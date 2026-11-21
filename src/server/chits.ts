/**
 * Chit operations for one organiser (docs/BUSINESS-CONCEPT.md §3–§9).
 * Every function runs inside withOrganiser(): PostgreSQL RLS limits it to that organiser's rows,
 * and row locks (SELECT … FOR UPDATE on the month) serialise anything that changes a month.
 */
import { randomInt } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { DB, Tx } from "@/db/client";
import { auditLog, bid, chit, memberLink, month, organiser, payment, payout, pushSubscription, roomJoin, seat } from "@/db/schema";
import { withOrganiser } from "@/db/tenant";
import { MoneyError, makeTerms, monthlyPayment, type Terms } from "@/domain/money";
import { checkBid, checkStart, isChitCode, lastPayDate, monthsToCreate, nextValidBid } from "@/domain/rules";
import { AccountError, normalizeMobile } from "./accounts";
import { publish } from "./events";
import { deliverLater, queueMessages } from "./notify";

export class ChitError extends Error {
  constructor(
    public code: string,
    public details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "ChitError";
  }
}

export type Actor = { kind: "organiser" | "member" | "system"; id: string | null };
type ChitRow = typeof chit.$inferSelect;
type MonthRow = typeof month.$inferSelect;

export const termsOf = (c: ChitRow): Terms => ({
  totalPaise: c.totalPaise,
  months: c.months,
  rateBps: c.rateBps,
  incrementPaise: c.incrementPaise,
  installmentPaise: c.totalPaise / c.months,
  interestPaise: (c.totalPaise * c.rateBps) / 10000,
});

export const seatCode = (chitCode: string, n: number) => `${chitCode}${String(n).padStart(2, "0")}`;

/** A, B, …, Z, AA, AB, … — the first code not yet used by this organiser. */
export function nextChitCode(used: string[]): string {
  const taken = new Set(used);
  for (let i = 0; ; i++) {
    let n = i;
    let code = "";
    do {
      code = String.fromCharCode(65 + (n % 26)) + code;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    if (!taken.has(code)) return code;
  }
}

async function audit(tx: Tx, organiserId: string, actor: Actor, action: string, details: object) {
  await tx.insert(auditLog).values({ organiserId, actorKind: actor.kind, actorId: actor.id, action, details });
}

export function cleanName(v: unknown) {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  if (s.length < 1 || s.length > 60) throw new ChitError("INVALID_NAME");
  return s;
}
export function cleanPhone(v: unknown) {
  try {
    return normalizeMobile(String(v ?? ""));
  } catch (e) {
    if (e instanceof AccountError) throw new ChitError("INVALID_PHONE");
    throw e;
  }
}

async function lockChit(tx: Tx, chitId: string) {
  const [c] = await tx.select().from(chit).where(eq(chit.id, chitId)).for("update");
  if (!c) throw new ChitError("CHIT_NOT_FOUND");
  return c;
}
async function lockMonth(tx: Tx, monthId: string) {
  const [m] = await tx.select().from(month).where(eq(month.id, monthId)).for("update");
  if (!m) throw new ChitError("MONTH_NOT_FOUND");
  return m;
}
async function chitOf(tx: Tx, chitId: string) {
  const [c] = await tx.select().from(chit).where(eq(chit.id, chitId));
  if (!c) throw new ChitError("CHIT_NOT_FOUND");
  return c;
}

/* ============================== chits & seats ============================== */

export type NewChit = { totalRupees: number; months: number; ratePct?: number; incrementRupees?: number; code?: string; openTime?: string; display?: "id" | "name" };

export async function createChit(db: DB, orgId: string, input: NewChit): Promise<string> {
  let terms: Terms;
  try {
    terms = makeTerms(input);
  } catch (e) {
    if (e instanceof MoneyError) throw new ChitError(e.code);
    throw e;
  }
  const openTime = input.openTime ?? "09:00";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(openTime)) throw new ChitError("INVALID_TIME");
  return withOrganiser(db, orgId, async (tx) => {
    const used = (await tx.select({ code: chit.code }).from(chit)).map((r) => r.code);
    const code = input.code ? input.code.trim().toUpperCase() : nextChitCode(used);
    if (!isChitCode(code)) throw new ChitError("INVALID_CODE");
    if (used.includes(code)) throw new ChitError("CODE_TAKEN");
    const [c] = await tx
      .insert(chit)
      .values({
        organiserId: orgId,
        code,
        totalPaise: terms.totalPaise,
        months: terms.months,
        rateBps: terms.rateBps,
        incrementPaise: terms.incrementPaise,
        openTime,
        display: input.display ?? "id",
      })
      .returning({ id: chit.id });
    // The organiser's own seat is #1 by default; it wins month 1.
    const [me] = await tx.select({ name: organiser.ownerName, mobile: organiser.mobile }).from(organiser);
    await tx.insert(seat).values({ organiserId: orgId, chitId: c.id, number: 1, name: me.name, phone: me.mobile, isOrganiser: true });
    await audit(tx, orgId, { kind: "organiser", id: orgId }, "chit.create", { chitId: c.id, code, ...terms });
    return c.id;
  });
}

