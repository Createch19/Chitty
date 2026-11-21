/**
 * Auction, start and date rules (docs/BUSINESS-CONCEPT.md §3, §5, §6). Pure functions; the
 * server gathers the facts inside one locked transaction and asks these.
 */
import type { Terms } from "./money";
import { minimumDiscount } from "./money";

export type Reject = { ok: false; code: string; minPaise?: number };
export type Ok = { ok: true; minPaise: number };

/** First valid bid = minimum + increment; after that highest + increment. The minimum itself is never a bid. */
export const nextValidBid = (minPaise: number, incPaise: number, highestPaise: number | null) =>
  highestPaise == null ? minPaise + incPaise : highestPaise + incPaise;

/** Bids sit on the increment grid that starts at the minimum. */
export const onGrid = (amountPaise: number, minPaise: number, incPaise: number) =>
  amountPaise > minPaise && (amountPaise - minPaise) % incPaise === 0;

export type BidFacts = {
  month: { status: "pending" | "open" | "closed"; bidding: boolean; minDiscountPaise: number };
  terms: Pick<Terms, "totalPaise" | "incrementPaise">;
  leader: { seatId: string; amountPaise: number } | null;
  seat: { id: string; ownedByBidder: boolean; alreadyWon: boolean; joined: boolean; hasArrears: boolean };
  amountPaise: number;
};

export function checkBid(f: BidFacts): Ok | Reject {
  if (!f.month.bidding) return { ok: false, code: "NO_BIDDING_THIS_MONTH" };
  if (f.month.status !== "open") return { ok: false, code: "AUCTION_NOT_OPEN" };
  if (!f.seat.ownedByBidder) return { ok: false, code: "SEAT_NOT_YOURS" };
  if (f.seat.alreadyWon) return { ok: false, code: "SEAT_ALREADY_WON" };
  if (!f.seat.joined) return { ok: false, code: "NOT_JOINED" };
  if (f.seat.hasArrears) return { ok: false, code: "HAS_ARREARS" };
  if (f.leader && f.leader.seatId === f.seat.id) return { ok: false, code: "ALREADY_LEADING" };
  const minPaise = nextValidBid(f.month.minDiscountPaise, f.terms.incrementPaise, f.leader?.amountPaise ?? null);
  if (!Number.isSafeInteger(f.amountPaise) || f.amountPaise <= 0) return { ok: false, code: "INVALID_AMOUNT", minPaise };
  if (f.amountPaise >= f.terms.totalPaise) return { ok: false, code: "BID_TOO_HIGH", minPaise };
  if (f.amountPaise < minPaise) return { ok: false, code: "BID_TOO_LOW", minPaise };
  if (!onGrid(f.amountPaise, f.month.minDiscountPaise, f.terms.incrementPaise)) return { ok: false, code: "OFF_GRID", minPaise };
  return { ok: true, minPaise };
}

/** A chit starts only when every seat is filled, one seat is the organiser's, and the day is 1–28. */
export function checkStart(f: { status: string; seats: number; months: number; hasOrganiserSeat: boolean; startDate: string }): { ok: true } | Reject {
  if (f.status !== "draft") return { ok: false, code: "CHIT_NOT_DRAFT" };
  if (f.seats !== f.months) return { ok: false, code: "CHIT_NOT_FULL" };
  if (!f.hasOrganiserSeat) return { ok: false, code: "NO_ORGANISER_SEAT" };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.startDate);
  if (!m) return { ok: false, code: "INVALID_DATE" };
  const day = Number(m[3]);
  if (day < 1 || day > 28) return { ok: false, code: "START_DAY_1_TO_28" };
  return { ok: true };
}

/** Add calendar months to a YYYY-MM-DD date whose day is 1–28 (always exists). */
export function addMonths(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Auction date of month k (month 1 = the start date) and its last day to pay (+10 days). */
export const auctionDate = (startDate: string, k: number) => addMonths(startDate, k - 1);
export const lastPayDate = (auction: string) => addDays(auction, 10);

/** Rows to create when a chit starts. */
export function monthsToCreate(t: Terms, startDate: string) {
  return Array.from({ length: t.months }, (_, i) => {
    const k = i + 1;
    return { month: k, auctionDate: auctionDate(startDate, k), bidding: k >= 2 && k <= t.months - 1, minDiscountPaise: minimumDiscount(t, k) };
  });
}
