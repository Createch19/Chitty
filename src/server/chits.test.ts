import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, type Handle } from "@/db/client";
import { auditLog, payment, payout } from "@/db/schema";
import { createOrganiser, setOrganiserActive } from "./accounts";
import {
  addSeat,
  changeAuctionDate,
  closeAuction,
  createChit,
  deleteChit,
  getChitDetail,
  getMonthBoard,
  joinRoom,
  listChits,
  markPayout,
  nextChitCode,
  openMonth,
  payoutSummary,
  placeBid,
  removeSeat,
  runLottery,
  setPaid,
  startChit,
  undoPayout,
} from "./chits";
import { istNow, tick } from "./scheduler";
import { issueLink } from "./members";

const R = (r: number) => r * 100;
const ADMIN = "00000000-0000-0000-0000-000000000000";
let h: Handle;
let org: string;
let otherOrg: string;

/** 9:01 AM IST on a date = 03:31 UTC. */
const at = (date: string, time = "09:01") => {
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), hh, mm) - 330 * 60_000);
};

const names = ["Selvi", "Karthik", "Lakshmi", "Ravi", "Ravi", "Meena", "Suresh", "Divya", "Arun", "Priya", "Kumar", "Anitha", "Vijay", "Geetha", "Mani", "Revathi", "Bala", "Kavitha", "Sakthi"];

async function fullDraft(code?: string) {
  const id = await createChit(h.db, org, { totalRupees: 500000, months: 20, code });
  for (const [i, n] of names.entries()) await addSeat(h.db, org, id, { name: n, phone: n === "Ravi" ? "9840011205" : `98400${String(11000 + i)}` });
  return id;
}

beforeAll(async () => {
  h = await createDb();
  org = await createOrganiser(h.db, ADMIN, { businessName: "Sri Murugan Chits", ownerName: "Murugan", mobile: "9840012345", password: "password-1" });
  otherOrg = await createOrganiser(h.db, ADMIN, { businessName: "Other", ownerName: "O", mobile: "9840099999", password: "password-2" });
});
afterAll(() => h.close());