async function draftChit(tx: Tx, chitId: string) {
  const c = await lockChit(tx, chitId);
  if (c.status !== "draft") throw new ChitError("CHIT_NOT_DRAFT");
  return c;
}

/** Seat numbers fill the lowest free number. Names and phones need not be unique. */
export async function addSeat(db: DB, orgId: string, chitId: string, input: { name: string; phone: string }) {
  const name = cleanName(input.name);
  const phone = cleanPhone(input.phone);
  return withOrganiser(db, orgId, async (tx) => {
    const c = await draftChit(tx, chitId);
    const used = new Set((await tx.select({ n: seat.number }).from(seat).where(eq(seat.chitId, chitId))).map((r) => r.n));
    if (used.size >= c.months) throw new ChitError("CHIT_FULL");
    let n = 1;
    while (used.has(n)) n++;
    const [s] = await tx.insert(seat).values({ organiserId: orgId, chitId, number: n, name, phone }).returning({ id: seat.id });
    return { id: s.id, number: n, code: seatCode(c.code, n) };
  });
}

export async function updateSeat(db: DB, orgId: string, seatId: string, input: { name: string; phone: string }) {
  const name = cleanName(input.name);
  const phone = cleanPhone(input.phone);
  return withOrganiser(db, orgId, async (tx) => {
    const [s] = await tx.select().from(seat).where(eq(seat.id, seatId));
    if (!s) throw new ChitError("SEAT_NOT_FOUND");
    await draftChit(tx, s.chitId);
    await tx.update(seat).set({ name, phone }).where(eq(seat.id, seatId));
  });
}

export async function removeSeat(db: DB, orgId: string, seatId: string) {
  return withOrganiser(db, orgId, async (tx) => {
    const [s] = await tx.select().from(seat).where(eq(seat.id, seatId));
    if (!s) throw new ChitError("SEAT_NOT_FOUND");
    await draftChit(tx, s.chitId);
    if (s.isOrganiser) throw new ChitError("ORGANISER_SEAT");
    await tx.delete(seat).where(eq(seat.id, seatId));
  });
}

/** Delete a chit that has not started: its member IDs (and any links / app subscriptions) go with it. */
export async function deleteChit(db: DB, orgId: string, chitId: string) {
  return withOrganiser(db, orgId, async (tx) => {
    const c = await draftChit(tx, chitId);
    const seats = await tx.select({ id: seat.id }).from(seat).where(eq(seat.chitId, chitId));
    const ids = seats.map((s) => s.id);
    if (ids.length) {
      await tx.delete(pushSubscription).where(inArray(pushSubscription.seatId, ids));
      await tx.delete(memberLink).where(inArray(memberLink.seatId, ids));
      await tx.delete(seat).where(eq(seat.chitId, chitId));
    }
    await tx.delete(chit).where(eq(chit.id, chitId));
    await audit(tx, orgId, { kind: "organiser", id: orgId }, "chit.delete", { chitId, code: c.code, seats: ids.length });
  });
}

/** Pick which seat is the organiser's own (it wins month 1). */
export async function setOrganiserSeat(db: DB, orgId: string, chitId: string, seatId: string) {
  return withOrganiser(db, orgId, async (tx) => {
    await draftChit(tx, chitId);
    const [s] = await tx.select().from(seat).where(and(eq(seat.id, seatId), eq(seat.chitId, chitId)));
    if (!s) throw new ChitError("SEAT_NOT_FOUND");
    await tx.update(seat).set({ isOrganiser: false }).where(eq(seat.chitId, chitId));
    await tx.update(seat).set({ isOrganiser: true }).where(eq(seat.id, seatId));
  });
}

