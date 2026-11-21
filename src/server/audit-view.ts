/** The organiser's audit log (read-only), newest first, with seat/month ids turned into codes. */
import { and, desc, eq, like, lt, or, type SQL } from "drizzle-orm";
import type { DB } from "@/db/client";
import { auditLog, chit, month, seat } from "@/db/schema";
import { withOrganiser } from "@/db/tenant";
import { seatCode } from "./chits";

export type AuditGroup = "all" | "money" | "auction" | "members" | "aadhaar";
export const AUDIT_PAGE = 50;

const GROUP: Record<Exclude<AuditGroup, "all">, string[]> = {
  money: ["payment.%", "payout.%"],
  auction: ["month.%", "bid.%"],
  members: ["seat.%", "link.%", "chit.%"],
  aadhaar: ["seat.aadhaar_%"],
};

export async function listAudit(db: DB, orgId: string, opts: { group?: AuditGroup; before?: number } = {}) {
  return withOrganiser(db, orgId, async (tx) => {
    const where: SQL[] = [eq(auditLog.organiserId, orgId)];
    if (opts.before && Number.isSafeInteger(opts.before)) where.push(lt(auditLog.id, opts.before));
    if (opts.group && opts.group !== "all") where.push(or(...GROUP[opts.group].map((p) => like(auditLog.action, p)))!);
    const rows = await tx
      .select()
      .from(auditLog)
      .where(and(...where))
      .orderBy(desc(auditLog.id))
      .limit(AUDIT_PAGE + 1);
    const chits = await tx.select({ id: chit.id, code: chit.code }).from(chit);
    const code = new Map(chits.map((c) => [c.id, c.code]));
    const seats = await tx.select({ id: seat.id, chitId: seat.chitId, number: seat.number, name: seat.name }).from(seat);
    const months = await tx.select({ id: month.id, chitId: month.chitId, month: month.month }).from(month);
    return {
      rows: rows.slice(0, AUDIT_PAGE).map((r) => ({ id: r.id, at: r.at.toISOString(), actor: r.actorKind, action: r.action, details: (r.details ?? {}) as Record<string, unknown> })),
      more: rows.length > AUDIT_PAGE,
      names: {
        seats: Object.fromEntries(seats.map((s) => [s.id, `${seatCode(code.get(s.chitId) ?? "?", s.number)} · ${s.name}`])),
        months: Object.fromEntries(months.map((m) => [m.id, { chit: code.get(m.chitId) ?? "?", month: m.month }])),
        chits: Object.fromEntries(chits.map((c) => [c.id, c.code])),
      },
    };
  });
}
