/**
 * Paper-chit import (BUSINESS-CONCEPT §14): the Excel template, reading an uploaded file, and recording a
 * checked chit in one transaction. From the next month on, the chit runs in the app as normal.
 */
import ExcelJS from "exceljs";
import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db/client";
import { auditLog, chit, month, payment, seat } from "@/db/schema";
import { withOrganiser } from "@/db/tenant";
import { checkImport, type ImportData, type ImportPlan } from "@/domain/import";
import { minimumDiscount } from "@/domain/money";
import { monthsToCreate } from "@/domain/rules";
import { ChitError, payoutTx, settleMonth } from "./chits";
import { sealAadhaar } from "./people";

export const MAX_IMPORT_BYTES = 900 * 1024; // under the 1 MB server-action body limit

/* ------------------------------ template ------------------------------ */

const SAMPLE_NAMES = ["Organiser", "Selvi", "Karthik", "Lakshmi", "Ravi", "Ravi", "Meena", "Suresh", "Divya", "Arun", "Priya", "Kumar", "Anitha", "Vijay", "Geetha", "Mani", "Revathi", "Bala", "Kavitha", "Sakthi"];
// 5L / 20 months, started 10 May 2026, 7 months held
const SAMPLE_MONTHS: [number, number, string, boolean, boolean][] = [
  [1, 0, "A01", false, true],
  [2, 145500, "A07", false, true],
  [3, 135000, "A12", true, true],
  [4, 130000, "A03", false, true],
  [5, 121000, "A15", false, true],
  [6, 115500, "A09", false, true],
  [7, 108000, "A18", false, false],
];

