/** Turns the reports page / CSV query into one report. Bad or missing ids just mean "pick something". */
import type { DB } from "@/db/client";
import { ChitError } from "./chits";
import { arrearsReport, collectionReport, ledgerReport, summaryReport, type Report, type ReportKind } from "./reports";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type ReportQuery = { kind: ReportKind; chit?: string; month?: string; seat?: string };

export function parseQuery(q: Record<string, string | string[] | undefined>): ReportQuery {
  const one = (k: string) => (typeof q[k] === "string" && UUID.test(q[k] as string) ? (q[k] as string) : undefined);
  const kind = (["collection", "summary", "arrears", "ledger"] as const).find((k) => k === q.kind) ?? "arrears";
  return { kind, chit: one("chit"), month: one("month"), seat: one("seat") };
}

export async function loadReport(db: DB, orgId: string, q: ReportQuery, today: string): Promise<Report | null> {
  try {
    if (q.kind === "arrears") return await arrearsReport(db, orgId, today);
    if (q.kind === "collection" && q.month) return await collectionReport(db, orgId, q.month);
    if (q.kind === "summary" && q.chit) return await summaryReport(db, orgId, q.chit);
    if (q.kind === "ledger" && q.seat) return await ledgerReport(db, orgId, q.seat);
    return null;
  } catch (e) {
    if (e instanceof ChitError) return null;
    throw e;
  }
}