/** Start: every seat filled, start day 1–28. Creates all months; month 1 goes to the organiser's seat. */
export async function startChit(db: DB, orgId: string, chitId: string, startDate: string, now = new Date()) {
  const notes = await withOrganiser(db, orgId, async (tx) => {
    const c = await lockChit(tx, chitId);
    const seats = await tx.select().from(seat).where(eq(seat.chitId, chitId));
    const own = seats.find((s) => s.isOrganiser);
    const ok = checkStart({ status: c.status, seats: seats.length, months: c.months, hasOrganiserSeat: Boolean(own), startDate });
    if (!ok.ok) throw new ChitError(ok.code);
    const rows = monthsToCreate(termsOf(c), startDate);
    const inserted = await tx
      .insert(month)
      .values(rows.map((r) => ({ organiserId: orgId, chitId, month: r.month, auctionDate: r.auctionDate, bidding: r.bidding, minDiscountPaise: r.minDiscountPaise })))
      .returning();
    await tx.update(chit).set({ status: "active", startDate }).where(eq(chit.id, chitId));
    await audit(tx, orgId, { kind: "organiser", id: orgId }, "chit.start", { chitId, startDate });
    const first = inserted.find((m) => m.month === 1)!;
    return settleMonth(tx, orgId, { ...c, status: "active" }, first, own!.id, 0, false, now, { kind: "system", id: null });
  });
  deliverLater(db, orgId, notes);
}

/* ============================== months ============================== */

/** Close a month with its winner: create everyone's payment row and the payout row. */
export async function settleMonth(tx: Tx, orgId: string, c: ChitRow, m: MonthRow, winnerSeatId: string, discountPaise: number, lottery: boolean, now: Date, actor: Actor, quiet = false) {
  const terms = termsOf(c);
  const pay = monthlyPayment(terms, discountPaise);
  await tx
    .update(month)
    .set({ status: "closed", winnerSeatId, discountPaise, lottery, closedAt: now, openedAt: m.openedAt ?? now })
    .where(eq(month.id, m.id));
  const seats = await tx.select({ id: seat.id }).from(seat).where(eq(seat.chitId, c.id));
  await tx.insert(payment).values(seats.map((s) => ({ organiserId: orgId, monthId: m.id, seatId: s.id, updatedAt: now })));
  await tx.insert(payout).values({ organiserId: orgId, monthId: m.id, prizePaise: pay.prizePaise, cashPaise: pay.prizePaise - pay.payPaise });
  await audit(tx, orgId, actor, "month.close", { monthId: m.id, month: m.month, winnerSeatId, discountPaise, lottery, payPaise: pay.payPaise });
  if (quiet) return []; // imported history: no messages
  return queueMessages(tx, orgId, m.id, "closed", "all", now); // "this month pay ₹X, last day DD/MM" to every ID
}

async function previousClosed(tx: Tx, m: MonthRow) {
  if (m.month === 1) return true;
  const [p] = await tx.select({ status: month.status }).from(month).where(and(eq(month.chitId, m.chitId), eq(month.month, m.month - 1)));
  return p?.status === "closed";
}

async function seatsNotWon(tx: Tx, chitId: string) {
  const won = await tx.select({ id: month.winnerSeatId }).from(month).where(and(eq(month.chitId, chitId), isNotNull(month.winnerSeatId)));
  const wonIds = new Set(won.map((w) => w.id));
  return (await tx.select().from(seat).where(eq(seat.chitId, chitId)).orderBy(asc(seat.number))).filter((s) => !wonIds.has(s.id));
}

/** Open a month's auction (the scheduler does this at the open time; the organiser can do it early).
 *  The last month has no auction: the one remaining seat wins at once. */
export async function openMonth(db: DB, orgId: string, monthId: string, now = new Date(), actor: Actor = { kind: "organiser", id: orgId }) {
  let notes: string[] = [];
  const r = await withOrganiser(db, orgId, async (tx) => {
    const m = await lockMonth(tx, monthId);
    const c = await chitOf(tx, m.chitId);
    if (c.status !== "active") throw new ChitError("CHIT_NOT_ACTIVE");
    if (m.status !== "pending") throw new ChitError("MONTH_NOT_PENDING");
    if (!(await previousClosed(tx, m))) throw new ChitError("PREVIOUS_NOT_CLOSED");
    if (m.month === c.months) {
      const remaining = await seatsNotWon(tx, c.id);
      if (remaining.length !== 1) throw new ChitError("INTERNAL_STATE", { remaining: remaining.length });
      notes = await settleMonth(tx, orgId, c, m, remaining[0].id, 0, false, now, actor);
      return "closed" as const;
    }
    await tx.update(month).set({ status: "open", openedAt: now }).where(eq(month.id, m.id));
    await audit(tx, orgId, actor, "month.open", { monthId, month: m.month });
    notes = await queueMessages(tx, orgId, m.id, "open", "all", now);
    return "open" as const;
  });
  publish(monthId);
  deliverLater(db, orgId, notes);
  return r;
}

