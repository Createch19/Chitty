/**
 * Member side (BUSINESS-CONCEPT §10–§11). A member has no login: each member ID has one secret link
 * /m/<token>. Only the SHA-256 of the token is stored. Members see IDs (or ID + name if the chit says so),
 * never phones or Aadhaar, and never other members' payments or past results.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { DB, Tx } from "@/db/client";
import { auditLog, bid, chit, memberLink, month, organiser, payment, roomJoin, seat } from "@/db/schema";
import { withOrganiser } from "@/db/tenant";
import { minimumDiscount, monthlyPayment } from "@/domain/money";
import { lastPayDate, nextValidBid } from "@/domain/rules";
import { newToken, sha256 } from "./accounts";
import { ChitError, joinRoom, placeBid, seatCode, termsOf } from "./chits";
import { publish } from "./events";
import { checkPin } from "./pins";

export type Link = { linkId: string; organiserId: string; seatId: string; chitId: string };

/* ------------------------------ links (organiser) ------------------------------ */

/** New link for a seat; any older link stops working. The token is returned once and never stored. */
export async function issueLink(db: DB, orgId: string, seatId: string, now = new Date()) {
  const token = newToken();
  const live = await withOrganiser(db, orgId, async (tx) => {
    const [s] = await tx.select().from(seat).where(eq(seat.id, seatId));
    if (!s) throw new ChitError("SEAT_NOT_FOUND");
    const revoked = await tx.update(memberLink).set({ revokedAt: now }).where(and(eq(memberLink.seatId, seatId), isNull(memberLink.revokedAt))).returning({ id: memberLink.id });
    await tx.insert(memberLink).values({ organiserId: orgId, seatId, tokenHash: sha256(token), createdAt: now });
    await tx.insert(auditLog).values({ organiserId: orgId, actorKind: "organiser", actorId: orgId, action: revoked.length ? "link.regenerate" : "link.create", details: { seatId } });
    return revoked.length ? openMonths(tx, s.chitId) : [];
  });
  live.forEach(publish); // a phone still on the old link gets "gone" at once
  return token;
}

export async function revokeLink(db: DB, orgId: string, seatId: string, now = new Date()) {
  const { n, live } = await withOrganiser(db, orgId, async (tx) => {
    const r = await tx.update(memberLink).set({ revokedAt: now }).where(and(eq(memberLink.seatId, seatId), isNull(memberLink.revokedAt))).returning({ id: memberLink.id });
    await tx.insert(auditLog).values({ organiserId: orgId, actorKind: "organiser", actorId: orgId, action: "link.revoke", details: { seatId, revoked: r.length } });
    const [s] = r.length ? await tx.select({ chitId: seat.chitId }).from(seat).where(eq(seat.id, seatId)) : [];
    return { n: r.length, live: s ? await openMonths(tx, s.chitId) : [] };
  });
  live.forEach(publish);
  return n;
}

async function openMonths(tx: Tx, chitId: string) {
  return (await tx.select({ id: month.id }).from(month).where(and(eq(month.chitId, chitId), eq(month.status, "open")))).map((m) => m.id);
}

/** Seats whose member signed in with the PIN on at least one phone (and since when). */
export async function connectedSeats(db: DB, orgId: string, chitId: string) {
  return withOrganiser(db, orgId, (tx) =>
    tx
      .select({ seatId: memberLink.seatId, since: sql<string>`min(${memberLink.createdAt})`.mapWith(String) })
      .from(memberLink)
      .innerJoin(seat, eq(seat.id, memberLink.seatId))
      .where(and(eq(seat.chitId, chitId), eq(memberLink.kind, "device"), isNull(memberLink.revokedAt)))
      .groupBy(memberLink.seatId),
  );
}

/** Which seats of a chit have a working private link (and since when). */
export async function linkStatus(db: DB, orgId: string, chitId: string) {
  return withOrganiser(db, orgId, (tx) =>
    tx
      .select({ seatId: memberLink.seatId, createdAt: memberLink.createdAt })
      .from(memberLink)
      .innerJoin(seat, eq(seat.id, memberLink.seatId))
      .where(and(eq(seat.chitId, chitId), eq(memberLink.kind, "link"), isNull(memberLink.revokedAt))),
  );
}

