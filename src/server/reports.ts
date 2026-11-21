/**
 * Organiser reports (BUSINESS-CONCEPT §13). Each report is a plain table, so the same data feeds the page,
 * the CSV download and the printable page. Money stays in paise here; the page formats it, the CSV writes rupees.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db/client";
import { chit, month, payment, payout, seat } from "@/db/schema";
import { withOrganiser } from "@/db/tenant";
import { monthlyPayment } from "@/domain/money";
import { dateText } from "@/domain/messages";
import { lastPayDate } from "@/domain/rules";
import { ChitError, seatCode, termsOf } from "./chits";

export type Cell = string | number | null;
export type Column = { key: string; en: string; ta: string; money?: boolean; align?: "right" };
export type Report = {
  kind: ReportKind;
  title: { en: string; ta: string };
  subtitle?: { en: string; ta: string };
  columns: Column[];
  rows: Record<string, Cell>[];
  totals?: Record<string, Cell>;
  /** Headline numbers (paise) shown as tiles and in the CSV footer. */
  kpis?: { en: string; ta: string; paise: number; tone?: "ok" | "warn" }[];
};
export type ReportKind = "collection" | "summary" | "arrears" | "ledger";

const status = (p: { paid: boolean; adjusted: boolean } | undefined, isWinner: boolean, payoutDone: boolean) =>
  p?.adjusted ? "adjusted" : p?.paid ? "paid" : isWinner && !payoutDone ? "at-payout" : "unpaid";

/** 1. Month collection: who paid, who didn't, collected vs pending. */
export async function collectionReport(db: DB, orgId: string, monthId: string): Promise<Report> {
  return withOrganiser(db, orgId, async (tx) => {
    const [m] = await tx.select().from(month).where(eq(month.id, monthId));
    if (!m) throw new ChitError("MONTH_NOT_FOUND");
    if (m.status !== "closed") throw new ChitError("MONTH_NOT_CLOSED");
    const [c] = await tx.select().from(chit).where(eq(chit.id, m.chitId));
    const pay = monthlyPayment(termsOf(c), m.discountPaise ?? 0).payPaise;
    const seats = await tx.select().from(seat).where(eq(seat.chitId, c.id)).orderBy(asc(seat.number));
    const pays = await tx.select().from(payment).where(eq(payment.monthId, m.id));
    const [po] = await tx.select().from(payout).where(eq(payout.monthId, m.id));
    const rows = seats.map((s) => {
      const p = pays.find((x) => x.seatId === s.id);
      const st = status(p, s.id === m.winnerSeatId, Boolean(po?.done));
      return { id: seatCode(c.code, s.number), name: s.name, phone: s.phone, amount: pay, status: st, paidAmount: st === "paid" || st === "adjusted" ? pay : 0 };
    });
    const collected = rows.reduce((a, r) => a + (r.paidAmount as number), 0);
    return {
      kind: "collection",
      title: { en: `Chit ${c.code} · Month ${m.month} collection`, ta: `சீட்டு ${c.code} · ${m.month}-வது மாத வசூல்` },
      subtitle: { en: `Last day to pay ${dateText(lastPayDate(m.auctionDate), "en")}`, ta: `கட்ட கடைசி நாள் ${dateText(lastPayDate(m.auctionDate), "ta")}` },
      columns: [
        { key: "id", en: "ID", ta: "ID" },
        { key: "name", en: "Name", ta: "பெயர்" },
        { key: "phone", en: "Mobile", ta: "Mobile" },
        { key: "amount", en: "Due", ta: "கட்ட வேண்டியது", money: true, align: "right" },
        { key: "status", en: "Status", ta: "நிலை" },
        { key: "paidAmount", en: "Paid", ta: "கட்டியது", money: true, align: "right" },
      ],
      rows,
      totals: { id: `${rows.filter((r) => r.paidAmount).length}/${rows.length}`, amount: pay * rows.length, paidAmount: collected },
      kpis: [
        { en: "Collected", ta: "வசூலானது", paise: collected, tone: "ok" },
        { en: "Pending", ta: "நிலுவை", paise: pay * rows.length - collected, tone: "warn" },
      ],
    };
  });
}