/** Move one pending month's auction date (festival etc.). Must stay between its neighbours. */
export async function changeAuctionDate(db: DB, orgId: string, monthId: string, newDate: string) {
  let notes: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || Number.isNaN(Date.parse(newDate + "T00:00:00Z"))) throw new ChitError("INVALID_DATE");
  const r = await withOrganiser(db, orgId, async (tx) => {
    const m = await lockMonth(tx, monthId);
    if (m.status !== "pending") throw new ChitError("MONTH_NOT_PENDING");
    const near = await tx
      .select({ month: month.month, date: month.auctionDate })
      .from(month)
      .where(and(eq(month.chitId, m.chitId), inArray(month.month, [m.month - 1, m.month + 1])));
    const prev = near.find((x) => x.month === m.month - 1);
    const next = near.find((x) => x.month === m.month + 1);
    if ((prev && newDate <= prev.date) || (next && newDate >= next.date)) throw new ChitError("DATE_OUT_OF_ORDER");
    await tx.update(month).set({ auctionDate: newDate }).where(eq(month.id, monthId));
    await audit(tx, orgId, { kind: "organiser", id: orgId }, "month.date_change", { monthId, month: m.month, from: m.auctionDate, to: newDate });
    notes = await queueMessages(tx, orgId, monthId, "date");
  });
  publish(monthId);
  deliverLater(db, orgId, notes);
  return r;
}

export async function joinRoom(db: DB, orgId: string, monthId: string, seatId: string, now = new Date()) {
  const r = await withOrganiser(db, orgId, async (tx) => {
    const [m] = await tx.select().from(month).where(eq(month.id, monthId));
    if (!m) throw new ChitError("MONTH_NOT_FOUND");
    if (m.status !== "open") throw new ChitError("AUCTION_NOT_OPEN");
    await tx.insert(roomJoin).values({ organiserId: orgId, monthId, seatId, joinedAt: now }).onConflictDoNothing();
  });
  publish(monthId);
  return r;
}

/** Unpaid (and not adjusted) installments of earlier months. */
async function arrearsOf(tx: Tx, seatId: string, beforeMonth: number) {
  return tx
    .select({ monthId: month.id, month: month.month, discountPaise: month.discountPaise })
    .from(payment)
    .innerJoin(month, eq(month.id, payment.monthId))
    .where(and(eq(payment.seatId, seatId), eq(payment.paid, false), lt(month.month, beforeMonth)))
    .orderBy(asc(month.month));
}

export type BidResult = { bidId: number; amountPaise: number; at: Date; nextMinPaise: number };

/**
 * Place a bid for a seat. The caller (the member link, Phase 3) has already proven the seat is theirs.
 * The month row is locked, so two bids at the same moment are handled one after the other.
 * Rejections are audited (committed) before the error is thrown.
 */
export async function placeBid(db: DB, orgId: string, monthId: string, seatId: string, amountRupees: number, now = new Date()): Promise<BidResult> {
  const amountPaise = Number.isSafeInteger(amountRupees) && Number.isSafeInteger(amountRupees * 100) ? amountRupees * 100 : NaN;
  const res = await withOrganiser(db, orgId, async (tx) => {
    const m = await lockMonth(tx, monthId);
    const c = await chitOf(tx, m.chitId);
    const [top] = await tx.select().from(bid).where(eq(bid.monthId, monthId)).orderBy(desc(bid.amountPaise)).limit(1);
    const [s] = await tx.select().from(seat).where(and(eq(seat.id, seatId), eq(seat.chitId, c.id)));
    const won = s ? (await tx.select({ n: count() }).from(month).where(and(eq(month.chitId, c.id), eq(month.winnerSeatId, s.id))))[0].n > 0 : false;
    const joined = s ? (await tx.select({ n: count() }).from(roomJoin).where(and(eq(roomJoin.monthId, monthId), eq(roomJoin.seatId, s.id))))[0].n > 0 : false;
    const arrears = s ? await arrearsOf(tx, s.id, m.month) : [];
    const check = checkBid({
      month: { status: m.status as "open", bidding: m.bidding, minDiscountPaise: m.minDiscountPaise },
      terms: termsOf(c),
      leader: top ? { seatId: top.seatId, amountPaise: top.amountPaise } : null,
      seat: { id: seatId, ownedByBidder: Boolean(s), alreadyWon: won, joined, hasArrears: arrears.length > 0 },
      amountPaise,
    });
    const actor: Actor = { kind: "member", id: seatId };
    if (!check.ok) {
      await audit(tx, orgId, actor, "bid.reject", { monthId, seatId, amountRupees, code: check.code });
      return { error: new ChitError(check.code, { minPaise: check.minPaise }) };
    }
    const [b] = await tx.insert(bid).values({ organiserId: orgId, monthId, seatId, amountPaise, at: now }).returning({ id: bid.id });
    await audit(tx, orgId, actor, "bid.place", { monthId, seatId, bidId: b.id, amountPaise, previous: top?.amountPaise ?? null });
    return { ok: { bidId: b.id, amountPaise, at: now, nextMinPaise: nextValidBid(m.minDiscountPaise, c.incrementPaise, amountPaise) } };
  });
  if ("error" in res) throw res.error;
  publish(monthId);
  return res.ok;
}

