/** Phase 4: who gets which message, in which language, once; dead phones; paused organisers; tenancy. */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, type Handle } from "@/db/client";
import { notification, pushSubscription } from "@/db/schema";
import { fullLines, pushText, whatsappText, type MsgFields } from "@/domain/messages";
import { createOrganiser, setOrganiserActive } from "./accounts";
import { addSeat, changeAuctionDate, closeAuction, createChit, getChitDetail, getMonthBoard, joinRoom, openMonth, placeBid, setPaid, startChit } from "./chits";
import { memberHome } from "./members";
import { flushPush, messagesFor, saveSubscription, sendReminders, setSender, validSub, type Payload, type PushSub, type SendResult } from "./notify";

const ADMIN = "00000000-0000-0000-0000-000000000000";
let h: Handle;
let org: string;
let otherOrg: string;
let d: Awaited<ReturnType<typeof getChitDetail>>;
let sent: { sub: PushSub; p: Payload }[] = [];
let reply: (sub: PushSub) => SendResult = () => "ok";

const seat = (code: string) => d.seats.find((s) => s.code === code)!;
const mId = (k: number) => d.months[k - 1].id;
const sub = (name: string): PushSub => ({ endpoint: `https://push.example/${name}`, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } });
const kinds = async (k: string, monthId: string) => h.db.select().from(notification).where(and(eq(notification.kind, k), eq(notification.monthId, monthId)));
const settle = async () => {
  await flushPush();
  const s = sent;
  sent = [];
  return s;
};

beforeAll(async () => {
  h = await createDb();
  setSender(async (s, p) => {
    sent.push({ sub: s, p });
    return reply(s);
  });
  org = await createOrganiser(h.db, ADMIN, { businessName: "Sri Murugan Chits", ownerName: "Murugan", mobile: "9840012345", password: "password-1" });
  otherOrg = await createOrganiser(h.db, ADMIN, { businessName: "Other", ownerName: "O", mobile: "9840099999", password: "password-2" });
  const chitId = await createChit(h.db, org, { totalRupees: 100000, months: 5, code: "N" });
  for (const n of ["Selvi", "Ravi", "Meena", "Arun"]) await addSeat(h.db, org, chitId, { name: n, phone: `98400${Math.floor(10000 + Math.random() * 89999)}` });
  d = await getChitDetail(h.db, org, chitId);
  await saveSubscription(h.db, org, seat("N02").id, sub("selvi"), "en");
  await saveSubscription(h.db, org, seat("N03").id, sub("ravi"), "ta");
  await saveSubscription(h.db, org, seat("N03").id, sub("ravi"), "ta"); // same phone twice → one row
}, 60_000);
afterEach(() => {
  reply = () => "ok";
});
afterAll(async () => {
  setSender(null);
  await h.close();
});

describe("messages text (§12)", () => {
  const f: MsgFields = { business: "Sri Murugan Chits", code: "A07", chitCode: "A", totalPaise: 50000000, chitDay: 10, month: 2, auctionDate: "2026-12-10", lastPayDate: "2026-12-20", discountPaise: 14500000, sharePaise: 725000, payPaise: 1775000 };
  it("the closed message carries every field of the sheet", () => {
    const t = whatsappText("closed", f, "en");
    for (const x of ["Sri Murugan Chits", "A07", "₹5,00,000", "10th of every month", "2nd month", "₹1,45,000", "₹7,250", "₹17,750", "20 Dec 2026"]) expect(t).toContain(x);
  });
  it("the reminder starts with 'Reminder: 2 days left' and Tamil is Tamil", () => {
    expect(pushText("reminder", f, "en").body.startsWith("Reminder: 2 days left")).toBe(true);
    expect(whatsappText("reminder", f, "en").split("\n")[1]).toBe("Reminder: 2 days left");
    expect(pushText("reminder", f, "ta").body).toContain("நினைவூட்டல்");
    expect(fullLines("closed", f, "ta").map((r) => r.k)).toContain("கட்ட வேண்டிய தொகை");
  });
  it("only https push endpoints with sane keys are accepted", () => {
    expect(validSub(sub("x"))).toBe(true);
    expect(validSub({ ...sub("x"), endpoint: "http://push.example/x" })).toBe(false);
    expect(validSub({ endpoint: "https://x", keys: { p256dh: "<script>", auth: "a" } })).toBe(false);
    expect(validSub(null)).toBe(false);
  });
});

