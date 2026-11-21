/** Phase 5: Aadhaar, transfer, reports + CSV, paper-chit import, audit log viewer. */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Handle } from "@/db/client";
import { auditLog, pushSubscription, seat } from "@/db/schema";
import { cleanAadhaar, verhoeffDigit } from "@/domain/aadhaar";
import { checkImport } from "@/domain/import";
import { createOrganiser } from "./accounts";
import { listAudit } from "./audit-view";
import { addSeat, createChit, getChitDetail, getMonthBoard, joinRoom, markPayout, openMonth, placeBid, closeAuction, setPaid, startChit } from "./chits";
import { buildTemplate, importChit, readWorkbook } from "./importer";
import { issueLink, resolveLink } from "./members";
import { saveSubscription } from "./notify";
import { openAadhaar, sealAadhaar, setAadhaar, showAadhaar, transferSeat } from "./people";
import { arrearsReport, collectionReport, ledgerReport, summaryReport, toCsv } from "./reports";

process.env.CHITTY_AADHAAR_KEY = randomBytes(32).toString("base64");

const ADMIN = "00000000-0000-0000-0000-000000000000";
const AADHAAR = "23456789012" + verhoeffDigit("23456789012");
let h: Handle;
let org: string;
let otherOrg: string;
let d: Awaited<ReturnType<typeof getChitDetail>>;
const seatOf = (code: string) => d.seats.find((s) => s.code === code)!;

beforeAll(async () => {
  h = await createDb();
  org = await createOrganiser(h.db, ADMIN, { businessName: "Sri Murugan Chits", ownerName: "Murugan", mobile: "9840012345", password: "password-1" });
  otherOrg = await createOrganiser(h.db, ADMIN, { businessName: "Other", ownerName: "O", mobile: "9840099999", password: "password-2" });
  const id = await createChit(h.db, org, { totalRupees: 100000, months: 5, code: "R" });
  for (const [i, n] of ["Selvi", "Ravi", "Meena", "Arun"].entries()) await addSeat(h.db, org, id, { name: n, phone: `984001100${i}` });
  await startChit(h.db, org, id, "2026-09-05");
  d = await getChitDetail(h.db, org, id);
}, 60_000);
afterAll(() => h.close());

describe("Aadhaar", () => {
  it("checks the Verhoeff digit and the 12-digit shape", () => {
    expect(cleanAadhaar(`${AADHAAR.slice(0, 4)} ${AADHAAR.slice(4, 8)} ${AADHAAR.slice(8)}`)).toBe(AADHAAR);
    const wrong = AADHAAR.slice(0, 11) + String((Number(AADHAAR[11]) + 1) % 10);
    expect(cleanAadhaar(wrong)).toBeNull();
    expect(cleanAadhaar("0" + AADHAAR.slice(1))).toBeNull();
    expect(cleanAadhaar("12345")).toBeNull();
  });

  it("is sealed per seat: the stored bytes don't contain it, and another seat id can't open it", () => {
    const blob = sealAadhaar("seat-1", AADHAAR);
    expect(blob.toString("latin1")).not.toContain(AADHAAR);
    expect(openAadhaar("seat-1", blob)).toBe(AADHAAR);
    expect(() => openAadhaar("seat-2", blob)).toThrow("AADHAAR_UNREADABLE");
  });

  it("save → masked last 4 only; Show returns it and is audited; other organisers can't", async () => {
    const s = seatOf("R02");
    await setAadhaar(h.db, org, s.id, AADHAAR);
    await expect(setAadhaar(h.db, org, s.id, "1234 5678 9012")).rejects.toThrow("INVALID_AADHAAR");
    d = await getChitDetail(h.db, org, d.chit.id);
    expect(seatOf("R02").aadhaarLast4).toBe(AADHAAR.slice(8));
    expect(JSON.stringify(d)).not.toContain(AADHAAR);
    expect(await showAadhaar(h.db, org, s.id)).toBe(AADHAAR);
    await expect(showAadhaar(h.db, otherOrg, s.id)).rejects.toThrow("SEAT_NOT_FOUND");
    const shows = await h.db.select().from(auditLog).where(eq(auditLog.action, "seat.aadhaar_show"));
    expect(shows).toHaveLength(1);
    expect(JSON.stringify(shows[0].details)).not.toContain(AADHAAR);
  });

  it("without the server key nothing is stored", async () => {
    const k = process.env.CHITTY_AADHAAR_KEY;
    delete process.env.CHITTY_AADHAAR_KEY;
    await expect(setAadhaar(h.db, org, seatOf("R03").id, AADHAAR)).rejects.toThrow("AADHAAR_KEY_MISSING");
    process.env.CHITTY_AADHAAR_KEY = k;
  });
});