/** Organiser closes the auction (Yes is final). Highest bid wins; with no bids, use runLottery(). */
export async function closeAuction(db: DB, orgId: string, monthId: string, now = new Date()) {
  let notes: string[] = [];
  const r = await withOrganiser(db, orgId, async (tx) => {
    const m = await lockMonth(tx, monthId);
    if (m.status !== "open") throw new ChitError("AUCTION_NOT_OPEN");
    const [top] = await tx.select().from(bid).where(eq(bid.monthId, monthId)).orderBy(desc(bid.amountPaise)).limit(1);
    if (!top) throw new ChitError("NO_BIDS");
    const c = await chitOf(tx, m.chitId);
    notes = await settleMonth(tx, orgId, c, m, top.seatId, top.amountPaise, false, now, { kind: "organiser", id: orgId });
    return { winnerSeatId: top.seatId, discountPaise: top.amountPaise };
  });
  publish(monthId);
  deliverLater(db, orgId, notes);
  return r;
}

/** No bids: every seat that has not won joins the draw (absent and arrears too); prize at the minimum. */
export async function runLottery(db: DB, orgId: string, monthId: string, now = new Date(), pick: (n: number) => number = (n) => randomInt(n)) {
  let notes: string[] = [];
  const r = await withOrganiser(db, orgId, async (tx) => {
    const m = await lockMonth(tx, monthId);
    if (m.status !== "open") throw new ChitError("AUCTION_NOT_OPEN");
    const [{ n }] = await tx.select({ n: count() }).from(bid).where(eq(bid.monthId, monthId));
    if (n > 0) throw new ChitError("HAS_BIDS");
    const c = await chitOf(tx, m.chitId);
    const pool = await seatsNotWon(tx, c.id);
    const i = pick(pool.length);
    const winner = pool[i];
    await audit(tx, orgId, { kind: "organiser", id: orgId }, "month.lottery", { monthId, month: m.month, pool: pool.map((p) => p.id), pick: i, winnerSeatId: winner.id });
    notes = await settleMonth(tx, orgId, c, m, winner.id, m.minDiscountPaise, true, now, { kind: "organiser", id: orgId });
    return { winnerSeatId: winner.id, discountPaise: m.minDiscountPaise, poolSize: pool.length };
  });
  publish(monthId);
  deliverLater(db, orgId, notes);
  return r;
}

/* ============================== collection & payout ============================== */

/** Tick or untick Paid. The winner's own share is settled at payout, not here. */

/** Payments change who has arrears, and arrears decide who may bid: refresh this chit's open room too. */
async function openRoomsOf(tx: Tx, chitId: string) {
  return (await tx.select({ id: month.id }).from(month).where(and(eq(month.chitId, chitId), eq(month.status, "open")))).map((x) => x.id);
}

export async function setPaid(db: DB, orgId: string, monthId: string, seatId: string, paid: boolean, now = new Date()) {
  let live: string[] = [];
  let notes: string[] = [];
  const r = await withOrganiser(db, orgId, async (tx) => {
    const m = await lockMonth(tx, monthId);
    if (m.status !== "closed") throw new ChitError("MONTH_NOT_CLOSED");
    if (m.winnerSeatId === seatId) throw new ChitError("WINNER_AT_PAYOUT");
    const [p] = await tx.select().from(payment).where(and(eq(payment.monthId, monthId), eq(payment.seatId, seatId)));
    if (!p) throw new ChitError("SEAT_NOT_FOUND");
    if (p.adjusted) throw new ChitError("ADJUSTED_AT_PAYOUT");
    if (!paid) {
      const [po] = await tx.select({ done: payout.done }).from(payout).where(eq(payout.monthId, monthId));
      if (po?.done) throw new ChitError("PAYOUT_ALREADY_DONE");
    }
    if (p.paid === paid) return;
    await tx.update(payment).set({ paid, updatedAt: now }).where(and(eq(payment.monthId, monthId), eq(payment.seatId, seatId)));
    await audit(tx, orgId, { kind: "organiser", id: orgId }, paid ? "payment.paid" : "payment.unpaid", { monthId, month: m.month, seatId });
    live = await openRoomsOf(tx, m.chitId);
    notes = await queueMessages(tx, orgId, monthId, paid ? "receipt" : "correction", { seatIds: [seatId] }, now); // receipt / correction to that ID only
  });
  publish(monthId);
  live.forEach(publish);
  deliverLater(db, orgId, notes);
  return r;
}

