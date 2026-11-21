"use server";

/** Paper-chit import actions. The file is re-read and re-checked on Import; nothing from the preview is trusted. */
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import type { ImportIssue } from "@/domain/import";
import { ChitError } from "@/server/chits";
import { ImportFileError, importChit, MAX_IMPORT_BYTES, previewImport } from "@/server/importer";
import { istNow } from "@/server/scheduler";
import { requireOrganiser } from "@/server/session";

export type Preview = {
  ok: boolean;
  fileError?: string;
  issues: ImportIssue[];
  plan?: {
    code: string;
    totalPaise: number;
    months: number;
    rateBps: number;
    incrementPaise: number;
    startDate: string;
    openTime: string;
    members: { id: string; name: string; phone: string; aadhaar4: string | null; organiser: boolean }[];
    held: { month: number; auctionDate: string; discountPaise: number; winner: string; lottery: boolean; payoutDone: boolean; payPaise: number; paid: number }[];
    next: { month: number; auctionDate: string } | null;
  };
};

async function load(form: FormData) {
  const me = await requireOrganiser();
  if (me.mustChangePassword) throw new ImportFileError("MUST_CHANGE_PASSWORD");
  const f = form.get("file");
  if (!(f instanceof File) || f.size === 0) throw new ImportFileError("NO_FILE");
  if (f.size > MAX_IMPORT_BYTES) throw new ImportFileError("TOO_BIG");
  const db = await getDb();
  const r = await previewImport(db, me.id, Buffer.from(await f.arrayBuffer()), istNow(new Date()).date);
  return { me, db, r };
}

export async function previewImportAction(form: FormData): Promise<Preview> {
  try {
    const { r } = await load(form);
    if (!r.plan) return { ok: false, issues: r.issues };
    const p = r.plan;
    const code = (n: number) => p.members.find((m) => m.number === n)!.id;
    return {
      ok: true,
      issues: [],
      plan: {
        code: p.code,
        totalPaise: p.terms.totalPaise,
        months: p.terms.months,
        rateBps: p.terms.rateBps,
        incrementPaise: p.terms.incrementPaise,
        startDate: p.startDate,
        openTime: p.openTime,
        members: p.members.map((m) => ({ id: m.id, name: m.name, phone: m.phone, aadhaar4: m.aadhaar ? m.aadhaar.slice(8) : null, organiser: m.organiser })),
        held: p.months.map((m, i) => ({ month: m.month, auctionDate: m.auctionDate, discountPaise: m.discountPaise, winner: code(m.winner), lottery: m.lottery, payoutDone: m.payoutDone, payPaise: m.payPaise, paid: p.paid[i].filter(Boolean).length })),
        next: p.next,
      },
    };
  } catch (e) {
    if (e instanceof ImportFileError) return { ok: false, fileError: e.message, issues: [] };
    throw e;
  }
}

export async function importAction(form: FormData): Promise<Preview> {
  let chitId: string;
  try {
    const { me, db, r } = await load(form);
    if (!r.plan) return { ok: false, issues: r.issues };
    chitId = await importChit(db, me.id, r.plan);
  } catch (e) {
    if (e instanceof ImportFileError) return { ok: false, fileError: e.message, issues: [] };
    if (e instanceof ChitError) return { ok: false, fileError: e.code, issues: [] };
    throw e;
  }
  redirect(`/app/chits/${chitId}`);
}
