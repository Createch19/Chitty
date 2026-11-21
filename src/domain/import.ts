/**
 * Paper-chit import (BUSINESS-CONCEPT §14): checks a filled template and works out every amount.
 * Pure: the server reads the Excel file into ImportData, this decides whether it can be imported.
 */
import { cleanAadhaar } from "./aadhaar";
import { MoneyError, makeTerms, minimumDiscount, monthlyPayment, type Terms } from "./money";
import { auctionDate } from "./rules";

export type ImportData = {
  chit: { code: string; total: string; months: string; rate: string; increment: string; startDate: string; openTime: string; rows: Record<string, number> };
  members: { row: number; id: string; name: string; phone: string; aadhaar: string; organiser: string }[];
  months: { row: number; month: string; discount: string; winner: string; lottery: string; payoutDone: string }[];
  payments: { row: number; id: string; cells: { month: number; value: string }[] }[];
};

export type ImportIssue = { sheet: "Chit" | "Members" | "Months" | "Payments"; row: number | null; en: string; ta: string };

export type ImportPlan = {
  code: string;
  terms: Terms;
  startDate: string;
  openTime: string;
  members: { number: number; id: string; name: string; phone: string; aadhaar: string | null; organiser: boolean }[];
  months: { month: number; auctionDate: string; discountPaise: number; winner: number; lottery: boolean; payoutDone: boolean; payPaise: number; prizePaise: number }[];
  /** paid[month-1][seatNumber-1] — the winner's own cell is false (settled at payout). */
  paid: boolean[][];
  next: { month: number; auctionDate: string } | null;
};

const yes = (v: string) => /^(y|yes|paid|true|1|ஆம்|கட்டியது)$/i.test(v.trim());
const no = (v: string) => /^(n|no|not paid|unpaid|false|0|இல்லை|கட்டவில்லை)?$/i.test(v.trim());
const int = (v: string) => (/^\d+$/.test(v.replace(/[,\s₹]/g, "")) ? Number(v.replace(/[,\s₹]/g, "")) : NaN);