async function summary(tx: Tx, m: MonthRow) {
  const c = await chitOf(tx, m.chitId);
  const terms = termsOf(c);
  const pay = monthlyPayment(terms, m.discountPaise ?? 0);
  const pays = await tx.select().from(payment).where(eq(payment.monthId, m.id));
  const [po] = await tx.select().from(payout).where(eq(payout.monthId, m.id));
  const winner = m.winnerSeatId!;
  const arrearsRows = po?.done ? [] : await arrearsOf(tx, winner, m.month);
  const arrears = arrearsRows.map((a) => ({ monthId: a.monthId, month: a.month, amountPaise: monthlyPayment(terms, a.discountPaise ?? 0).payPaise }));
  const others = pays.filter((p) => p.seatId !== winner);
  const unpaid = others.filter((p) => !p.paid).map((p) => p.seatId);
  return {
    chit: c,
    terms,
    payPaise: pay.payPaise,
    prizePaise: pay.prizePaise,
    roundingDiffPaise: pay.roundingDiffPaise,
    ownPaise: pay.payPaise,
    arrears,
    cashPaise: pay.prizePaise - pay.payPaise - arrears.reduce((a, x) => a + x.amountPaise, 0),
    unpaidSeatIds: unpaid,
    paidCount: pays.filter((p) => p.paid).length,
    seatsTotal: pays.length,
    ready: unpaid.length === 0,
    done: Boolean(po?.done),
    doneAt: po?.doneAt ?? null,
    lastPayDate: lastPayDate(m.auctionDate),
  };
}

export async function payoutSummary(db: DB, orgId: string, monthId: string) {
  return withOrganiser(db, orgId, async (tx) => {
    const [m] = await tx.select().from(month).where(eq(month.id, monthId));
    if (!m) throw new ChitError("MONTH_NOT_FOUND");
    if (m.status !== "closed") throw new ChitError("MONTH_NOT_CLOSED");
    const s = await summary(tx, m);
    return {
      payPaise: s.payPaise,
      prizePaise: s.prizePaise,
      roundingDiffPaise: s.roundingDiffPaise,
      ownPaise: s.ownPaise,
      arrears: s.arrears,
      cashPaise: s.cashPaise,
      unpaidSeatIds: s.unpaidSeatIds,
      paidCount: s.paidCount,
      seatsTotal: s.seatsTotal,
      ready: s.ready,
      done: s.done,
      doneAt: s.doneAt,
      lastPayDate: s.lastPayDate,
    };
  });
}

/** Payout done: the winner's own share (and any arrears) are marked Paid (adjusted); the full prize is recorded. */
export async function markPayout(db: DB, orgId: string, monthId: string, now = new Date()) {
  let live: string[] = [];
  const r = await withOrganiser(db, orgId, async (tx) => {
    const m = await lockMonth(tx, monthId);
    const out = await payoutTx(tx, orgId, m, now, { kind: "organiser", id: orgId });
    live = await openRoomsOf(tx, m.chitId);
    return out;
  });
  publish(monthId);
  live.forEach(publish);
  return r;
}

/** The payout itself, inside a transaction (also used by the paper-chit import). */
export async function payoutTx(tx: Tx, orgId: string, m: MonthRow, now: Date, actor: Actor) {
  if (m.status !== "closed") throw new ChitError("MONTH_NOT_CLOSED");
  const s = await summary(tx, m);
  if (s.done) throw new ChitError("PAYOUT_ALREADY_DONE");
  if (!s.ready) throw new ChitError("NOT_EVERYONE_PAID", { unpaid: s.unpaidSeatIds.length });
  const winner = m.winnerSeatId!;
  const adjustIds = [m.id, ...s.arrears.map((a) => a.monthId)];
  await tx
    .update(payment)
    .set({ paid: true, adjusted: true, updatedAt: now })
    .where(and(eq(payment.seatId, winner), inArray(payment.monthId, adjustIds)));
  await tx.update(payout).set({ done: true, doneAt: now, prizePaise: s.prizePaise, cashPaise: s.cashPaise }).where(eq(payout.monthId, m.id));
  if (m.month === s.chit.months) await tx.update(chit).set({ status: "completed" }).where(eq(chit.id, s.chit.id));
  await audit(tx, orgId, actor, "payout.done", { monthId: m.id, month: m.month, winnerSeatId: winner, prizePaise: s.prizePaise, cashPaise: s.cashPaise, arrears: s.arrears });
  return { prizePaise: s.prizePaise, cashPaise: s.cashPaise, arrears: s.arrears };
}

