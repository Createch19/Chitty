import { describe, expect, it } from "vitest";
import { defaultRateBps, formatINR, makeTerms, minimumDiscount, monthlyPayment, prize, schedule } from "./money";

const R = (rupees: number) => rupees * 100;
const t5L20 = makeTerms({ totalRupees: 500000, months: 20 });

describe("5L / 20 months — the organiser's real sheet", () => {
  it("installment ₹25,000, default rate 1.5%, monthly interest ₹7,500", () => {
    expect(t5L20.installmentPaise).toBe(R(25000));
    expect(t5L20.rateBps).toBe(150);
    expect(t5L20.interestPaise).toBe(R(7500));
    expect(t5L20.incrementPaise).toBe(R(500));
  });

  it("minimum discount for months 2–19 matches the PDF exactly", () => {
    const pdf = [142500, 135000, 127500, 120000, 112500, 105000, 97500, 90000, 82500, 75000, 67500, 60000, 52500, 45000, 37500, 30000, 22500, 15000];
    const rows = schedule(t5L20);
    expect(rows.filter((r) => r.bidding).map((r) => r.minDiscountPaise)).toEqual(pdf.map(R));
    expect(rows.filter((r) => r.bidding).map((r) => r.month)).toEqual(Array.from({ length: 18 }, (_, i) => i + 2));
  });

  it("month 1 and month 20: no auction, discount 0, everyone pays ₹25,000", () => {
    for (const k of [1, 20]) {
      expect(minimumDiscount(t5L20, k)).toBe(0);
      expect(monthlyPayment(t5L20, 0).payPaise).toBe(R(25000));
    }
  });

  it("worked examples: 1,42,500 → 17,875 / 3,57,500; 1,70,000 → 16,500 / 3,30,000; 1,45,000 → 17,750", () => {
    expect(monthlyPayment(t5L20, R(142500))).toMatchObject({ payPaise: R(17875), prizePaise: R(357500), roundingDiffPaise: 0 });
    expect(monthlyPayment(t5L20, R(170000))).toMatchObject({ payPaise: R(16500), prizePaise: R(330000), roundingDiffPaise: 0 });
    const m = monthlyPayment(t5L20, R(145000));
    expect(m.payPaise).toBe(R(17750));
    expect(m.sharePaise).toBe(R(7250));
    // collection screen: all 20 IDs × ₹17,750 = ₹3,55,000 = the prize
    expect(m.collectedPaise).toBe(R(355000));
    expect(m.collectedPaise).toBe(m.prizePaise);
  });

  it("each seat pays ₹4,29,125 over 20 months at the minimum every month", () => {
    const total = schedule(t5L20).reduce((a, r) => a + r.payPaise, 0);
    expect(total).toBe(R(429125));
  });
});

describe("other chit sizes (rate = 30 ÷ months by default)", () => {
  it("3L / 15: 2% → ₹6,000; month 2 minimum ₹84,000", () => {
    const t = makeTerms({ totalRupees: 300000, months: 15 });
    expect(t.rateBps).toBe(200);
    expect(t.interestPaise).toBe(R(6000));
    expect(minimumDiscount(t, 2)).toBe(R(84000));
  });
  it("5L / 10: 3% → ₹15,000; month 2 minimum ₹1,35,000", () => {
    const t = makeTerms({ totalRupees: 500000, months: 10 });
    expect(t.interestPaise).toBe(R(15000));
    expect(minimumDiscount(t, 2)).toBe(R(135000));
  });
  it("defaults: 25 → 1.2%, 12 → 2.5%, 30 → 1%, 9 → 3.33%", () => {
    expect([25, 12, 30, 9].map(defaultRateBps)).toEqual([120, 250, 100, 333]);
  });
  it("the organiser can override the rate (2 decimals)", () => {
    const t = makeTerms({ totalRupees: 500000, months: 20, ratePct: 1.25 });
    expect(t.interestPaise).toBe(R(6250));
    expect(minimumDiscount(t, 2)).toBe(R(118750));
  });
});

describe("rounding to the nearest whole rupee", () => {
  it("3L/15 at ₹84,500: ₹14,366.67 → ₹14,367; collected ₹2,15,505 vs prize ₹2,15,500 (+₹5 to the organiser)", () => {
    const t = makeTerms({ totalRupees: 300000, months: 15 });
    const m = monthlyPayment(t, R(84500));
    expect(m.payPaise).toBe(R(14367));
    expect(m.prizePaise).toBe(R(215500));
    expect(m.roundingDiffPaise).toBe(R(5));
  });
  it("never more than half a rupee per seat away from exact", () => {
    for (const months of [10, 12, 15, 20, 25]) {
      const t = makeTerms({ totalRupees: 300000, months });
      for (let d = 0; d < t.totalPaise; d += R(13500)) {
        const m = monthlyPayment(t, d);
        expect(m.payPaise % 100).toBe(0);
        expect(Math.abs(m.roundingDiffPaise)).toBeLessThanOrEqual((months * 100) / 2);
      }
    }
  });
});

describe("validation", () => {
  it.each([
    [{ totalRupees: 100000, months: 15 }, "INSTALLMENT_NOT_EXACT"],
    [{ totalRupees: 500000, months: 1 }, "INVALID_MONTHS"],
    [{ totalRupees: 500000.5, months: 20 }, "INVALID_AMOUNT"],
    [{ totalRupees: 500000, months: 20, ratePct: 0 }, "INVALID_RATE"],
    [{ totalRupees: 500000, months: 20, ratePct: 1.234 }, "INVALID_RATE"],
    [{ totalRupees: 500000, months: 20, incrementRupees: 0 }, "INVALID_INCREMENT"],
    [{ totalRupees: 30, months: 3, ratePct: 33.33 }, "INTEREST_NOT_EXACT"],
  ])("%o → %s", (input, code) => {
    expect(() => makeTerms(input)).toThrow(expect.objectContaining({ code }));
  });
  it("discount must be below the chit value", () => {
    expect(() => prize(t5L20, R(500000))).toThrow(expect.objectContaining({ code: "INVALID_DISCOUNT" }));
  });
});

describe("formatINR", () => {
  it("uses Indian grouping", () => {
    expect(formatINR(R(357500))).toBe("₹3,57,500");
    expect(formatINR(R(14250000))).toBe("₹1,42,50,000");
    expect(formatINR(R(17875))).toBe("₹17,875");
    expect(formatINR(1436667)).toBe("₹14,366.67");
  });
});