export async function buildTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Chitty";
  const gold = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFD34D" } };
  const head = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).eachCell((c) => (c.fill = gold));
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  const help = wb.addWorksheet("Read me");
  help.columns = [{ width: 110 }];
  [
    "Chitty: import a chit that is already running on paper",
    "",
    "1. Fill the 4 sheets: Chit, Members, Months, Payments. The sample (5 lakh, 20 months, 7 months held) shows how. Replace it with your chit.",
    "2. Chit: one value per row in column B. Dates like 2026-05-10. The start day must be 1 to 28.",
    "3. Members: one row per member ID (A01, A02 …). Exactly one row has Organiser = Yes; that ID wins month 1. Aadhaar is optional.",
    "4. Months: only months already held. Discount in rupees (month 1 = 0). Lottery = Yes when nobody bid. Payout done = Yes when the winner was paid.",
    "5. Payments: one row per ID, one column per held month: Paid or Not paid. Leave the winner's own cell empty.",
    "6. Upload it in Chitty → Import. You'll see a preview and any mistakes with their row before anything is saved.",
    "",
    "சுருக்கம்: 4 sheet-களையும் நிரப்பி Chitty → Import-ல் upload செய்யவும். சேமிக்கும் முன் preview, தவறுகள் வரிசை எண்ணுடன் காட்டப்படும்.",
  ].forEach((t, i) => {
    help.getCell(`A${i + 1}`).value = t;
    if (i === 0) help.getCell("A1").font = { bold: true, size: 14 };
  });

  const c = wb.addWorksheet("Chit");
  c.columns = [
    { header: "Field", width: 26 },
    { header: "Value", width: 18 },
    { header: "Note", width: 60 },
  ];
  head(c);
  c.addRows([
    ["Chit code", "A", "1–3 letters; must not be used by another of your chits"],
    ["Chit value (₹)", 500000, "Whole rupees"],
    ["Months", 20, "Number of months = number of member IDs"],
    ["Monthly rate %", 1.5, "Default 30 ÷ months"],
    ["Bid increment (₹)", 500, ""],
    ["Start date", "2026-05-10", "Month 1 auction day. Day 1–28; every auction is on this day"],
    ["Auction open time", "09:00", "24-hour time"],
  ]);

  const m = wb.addWorksheet("Members");
  m.columns = [
    { header: "ID", width: 8 },
    { header: "Name", width: 24 },
    { header: "Mobile", width: 14 },
    { header: "Aadhaar (optional)", width: 20 },
    { header: "Organiser (Yes/No)", width: 18 },
  ];
  head(m);
  SAMPLE_NAMES.forEach((n, i) => m.addRow([`A${String(i + 1).padStart(2, "0")}`, n, n === "Ravi" ? "9840011205" : `98400${11000 + i}`, "", i === 0 ? "Yes" : "No"]));
  m.getColumn(3).numFmt = "@";
  m.getColumn(4).numFmt = "@";

  const mo = wb.addWorksheet("Months");
  mo.columns = [
    { header: "Month", width: 8 },
    { header: "Discount (₹)", width: 14 },
    { header: "Winner ID", width: 11 },
    { header: "Lottery (Yes/No)", width: 16 },
    { header: "Payout done (Yes/No)", width: 20 },
  ];
  head(mo);
  SAMPLE_MONTHS.forEach(([k, d, w, l, p]) => mo.addRow([k, d, w, l ? "Yes" : "No", p ? "Yes" : "No"]));

  const p = wb.addWorksheet("Payments");
  p.columns = [{ header: "ID", width: 8 }, ...SAMPLE_MONTHS.map(([k]) => ({ header: `M${k}`, width: 10 }))];
  head(p);
  SAMPLE_NAMES.forEach((_, i) => {
    const id = `A${String(i + 1).padStart(2, "0")}`;
    p.addRow([id, ...SAMPLE_MONTHS.map(([k, , w]) => (w === id ? "" : k === 7 && (id === "A05" || id === "A11") ? "Not paid" : "Paid"))]);
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ------------------------------ reading ------------------------------ */

const text = (cell: ExcelJS.Cell): string => {
  const v = cell.value;
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "result" in v) return String(v.result ?? "");
  if (typeof v === "object" && "richText" in v) return v.richText.map((r) => r.text).join("");
  if (typeof v === "object" && "text" in v) return String(v.text);
  return String(v).trim();
};

export class ImportFileError extends Error {}

export async function readWorkbook(buf: Buffer): Promise<ImportData> {
  if (buf.length > MAX_IMPORT_BYTES) throw new ImportFileError("TOO_BIG");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new ImportFileError("NOT_XLSX");
  }
  const sheet = (name: string) => {
    const ws = wb.getWorksheet(name);
    if (!ws) throw new ImportFileError(`MISSING_SHEET:${name}`);
    return ws;
  };
  const rowsOf = (ws: ExcelJS.Worksheet, cols: number) => {
    const out: { row: number; v: string[] }[] = [];
    ws.eachRow((r, i) => {
      if (i === 1 || out.length > 500) return;
      const v = Array.from({ length: cols }, (_, j) => text(r.getCell(j + 1)));
      if (v.some((x) => x !== "")) out.push({ row: i, v });
    });
    return out;
  };

  const chitRows = rowsOf(sheet("Chit"), 2);
  const field = (re: RegExp) => chitRows.find((r) => re.test(r.v[0].toLowerCase()));
  const pick = (key: string, re: RegExp) => {
    const r = field(re);
    if (r) rows[key] = r.row;
    return r?.v[1] ?? "";
  };
  const rows: Record<string, number> = {};
  const chitPart = {
    code: pick("code", /code/),
    total: pick("total", /value|தொகை/),
    months: pick("months", /^months?/),
    rate: pick("rate", /rate|வட்டி/),
    increment: pick("increment", /increment|step/),
    startDate: pick("startDate", /start/),
    openTime: pick("openTime", /time/),
    rows,
  };

  const members = rowsOf(sheet("Members"), 5).map(({ row, v }) => ({ row, id: v[0], name: v[1], phone: v[2], aadhaar: v[3], organiser: v[4] }));
  const months = rowsOf(sheet("Months"), 5).map(({ row, v }) => ({ row, month: v[0], discount: v[1], winner: v[2], lottery: v[3], payoutDone: v[4] }));

  const pws = sheet("Payments");
  const header = pws.getRow(1);
  const monthCols: { col: number; month: number }[] = [];
  header.eachCell((c, col) => {
    const k = /^m?\s*(\d{1,3})$/i.exec(text(c));
    if (col > 1 && k) monthCols.push({ col, month: Number(k[1]) });
  });
  const payments: ImportData["payments"] = [];
  pws.eachRow((r, i) => {
    if (i === 1) return;
    const id = text(r.getCell(1));
    if (!id) return;
    payments.push({ row: i, id, cells: monthCols.map(({ col, month }) => ({ month, value: text(r.getCell(col)) })) });
  });

  return { chit: chitPart, members, months, payments };
}