/** 2. Chit summary: winner, discount and payout status for each month. */
export async function summaryReport(db: DB, orgId: string, chitId: string): Promise<Report> {
  return withOrganiser(db, orgId, async (tx) => {
    const [c] = await tx.select().from(chit).where(eq(chit.id, chitId));
    if (!c) throw new ChitError("CHIT_NOT_FOUND");
    const t = termsOf(c);
    const months = await tx.select().from(month).where(eq(month.chitId, c.id)).orderBy(asc(month.month));
    const seats = await tx.select().from(seat).where(eq(seat.chitId, c.id));
    const pos = months.length ? await tx.select().from(payout).where(inArray(payout.monthId, months.map((m) => m.id))) : [];
    const paidRows = months.length ? await tx.select().from(payment).where(inArray(payment.monthId, months.map((m) => m.id))) : [];
    const rows = months.map((m) => {
      const w = seats.find((s) => s.id === m.winnerSeatId);
      const po = pos.find((p) => p.monthId === m.id);
      const pay = m.discountPaise != null ? monthlyPayment(t, m.discountPaise) : null;
      const paid = paidRows.filter((p) => p.monthId === m.id && p.paid).length;
      return {
        month: m.month,
        date: m.auctionDate,
        discount: m.discountPaise,
        winner: w ? `${seatCode(c.code, w.number)} ${w.name}${m.lottery ? " (lottery)" : ""}` : null,
        each: pay?.payPaise ?? null,
        prize: pay?.prizePaise ?? null,
        cash: po?.done ? po.cashPaise : null,
        collected: m.status === "closed" ? `${paid}/${seats.length}` : null,
        status: m.status === "closed" ? (po?.done ? "paid out" : "collecting") : m.status,
      };
    });
    return {
      kind: "summary",
      title: { en: `Chit ${c.code} summary`, ta: `சீட்டு ${c.code} சுருக்கம்` },
      subtitle: { en: `${t.months} months · ${c.status}`, ta: `${t.months} மாதம் · ${c.status}` },
      columns: [
        { key: "month", en: "Month", ta: "மாதம்" },
        { key: "date", en: "Auction", ta: "ஏலம்" },
        { key: "discount", en: "Discount", ta: "தள்ளு", money: true, align: "right" },
        { key: "winner", en: "Winner", ta: "வென்றவர்" },
        { key: "each", en: "Each pays", ta: "ஒவ்வொருவரும்", money: true, align: "right" },
        { key: "prize", en: "Prize", ta: "தொகை", money: true, align: "right" },
        { key: "cash", en: "Cash handed", ta: "கையில் கொடுத்தது", money: true, align: "right" },
        { key: "collected", en: "Paid", ta: "கட்டியது" },
        { key: "status", en: "Status", ta: "நிலை" },
      ],
      rows,
    };
  });
}

