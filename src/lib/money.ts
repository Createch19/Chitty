// Chit math for the design preview (whole rupees). Phase 1 replaces this with the tested paise module.

export function inr(rupees: number, opts: { symbol?: boolean; paise?: boolean } = {}): string {
  const { symbol = true, paise = false } = opts;
  const neg = rupees < 0;
  const abs = Math.abs(rupees);
  const whole = Math.floor(abs);
  const s = String(whole);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  const grouped = rest ? `${rest},${last3}` : last3;
  const p = paise ? "." + String(Math.round((abs - whole) * 100)).padStart(2, "0") : "";
  return `${neg ? "-" : ""}${symbol ? "₹" : ""}${grouped}${p}`;
}

/** Compact Indian form: 5,00,000 -> "5L", 1,42,500 -> "1.43L". */
export function lakh(rupees: number): string {
  if (rupees >= 100000) {
    const v = rupees / 100000;
    return `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/, "")}L`;
  }
  if (rupees >= 1000) return `${Math.round(rupees / 100) / 10}K`;
  return String(rupees);
}

export type ChitTerms = { total: number; months: number; ratePct: number; increment: number };

export const isBiddingMonth = (months: number, k: number) => k >= 2 && k <= months - 1;

export function minimumDiscount(t: ChitTerms, k: number): number {
  if (!isBiddingMonth(t.months, k)) return 0;
  const R = (t.total * t.ratePct) / 100;
  return R * (t.months + 1 - k);
}

export const prize = (t: ChitTerms, discount: number) => t.total - discount;

/** Everyone pays installment − discount ÷ n, rounded to the nearest rupee. */
export const eachPays = (t: ChitTerms, discount: number) => Math.round((t.total - discount) / t.months);

export function schedule(t: ChitTerms) {
  return Array.from({ length: t.months }, (_, i) => {
    const month = i + 1;
    const min = minimumDiscount(t, month);
    return { month, bidding: isBiddingMonth(t.months, month), min, prize: prize(t, min), pay: eachPays(t, min) };
  });
}

/** First valid bid is minimum + increment; later ones highest + increment. */
export const nextValidBid = (min: number, inc: number, highest: number | null) =>
  highest == null ? min + inc : highest + inc;

export const onGrid = (amount: number, min: number, inc: number) => (amount - min) % inc === 0;
