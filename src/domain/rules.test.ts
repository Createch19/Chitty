import { describe, expect, it } from "vitest";
import { makeTerms } from "./money";
import { addDays, auctionDate, checkBid, checkStart, lastPayDate, monthsToCreate, nextValidBid, onGrid, type BidFacts } from "./rules";

const R = (r: number) => r * 100;
const terms = makeTerms({ totalRupees: 500000, months: 20 });
const base: BidFacts = {
  month: { status: "open", bidding: true, minDiscountPaise: R(142500) },
  terms,
  leader: null,
  seat: { id: "s7", ownedByBidder: true, alreadyWon: false, joined: true, hasArrears: false },
  amountPaise: R(143000),
};
const bid = (patch: Omit<Partial<BidFacts>, "seat"> & { seat?: Partial<BidFacts["seat"]> }) =>
  checkBid({ ...base, ...patch, seat: { ...base.seat, ...(patch.seat ?? {}) } });

describe("bid rules", () => {
  it("the minimum itself is not a valid bid; the first bid starts at minimum + increment", () => {
    expect(nextValidBid(R(142500), R(500), null)).toBe(R(143000));
    expect(bid({ amountPaise: R(142500) })).toMatchObject({ ok: false, code: "BID_TOO_LOW", minPaise: R(143000) });
    expect(bid({ amountPaise: R(143000) }).ok).toBe(true);
  });
  it("each next bid ≥ highest + increment", () => {
    const leader = { seatId: "s3", amountPaise: R(150000) };
    expect(bid({ leader, amountPaise: R(150000) })).toMatchObject({ code: "BID_TOO_LOW" });
    expect(bid({ leader, amountPaise: R(150499) })).toMatchObject({ code: "BID_TOO_LOW" });
    expect(bid({ leader, amountPaise: R(150500) }).ok).toBe(true);
  });
  it("only multiples of the increment from the minimum", () => {
    expect(onGrid(R(143700), R(142500), R(500))).toBe(false);
    expect(bid({ amountPaise: R(143700) })).toMatchObject({ code: "OFF_GRID" });
    expect(bid({ amountPaise: R(144000) }).ok).toBe(true);
    // a minimum that is not a multiple of ₹500 (3L/25 at 1.2%): steps from the minimum
    expect(onGrid(R(86900), R(86400), R(500))).toBe(true);
    expect(onGrid(R(87000), R(86400), R(500))).toBe(false);
  });
  it("the current leader cannot bid again until outbid", () => {
    expect(bid({ leader: { seatId: "s7", amountPaise: R(150000) }, amountPaise: R(151000) })).toMatchObject({ code: "ALREADY_LEADING" });
  });
  it("IDs with arrears cannot bid; past winners cannot bid; must join; must own the seat", () => {
    expect(bid({ seat: { hasArrears: true } })).toMatchObject({ code: "HAS_ARREARS" });
    expect(bid({ seat: { alreadyWon: true } })).toMatchObject({ code: "SEAT_ALREADY_WON" });
    expect(bid({ seat: { joined: false } })).toMatchObject({ code: "NOT_JOINED" });
    expect(bid({ seat: { ownedByBidder: false } })).toMatchObject({ code: "SEAT_NOT_YOURS" });
  });
  it("bid below the chit value; no bidding in month 1 / month n or when not open", () => {
    expect(bid({ amountPaise: R(500000) })).toMatchObject({ code: "BID_TOO_HIGH" });
    expect(bid({ month: { ...base.month, bidding: false } })).toMatchObject({ code: "NO_BIDDING_THIS_MONTH" });
    expect(bid({ month: { ...base.month, status: "closed" } })).toMatchObject({ code: "AUCTION_NOT_OPEN" });
  });
});

describe("starting a chit", () => {
  const ok = { status: "draft", seats: 20, months: 20, hasOrganiserSeat: true, startDate: "2027-02-10" };
  it("needs every seat, an organiser seat, and a start day 1–28", () => {
    expect(checkStart(ok).ok).toBe(true);
    expect(checkStart({ ...ok, seats: 19 })).toMatchObject({ code: "CHIT_NOT_FULL" });
    expect(checkStart({ ...ok, hasOrganiserSeat: false })).toMatchObject({ code: "NO_ORGANISER_SEAT" });
    expect(checkStart({ ...ok, startDate: "2027-01-29" })).toMatchObject({ code: "START_DAY_1_TO_28" });
    expect(checkStart({ ...ok, status: "active" })).toMatchObject({ code: "CHIT_NOT_DRAFT" });
  });
});

describe("dates", () => {
  it("auction every month on the start day; last day to pay is +10 days", () => {
    expect(auctionDate("2026-11-10", 1)).toBe("2026-11-10");
    expect(auctionDate("2026-11-10", 2)).toBe("2026-12-10");
    expect(auctionDate("2026-11-10", 3)).toBe("2027-01-10");
    expect(auctionDate("2026-11-10", 20)).toBe("2028-06-10");
    expect(lastPayDate("2026-12-10")).toBe("2026-12-20");
    expect(addDays("2027-02-25", 10)).toBe("2027-03-07");
  });
  it("creates 20 month rows with the right minimums", () => {
    const rows = monthsToCreate(terms, "2026-11-10");
    expect(rows).toHaveLength(20);
    expect(rows[1]).toMatchObject({ month: 2, auctionDate: "2026-12-10", bidding: true, minDiscountPaise: R(142500) });
    expect(rows[0].bidding).toBe(false);
    expect(rows[19].bidding).toBe(false);
  });
});