/** 3. Arrears across all chits: every unpaid installment of a closed month (not the winner's own share). */
export async function arrearsReport(db: DB, orgId: string, today: string): Promise<Report> {
  return withOrganiser(db, orgId, async (tx) => {
    const rows = await tx
      .select({ code: chit.code, total: chit.totalPaise, months: chit.months, rate: chit.rateBps, inc: chit.incrementPaise, num: seat.number, name: seat.name, phone: seat.phone, m: month.month, date: month.auctionDate, disc: month.discountPaise, winner: month.winnerSeatId, seatId: seat.id })
      .from(payment)
      .innerJoin(month, eq(month.id, payment.monthId))
      .innerJoin(seat, eq(seat.id, payment.seatId))
      .innerJoin(chit, eq(chit.id, month.chitId))
      .where(and(eq(payment.paid, false), eq(month.status, "closed")))
      .orderBy(asc(chit.code), asc(seat.number), asc(month.month));
    const out = rows
      .filter((r) => r.winner !== r.seatId)
      .map((r) => {
        const pay = monthlyPayment({ totalPaise: r.total, months: r.months, rateBps: r.rate, incrementPaise: r.inc, installmentPaise: r.total / r.months, interestPaise: (r.total * r.rate) / 10000 }, r.disc ?? 0).payPaise;
        const last = lastPayDate(r.date);
        const late = Math.round((Date.parse(today) - Date.parse(last)) / 86_400_000);
        return { id: seatCode(r.code, r.num), name: r.name, phone: r.phone, chit: r.code, month: r.m, amount: pay, lastDay: last, status: late > 0 ? "late" : "not-due", late: late > 0 ? late : null };
      });
    return {
      kind: "arrears",
      title: { en: "Arrears · all chits", ta: "பாக்கி · எல்லா சீட்டுகளும்" },
      subtitle: { en: `Unpaid installments as of ${dateText(today, "en")}`, ta: `${dateText(today, "ta")} நிலவரப்படி கட்டாதவை` },
      columns: [
        { key: "id", en: "ID", ta: "ID" },
        { key: "name", en: "Name", ta: "பெயர்" },
        { key: "phone", en: "Mobile", ta: "Mobile" },
        { key: "month", en: "Month", ta: "மாதம்" },
        { key: "amount", en: "Amount", ta: "தொகை", money: true, align: "right" },
        { key: "lastDay", en: "Last day", ta: "கடைசி நாள்" },
        { key: "status", en: "Status", ta: "நிலை" },
        { key: "late", en: "Days late", ta: "தாமத நாள்", align: "right" },
      ],
      rows: out,
      totals: { id: `${new Set(out.map((r) => r.id)).size} IDs`, amount: out.reduce((a, r) => a + r.amount, 0) },
      kpis: [
        { en: "Late", ta: "தாமதம்", paise: out.filter((r) => r.status === "late").reduce((a, r) => a + r.amount, 0), tone: "warn" },
        { en: "Not due yet", ta: "இன்னும் கெடு உள்ளது", paise: out.filter((r) => r.status === "not-due").reduce((a, r) => a + r.amount, 0) },
      ],
    };
  });
}

/** 4. Member ledger: paid, received and arrears for one ID. */
export async function ledgerReport(db: DB, orgId: string, seatId: string): Promise<Report> {
  return withOrganiser(db, orgId, async (tx) => {
    const [s] = await tx.select().from(seat).where(eq(seat.id, seatId));
    if (!s) throw new ChitError("SEAT_NOT_FOUND");
    const [c] = await tx.select().from(chit).where(eq(chit.id, s.chitId));
    const t = termsOf(c);
    const months = await tx.select().from(month).where(and(eq(month.chitId, c.id), eq(month.status, "closed"))).orderBy(asc(month.month));
    const pays = await tx.select().from(payment).where(eq(payment.seatId, s.id));
    const pos = months.length ? await tx.select().from(payout).where(inArray(payout.monthId, months.map((m) => m.id))) : [];
    let paidTotal = 0;
    let arrears = 0;
    let received = 0;
    const rows = months.map((m) => {
      const pay = monthlyPayment(t, m.discountPaise ?? 0);
      const p = pays.find((x) => x.monthId === m.id);
      const won = m.winnerSeatId === s.id;
      const po = pos.find((x) => x.monthId === m.id);
      const st = status(p, won, Boolean(po?.done));
      if (st === "paid" || st === "adjusted") paidTotal += pay.payPaise;
      if (st === "unpaid") arrears += pay.payPaise;
      const got = won && po?.done ? po.prizePaise : null;
      if (got) received += got;
      return { month: m.month, date: m.auctionDate, due: pay.payPaise, status: st, paid: st === "paid" || st === "adjusted" ? pay.payPaise : 0, received: got, cash: won && po?.done ? po.cashPaise : null };
    });
    return {
      kind: "ledger",
      title: { en: `${seatCode(c.code, s.number)} · ${s.name}`, ta: `${seatCode(c.code, s.number)} · ${s.name}` },
      subtitle: { en: `Chit ${c.code} · ${s.phone}`, ta: `சீட்டு ${c.code} · ${s.phone}` },
      columns: [
        { key: "month", en: "Month", ta: "மாதம்" },
        { key: "date", en: "Auction", ta: "ஏலம்" },
        { key: "due", en: "Due", ta: "கட்ட வேண்டியது", money: true, align: "right" },
        { key: "status", en: "Status", ta: "நிலை" },
        { key: "paid", en: "Paid", ta: "கட்டியது", money: true, align: "right" },
        { key: "received", en: "Prize received", ta: "பெற்ற தொகை", money: true, align: "right" },
        { key: "cash", en: "Cash handed", ta: "கையில் கொடுத்தது", money: true, align: "right" },
      ],
      rows,
      totals: { month: "Total", paid: paidTotal, received: received || null, due: rows.reduce((a, r) => a + r.due, 0) },
      kpis: [
        { en: "Paid", ta: "கட்டியது", paise: paidTotal, tone: "ok" },
        { en: "Prize received", ta: "பெற்ற தொகை", paise: received },
        { en: "Arrears", ta: "பாக்கி", paise: arrears, tone: arrears ? "warn" : "ok" },
      ],
    };
  });
}