/** Correction: untick the payout. The winner's adjusted payments go back to unpaid. */
export async function undoPayout(db: DB, orgId: string, monthId: string, now = new Date()) {
  let live: string[] = [];
  const r = await withOrganiser(db, orgId, async (tx) => {
    const m = await lockMonth(tx, monthId);
    const [po] = await tx.select().from(payout).where(eq(payout.monthId, monthId));
    if (!po?.done) throw new ChitError("PAYOUT_NOT_DONE");
    const winner = m.winnerSeatId!;
    // a seat wins once, so every adjusted payment of this seat belongs to this payout
    await tx.update(payment).set({ paid: false, adjusted: false, updatedAt: now }).where(and(eq(payment.seatId, winner), eq(payment.adjusted, true)));
    await tx.update(payout).set({ done: false, doneAt: null }).where(eq(payout.monthId, monthId));
    const c = await chitOf(tx, m.chitId);
    if (c.status === "completed") await tx.update(chit).set({ status: "active" }).where(eq(chit.id, c.id));
    await audit(tx, orgId, { kind: "organiser", id: orgId }, "payout.undo", { monthId, month: m.month });
    live = await openRoomsOf(tx, m.chitId);
  });
  publish(monthId);
  live.forEach(publish);
  return r;
}

/* ============================== read models ============================== */

export async function listChits(db: DB, orgId: string) {
  return withOrganiser(db, orgId, async (tx) => {
    const chits = await tx.select().from(chit).orderBy(asc(chit.code));
    const out = [];
    for (const c of chits) {
      const [{ n: seats }] = await tx.select({ n: count() }).from(seat).where(eq(seat.chitId, c.id));
      const months = await tx.select().from(month).where(eq(month.chitId, c.id)).orderBy(asc(month.month));
      const current = months.find((m) => m.status === "open") ?? [...months].reverse().find((m) => m.status === "closed") ?? months[0] ?? null;
      let collection = null;
      if (current?.status === "closed") {
        const s = await summary(tx, current);
        collection = { paid: s.paidCount, total: s.seatsTotal, payPaise: s.payPaise, payoutDone: s.done };
      }
      const next = months.find((m) => m.status === "pending") ?? null;
      out.push({
        id: c.id,
        code: c.code,
        status: c.status,
        terms: termsOf(c),
        seats,
        startDate: c.startDate,
        current: current ? { id: current.id, month: current.month, status: current.status, auctionDate: current.auctionDate } : null,
        next: next ? { id: next.id, month: next.month, auctionDate: next.auctionDate } : null,
        collection,
      });
    }
    return out;
  });
}

export async function getChitDetail(db: DB, orgId: string, chitId: string) {
  return withOrganiser(db, orgId, async (tx) => {
    const c = await chitOf(tx, chitId);
    const seats = await tx.select().from(seat).where(eq(seat.chitId, chitId)).orderBy(asc(seat.number));
    const months = await tx.select().from(month).where(eq(month.chitId, chitId)).orderBy(asc(month.month));
    const pays = months.length
      ? await tx
          .select({ monthId: payment.monthId, n: count() })
          .from(payment)
          .where(and(inArray(payment.monthId, months.map((m) => m.id)), eq(payment.paid, true)))
          .groupBy(payment.monthId)
      : [];
    const payouts = months.length ? await tx.select().from(payout).where(inArray(payout.monthId, months.map((m) => m.id))) : [];
    const terms = termsOf(c);
    const wonBy = new Map(months.filter((m) => m.winnerSeatId).map((m) => [m.winnerSeatId!, m.month]));
    return {
      chit: { id: c.id, code: c.code, status: c.status, startDate: c.startDate, openTime: c.openTime.slice(0, 5), display: c.display, terms },
      seats: seats.map((s) => ({ id: s.id, number: s.number, code: seatCode(c.code, s.number), name: s.name, phone: s.phone, isOrganiser: s.isOrganiser, wonMonth: wonBy.get(s.id) ?? null, aadhaarLast4: s.aadhaarLast4 })),
      months: months.map((m) => ({
        id: m.id,
        month: m.month,
        auctionDate: m.auctionDate,
        lastPayDate: lastPayDate(m.auctionDate),
        bidding: m.bidding,
        minDiscountPaise: m.minDiscountPaise,
        status: m.status,
        discountPaise: m.discountPaise,
        winnerSeatId: m.winnerSeatId,
        lottery: m.lottery,
        payPaise: m.discountPaise != null ? monthlyPayment(terms, m.discountPaise).payPaise : null,
        paidCount: pays.find((p) => p.monthId === m.id)?.n ?? 0,
        payoutDone: payouts.find((p) => p.monthId === m.id)?.done ?? false,
      })),
    };
  });
}