describe("helpers", () => {
  it("chit codes run A…Z, AA, AB…", () => {
    expect(nextChitCode([])).toBe("A");
    expect(nextChitCode(["A", "B"])).toBe("C");
    expect(nextChitCode("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""))).toBe("AA");
  });
  it("IST clock", () => {
    expect(istNow(new Date("2026-12-10T03:31:00Z"))).toEqual({ date: "2026-12-10", time: "09:01" });
    expect(istNow(new Date("2026-12-09T19:00:00Z"))).toEqual({ date: "2026-12-10", time: "00:30" });
  });
});

describe("draft chit and seats", () => {
  it("creates with the default 1.5% and puts the organiser in seat A01", async () => {
    const id = await createChit(h.db, org, { totalRupees: 500000, months: 20 });
    const d = await getChitDetail(h.db, org, id);
    expect(d.chit.code).toBe("A");
    expect(d.chit.terms.interestPaise).toBe(R(7500));
    expect(d.seats).toMatchObject([{ number: 1, code: "A01", name: "Murugan", isOrganiser: true }]);
  });

  it("fills the lowest free seat number, refuses a 21st seat, and freezes seats after start", async () => {
    const id = await fullDraft("Q");
    const d = await getChitDetail(h.db, org, id);
    expect(d.seats).toHaveLength(20);
    expect(d.seats.filter((s) => s.name === "Ravi").map((s) => s.code)).toEqual(["Q05", "Q06"]); // one person, two IDs
    await expect(addSeat(h.db, org, id, { name: "Extra", phone: "9840000000" })).rejects.toThrow("CHIT_FULL");
    await removeSeat(h.db, org, d.seats[6].id);
    expect((await addSeat(h.db, org, id, { name: "New", phone: "9840000001" })).code).toBe("Q07");
    await expect(removeSeat(h.db, org, d.seats[0].id)).rejects.toThrow("ORGANISER_SEAT");
    await expect(startChit(h.db, org, id, "2026-11-29")).rejects.toThrow("START_DAY_1_TO_28");
    await startChit(h.db, org, id, "2026-11-10");
    await expect(addSeat(h.db, org, id, { name: "Late", phone: "9840000002" })).rejects.toThrow("CHIT_NOT_DRAFT");
  });

  it("cannot start until every seat is filled", async () => {
    const id = await createChit(h.db, org, { totalRupees: 300000, months: 15 });
    await expect(startChit(h.db, org, id, "2027-01-05")).rejects.toThrow("CHIT_NOT_FULL");
  });

  it("another organiser cannot see or touch this chit", async () => {
    const id = await createChit(h.db, org, { totalRupees: 100000, months: 10 });
    await expect(getChitDetail(h.db, otherOrg, id)).rejects.toThrow("CHIT_NOT_FOUND");
    await expect(addSeat(h.db, otherOrg, id, { name: "X", phone: "9840000003" })).rejects.toThrow("CHIT_NOT_FOUND");
  });
});

describe("a whole 5L / 20-month chit", () => {
  let chitId: string;
  let d: Awaited<ReturnType<typeof getChitDetail>>;
  const monthId = (k: number) => d.months.find((m) => m.month === k)!.id;
  const seatId = (code: string) => d.seats.find((s) => s.code === code)!.id;
  const refresh = async () => (d = await getChitDetail(h.db, org, chitId));
  const payAllBut = async (k: number, skip: string[] = []) => {
    const board = await getMonthBoard(h.db, org, monthId(k));
    for (const s of board.seats) if (s.id !== board.month.winnerSeatId && !skip.includes(s.id)) await setPaid(h.db, org, monthId(k), s.id, true);
  };
  /** The scheduler, limited to this chit (other test chits share the database). */
  const tickMine = async (now: Date) => (await tick(h.db, now)).filter((id) => d.months.some((m) => m.id === id));
  const joinAll = async (k: number) => {
    for (const s of d.seats) await joinRoom(h.db, org, monthId(k), s.id);
  };

  beforeAll(async () => {
    chitId = await fullDraft("Z");
    await startChit(h.db, org, chitId, "2026-11-10", at("2026-11-01"));
    await refresh();
  });

  it("month 1: the organiser's seat wins at no discount; payout after the other 19 pay", async () => {
    const m1 = d.months[0];
    expect(m1).toMatchObject({ month: 1, status: "closed", discountPaise: 0, winnerSeatId: seatId("Z01"), payPaise: R(25000) });
    await expect(markPayout(h.db, org, m1.id)).rejects.toThrow("NOT_EVERYONE_PAID");
    await expect(setPaid(h.db, org, m1.id, seatId("Z01"), true)).rejects.toThrow("WINNER_AT_PAYOUT");
    await payAllBut(1);
    const s = await payoutSummary(h.db, org, m1.id);
    expect(s).toMatchObject({ ready: true, prizePaise: R(500000), ownPaise: R(25000), cashPaise: R(475000), paidCount: 19, seatsTotal: 20 });
    await markPayout(h.db, org, m1.id);
    const after = await payoutSummary(h.db, org, m1.id);
    expect(after).toMatchObject({ done: true, paidCount: 20 }); // 20/20: the organiser's own share was adjusted
  });

  it("month 2 opens automatically at 9:00 AM IST on its date — not before", async () => {
    expect(await tickMine(at("2026-12-10", "08:59"))).toEqual([]);
    expect(await tickMine(at("2026-12-10", "09:00"))).toEqual([monthId(2)]);
    expect(await tickMine(at("2026-12-10", "09:05"))).toEqual([]); // only once
    await refresh();
    expect(d.months[1].status).toBe("open");
  });

  it("month 2 bidding follows every rule", async () => {
    const m = monthId(2);
    await expect(placeBid(h.db, org, m, seatId("Z03"), 143000)).rejects.toThrow("NOT_JOINED");
    await joinAll(2);
    await expect(placeBid(h.db, org, m, seatId("Z03"), 142500)).rejects.toThrow("BID_TOO_LOW"); // the minimum itself is not a bid
    await expect(placeBid(h.db, org, m, seatId("Z01"), 143000)).rejects.toThrow("SEAT_ALREADY_WON"); // organiser won month 1
    const b1 = await placeBid(h.db, org, m, seatId("Z03"), 143000);
    expect(b1.nextMinPaise).toBe(R(143500));
    await expect(placeBid(h.db, org, m, seatId("Z03"), 145000)).rejects.toThrow("ALREADY_LEADING");
    await expect(placeBid(h.db, org, m, seatId("Z04"), 143300)).rejects.toThrow("BID_TOO_LOW");
    await expect(placeBid(h.db, org, m, seatId("Z04"), 145300)).rejects.toThrow("OFF_GRID");
    await expect(placeBid(h.db, org, m, seatId("Z04"), 500000)).rejects.toThrow("BID_TOO_HIGH");
    await placeBid(h.db, org, m, seatId("Z04"), 145000);
    // two bids at the same moment for the same amount: exactly one is accepted
    const same = await Promise.allSettled([placeBid(h.db, org, m, seatId("Z07"), 145500), placeBid(h.db, org, m, seatId("Z08"), 145500)]);
    expect(same.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(same.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "BID_TOO_LOW" } });
    const rejects = await h.db.select().from(auditLog).where(eq(auditLog.action, "bid.reject"));
    expect(rejects.length).toBeGreaterThanOrEqual(8);
  });

  it("closing makes the highest bid the winner; everyone pays ₹17,725 at ₹1,45,500", async () => {
    const r = await closeAuction(h.db, org, monthId(2));
    expect(r.discountPaise).toBe(R(145500));
    await expect(placeBid(h.db, org, monthId(2), seatId("Z09"), 150000)).rejects.toThrow("AUCTION_NOT_OPEN");
    const board = await getMonthBoard(h.db, org, monthId(2));
    expect(board.payout).toMatchObject({ payPaise: R(17725), prizePaise: R(354500), cashPaise: R(354500 - 17725), roundingDiffPaise: 0 });
    await payAllBut(2);
    await markPayout(h.db, org, monthId(2));
  });

  it("the organiser can move one pending month's date (between its neighbours)", async () => {
    await expect(changeAuctionDate(h.db, org, monthId(4), "2027-01-05")).rejects.toThrow("DATE_OUT_OF_ORDER"); // before month 3
    await changeAuctionDate(h.db, org, monthId(4), "2027-02-12");
    await refresh();
    expect(d.months[3].auctionDate).toBe("2027-02-12");
    expect(d.months[3].lastPayDate).toBe("2027-02-22");
  });

  it("no bids → lottery among every seat that has not won, at the minimum discount", async () => {
    expect(await tickMine(at("2027-01-10"))).toEqual([monthId(3)]);
    await expect(closeAuction(h.db, org, monthId(3))).rejects.toThrow("NO_BIDS");
    let poolSize = 0;
    const r = await runLottery(h.db, org, monthId(3), new Date(), (n) => {
      poolSize = n;
      return 0;
    });
    expect(poolSize).toBe(18); // 20 seats − Z01 (month 1) − the month-2 winner
    await refresh();
    expect(r.discountPaise).toBe(R(135000));
    expect(d.months[2]).toMatchObject({ status: "closed", lottery: true, discountPaise: R(135000) });
    await payAllBut(3);
    await markPayout(h.db, org, monthId(3));
  });

  it("someone who does not pay cannot bid next month; if the lottery picks them, arrears come out of the payout", async () => {
    // month 4 (moved to 12 Feb): Z10 does not pay
    expect(await tickMine(at("2027-02-12"))).toEqual([monthId(4)]);
    await joinAll(4);
    await placeBid(h.db, org, monthId(4), seatId("Z11"), 128000);
    await closeAuction(h.db, org, monthId(4));
    await payAllBut(4, [seatId("Z10")]);
    await expect(markPayout(h.db, org, monthId(4))).rejects.toThrow("NOT_EVERYONE_PAID");

    // month 5: Z10 has arrears → cannot bid; nobody else bids; the lottery picks Z10
    expect(await tickMine(at("2027-03-10"))).toEqual([monthId(5)]);
    await joinAll(5);
    await expect(placeBid(h.db, org, monthId(5), seatId("Z10"), 121000)).rejects.toThrow("HAS_ARREARS");
    const board5 = await getMonthBoard(h.db, org, monthId(5));
    const poolIndex = board5.seats.filter((s) => s.wonMonth == null).findIndex((s) => s.id === seatId("Z10"));
    await runLottery(h.db, org, monthId(5), new Date(), () => poolIndex);
    await payAllBut(5);
    const s5 = await payoutSummary(h.db, org, monthId(5));
    const pay4 = (await getMonthBoard(h.db, org, monthId(4))).payout!.payPaise;
    expect(s5.arrears).toEqual([{ monthId: monthId(4), month: 4, amountPaise: pay4 }]);
    expect(s5.cashPaise).toBe(s5.prizePaise - s5.ownPaise - pay4);
    await markPayout(h.db, org, monthId(5));
    // Z10's month-4 payment is now Paid (adjusted), so month 4's payout can finally happen
    const [p4] = await h.db.select().from(payment).where(and(eq(payment.monthId, monthId(4)), eq(payment.seatId, seatId("Z10"))));
    expect(p4).toMatchObject({ paid: true, adjusted: true });
    await markPayout(h.db, org, monthId(4));
  });

  it("undo payout puts the winner's adjusted payments back", async () => {
    await undoPayout(h.db, org, monthId(5));
    const [p] = await h.db.select().from(payment).where(and(eq(payment.monthId, monthId(5)), eq(payment.seatId, seatId("Z10"))));
    expect(p).toMatchObject({ paid: false, adjusted: false });
    await markPayout(h.db, org, monthId(5));
  });

  it("a paused organiser's auctions do not open", async () => {
    await setOrganiserActive(h.db, ADMIN, org, false);
    expect(await tick(h.db, at("2027-04-10"))).toEqual([]);
    await setOrganiserActive(h.db, ADMIN, org, true);
  });

  it("months 6–19 run, month 20 closes itself with the last seat, the chit completes", async () => {
    for (let k = 6; k <= 19; k++) {
      await refresh();
      const date = d.months[k - 1].auctionDate;
      expect(await tickMine(at(date))).toEqual([monthId(k)]);
      await joinAll(k);
      const eligible = d.seats.filter((s) => s.wonMonth == null);
      if (k % 4 === 0) {
        await runLottery(h.db, org, monthId(k), new Date(), (n) => k % n);
      } else {
        const board = await getMonthBoard(h.db, org, monthId(k));
        let amount = board.nextMinPaise / 100;
        for (let i = 0; i < (k % 3) + 1; i++) {
          const bidder = eligible[(k + i) % eligible.length];
          await placeBid(h.db, org, monthId(k), bidder.id, amount);
          amount += 500 * ((i % 2) + 1);
        }
        await closeAuction(h.db, org, monthId(k));
      }
      await payAllBut(k);
      await markPayout(h.db, org, monthId(k));
    }
    await refresh();
    const date20 = d.months[19].auctionDate;
    expect(date20).toBe("2028-06-10");
    expect(await tickMine(at(date20))).toEqual([monthId(20)]);
    await refresh();
    const last = d.months[19];
    expect(last).toMatchObject({ status: "closed", discountPaise: 0, payPaise: R(25000) });
    expect(d.seats.filter((s) => s.wonMonth == null)).toHaveLength(0);
    await payAllBut(20);
    await markPayout(h.db, org, monthId(20));
    await refresh();
    expect(d.chit.status).toBe("completed");

    // every seat won exactly once; every payout done; collections add up to the prizes
    const winners = d.months.map((m) => m.winnerSeatId);
    expect(new Set(winners).size).toBe(20);
    const payouts = await h.db.select().from(payout);
    const mine = payouts.filter((p) => d.months.some((m) => m.id === p.monthId));
    expect(mine.every((p) => p.done)).toBe(true);
    const prizes = mine.reduce((a, p) => a + p.prizePaise, 0);
    const collected = d.months.reduce((a, m) => a + m.payPaise! * 20, 0);
    expect(collected).toBe(prizes);
    const list = await listChits(h.db, org);
    expect(list.find((c) => c.id === chitId)?.status).toBe("completed");
  });

  it("organiser B never sees organiser A's months", async () => {
    await expect(getMonthBoard(h.db, otherOrg, monthId(2))).rejects.toThrow("MONTH_NOT_FOUND");
    await expect(openMonth(h.db, otherOrg, monthId(2))).rejects.toThrow("MONTH_NOT_FOUND");
  });
});

describe("delete a chit before it starts", () => {
  it("removes the draft, its seats and links, and audits it", async () => {
    const id = await createChit(h.db, org, { totalRupees: 100000, months: 10, code: "DL" });
    const s = await addSeat(h.db, org, id, { name: "Selvi", phone: "9840011111" });
    await issueLink(h.db, org, s.id);
    await expect(deleteChit(h.db, otherOrg, id)).rejects.toThrow("CHIT_NOT_FOUND");
    await deleteChit(h.db, org, id);
    expect((await listChits(h.db, org)).some((c) => c.id === id)).toBe(false);
    const rows = await h.db.select().from(auditLog).where(eq(auditLog.action, "chit.delete"));
    expect(rows.at(-1)?.details).toMatchObject({ chitId: id, code: "DL", seats: 2 });
    // the code is free again
    expect(await createChit(h.db, org, { totalRupees: 100000, months: 10, code: "DL" })).toBeTruthy();
  });

  it("refuses once the chit has started", async () => {
    const id = await fullDraft("DS");
    await startChit(h.db, org, id, "2027-01-10", at("2026-12-01"));
    await expect(deleteChit(h.db, org, id)).rejects.toThrow("CHIT_NOT_DRAFT");
  });
});