/** Choices for the report pickers (chits, closed months, seats). */
export async function reportChoices(db: DB, orgId: string) {
  return withOrganiser(db, orgId, async (tx) => {
    const chits = await tx.select({ id: chit.id, code: chit.code, status: chit.status }).from(chit).orderBy(asc(chit.code));
    const months = await tx.select({ id: month.id, chitId: month.chitId, month: month.month, status: month.status }).from(month).orderBy(asc(month.month));
    const seats = await tx.select({ id: seat.id, chitId: seat.chitId, number: seat.number, name: seat.name }).from(seat).orderBy(asc(seat.number));
    return chits.map((c) => ({
      id: c.id,
      code: c.code,
      status: c.status,
      months: months.filter((m) => m.chitId === c.id && m.status === "closed").map((m) => ({ id: m.id, month: m.month })),
      seats: seats.filter((s) => s.chitId === c.id).map((s) => ({ id: s.id, code: seatCode(c.code, s.number), name: s.name })),
    }));
  });
}

/* ------------------------------ CSV ------------------------------ */

const STATUS_TA: Record<string, string> = { paid: "கட்டியது", unpaid: "கட்டவில்லை", adjusted: "payout-ல் கழிவு", "at-payout": "payout-ல் கழிக்கப்படும்", late: "தாமதம்", "not-due": "கெடு உள்ளது" };

export function statusText(v: Cell, lang: "en" | "ta") {
  if (typeof v !== "string") return v;
  if (lang === "ta" && STATUS_TA[v]) return STATUS_TA[v];
  return { "at-payout": "at payout", adjusted: "adjusted (payout)", "not-due": "not due yet" }[v] ?? v;
}

/** RFC 4180 CSV with a UTF-8 BOM (so Excel shows Tamil correctly). Money as plain rupees. Formula-looking text is neutralised. */
export function toCsv(r: Report, lang: "en" | "ta") {
  const esc = (v: Cell) => {
    if (v == null) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`; // CSV injection guard
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const val = (c: Column, v: Cell) => (c.money && typeof v === "number" ? v / 100 : c.key === "status" ? statusText(v, lang) : v);
  const lines = [r.columns.map((c) => esc(c[lang])).join(",")];
  for (const row of r.rows) lines.push(r.columns.map((c) => esc(val(c, row[c.key]))).join(","));
  if (r.totals) lines.push(r.columns.map((c) => esc(val(c, r.totals![c.key] ?? null))).join(","));
  for (const k of r.kpis ?? []) lines.push([esc(k[lang]), esc(k.paise / 100)].join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