describe("transfer", () => {
  it("same ID and history; new name/phone; old link and old phones stop; audited", async () => {
    const s = seatOf("R03");
    const token = await issueLink(h.db, org, s.id);
    await saveSubscription(h.db, org, s.id, { endpoint: "https://push.example/old", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } }, "en");
    await setPaid(h.db, org, d.months[0].id, s.id, true);
    await transferSeat(h.db, org, s.id, { name: "Kannan", phone: "9876500000", aadhaar: AADHAAR });
    expect(await resolveLink(h.db, token)).toBeNull();
    expect(await h.db.select().from(pushSubscription).where(eq(pushSubscription.seatId, s.id))).toHaveLength(0);
    d = await getChitDetail(h.db, org, d.chit.id);
    expect(seatOf("R03")).toMatchObject({ id: s.id, name: "Kannan", phone: "9876500000", aadhaarLast4: AADHAAR.slice(8) });
    const b = await getMonthBoard(h.db, org, d.months[0].id);
    expect(b.seats.find((x) => x.id === s.id)!.paid).toBe(true); // history kept
    const [a] = await h.db.select().from(auditLog).where(eq(auditLog.action, "seat.transfer"));
    expect(a.details).toMatchObject({ from: { name: "Ravi" }, to: { name: "Kannan" }, linksRevoked: 1 });
  });

  it("not the organiser's own seat, not another organiser's seat", async () => {
    await expect(transferSeat(h.db, org, seatOf("R01").id, { name: "X", phone: "9876500001" })).rejects.toThrow("ORGANISER_SEAT");
    await expect(transferSeat(h.db, otherOrg, seatOf("R04").id, { name: "X", phone: "9876500001" })).rejects.toThrow("SEAT_NOT_FOUND");
  });
});

describe("reports", () => {
  beforeAll(async () => {
    // month 1: everyone but R05 pays; payout waits. month 2: R04 wins by bid.
    for (const c of ["R02", "R04"]) await setPaid(h.db, org, d.months[0].id, seatOf(c).id, true);
    await openMonth(h.db, org, d.months[1].id);
    for (const s of d.seats) await joinRoom(h.db, org, d.months[1].id, s.id);
    const b = await getMonthBoard(h.db, org, d.months[1].id);
    await placeBid(h.db, org, d.months[1].id, seatOf("R04").id, b.nextMinPaise / 100);
    await closeAuction(h.db, org, d.months[1].id);
    d = await getChitDetail(h.db, org, d.chit.id);
  });

  it("month collection: statuses, collected and pending", async () => {
    const r = await collectionReport(h.db, org, d.months[0].id);
    expect(r.rows.map((x) => x.status)).toEqual(["at-payout", "paid", "paid", "paid", "unpaid"]);
    expect(r.kpis![0].paise).toBe(3 * 2000000);
    expect(r.kpis![1].paise).toBe(2 * 2000000);
  });

  it("chit summary: one row per month, winners and status", async () => {
    const r = await summaryReport(h.db, org, d.chit.id);
    expect(r.rows).toHaveLength(5);
    expect(r.rows[0]).toMatchObject({ month: 1, discount: 0, status: "collecting" });
    expect(String(r.rows[1].winner)).toContain("R04");
    expect(r.rows[2]).toMatchObject({ status: "pending", winner: null });
  });

  it("arrears across chits: unpaid installments of closed months, never the winner's own share", async () => {
    const r = await arrearsReport(h.db, org, "2026-12-20");
    const ids = r.rows.map((x) => `${x.id}/${x.month}`);
    expect(ids).toContain("R05/1");
    expect(ids).not.toContain("R01/1"); // organiser won month 1
    expect(ids).not.toContain("R04/2"); // won month 2
    expect(r.rows.find((x) => x.id === "R05" && x.month === 1)!.late).toBe(96); // last day 15 Sep → 20 Dec
    expect(r.rows.find((x) => x.id === "R05" && x.month === 1)!.status).toBe("late");
    expect(await arrearsReport(h.db, otherOrg, "2026-12-20")).toMatchObject({ rows: [] });
  });

  it("member ledger: paid, received, arrears", async () => {
    const r = await ledgerReport(h.db, org, seatOf("R05").id);
    expect(r.rows.map((x) => x.status)).toEqual(["unpaid", "unpaid"]);
    expect(r.kpis!.find((k) => k.en === "Arrears")!.paise).toBeGreaterThan(0);
  });

  it("CSV: BOM, rupees not paise, Tamil headers, formula injection neutralised", async () => {
    const r = await collectionReport(h.db, org, d.months[0].id);
    r.rows[1].name = "=HYPERLINK(\"http://x\")";
    const csv = toCsv(r, "en");
    expect(csv.startsWith("﻿ID,Name,Mobile,Due,Status,Paid")).toBe(true);
    expect(csv).toContain(",20000,");
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(toCsv(r, "ta")).toContain("பெயர்");
  });
});