/* ------------------------------ resolving a link ------------------------------ */

/** Token → link. Runs as the owner (the token is the credential). Paused organisers return "paused". */
export async function resolveLink(db: DB, token: string): Promise<Link | "paused" | null> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const rows = (await db.execute(sql`
    select l.id as "linkId", l.organiser_id as "organiserId", l.seat_id as "seatId", s.chit_id as "chitId", o.active
    from member_link l join seat s on s.id = l.seat_id join organiser o on o.id = l.organiser_id
    where l.token_hash = ${sha256(token)} and l.revoked_at is null
  `)) as unknown as { rows?: (Link & { active: boolean })[] } | (Link & { active: boolean })[];
  const r = (Array.isArray(rows) ? rows : (rows.rows ?? []))[0];
  if (!r) return null;
  if (!r.active) return "paused";
  return { linkId: r.linkId, organiserId: r.organiserId, seatId: r.seatId, chitId: r.chitId };
}

/* ------------------------------ member views ------------------------------ */

export async function memberHome(db: DB, link: Link) {
  return withOrganiser(db, link.organiserId, async (tx) => {
    const [org] = await tx.select({ business: organiser.businessName, businessTa: organiser.businessNameTa }).from(organiser);
    const [c] = await tx.select().from(chit).where(eq(chit.id, link.chitId));
    const [me] = await tx.select().from(seat).where(eq(seat.id, link.seatId));
    const t = termsOf(c);
    const months = await tx.select().from(month).where(eq(month.chitId, c.id)).orderBy(asc(month.month));
    const pays = await tx.select().from(payment).where(eq(payment.seatId, me.id));
    const history = months
      .filter((m) => m.status === "closed")
      .map((m) => {
        const p = pays.find((x) => x.monthId === m.id);
        // the month this ID won: its own share comes out of the payout, so it is never "due"
        return { month: m.month, amountPaise: monthlyPayment(t, m.discountPaise ?? 0).payPaise, paid: Boolean(p?.paid), adjusted: Boolean(p?.adjusted), atPayout: m.winnerSeatId === me.id && !p?.paid, lastPayDate: lastPayDate(m.auctionDate) };
      });
    const open = months.find((m) => m.status === "open");
    const next = months.find((m) => m.status === "pending");
    const won = months.find((m) => m.winnerSeatId === me.id);
    return {
      business: org.business,
      businessTa: org.businessTa,
      chit: { code: c.code, totalPaise: t.totalPaise, months: t.months, status: c.status, openTime: c.openTime.slice(0, 5) },
      me: { seatId: me.id, code: seatCode(c.code, me.number), name: me.name, wonMonth: won?.month ?? null, wonPrizePaise: won ? t.totalPaise - (won.discountPaise ?? 0) : null },
      open: open ? { id: open.id, month: open.month, bidding: open.bidding } : null,
      next: next ? { month: next.month, auctionDate: next.auctionDate } : null,
      history,
      schedule: Array.from({ length: t.months }, (_, i) => ({ month: i + 1, minDiscountPaise: minimumDiscount(t, i + 1) })),
    };
  });
}