export async function getMonthBoard(db: DB, orgId: string, monthId: string) {
  return withOrganiser(db, orgId, async (tx) => {
    const [m] = await tx.select().from(month).where(eq(month.id, monthId));
    if (!m) throw new ChitError("MONTH_NOT_FOUND");
    const c = await chitOf(tx, m.chitId);
    const terms = termsOf(c);
    const seats = await tx.select().from(seat).where(eq(seat.chitId, c.id)).orderBy(asc(seat.number));
    const bids = await tx.select().from(bid).where(eq(bid.monthId, monthId)).orderBy(desc(bid.id));
    const joined = await tx.select({ seatId: roomJoin.seatId }).from(roomJoin).where(eq(roomJoin.monthId, monthId));
    const pays = await tx.select().from(payment).where(eq(payment.monthId, monthId));
    const won = await tx.select({ id: month.winnerSeatId, month: month.month }).from(month).where(and(eq(month.chitId, c.id), isNotNull(month.winnerSeatId)));
    const s = m.status === "closed" ? await summary(tx, m) : null;
    const top = bids.reduce<(typeof bids)[number] | null>((a, b) => (!a || b.amountPaise > a.amountPaise ? b : a), null);
    const arrearsSeatIds = new Set(
      (
        await tx
          .select({ seatId: payment.seatId })
          .from(payment)
          .innerJoin(month, eq(month.id, payment.monthId))
          .where(and(eq(month.chitId, c.id), eq(payment.paid, false), lt(month.month, m.month)))
      ).map((r) => r.seatId),
    );
    return {
      chit: { id: c.id, code: c.code, status: c.status, months: c.months, display: c.display, terms, startDate: c.startDate, openTime: c.openTime.slice(0, 5) },
      month: {
        id: m.id,
        month: m.month,
        status: m.status,
        bidding: m.bidding,
        auctionDate: m.auctionDate,
        lastPayDate: lastPayDate(m.auctionDate),
        minDiscountPaise: m.minDiscountPaise,
        discountPaise: m.discountPaise,
        winnerSeatId: m.winnerSeatId,
        lottery: m.lottery,
      },
      seats: seats.map((x) => ({
        id: x.id,
        code: seatCode(c.code, x.number),
        name: x.name,
        phone: x.phone,
        isOrganiser: x.isOrganiser,
        wonMonth: won.find((w) => w.id === x.id)?.month ?? null,
        joined: joined.some((j) => j.seatId === x.id),
        hasArrears: arrearsSeatIds.has(x.id),
        paid: pays.find((p) => p.seatId === x.id)?.paid ?? false,
        adjusted: pays.find((p) => p.seatId === x.id)?.adjusted ?? false,
      })),
      bids: bids.map((b) => ({ id: b.id, seatId: b.seatId, amountPaise: b.amountPaise, at: b.at.toISOString() })),
      leader: top ? { seatId: top.seatId, amountPaise: top.amountPaise } : null,
      nextMinPaise: nextValidBid(m.minDiscountPaise, c.incrementPaise, top?.amountPaise ?? null),
      payout: s
        ? {
            payPaise: s.payPaise,
            prizePaise: s.prizePaise,
            ownPaise: s.ownPaise,
            arrears: s.arrears,
            cashPaise: s.cashPaise,
            roundingDiffPaise: s.roundingDiffPaise,
            paidCount: s.paidCount,
            seatsTotal: s.seatsTotal,
            ready: s.ready,
            done: s.done,
          }
        : null,
    };
  });
}

/** Organiser dashboard numbers. */
export async function dashboardStats(db: DB, orgId: string, today: string) {
  return withOrganiser(db, orgId, async (tx) => {
    const chits = await tx.select().from(chit);
    const active = chits.filter((c) => c.status === "active");
    const [{ n: ids }] = await tx.select({ n: count() }).from(seat).innerJoin(chit, eq(chit.id, seat.chitId)).where(eq(chit.status, "active"));
    // arrears: unpaid payments whose last pay date has passed
    const overdue = await tx
      .select({ seatId: payment.seatId, discountPaise: month.discountPaise, auctionDate: month.auctionDate, chitId: month.chitId })
      .from(payment)
      .innerJoin(month, eq(month.id, payment.monthId))
      .where(and(eq(payment.paid, false), sql`${month.auctionDate} + 10 < ${today}::date`));
    const byChit = new Map(chits.map((c) => [c.id, termsOf(c)]));
    const arrearsPaise = overdue.reduce((a, o) => a + monthlyPayment(byChit.get(o.chitId)!, o.discountPaise ?? 0).payPaise, 0);
    return { activeChits: active.length, draftChits: chits.filter((c) => c.status === "draft").length, memberIds: ids, arrearsPaise, arrearsIds: new Set(overdue.map((o) => o.seatId)).size };
  });
}
