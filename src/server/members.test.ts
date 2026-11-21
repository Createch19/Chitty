/**
 * Phase 3: member links, the member's views (privacy), 20 phones bidding at once, the live SSE stream,
 * reconnect, and link revoke.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Handle } from "@/db/client";
import { bid } from "@/db/schema";
import { createOrganiser, setOrganiserActive } from "./accounts";
import { addSeat, createChit, getChitDetail, openMonth, setPaid, startChit } from "./chits";
import { listeners, publish } from "./events";
import { bidRateOk, issueLink, linkStatus, memberBid, memberHome, memberJoin, memberRoom, resolveLink, revokeLink, type Link } from "./members";
import { GET as memberEvents } from "@/app/api/m/[token]/rooms/[monthId]/events/route";

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
    const res = await Promise.allSettled(codes.map(async (c, i) => memberBid(h.db, await link(c), month2(), 143000 + 500 * i)));
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
    const res = await Promise.allSettled(codes.map(async (c) => memberBid(h.db, await link(c), month2(), amount)));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
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
    await memberBid(h.db, await link(bidder), month2(), snap.nextMinPaise / 100);
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
