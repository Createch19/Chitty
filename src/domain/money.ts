/**
 * Chit money math (docs/BUSINESS-CONCEPT.md §4). Pure, no I/O, integer PAISE only.
 *
 *   installment           = total ÷ n
 *   monthly interest R     = total × rate%            (default rate = 30 ÷ n %, e.g. 20 months → 1.5%)
 *   minimum discount(k)    = R × (n + 1 − k)          for 2 ≤ k ≤ n−1; month 1 and month n: 0
 *   prize                  = total − discount
 *   everyone pays          = (total − discount) ÷ n, rounded to the NEAREST WHOLE RUPEE
 *   rounding difference    = n × pay − prize          (organiser keeps or covers it)
 */
export const PAISE = 100;

export class MoneyError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "MoneyError";
  }
}

export type Terms = Readonly<{
  totalPaise: number;
  months: number;
  rateBps: number; // monthly rate in basis points of the total (1.5% = 150)
  incrementPaise: number;
  installmentPaise: number;
  interestPaise: number; // R
}>;

const safe = (n: number, code: string, what: string) => {
  if (!Number.isSafeInteger(n)) throw new MoneyError(code, `${what} is not a safe integer`);
  return n;
};

export function rupees(r: number, what = "amount"): number {
  if (typeof r !== "number" || !Number.isSafeInteger(r)) throw new MoneyError("INVALID_AMOUNT", `${what} must be whole rupees`);
  return safe(r * PAISE, "INVALID_AMOUNT", what);
}

/** Default monthly rate: 30 ÷ months %, in basis points, rounded to the nearest basis point. */
export function defaultRateBps(months: number): number {
  return Math.round(3000 / months);
}

/** Percent with at most 2 decimals → basis points (1.5 → 150). */
export function pctToBps(pct: number): number {
  if (typeof pct !== "number" || !Number.isFinite(pct)) throw new MoneyError("INVALID_RATE", "rate must be a number");
  const bps = Math.round(pct * 100);
  if (Math.abs(bps - pct * 100) > 1e-6) throw new MoneyError("INVALID_RATE", "rate allows at most 2 decimals");
  if (bps < 1 || bps > 10000) throw new MoneyError("INVALID_RATE", "rate must be above 0% and at most 100%");
  return bps;
}

export function makeTerms({
  totalRupees,
  months,
  ratePct,
  incrementRupees = 500,
}: {
  totalRupees: number;
  months: number;
  ratePct?: number;
  incrementRupees?: number;
}): Terms {
  const totalPaise = rupees(totalRupees, "chit value");
  if (totalPaise <= 0 || totalRupees > 1_000_000_000) throw new MoneyError("INVALID_TOTAL", "chit value must be between ₹1 and ₹100 crore");
  if (!Number.isInteger(months) || months < 2 || months > 120) throw new MoneyError("INVALID_MONTHS", "months must be 2 to 120");
  if (totalPaise % months !== 0) throw new MoneyError("INSTALLMENT_NOT_EXACT", "chit value ÷ months is not a whole number of paise");
  const rateBps = ratePct == null ? defaultRateBps(months) : pctToBps(ratePct);
  const rTimes = safe(totalPaise * rateBps, "INTEREST_NOT_EXACT", "interest");
  if (rTimes % 10000 !== 0) throw new MoneyError("INTEREST_NOT_EXACT", "chit value × rate is not a whole number of paise");
  const incrementPaise = rupees(incrementRupees, "increment");
  if (incrementPaise <= 0 || incrementPaise >= totalPaise) throw new MoneyError("INVALID_INCREMENT", "increment must be at least ₹1 and below the chit value");
  return Object.freeze({ totalPaise, months, rateBps, incrementPaise, installmentPaise: totalPaise / months, interestPaise: rTimes / 10000 });
}

export const isBiddingMonth = (months: number, k: number) => k >= 2 && k <= months - 1;

function assertMonth(t: Terms, k: number) {
  if (!Number.isInteger(k) || k < 1 || k > t.months) throw new MoneyError("INVALID_MONTH", `month must be 1..${t.months}`);
}

export function minimumDiscount(t: Terms, k: number): number {
  assertMonth(t, k);
  return isBiddingMonth(t.months, k) ? t.interestPaise * (t.months + 1 - k) : 0;
}

export function prize(t: Terms, discountPaise: number): number {
  if (!Number.isSafeInteger(discountPaise) || discountPaise < 0 || discountPaise >= t.totalPaise) {
    throw new MoneyError("INVALID_DISCOUNT", "discount must be at least 0 and below the chit value");
  }
  return t.totalPaise - discountPaise;
}

/** Everyone's payment this month, rounded to the nearest whole rupee (half up). */
export function monthlyPayment(t: Terms, discountPaise: number) {
  const p = prize(t, discountPaise);
  const unit = t.months * PAISE;
  const r = p % unit;
  const q = (p - r) / unit;
  const payPaise = (2 * r >= unit ? q + 1 : q) * PAISE;
  const collectedPaise = payPaise * t.months;
  return { payPaise, prizePaise: p, collectedPaise, roundingDiffPaise: collectedPaise - p, sharePaise: discountPaise / t.months };
}

export function schedule(t: Terms) {
  return Array.from({ length: t.months }, (_, i) => {
    const k = i + 1;
    const min = minimumDiscount(t, k);
    return { month: k, bidding: isBiddingMonth(t.months, k), minDiscountPaise: min, ...monthlyPayment(t, min) };
  });
}

/** Indian grouping: 35750000 paise → "₹3,57,500"; whole rupees only unless paise remain. */
export function formatINR(p: number, { symbol = "₹" } = {}): string {
  const sign = p < 0 ? "-" : "";
  const abs = Math.abs(p);
  const ps = abs % PAISE;
  const r = String((abs - ps) / PAISE);
  const last3 = r.slice(-3);
  const rest = r.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${sign}${symbol}${rest ? `${rest},${last3}` : last3}${ps ? "." + String(ps).padStart(2, "0") : ""}`;
}
