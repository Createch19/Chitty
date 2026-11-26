/**
 * Phase 3: member links, the member's views (privacy), 20 phones bidding at once, the live SSE stream,
 * reconnect, and link revoke.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Handle } from "@/db/client";
import { auditLog, bid, loginAttempt } from "@/db/schema";
import { createOrganiser, setOrganiserActive } from "./accounts";
import { addSeat, createChit, getChitDetail, openMonth, removeSeat, setPaid, startChit, updateSeat } from "./chits";
import { listeners, publish } from "./events";
import { bidRateOk, connectedSeats, issueLink, linkStatus, memberBid, memberHome, memberJoin, memberRoom, resolveLink, revokeLink, type Link } from "./members";
import { chitPins, groupToken, groupView, joinWithPin, resetPin, resolveGroup, type Group } from "./pins";
import { transferSeat } from "./people";
import { GET as memberEvents } from "@/app/api/m/[token]/rooms/[monthId]/events/route";

process.env.CHITTY_AADHAAR_KEY = randomBytes(32).toString("base64");
const ADMIN = "00000000-0000-0000-0000-000000000000";
let h: Handle;
let org: string;
let otherOrg: string;
let d: Awaited<ReturnType<typeof getChitDetail>>;
const tokens = new Map<string, string>(); // seat code → token
const phones: string[] = [];

const link = async (code: string) => (await resolveLink(h.db, tokens.get(code)!)) as Link;
const month2 = () => d.months[1].id;
const seat = (code: string) => d.seats.find((s) => s.code === code)!;
const pins = new Map<string, string>(); // seat code → PIN
const pin = (code: string) => pins.get(code)!;

beforeAll(async () => {
  h = await createDb();
  (globalThis as unknown as { __chittyDb?: Promise<Handle> }).__chittyDb = Promise.resolve(h); // the route handler's getDb()
  org = await createOrganiser(h.db, ADMIN, { businessName: "Sri Murugan Chits", ownerName: "Murugan", mobile: "9840012345", password: "password-1" });
  otherOrg = await createOrganiser(h.db, ADMIN, { businessName: "Other", ownerName: "O", mobile: "9840099999", password: "password-2" });
  const chitId = await createChit(h.db, org, { totalRupees: 500000, months: 20, code: "M" });
  for (let i = 0; i < 19; i++) {
    const phone = `97${String(10000000 + i * 7919)}`;
    phones.push(phone);
    await addSeat(h.db, org, chitId, { name: `Member ${i + 2}`, phone });
  }
  await startChit(h.db, org, chitId, "2026-11-10");
  d = await getChitDetail(h.db, org, chitId);
  for (const s of d.seats) if (s.code !== "M01") await setPaid(h.db, org, d.months[0].id, s.id, true); // no arrears
  for (const s of d.seats) tokens.set(s.code, await issueLink(h.db, org, s.id));
  for (const p of await chitPins(h.db, org, d.chit.id)) for (const c of p.codes) pins.set(c, p.pin);
  await openMonth(h.db, org, month2());
}, 120_000);
afterAll(() => h.close());

describe("member links", () => {
  it("a link resolves to its seat; junk and unknown tokens do not", async () => {
    const l = await link("M05");
    expect(l).toMatchObject({ organiserId: org, seatId: seat("M05").id, chitId: d.chit.id });
    expect(await resolveLink(h.db, "x")).toBeNull();
    expect(await resolveLink(h.db, "' or 1=1 --")).toBeNull();
    expect(await resolveLink(h.db, "A".repeat(43))).toBeNull();
    expect((await linkStatus(h.db, org, d.chit.id)).length).toBe(20);
  });

  it("a new link kills the old one; revoke kills it too", async () => {
    const old = tokens.get("M20")!;
    const fresh = await issueLink(h.db, org, seat("M20").id);
    expect(await resolveLink(h.db, old)).toBeNull();
    expect(await resolveLink(h.db, fresh)).not.toBeNull();
    expect(await revokeLink(h.db, org, seat("M20").id)).toBe(1);
    expect(await resolveLink(h.db, fresh)).toBeNull();
    tokens.set("M20", await issueLink(h.db, org, seat("M20").id));
  });

  it("another organiser cannot make or stop links for this chit's seats", async () => {
    await expect(issueLink(h.db, otherOrg, seat("M03").id)).rejects.toThrow("SEAT_NOT_FOUND");
    expect(await revokeLink(h.db, otherOrg, seat("M03").id)).toBe(0);
    expect(await linkStatus(h.db, otherOrg, d.chit.id)).toEqual([]);
    expect(await resolveLink(h.db, tokens.get("M03")!)).not.toBeNull();
  });

  it("a paused organiser's links say 'paused'", async () => {
    await setOrganiserActive(h.db, ADMIN, org, false);
    expect(await resolveLink(h.db, tokens.get("M03")!)).toBe("paused");
    await setOrganiserActive(h.db, ADMIN, org, true);
    expect(await resolveLink(h.db, tokens.get("M03")!)).not.toBe("paused");
  });

  it("a link only opens months of its own chit", async () => {
    const otherChit = await createChit(h.db, org, { totalRupees: 100000, months: 5 });
    const od = await getChitDetail(h.db, org, otherChit);
    expect(od.months).toEqual([]);
    await expect(memberRoom(h.db, await link("M04"), "00000000-0000-4000-8000-000000000000")).rejects.toThrow("MONTH_NOT_FOUND");
  });
});

describe("what a member sees", () => {
  it("home and room never contain anyone's phone number", async () => {
    const home = JSON.stringify(await memberHome(h.db, await link("M02")));
    const room = JSON.stringify(await memberRoom(h.db, await link("M02"), month2()));
    for (const p of phones) {
      expect(home).not.toContain(p);
      expect(room).not.toContain(p);
    }
  });

  it("home shows the member's own payments and the schedule", async () => {
    const home = await memberHome(h.db, await link("M02"));
    expect(home.me.code).toBe("M02");
    expect(home.history).toEqual([expect.objectContaining({ month: 1, paid: true, amountPaise: 2500000 })]);
    expect(home.schedule).toHaveLength(20);
    expect(home.open).toMatchObject({ id: month2(), month: 2, bidding: true });
  });

  it("the room shows IDs only (display = id) and marks M01 as already won", async () => {
    const r = await memberRoom(h.db, await link("M02"), month2());
    expect(r.seats[0]).toMatchObject({ label: "M01", won: true });
    expect(r.seats[1]).toMatchObject({ label: "M02", won: false, joined: false });
    expect(r.me).toMatchObject({ index: 1, joined: false, won: false, arrearsPaise: 0 });
    expect(r.nextMinPaise).toBe(14300000); // ₹1,42,500 minimum + ₹500
  });
});

describe("20 phones in the live room", () => {
  it("all 20 can join at once", async () => {
    await Promise.all([...tokens.keys()].map(async (c) => memberJoin(h.db, await link(c), month2())));
    const r = await memberRoom(h.db, await link("M02"), month2());
    expect(r.seats.every((s) => s.joined)).toBe(true);
  });

  it("19 different bids at the same moment: bids stay strictly rising and the highest accepted one leads", async () => {
    const codes = [...tokens.keys()].filter((c) => c !== "M01");
    const res = await Promise.allSettled(codes.map(async (c, i) => memberBid(h.db, await link(c), month2(), 143000 + 500 * i, pin(c))));
    const ok = res.filter((r) => r.status === "fulfilled");
    expect(ok.length).toBeGreaterThanOrEqual(1);
    for (const r of res) if (r.status === "rejected") expect(["BID_TOO_LOW", "ALREADY_LEADING"]).toContain((r.reason as { code: string }).code);
    const rows = await h.db.select().from(bid).where(eq(bid.monthId, month2())).orderBy(bid.id);
    for (let i = 1; i < rows.length; i++) expect(rows[i].amountPaise).toBeGreaterThan(rows[i - 1].amountPaise);
    const r = await memberRoom(h.db, await link("M02"), month2());
    expect(r.bids.length).toBe(ok.length);
    expect(r.seats[r.leader!].label).toBe(d.seats.find((s) => s.id === rows[rows.length - 1].seatId)!.code);
  });

  it("19 phones bidding the same amount at once: exactly one wins it", async () => {
    const r0 = await memberRoom(h.db, await link("M02"), month2());
    const amount = r0.nextMinPaise / 100 + 5000;
    const codes = [...tokens.keys()].filter((c) => c !== "M01" && d.seats.findIndex((s) => s.code === c) !== r0.leader);
    const res = await Promise.allSettled(codes.map(async (c) => memberBid(h.db, await link(c), month2(), amount, pin(c))));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("a bid needs the PIN; wrong PINs place nothing, are audited, and lock only the phone that guessed", async () => {
    const r0 = await memberRoom(h.db, await link("M02"), month2());
    const code = ["M07", "M08"].find((c) => d.seats.findIndex((s) => s.code === c) !== r0.leader)!;
    const l = await link(code);
    const amount = r0.nextMinPaise / 100;
    const wrong = pin(code) === "000000" ? "111111" : "000000";
    for (const bad of ["", "1234", "abcdef", undefined as unknown as string]) await expect(memberBid(h.db, l, month2(), amount, bad, "1.1.1.1")).rejects.toThrow("PIN_NEEDED");
    // parallel guesses can't slip past the limit, and don't use up the member's bid tries
    const tries = await Promise.allSettled(Array.from({ length: 12 }, () => memberBid(h.db, l, month2(), amount, wrong, "1.1.1.1")));
    const codes = tries.map((t) => (t as PromiseRejectedResult).reason.code as string);
    expect(codes.filter((c) => c === "PIN_WRONG").length).toBeLessThanOrEqual(5);
    expect(codes.every((c) => c === "PIN_WRONG" || c === "PIN_LOCKED")).toBe(true);
    for (let i = 0; i < 6; i++) await memberBid(h.db, l, month2(), amount, wrong, "1.1.1.1").catch(() => {});
    await expect(memberBid(h.db, l, month2(), amount, pin(code), "1.1.1.1")).rejects.toThrow("PIN_LOCKED");
    expect((await memberRoom(h.db, l, month2())).bids.length).toBe(r0.bids.length);
    const rows = await h.db.select().from(auditLog).where(eq(auditLog.action, "pin.wrong"));
    expect(rows.some((x) => x.actorId === l.seatId)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(wrong + '"');
    // the member, on another connection, still bids; a right PIN leaves no try behind
    const before = (await h.db.select().from(loginAttempt)).length;
    await memberBid(h.db, l, month2(), amount, pin(code), "2.2.2.2");
    expect((await h.db.select().from(loginAttempt)).length).toBe(before);
    expect((await memberRoom(h.db, l, month2())).bids.length).toBe(r0.bids.length + 1);
  });

  it("a stuck button is slowed down (8 tries per 10 s per seat)", () => {
    const t = 1_000_000;
    for (let i = 0; i < 8; i++) expect(bidRateOk("rate-test", t + i)).toBe(true);
    expect(bidRateOk("rate-test", t + 9)).toBe(false);
    expect(bidRateOk("rate-test", t + 10_500)).toBe(true);
  });
});

/* ------------------------------ SSE ------------------------------ */