/* ------------------------------ checking + recording ------------------------------ */

export async function usedCodes(db: DB, orgId: string) {
  return withOrganiser(db, orgId, async (tx) => (await tx.select({ code: chit.code }).from(chit)).map((r) => r.code));
}

export async function previewImport(db: DB, orgId: string, buf: Buffer, today: string) {
  const data = await readWorkbook(buf);
  return checkImport(data, await usedCodes(db, orgId), today);
}

/** Record a checked plan. All or nothing. No member messages for past months. */
export async function importChit(db: DB, orgId: string, plan: ImportPlan, now = new Date()) {
  return withOrganiser(db, orgId, async (tx) => {
    const t = plan.terms;
    const taken = (await tx.select({ code: chit.code }).from(chit)).map((r) => r.code);
    if (taken.includes(plan.code)) throw new ChitError("CODE_TAKEN");
    const [c] = await tx
      .insert(chit)
      .values({ organiserId: orgId, code: plan.code, totalPaise: t.totalPaise, months: t.months, rateBps: t.rateBps, incrementPaise: t.incrementPaise, openTime: plan.openTime, display: "id", status: "active", startDate: plan.startDate })
      .returning();
    const seats = await tx
      .insert(seat)
      .values(plan.members.map((m) => ({ organiserId: orgId, chitId: c.id, number: m.number, name: m.name, phone: m.phone, isOrganiser: m.organiser })))
      .returning({ id: seat.id, number: seat.number });
    const seatId = (n: number) => seats.find((s) => s.number === n)!.id;
    for (const m of plan.members) {
      if (m.aadhaar) await tx.update(seat).set({ aadhaarEnc: sealAadhaar(seatId(m.number), m.aadhaar), aadhaarLast4: m.aadhaar.slice(8) }).where(eq(seat.id, seatId(m.number)));
    }
    const created = await tx
      .insert(month)
      .values(monthsToCreate(t, plan.startDate).map((r) => ({ organiserId: orgId, chitId: c.id, month: r.month, auctionDate: r.auctionDate, bidding: r.bidding, minDiscountPaise: minimumDiscount(t, r.month) })))
      .returning();
    const actor = { kind: "organiser" as const, id: orgId };
    for (const mo of plan.months) {
      const row = created.find((x) => x.month === mo.month)!;
      await settleMonth(tx, orgId, c, row, seatId(mo.winner), mo.discountPaise, mo.lottery, now, actor, true);
      const paidIds = plan.members.filter((m) => plan.paid[mo.month - 1][m.number - 1]).map((m) => seatId(m.number));
      if (paidIds.length) await tx.update(payment).set({ paid: true, updatedAt: now }).where(and(eq(payment.monthId, row.id), inArray(payment.seatId, paidIds)));
    }
    // payouts after every payment is in (a winner's arrears from later months can't exist; earlier ones are adjusted)
    for (const mo of plan.months) {
      if (!mo.payoutDone) continue;
      const [row] = await tx.select().from(month).where(eq(month.id, created.find((x) => x.month === mo.month)!.id));
      await payoutTx(tx, orgId, row, now, actor);
    }
    await tx.insert(auditLog).values({ organiserId: orgId, actorKind: "organiser", actorId: orgId, action: "chit.import", details: { chitId: c.id, code: plan.code, monthsImported: plan.months.length } });
    return c.id;
  });
}