describe("who gets what", () => {
  it("start: month 1 closed → every ID gets it; pushes go only to phones that agreed, in their language", async () => {
    await startChit(h.db, org, d.chit.id, "2026-11-10");
    d = await getChitDetail(h.db, org, d.chit.id);
    expect(await kinds("closed", mId(1))).toHaveLength(5);
    const s = await settle();
    expect(s.map((x) => x.sub.endpoint).sort()).toEqual(["https://push.example/ravi", "https://push.example/selvi"]);
    expect(s.find((x) => x.sub.endpoint.endsWith("ravi"))!.p.body).toContain("கட்டவும்");
    expect(s.find((x) => x.sub.endpoint.endsWith("selvi"))!.p.body).toBe("Month 1 auction closed. Pay ₹20,000 by 20 Nov 2026.");
    const own = (await kinds("closed", mId(1))).find((n) => n.seatId === seat("N01").id)!;
    expect(own.fields).toMatchObject({ winner: true, prizePaise: 10000000 });
  });

  it("receipt and correction go to that ID only", async () => {
    await setPaid(h.db, org, mId(1), seat("N02").id, true);
    let s = await settle();
    expect(s).toHaveLength(1);
    expect(s[0].p.body).toBe("Received ₹20,000 for month 1. Thank you!");
    await setPaid(h.db, org, mId(1), seat("N02").id, true); // no change → no message
    expect(await settle()).toHaveLength(0);
    await setPaid(h.db, org, mId(1), seat("N02").id, false);
    s = await settle();
    expect(s[0].p.body).toMatch(/^Correction:/);
    expect((await kinds("receipt", mId(1))).length).toBe(1);
    expect((await kinds("correction", mId(1))).length).toBe(1);
  });

  it("auction opens → every ID; tapping opens the room", async () => {
    for (const c of ["N02", "N03", "N04", "N05"]) await setPaid(h.db, org, mId(1), seat(c).id, true);
    await settle();
    await openMonth(h.db, org, mId(2));
    expect(await kinds("open", mId(2))).toHaveLength(5);
    const s = await settle();
    expect(s[0].p.url).toContain(`&room=${mId(2)}`);
    expect(s[0].p.url).toMatch(/^\/open\?s=[0-9a-f-]{36}&n=[0-9a-f-]{36}/); // never the secret link
  });

  it("date change → every ID, with the new date", async () => {
    await changeAuctionDate(h.db, org, mId(3), "2027-01-12");
    const s = await settle();
    expect(s.find((x) => x.sub.endpoint.endsWith("selvi"))!.p.body).toBe("Month 3 auction moved to 12 Jan 2027. Last day to pay: 22 Jan 2027.");
  });

  it("close → every ID; the winner gets 'You won'", async () => {
    for (const s of d.seats) await joinRoom(h.db, org, mId(2), s.id);
    const b = await getMonthBoard(h.db, org, mId(2));
    await placeBid(h.db, org, mId(2), seat("N03").id, b.nextMinPaise / 100);
    await closeAuction(h.db, org, mId(2));
    const s = await settle();
    expect(s.find((x) => x.sub.endpoint.endsWith("ravi"))!.p.body).toContain("வென்றீர்கள்");
    expect(s.find((x) => x.sub.endpoint.endsWith("selvi"))!.p.body).toMatch(/^Month 2 auction closed\. Pay ₹\d/);
  });

  it("a dead phone (410) is forgotten", async () => {
    reply = (x) => (x.endpoint.endsWith("selvi") ? "gone" : "ok");
    await setPaid(h.db, org, mId(2), seat("N02").id, true);
    await settle();
    expect(await h.db.select().from(pushSubscription).where(eq(pushSubscription.seatId, seat("N02").id))).toHaveLength(0);
    await saveSubscription(h.db, org, seat("N02").id, sub("selvi"), "en");
  });
});

describe("2-day reminder", () => {
  // month 2: auction 10 Dec 2026 → last day 20 Dec → reminder from 18 Dec, 9 AM IST
  it("not before 9 AM, not before the day", async () => {
    expect(await sendReminders(h.db, "2026-12-18", "08:59")).toBe(0);
    expect(await sendReminders(h.db, "2026-12-17", "10:00")).toBe(0);
  });

  it("unpaid IDs only (not the winner, not paid), and only once", async () => {
    const n = await sendReminders(h.db, "2026-12-18", "09:00");
    expect(n).toBe(3); // N01, N04, N05 (N02 paid, N03 is the winner)
    const rows = await kinds("reminder", mId(2));
    expect(rows.map((r) => r.seatId).sort()).toEqual([seat("N01").id, seat("N04").id, seat("N05").id].sort());
    expect(await settle()).toHaveLength(0); // none of those three subscribed
    expect(await sendReminders(h.db, "2026-12-19", "09:00")).toBe(0); // already sent
    expect(await sendReminders(h.db, "2026-12-21", "09:00")).toBe(0); // after the last day: no more
  });
});

describe("member home", () => {
  it("the winner's own share is 'at payout', never due", async () => {
    const home = await memberHome(h.db, { linkId: "x", organiserId: org, seatId: seat("N03").id, chitId: d.chit.id });
    expect(home.history.find((x) => x.month === 2)).toMatchObject({ paid: false, atPayout: true });
    const other = await memberHome(h.db, { linkId: "x", organiserId: org, seatId: seat("N05").id, chitId: d.chit.id });
    expect(other.history.find((x) => x.month === 2)).toMatchObject({ paid: false, atPayout: false });
  });
});

describe("safety", () => {
  it("a paused organiser sends nothing", async () => {
    await setOrganiserActive(h.db, ADMIN, org, false);
    const before = (await h.db.select().from(notification)).length;
    await setPaid(h.db, org, mId(2), seat("N04").id, true);
    expect((await h.db.select().from(notification)).length).toBe(before);
    expect(await settle()).toHaveLength(0);
    await setOrganiserActive(h.db, ADMIN, org, true);
  });

  it("another organiser can't read the messages or subscribe to these seats", async () => {
    expect(await messagesFor(h.db, otherOrg, seat("N02").id)).toEqual([]);
    await expect(saveSubscription(h.db, otherOrg, seat("N02").id, sub("evil"), "en")).rejects.toThrow();
    expect((await messagesFor(h.db, org, seat("N02").id)).length).toBeGreaterThan(3);
  });
});
