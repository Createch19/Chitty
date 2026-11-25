import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, getTableName, isNull, sql } from "drizzle-orm";
import { createDb, type Handle } from "@/db/client";
import { auditLog, bid, chit, organiser, seat } from "@/db/schema";
import { withOrganiser } from "@/db/tenant";
import { attemptLogin, createOrganiser, createSession, deleteOrganiser, ensureSuperAdmin, readSession, setOrganiserActive } from "./accounts";
import { addSeat, createChit, getChitDetail, openMonth, setPaid, startChit } from "./chits";
import { issueLink, memberBid, memberJoin, resolveLink, type Link } from "./members";
import { chitPins, groupToken, resolveGroup } from "./pins";

process.env.CHITTY_AADHAAR_KEY = randomBytes(32).toString("base64");
let h: Handle;
let admin: string;
const ids: string[] = [];
const PW = "admin-pass-1";

/** A company with a running chit, payments, links, a PIN sign-in and a bid. */
async function company(name: string, mobile: string) {
  const org = await createOrganiser(h.db, admin, { businessName: name, ownerName: "O", mobile, password: "password-1" });
  const c = await createChit(h.db, org, { totalRupees: 100000, months: 5, code: "P" });
  for (let i = 0; i < 4; i++) await addSeat(h.db, org, c, { name: `M${i}`, phone: `970000000${i}` });
  await startChit(h.db, org, c, "2026-11-10");
  const d = await getChitDetail(h.db, org, c);
  for (const s of d.seats.slice(1)) await setPaid(h.db, org, d.months[0].id, s.id, true);
  await openMonth(h.db, org, d.months[1].id);
  const token = await issueLink(h.db, org, d.seats[1].id);
  const l = (await resolveLink(h.db, token)) as Link;
  const pin = (await chitPins(h.db, org, c)).find((p) => p.codes.includes("P02"))!.pin;
  await memberJoin(h.db, l, d.months[1].id);
  await memberBid(h.db, l, d.months[1].id, 24500, pin);
  return { org, token, group: await groupToken(h.db, org, c) };
}
/** Rows per table that belong to an organiser, over every table that has organiser_id. */
async function rows(org: string) {
  const q = (await h.db.execute(sql`select table_name from information_schema.columns where column_name = 'organiser_id' and table_schema = 'public' order by 1`)) as unknown as { rows?: { table_name: string }[] };
  const list = (Array.isArray(q) ? q : q.rows!) as { table_name: string }[];
  const out: Record<string, number> = {};
  for (const { table_name: t } of list) {
    const r = (await h.db.execute(sql`select count(*)::int as n from ${sql.identifier(t)} where organiser_id = ${org}`)) as unknown as { rows?: { n: number }[] };
    out[t] = (Array.isArray(r) ? r : r.rows!)[0].n;
  }
  return out;
}

let A: Awaited<ReturnType<typeof company>>;
let B: Awaited<ReturnType<typeof company>>;
beforeAll(async () => {
  h = await createDb();
  await ensureSuperAdmin(h.db, { mobile: "9000000009", password: PW });
  const r = await attemptLogin(h.db, "admin", "9000000009", PW, "1.1.1.1");
  admin = r.ok ? r.subjectId : "";
  A = await company("Demo Chits", "9840000001");
  B = await company("Real Chits", "9840000002");
  ids.push(A.org, B.org);
}, 60_000);
afterAll(() => h.close());

describe("Super Admin deletes a company", () => {
  it("refuses unless paused, name typed exactly, and the right Super Admin password", async () => {
    const before = await rows(A.org);
    await expect(deleteOrganiser(h.db, admin, A.org, { name: "Demo Chits", password: PW })).rejects.toThrow("PAUSE_FIRST");
    await setOrganiserActive(h.db, admin, A.org, false);
    await expect(deleteOrganiser(h.db, admin, A.org, { name: "demo chits", password: PW })).rejects.toThrow("NAME_MISMATCH");
    await expect(deleteOrganiser(h.db, admin, A.org, { name: "Demo Chits", password: "wrong" })).rejects.toThrow("WRONG_PASSWORD");
    await expect(deleteOrganiser(h.db, A.org, A.org, { name: "Demo Chits", password: "password-1" })).rejects.toThrow("NOT_FOUND"); // an organiser is no admin
    expect({ ...(await rows(A.org)), audit_log: 0 }).toEqual({ ...before, audit_log: 0 });
  });

  it("bids and audit rows are still append-only, for the owner and for the tenant role", async () => {
    const no = /append-only|permission denied|Failed query/;
    await expect(h.db.delete(bid).where(eq(bid.organiserId, A.org))).rejects.toThrow(no);
    await expect(h.db.delete(auditLog).where(eq(auditLog.organiserId, A.org))).rejects.toThrow(no);
    await expect(
      withOrganiser(h.db, A.org, async (tx) => {
        await tx.execute(sql`select set_config('app.purge_organiser', ${A.org}, true)`);
        await tx.delete(bid);
      }),
    ).rejects.toThrow(no);
    await expect(
      h.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.purge_organiser', ${A.org}, true)`);
        await tx.delete(bid).where(eq(bid.organiserId, B.org)); // another company's rows stay protected
      }),
    ).rejects.toThrow(no);
  });

  it("removes every row of that company and nothing of the other; links, group link and login stop", async () => {
    const other = await rows(B.org);
    for (const t of [bid, seat, chit]) expect(other[getTableName(t)]).toBeGreaterThan(0);
    const s = await createSession(h.db, "organiser", A.org);
    expect(await deleteOrganiser(h.db, admin, A.org, { name: " Demo Chits ", password: PW })).toEqual({ chits: 1, ids: 5 });
    expect(Object.values(await rows(A.org)).every((n) => n === 0)).toBe(true);
    expect(await rows(B.org)).toEqual(other);
    expect(await resolveLink(h.db, A.token)).toBeNull();
    expect(await resolveGroup(h.db, A.group)).toBeNull();
    expect(await resolveLink(h.db, B.token)).not.toBeNull();
    expect(await readSession(h.db, "organiser", s.token)).toBeNull();
    expect(await attemptLogin(h.db, "organiser", "9840000001", "password-1", "1.1.1.2")).toEqual({ ok: false, code: "INVALID" });
    expect((await h.db.select().from(organiser)).map((o) => o.businessName)).toEqual(["Real Chits"]);
    const kept = await h.db.select().from(auditLog).where(isNull(auditLog.organiserId));
    expect(kept.find((k) => k.action === "organiser.delete")?.details).toMatchObject({ businessName: "Demo Chits", chits: 1, ids: 5 });
    // the mobile is free again
    expect(await createOrganiser(h.db, admin, { businessName: "Demo Chits", ownerName: "O", mobile: "9840000001", password: "password-1" })).toBeTruthy();
  });
});