type Msg = { event: string; data: unknown };

function open(code: string, monthId = month2()) {
  const ac = new AbortController();
  const req = new Request(`http://local/api/m/x/rooms/${monthId}/events`, { signal: ac.signal });
  const res = memberEvents(req, { params: Promise.resolve({ token: tokens.get(code)!, monthId }) } as never);
  return { ac, res };
}

/** Reads SSE messages from a response until `n` real (non-comment) events have arrived. */
async function reader(res: Response) {
  const r = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  return async function next(): Promise<Msg> {
    for (;;) {
      const i = buf.indexOf("\n\n");
      if (i >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];
        if (ev && data) return { event: ev, data: JSON.parse(data) };
        continue; // retry:, : ping
      }
      const { value, done } = await r.read();
      if (done) throw new Error("stream ended");
      buf += dec.decode(value, { stream: true });
    }
  };
}

describe("live stream (SSE)", () => {
  it("bad links get 404, paused organisers 423", async () => {
    const ac = new AbortController();
    const bad = await memberEvents(new Request("http://local/x", { signal: ac.signal }), { params: Promise.resolve({ token: "A".repeat(43), monthId: month2() }) } as never);
    expect(bad.status).toBe(404);
    await setOrganiserActive(h.db, ADMIN, org, false);
    const { res } = open("M03");
    expect((await res).status).toBe(423);
    await setOrganiserActive(h.db, ADMIN, org, true);
  });

  it("sends a snapshot at once, then a fresh one after a bid; closing the tab unsubscribes", async () => {
    const before = listeners(month2());
    const { ac, res } = open("M04");
    const r = await res;
    expect(r.headers.get("content-type")).toContain("text/event-stream");
    const next = await reader(r);
    const first = (await next()) as { event: string; data: { bids: unknown[]; me: { index: number } } };
    expect(first.event).toBe("snapshot");
    expect(first.data.me.index).toBe(3);
    expect(listeners(month2())).toBe(before + 1);

    const snap = await memberRoom(h.db, await link("M04"), month2());
    const bidder = snap.leader === 4 ? "M06" : "M05";
    await memberBid(h.db, await link(bidder), month2(), snap.nextMinPaise / 100, pin(bidder));
    const second = (await next()) as { data: { bids: unknown[] } };
    expect(second.data.bids.length).toBe(first.data.bids.length + 1);

    ac.abort();
    await new Promise((ok) => setTimeout(ok, 20));
    expect(listeners(month2())).toBe(before);
  });

  it("a burst of changes is coalesced into one snapshot", async () => {
    const { ac, res } = open("M07");
    const next = await reader(await res);
    await next();
    for (let i = 0; i < 10; i++) publish(month2());
    const got: Msg[] = [];
    const t = setTimeout(() => ac.abort(), 400);
    try {
      for (;;) got.push(await next());
    } catch {
      /* stream ended */
    }
    clearTimeout(t);
    expect(got.length).toBe(1);
  });

  it("reconnect: a new connection gets the current state straight away", async () => {
    const latest = await memberRoom(h.db, await link("M08"), month2());
    const { ac, res } = open("M08");
    const next = await reader(await res);
    const first = (await next()) as { data: { bids: unknown[]; leader: number } };
    expect(first.data.bids.length).toBe(latest.bids.length);
    expect(first.data.leader).toBe(latest.leader);
    ac.abort();
  });

  it("a payment change reaches the open room at once (arrears lock / unlock)", async () => {
    const { ac, res } = open("M10");
    const next = await reader(await res);
    expect(((await next()).data as { me: { arrearsPaise: number } }).me.arrearsPaise).toBe(0);
    await setPaid(h.db, org, d.months[0].id, seat("M10").id, false);
    expect(((await next()).data as { me: { arrearsPaise: number } }).me.arrearsPaise).toBe(2500000);
    await setPaid(h.db, org, d.months[0].id, seat("M10").id, true);
    expect(((await next()).data as { me: { arrearsPaise: number } }).me.arrearsPaise).toBe(0);
    ac.abort();
  });

  it("revoking a link sends 'gone' to that phone at the next change", async () => {
    const { ac, res } = open("M09");
    const next = await reader(await res);
    await next();
    await revokeLink(h.db, org, seat("M09").id); // revoke itself pushes to the open month
    expect((await next()).event).toBe("gone");
    ac.abort();
  });
});