/** "2026-05-10", "10/05/2026", "10-05-2026" → "2026-05-10". */
export function isoDate(v: string): string | null {
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export function checkImport(d: ImportData, usedCodes: string[], today: string): { issues: ImportIssue[]; plan: ImportPlan | null } {
  const issues: ImportIssue[] = [];
  const bad = (sheet: ImportIssue["sheet"], row: number | null, en: string, ta: string) => issues.push({ sheet, row, en, ta });

  /* ---- Chit ---- */
  const code = d.chit.code.trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(code)) bad("Chit", d.chit.rows.code ?? null, "Chit code must be 1–3 letters.", "சீட்டு code 1–3 எழுத்துகள்.");
  const codeTaken = /^[A-Z]{1,3}$/.test(code) && usedCodes.includes(code);
  if (codeTaken) bad("Chit", d.chit.rows.code ?? null, `Chit code ${code} is already used. Pick another.`, `சீட்டு code ${code} ஏற்கனவே உள்ளது. வேறு code கொடுக்கவும்.`);
  let terms: Terms | null = null;
  const rate = Number(d.chit.rate.replace(/[%\s]/g, ""));
  try {
    terms = makeTerms({ totalRupees: int(d.chit.total), months: int(d.chit.months), ratePct: d.chit.rate.trim() ? rate : undefined, incrementRupees: d.chit.increment.trim() ? int(d.chit.increment) : 500 });
  } catch (e) {
    if (!(e instanceof MoneyError)) throw e;
    bad("Chit", null, `Chit value, months, rate or increment is wrong (${e.message}).`, `சீட்டுத் தொகை, மாதம், வட்டி அல்லது படி தவறு (${e.message}).`);
  }
  const startDate = isoDate(d.chit.startDate);
  if (!startDate) bad("Chit", d.chit.rows.startDate ?? null, "Start date must be a date like 2026-05-10.", "தொடக்க தேதி 2026-05-10 போல இருக்க வேண்டும்.");
  else if (Number(startDate.slice(8)) > 28) bad("Chit", d.chit.rows.startDate ?? null, "Start day must be 1 to 28.", "தொடக்க நாள் 1 முதல் 28.");
  const openTime = d.chit.openTime.trim() || "09:00";
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(openTime)) bad("Chit", d.chit.rows.openTime ?? null, "Open time must be like 09:00.", "திறக்கும் நேரம் 09:00 போல.");
  // a taken chit code is reported but doesn't stop the other checks; anything else wrong in the Chit sheet does
  if (!terms || !startDate || issues.length > (codeTaken ? 1 : 0)) return { issues, plan: null };
  const n = terms.months;

  /* ---- Members ---- */
  const members: ImportPlan["members"] = [];
  const seen = new Map<string, number>();
  for (const r of d.members) {
    const id = r.id.trim().toUpperCase();
    const m = new RegExp(`^${code}(\\d{2,3})$`).exec(id);
    const num = m ? Number(m[1]) : NaN;
    if (!m || num < 1 || num > n) {
      bad("Members", r.row, `ID "${r.id}" must be ${code}01 to ${code}${String(n).padStart(2, "0")}.`, `ID "${r.id}" ${code}01 முதல் ${code}${String(n).padStart(2, "0")} வரை இருக்க வேண்டும்.`);
      continue;
    }
    if (seen.has(id)) bad("Members", r.row, `ID ${id} appears twice (also row ${seen.get(id)}).`, `ID ${id} இரண்டு முறை உள்ளது (வரிசை ${seen.get(id)}).`);
    seen.set(id, r.row);
    const name = r.name.trim().replace(/\s+/g, " ");
    if (!name || name.length > 60) bad("Members", r.row, `${id}: name is missing.`, `${id}: பெயர் இல்லை.`);
    const phone = r.phone.replace(/\D/g, "").replace(/^(91|0)(?=[6-9]\d{9}$)/, "");
    if (!/^[6-9]\d{9}$/.test(phone)) bad("Members", r.row, `${id}: mobile must be 10 digits.`, `${id}: mobile 10 இலக்கம் வேண்டும்.`);
    const aadhaar = r.aadhaar.trim() ? cleanAadhaar(r.aadhaar) : null;
    if (r.aadhaar.trim() && !aadhaar) bad("Members", r.row, `${id}: Aadhaar number is not valid.`, `${id}: Aadhaar எண் சரியில்லை.`);
    members.push({ number: num, id, name, phone, aadhaar, organiser: yes(r.organiser) });
  }
  if (members.length !== n) bad("Members", null, `There must be exactly ${n} member IDs (found ${members.length}).`, `சரியாக ${n} member ID வேண்டும் (${members.length} உள்ளது).`);
  const orgSeats = members.filter((m) => m.organiser);
  if (orgSeats.length !== 1) bad("Members", null, "Mark exactly one ID as the organiser's (Organiser = Yes).", "ஒரே ஒரு ID-ஐ organiser-னுடையதாக குறிக்கவும் (Organiser = Yes).");
  members.sort((a, b) => a.number - b.number);
  const byId = new Map(members.map((m) => [m.id, m]));

  /* ---- Months ---- */
  const months: ImportPlan["months"] = [];
  const winners = new Map<number, number>(); // seat number → month won
  const rows = [...d.months].sort((a, b) => int(a.month) - int(b.month));
  rows.forEach((r, i) => {
    const k = int(r.month);
    if (k !== i + 1) return bad("Months", r.row, `Months must be 1, 2, 3… with no gaps (row has "${r.month}").`, `மாதங்கள் 1, 2, 3… இடைவெளி இல்லாமல் (இங்கு "${r.month}").`);
    if (k >= n) return bad("Months", r.row, `Month ${k}: only months before the last (${n}) can be imported; the app finishes the chit.`, `${k}-வது மாதம்: கடைசி மாதத்துக்கு (${n}) முன் உள்ளவை மட்டும்; மீதியை app முடிக்கும்.`);
    const disc = int(r.discount);
    const w = byId.get(r.winner.trim().toUpperCase());
    if (!w) return bad("Months", r.row, `Month ${k}: winner "${r.winner}" is not a member ID.`, `${k}-வது மாதம்: வென்றவர் "${r.winner}" member ID இல்லை.`);
    if (winners.has(w.number)) bad("Months", r.row, `Month ${k}: ${w.id} already won month ${winners.get(w.number)}. An ID wins only once.`, `${k}-வது மாதம்: ${w.id} ஏற்கனவே ${winners.get(w.number)}-வது மாதம் வென்றார். ஒரு ID ஒருமுறை மட்டுமே.`);
    winners.set(w.number, k);
    const lottery = yes(r.lottery);
    if (k === 1) {
      if (!w.organiser) bad("Months", r.row, "Month 1 must be won by the organiser's ID.", "1-வது மாதம் organiser ID தான் வெல்ல வேண்டும்.");
      if (disc !== 0) bad("Months", r.row, "Month 1 has no discount (0).", "1-வது மாதத்துக்கு தள்ளு இல்லை (0).");
    } else {
      const min = minimumDiscount(terms!, k) / 100;
      if (Number.isNaN(disc)) return bad("Months", r.row, `Month ${k}: discount must be whole rupees.`, `${k}-வது மாதம்: தள்ளு முழு ரூபாயாக.`);
      if (disc * 100 >= terms!.totalPaise) bad("Months", r.row, `Month ${k}: discount ₹${disc} is not below the chit value.`, `${k}-வது மாதம்: தள்ளு ₹${disc} சீட்டுத் தொகையை விட குறைவாக இருக்க வேண்டும்.`);
      if (disc < min) bad("Months", r.row, `Month ${k}: discount ₹${disc} is below that month's minimum ₹${min}.`, `${k}-வது மாதம்: தள்ளு ₹${disc} அந்த மாத குறைந்தபட்சம் ₹${min}-ஐ விட குறைவு.`);
      if (lottery && disc !== min) bad("Months", r.row, `Month ${k}: a lottery month is at the minimum ₹${min}.`, `${k}-வது மாதம்: குலுக்கல் மாதம் குறைந்தபட்சம் ₹${min}-ல் இருக்கும்.`);
    }
    const pay = monthlyPayment(terms!, Number.isNaN(disc) ? 0 : disc * 100);
    months.push({ month: k, auctionDate: auctionDate(startDate, k), discountPaise: (Number.isNaN(disc) ? 0 : disc) * 100, winner: w.number, lottery: k > 1 && lottery, payoutDone: yes(r.payoutDone), payPaise: pay.payPaise, prizePaise: pay.prizePaise });
  });
  if (!rows.length) bad("Months", null, "Add at least month 1.", "குறைந்தது 1-வது மாதம் சேர்க்கவும்.");
  const last = months[months.length - 1];
  if (last && last.auctionDate > today) bad("Months", null, `Month ${last.month} (${last.auctionDate}) is in the future. Import only months already held.`, `${last.month}-வது மாதம் (${last.auctionDate}) இன்னும் வரவில்லை. நடந்த மாதங்கள் மட்டும்.`);

  /* ---- Payments ---- */
  const paid = months.map(() => Array.from({ length: n }, () => false));
  const got = months.map(() => new Set<number>());
  for (const r of d.payments) {
    const m = byId.get(r.id.trim().toUpperCase());
    if (!m) {
      if (r.id.trim()) bad("Payments", r.row, `"${r.id}" is not a member ID.`, `"${r.id}" member ID இல்லை.`);
      continue;
    }
    for (const c of r.cells) {
      const mo = months[c.month - 1];
      if (!mo) continue;
      got[c.month - 1].add(m.number);
      if (mo.winner === m.number) continue; // the winner's own share is settled at payout
      if (yes(c.value)) paid[c.month - 1][m.number - 1] = true;
      else if (!no(c.value)) bad("Payments", r.row, `${m.id}, month ${c.month}: write Paid or Not paid (found "${c.value}").`, `${m.id}, ${c.month}-வது மாதம்: Paid அல்லது Not paid (இங்கு "${c.value}").`);
    }
  }
  months.forEach((mo, i) => {
    const missing = members.filter((m) => m.number !== mo.winner && !got[i].has(m.number));
    if (missing.length) bad("Payments", null, `Month ${mo.month}: no Paid / Not paid for ${missing.map((m) => m.id).join(", ")}.`, `${mo.month}-வது மாதம்: ${missing.map((m) => m.id).join(", ")}-க்கு Paid / Not paid இல்லை.`);
    if (mo.payoutDone) {
      const unpaid = members.filter((m) => m.number !== mo.winner && !paid[i][m.number - 1]);
      if (unpaid.length) bad("Months", null, `Month ${mo.month}: payout is marked done but ${unpaid.map((m) => m.id).join(", ")} have not paid.`, `${mo.month}-வது மாதம்: payout முடிந்தது என்று உள்ளது, ஆனால் ${unpaid.map((m) => m.id).join(", ")} கட்டவில்லை.`);
    }
  });

  if (issues.length) return { issues, plan: null };
  const k = months.length;
  return {
    issues,
    plan: { code, terms: terms!, startDate, openTime: openTime.padStart(5, "0"), members, months, paid, next: k < n ? { month: k + 1, auctionDate: auctionDate(startDate, k + 1) } : null },
  };
}