/** Everything one member's phone needs to draw the live room. */
export async function memberRoom(db: DB, link: Link, monthId: string) {
  return withOrganiser(db, link.organiserId, async (tx) => {
    const [m] = await tx.select().from(month).where(and(eq(month.id, monthId), eq(month.chitId, link.chitId)));
    if (!m) throw new ChitError("MONTH_NOT_FOUND");
    const [c] = await tx.select().from(chit).where(eq(chit.id, m.chitId));
    const [org] = await tx.select({ business: organiser.businessName, businessTa: organiser.businessNameTa }).from(organiser);
    const t = termsOf(c);
    const seats = await tx.select().from(seat).where(eq(seat.chitId, c.id)).orderBy(asc(seat.number));
    // seats that won an EARLIER month (greyed out; they cannot bid)
    const wins = await tx.select({ id: month.winnerSeatId, k: month.month }).from(month).where(eq(month.chitId, c.id));
    const wonIds = new Set(wins.filter((w) => w.id && w.k !== m.month).map((w) => w.id as string));
    const joined = new Set((await tx.select({ s: roomJoin.seatId }).from(roomJoin).where(eq(roomJoin.monthId, m.id))).map((r) => r.s));
    const bids = await tx.select().from(bid).where(eq(bid.monthId, m.id)).orderBy(asc(bid.id));
    const arrears = await tx
      .select({ discountPaise: month.discountPaise })
      .from(payment)
      .innerJoin(month, eq(month.id, payment.monthId))
      .where(and(eq(payment.seatId, link.seatId), eq(payment.paid, false), sql`${month.month} < ${m.month}`));
    const label = (s: (typeof seats)[number]) => (c.display === "name" ? `${seatCode(c.code, s.number)} · ${s.name}` : seatCode(c.code, s.number));
    const idx = new Map(seats.map((s, i) => [s.id, i]));
    const top = bids.length ? bids[bids.length - 1] : null; // bids only ever go up
    const meIdx = idx.get(link.seatId)!;
    return {
      business: org.business,
      businessTa: org.businessTa,
      chit: { code: c.code, totalPaise: t.totalPaise, months: t.months, incrementPaise: t.incrementPaise },
      month: {
        id: m.id,
        month: m.month,
        status: m.status,
        bidding: m.bidding,
        minDiscountPaise: m.minDiscountPaise,
        discountPaise: m.discountPaise,
        lottery: m.lottery,
        winner: m.winnerSeatId ? idx.get(m.winnerSeatId)! : null,
        lastPayDate: lastPayDate(m.auctionDate),
        payPaise: m.discountPaise != null ? monthlyPayment(t, m.discountPaise).payPaise : null,
      },
      seats: seats.map((s) => ({ n: s.number, label: label(s), joined: joined.has(s.id), won: wonIds.has(s.id) })),
      bids: bids.map((b) => ({ id: b.id, seat: idx.get(b.seatId)!, amountPaise: b.amountPaise, at: b.at.toISOString() })),
      leader: top ? idx.get(top.seatId)! : null,
      nextMinPaise: nextValidBid(m.minDiscountPaise, t.incrementPaise, top?.amountPaise ?? null),
      me: { index: meIdx, joined: joined.has(link.seatId), won: wonIds.has(link.seatId), arrearsPaise: arrears.reduce((a, x) => a + monthlyPayment(t, x.discountPaise ?? 0).payPaise, 0) },
    };
  });
}

export type RoomSnapshot = Awaited<ReturnType<typeof memberRoom>>;

/* ------------------------------ member actions ------------------------------ */

const g = globalThis as unknown as { __chittyBidRate?: Map<string, number[]> };
const rate: Map<string, number[]> = (g.__chittyBidRate ??= new Map<string, number[]>());

/** At most 8 bid attempts per 10 seconds per seat (stops a stuck button or a script). */
export function bidRateOk(seatId: string, now = Date.now()) {
  const recent = (rate.get(seatId) ?? []).filter((t) => now - t < 10_000);
  if (recent.length >= 8) {
    rate.set(seatId, recent);
    return false;
  }
  recent.push(now);
  rate.set(seatId, recent);
  return true;
}

export async function memberJoin(db: DB, link: Link, monthId: string) {
  const r = await memberRoom(db, link, monthId); // also proves the month belongs to this seat's chit
  if (r.month.status !== "open") throw new ChitError("AUCTION_NOT_OPEN");
  await joinRoom(db, link.organiserId, monthId, link.seatId);
}

export async function memberBid(db: DB, link: Link, monthId: string, amountRupees: number, pin: string, ip = "local") {
  await memberRoom(db, link, monthId);
  await checkPin(db, link, pin, ip, { monthId, amountRupees });
  if (!bidRateOk(link.seatId)) throw new ChitError("TOO_FAST"); // after the PIN: a stranger can't use up the member's tries
  return placeBid(db, link.organiserId, monthId, link.seatId, amountRupees);
}