/* ------------------------------ group link + PIN ------------------------------ */

describe("group link and PIN", () => {
  let chitId: string;
  let g: Group;
  const ids = async () => Object.fromEntries((await getChitDetail(h.db, org, chitId)).seats.map((s) => [s.code, s.id]));
  const pinOf = async (code: string) => (await chitPins(h.db, org, chitId)).find((p) => p.codes.includes(code))!.pin;
  const on = async () => (await connectedSeats(h.db, org, chitId)).map((c) => c.seatId);

  beforeAll(async () => {
    chitId = await createChit(h.db, org, { totalRupees: 100000, months: 5, code: "GRP" });
    await addSeat(h.db, org, chitId, { name: "Ravi", phone: "9700000001" });
    await addSeat(h.db, org, chitId, { name: "Ravi", phone: "9700000001" });
    await addSeat(h.db, org, chitId, { name: "Selvi", phone: "9700000002" });
    await addSeat(h.db, org, chitId, { name: "Kumar", phone: "9700000003" });
    g = (await resolveGroup(h.db, await groupToken(h.db, org, chitId))) as Group;
  });

  it("works before Start; PINs are fixed, one per person, and only for this organiser", async () => {
    expect(g.chitId).toBe(chitId);
    const a = await chitPins(h.db, org, chitId);
    expect(a.map((p) => p.codes)).toEqual([["GRP01"], ["GRP02", "GRP03"], ["GRP04"], ["GRP05"]]);
    for (const p of a) expect(p.pin).toMatch(/^\d{6}$/);
    expect(await chitPins(h.db, org, chitId)).toEqual(a);
    await expect(chitPins(h.db, otherOrg, chitId)).rejects.toThrow("CHIT_NOT_FOUND");
    await expect(groupToken(h.db, otherOrg, chitId)).rejects.toThrow("CHIT_NOT_FOUND");
    await expect(resetPin(h.db, otherOrg, (await ids()).GRP04)).rejects.toThrow("SEAT_NOT_FOUND");
    const view = await groupView(h.db, g);
    expect(view.seats.map((s) => s.label)).toEqual(["GRP01 · Murugan", "GRP02 · Ravi", "GRP03 · Ravi", "GRP04 · Selvi", "GRP05 · Kumar"]);
    for (const secret of ["97000000", ...a.map((p) => p.pin)]) expect(JSON.stringify(view)).not.toContain(secret);
  });

  it("sending a private link or showing PINs connects nobody; a PIN sign-in connects all that person's IDs", async () => {
    const s = await ids();
    await issueLink(h.db, org, s.GRP04);
    expect(await on()).toEqual([]);
    await expect(joinWithPin(h.db, g, s.GRP02, await pinOf("GRP04"), "3.3.3.3")).rejects.toThrow("PIN_WRONG");
    expect(await on()).toEqual([]);
    const got = await joinWithPin(h.db, g, s.GRP02, await pinOf("GRP02"), "3.3.3.3");
    expect(got.map((x) => x.code)).toEqual(["GRP02", "GRP03"]);
    expect((await on()).sort()).toEqual([s.GRP02, s.GRP03].sort());
    expect(await resolveLink(h.db, got[0].token)).toMatchObject({ seatId: s.GRP02, chitId });
    expect((await memberHome(h.db, (await resolveLink(h.db, got[0].token)) as Link)).me.code).toBe("GRP02");
  });

  it("a seat of another chit can't be used; wrong tries lock out", async () => {
    await expect(joinWithPin(h.db, g, seat("M05").id, pin("M05"), "4.4.4.4")).rejects.toThrow("SEAT_NOT_FOUND");
    const s = await ids();
    const good = await pinOf("GRP05");
    const wrong = good === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await expect(joinWithPin(h.db, g, s.GRP05, wrong, "5.5.5.5")).rejects.toThrow("PIN_WRONG");
    await expect(joinWithPin(h.db, g, s.GRP05, good, "5.5.5.5")).rejects.toThrow("PIN_LOCKED");
    expect(await joinWithPin(h.db, g, s.GRP05, good, "6.6.6.6")).toHaveLength(1);
  });

  it("a new PIN signs the phone out; a new group link stops the old one but keeps phones in", async () => {
    const s = await ids();
    const [a] = await joinWithPin(h.db, g, s.GRP04, await pinOf("GRP04"), "7.7.7.7");
    const old = await groupToken(h.db, org, chitId);
    const fresh = await groupToken(h.db, org, chitId, true);
    expect(await resolveGroup(h.db, old)).toBeNull();
    expect(await resolveGroup(h.db, fresh)).not.toBeNull();
    expect(await resolveLink(h.db, a.token)).not.toBeNull();
    const before = await pinOf("GRP04");
    const next = await resetPin(h.db, org, s.GRP04);
    expect(await resolveLink(h.db, a.token)).toBeNull();
    expect(await on()).not.toContain(s.GRP04);
    if (before !== next) await expect(joinWithPin(h.db, g, s.GRP04, before, "7.7.7.7")).rejects.toThrow("PIN_WRONG");
    await joinWithPin(h.db, g, s.GRP04, next, "7.7.7.7");
  });

  it("draft edits: a new mobile drops the old PIN and phones; a connected ID can still be removed", async () => {
    const s = await ids();
    await updateSeat(h.db, org, s.GRP04, { name: "Selvi R", phone: "9700000002" });
    expect(await on()).toContain(s.GRP04); // same mobile: nothing lost
    const mine = await pinOf("GRP05");
    await updateSeat(h.db, org, s.GRP05, { name: "Mani", phone: "9700000009" });
    expect(await on()).not.toContain(s.GRP05);
    await expect(joinWithPin(h.db, g, s.GRP05, mine, "8.8.8.8")).rejects.toThrow(/PIN_NOT_SET|PIN_WRONG/);
    await removeSeat(h.db, org, s.GRP04);
    expect(await on()).not.toContain(s.GRP04);
  });

  it("transfer in a running chit clears the PIN and signs the old phone out", async () => {
    const s = seat("M19");
    const mg = (await resolveGroup(h.db, await groupToken(h.db, org, d.chit.id))) as Group;
    const [a] = await joinWithPin(h.db, mg, s.id, pin("M19"), "9.9.9.9");
    await transferSeat(h.db, org, s.id, { name: "New", phone: "9711111111" });
    expect(await resolveLink(h.db, a.token)).toBeNull();
    await expect(joinWithPin(h.db, mg, s.id, pin("M19"), "9.9.9.9")).rejects.toThrow("PIN_NOT_SET");
  });

  it("a paused organiser's group link says 'paused'", async () => {
    const t = await groupToken(h.db, org, chitId);
    await setOrganiserActive(h.db, ADMIN, org, false);
    expect(await resolveGroup(h.db, t)).toBe("paused");
    await setOrganiserActive(h.db, ADMIN, org, true);
  });
});