describe("paper-chit import", () => {
  let data: Awaited<ReturnType<typeof readWorkbook>>;
  beforeAll(async () => {
    data = await readWorkbook(await buildTemplate());
  });

  it("the template's sample checks out: 5L / 20, 7 months held, next month 8", () => {
    const { issues, plan } = checkImport(data, [], "2026-12-01");
    expect(issues).toEqual([]);
    expect(plan!.terms.totalPaise).toBe(50000000);
    expect(plan!.months.map((m) => m.discountPaise / 100)).toEqual([0, 145500, 135000, 130000, 121000, 115500, 108000]);
    expect(plan!.months[1].payPaise).toBe(1772500); // ₹17,725 at ₹1,45,500 (as in the 5L/20 sheet)
    expect(plan!.next).toEqual({ month: 8, auctionDate: "2026-12-10" });
  });

  it("lists every mistake with its sheet and row", () => {
    const bad = structuredClone(data);
    bad.months[3].winner = "A07"; // A07 already won month 2
    bad.months[4].discount = "100000"; // below month 5's minimum 1,20,000
    bad.months[6].payoutDone = "Yes"; // but A05 and A11 haven't paid
    bad.members[4].phone = "12345";
    bad.payments[2].cells[1].value = "maybe";
    const { issues, plan } = checkImport(bad, ["A"], "2026-12-01");
    expect(plan).toBeNull();
    const t = issues.map((i) => `${i.sheet}:${i.row ?? "-"}:${i.en}`).join("\n");
    expect(t).toMatch(/Chit:\d+:Chit code A is already used/);
    expect(t).toMatch(/Months:5:Month 4: A07 already won month 2/);
    expect(t).toMatch(/Months:6:Month 5: discount ₹100000 is below that month's minimum ₹120000/);
    expect(t).toMatch(/Month 7: payout is marked done but A05, A11 have not paid/);
    expect(t).toMatch(/Members:6:A05: mobile must be 10 digits/);
    expect(t).toMatch(/Payments:4:A03, month 2: write Paid or Not paid/);
  });

  it("refuses months that haven't happened yet", () => {
    const { issues } = checkImport(data, [], "2026-11-01");
    expect(issues.some((i) => /in the future/.test(i.en))).toBe(true);
  });

  it("imports: 7 months closed, payouts 1–6 done with arrears adjusted, month 8 runs in the app", async () => {
    const { plan } = checkImport(data, ["R"], "2026-12-01");
    const chitId = await importChit(h.db, org, plan!);
    const c = await getChitDetail(h.db, org, chitId);
    expect(c.chit).toMatchObject({ code: "A", status: "active", startDate: "2026-05-10" });
    expect(c.months.filter((m) => m.status === "closed")).toHaveLength(7);
    expect(c.months.filter((m) => m.payoutDone).map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(c.months[7]).toMatchObject({ month: 8, status: "pending", auctionDate: "2026-12-10" });
    const m7 = await getMonthBoard(h.db, org, c.months[6].id);
    expect(m7.seats.filter((s) => !s.paid).map((s) => s.code).sort()).toEqual(["A05", "A11", "A18"]); // A18 = winner, at payout
    const m2 = await getMonthBoard(h.db, org, c.months[1].id);
    expect(m2.payout).toMatchObject({ prizePaise: 35450000, cashPaise: 35450000 - 1772500, done: true });
    // month 7 payout is now possible once A05 and A11 pay
    for (const code of ["A05", "A11"]) await setPaid(h.db, org, c.months[6].id, m7.seats.find((s) => s.code === code)!.id, true);
    await markPayout(h.db, org, c.months[6].id);
    await expect(importChit(h.db, org, plan!)).rejects.toThrow("CODE_TAKEN");
  });

  it("rejects files that aren't the template", async () => {
    await expect(readWorkbook(Buffer.from("not a zip"))).rejects.toThrow("NOT_XLSX");
  });
});

describe("audit log viewer", () => {
  it("filters by group, pages, and only shows this organiser's rows", async () => {
    for (let i = 0; i < 30; i++) await issueLink(h.db, org, seatOf("R02").id);
    const all = await listAudit(h.db, org);
    expect(all.rows.length).toBe(50);
    expect(all.more).toBe(true);
    const next = await listAudit(h.db, org, { before: all.rows[49].id });
    expect(next.rows[0].id).toBeLessThan(all.rows[49].id);
    const aad = await listAudit(h.db, org, { group: "aadhaar" });
    expect(aad.rows.every((r) => r.action.startsWith("seat.aadhaar_"))).toBe(true);
    expect(aad.rows.map((r) => r.action).sort()).toEqual(["seat.aadhaar_set", "seat.aadhaar_show"]);
    const money = await listAudit(h.db, org, { group: "money" });
    expect(money.rows.every((r) => /^(payment|payout)\./.test(r.action))).toBe(true);
    expect((await listAudit(h.db, otherOrg)).rows.every((r) => r.action.startsWith("organiser."))).toBe(true);
    expect(all.names.seats[seatOf("R03").id]).toBe("R03 · Kannan");
  });

  it("the audit log can't be edited", async () => {
    await expect(h.db.update(auditLog).set({ action: "x" })).rejects.toThrow();
    await expect(h.db.delete(seat).where(eq(seat.id, seatOf("R03").id))).rejects.toThrow(); // payments reference it
  });
});
