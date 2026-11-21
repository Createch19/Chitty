/**
 * Accounts: Super Admin and organisers, passwords, sessions, login rate limiting, and the
 * Super Admin's organiser management. Framework-free (takes a db), so tests call it directly.
 *
 * - Passwords: scrypt (node:crypto), salted, parameters stored in the hash.
 * - Sessions: 256-bit random token in an httpOnly cookie; only its SHA-256 is stored; 30-day sliding expiry.
 * - Rate limit: 5 failed logins per mobile and 30 per IP in 15 minutes.
 * - The Super Admin never touches chit data; usage counts are plain COUNTs.
 */
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, count, desc, eq, gt, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db/client";
import { auditLog, loginAttempt, organiser, session, superAdmin } from "@/db/schema";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

export type Kind = "admin" | "organiser";
export const SESSION_DAYS = 30;
const DAY = 86_400_000;
const WINDOW_MS = 15 * 60_000;
const MAX_PER_MOBILE = 5;
const MAX_PER_IP = 30;

export class AccountError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "AccountError";
  }
}

/* ---------------- input ---------------- */

/** "+91 98400 12345", "098400 12345" → "9840012345". */
export function normalizeMobile(input: string): string {
  let d = String(input ?? "").replace(/[\s\-().]/g, "");
  if (d.startsWith("+91")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (!/^[6-9]\d{9}$/.test(d)) throw new AccountError("INVALID_MOBILE");
  return d;
}

const password = z.string().min(8, "PASSWORD_TOO_SHORT").max(200);
const organiserInput = z.object({
  businessName: z.string().trim().min(2).max(80),
  businessNameTa: z.string().trim().max(80).optional().transform((v) => v || null),
  ownerName: z.string().trim().min(1).max(60),
  mobile: z.string().transform((v, ctx) => {
    try {
      return normalizeMobile(v);
    } catch {
      ctx.addIssue({ code: "custom", message: "INVALID_MOBILE" });
      return z.NEVER;
    }
  }),
});
export type OrganiserInput = z.input<typeof organiserInput>;

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new AccountError(r.error.issues[0]?.message?.match(/^[A-Z_]+$/) ? r.error.issues[0].message : "INVALID_INPUT");
  return r.data;
}

/* ---------------- passwords & tokens ---------------- */

const N = 2 ** 15;
const KEYLEN = 32;

export async function hashPassword(pw: string): Promise<string> {
  parse(password, pw);
  const salt = randomBytes(16);
  const key = await scrypt(pw.normalize("NFKC"), salt, KEYLEN, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$8$1$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const parts = String(stored).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt" || typeof pw !== "string" || pw.length > 200) return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (![n, r, p].every(Number.isSafeInteger) || 128 * n * r > 64 * 1024 * 1024) return false;
  const salt = Buffer.from(parts[4], "base64url");
  const want = Buffer.from(parts[5], "base64url");
  if (salt.length !== 16 || want.length !== KEYLEN) return false;
  const got = await scrypt(pw.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(got, want);
}

let dummy: Promise<string> | undefined;
const dummyHash = () => (dummy ??= hashPassword("dummy-password-for-timing"));

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

/** Readable one-time password for resets: no 0/O/1/l/I. */
export function tempPassword(len = 10): string {
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => abc[randomInt(abc.length)]).join("");
}

/* ---------------- seed ---------------- */

/** Create the Super Admin on first boot (idempotent: does nothing once one exists). */
export async function ensureSuperAdmin(db: DB, input: { mobile: string; password: string; name?: string }): Promise<"created" | "exists"> {
  const [{ n }] = await db.select({ n: count() }).from(superAdmin);
  if (n > 0) return "exists";
  const mobile = normalizeMobile(input.mobile);
  await db.insert(superAdmin).values({ mobile, name: input.name ?? "Super Admin", passwordHash: await hashPassword(input.password) });
  await db.insert(auditLog).values({ actorKind: "system", action: "superadmin.seed", details: { mobile } });
  return "created";
}

/* ---------------- login ---------------- */

async function tooMany(db: DB, key: string, max: number, now: Date) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(loginAttempt)
    .where(and(eq(loginAttempt.key, key), gte(loginAttempt.at, new Date(now.getTime() - WINDOW_MS))));
  return n >= max;
}

export type LoginResult = { ok: true; subjectId: string; mustChangePassword: boolean } | { ok: false; code: "INVALID" | "LOCKED" | "DISABLED" };

export async function attemptLogin(db: DB, kind: Kind, mobileRaw: string, pw: string, ip: string, now = new Date()): Promise<LoginResult> {
  let mobile: string;
  try {
    mobile = normalizeMobile(mobileRaw);
  } catch {
    await verifyPassword(pw, await dummyHash());
    return { ok: false, code: "INVALID" };
  }
  const mKey = `${kind}:${mobile}`;
  const ipKey = `ip:${ip || "unknown"}`;
  if ((await tooMany(db, mKey, MAX_PER_MOBILE, now)) || (await tooMany(db, ipKey, MAX_PER_IP, now))) return { ok: false, code: "LOCKED" };

  const row =
    kind === "admin"
      ? (await db.select({ id: superAdmin.id, hash: superAdmin.passwordHash }).from(superAdmin).where(eq(superAdmin.mobile, mobile)))[0]
      : (
          await db
            .select({ id: organiser.id, hash: organiser.passwordHash, active: organiser.active, must: organiser.mustChangePassword })
            .from(organiser)
            .where(eq(organiser.mobile, mobile))
        )[0];

  const good = await verifyPassword(pw, row?.hash ?? (await dummyHash()));
  if (!row || !good) {
    await db.insert(loginAttempt).values([{ key: mKey, at: now }, { key: ipKey, at: now }]);
    return { ok: false, code: "INVALID" };
  }
  if ("active" in row && !row.active) return { ok: false, code: "DISABLED" };
  await db.delete(loginAttempt).where(eq(loginAttempt.key, mKey));
  return { ok: true, subjectId: row.id, mustChangePassword: "must" in row ? Boolean(row.must) : false };
}

/* ---------------- sessions ---------------- */

export async function createSession(db: DB, kind: Kind, subjectId: string, now = new Date()) {
  const token = newToken();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY);
  await db.insert(session).values({ tokenHash: sha256(token), kind, subjectId, createdAt: now, expiresAt });
  // housekeeping: drop this account's expired sessions
  await db.delete(session).where(and(eq(session.kind, kind), eq(session.subjectId, subjectId), lt(session.expiresAt, now)));
  return { token, expiresAt };
}

/** Returns the subject id for a valid token (and slides the expiry), or null. Disabled organisers get null. */
export async function readSession(db: DB, kind: Kind, token: string | undefined, now = new Date()) {
  if (!token || token.length > 100) return null;
  const [s] = await db
    .select()
    .from(session)
    .where(and(eq(session.tokenHash, sha256(token)), eq(session.kind, kind), gt(session.expiresAt, now)));
  if (!s) return null;
  if (kind === "organiser") {
    const [o] = await db.select({ active: organiser.active }).from(organiser).where(eq(organiser.id, s.subjectId));
    if (!o?.active) return null;
  }
  if (s.expiresAt.getTime() - now.getTime() < (SESSION_DAYS / 2) * DAY) {
    await db.update(session).set({ expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY) }).where(eq(session.id, s.id));
  }
  return { subjectId: s.subjectId };
}

export async function endSession(db: DB, token: string | undefined) {
  if (token) await db.delete(session).where(eq(session.tokenHash, sha256(token)));
}

export async function revokeAll(db: DB, kind: Kind, subjectId: string) {
  await db.delete(session).where(and(eq(session.kind, kind), eq(session.subjectId, subjectId)));
}

/* ---------------- Super Admin: organisers ---------------- */

const audit = (db: DB, adminId: string, action: string, organiserId: string | null, details: object) =>
  db.insert(auditLog).values({ actorKind: "admin", actorId: adminId, action, organiserId, details });

export async function listOrganisers(db: DB) {
  return db
    .select({
      id: organiser.id,
      businessName: organiser.businessName,
      businessNameTa: organiser.businessNameTa,
      ownerName: organiser.ownerName,
      mobile: organiser.mobile,
      active: organiser.active,
      createdAt: organiser.createdAt,
      // fully qualified on purpose: counts only, never chit or member details
      chits: sql<number>`(select count(*)::int from chit c where c.organiser_id = "organiser"."id")`,
      ids: sql<number>`(select count(*)::int from seat s where s.organiser_id = "organiser"."id")`,
    })
    .from(organiser)
    .orderBy(desc(organiser.createdAt));
}

export async function createOrganiser(db: DB, adminId: string, input: OrganiserInput & { password: string }) {
  const data = parse(organiserInput, input);
  parse(password, input.password);
  const exists = await db.select({ id: organiser.id }).from(organiser).where(eq(organiser.mobile, data.mobile));
  if (exists.length) throw new AccountError("MOBILE_TAKEN");
  const [row] = await db
    .insert(organiser)
    .values({ ...data, passwordHash: await hashPassword(input.password), mustChangePassword: true })
    .returning({ id: organiser.id });
  await audit(db, adminId, "organiser.create", row.id, { businessName: data.businessName, mobile: data.mobile });
  return row.id;
}

export async function updateOrganiser(db: DB, adminId: string, id: string, input: OrganiserInput) {
  const data = parse(organiserInput, input);
  const clash = await db.select({ id: organiser.id }).from(organiser).where(eq(organiser.mobile, data.mobile));
  if (clash.some((c) => c.id !== id)) throw new AccountError("MOBILE_TAKEN");
  const r = await db.update(organiser).set({ ...data, updatedAt: new Date() }).where(eq(organiser.id, id)).returning({ id: organiser.id });
  if (!r.length) throw new AccountError("NOT_FOUND");
  await audit(db, adminId, "organiser.update", id, data);
}

/** Disabling pauses everything for that organiser (BUSINESS-CONCEPT §2) and signs them out. */
export async function setOrganiserActive(db: DB, adminId: string, id: string, active: boolean) {
  const r = await db.update(organiser).set({ active, updatedAt: new Date() }).where(eq(organiser.id, id)).returning({ id: organiser.id });
  if (!r.length) throw new AccountError("NOT_FOUND");
  if (!active) await revokeAll(db, "organiser", id);
  await audit(db, adminId, active ? "organiser.enable" : "organiser.disable", id, {});
}

/** Returns a one-time password to give the organiser; they must change it at next login. */
export async function resetOrganiserPassword(db: DB, adminId: string, id: string) {
  const pw = tempPassword();
  const r = await db
    .update(organiser)
    .set({ passwordHash: await hashPassword(pw), mustChangePassword: true, updatedAt: new Date() })
    .where(eq(organiser.id, id))
    .returning({ id: organiser.id });
  if (!r.length) throw new AccountError("NOT_FOUND");
  await revokeAll(db, "organiser", id);
  await audit(db, adminId, "organiser.password_reset", id, {});
  return pw;
}

export async function changeOrganiserPassword(db: DB, id: string, current: string, next: string) {
  parse(password, next);
  const [row] = await db.select({ hash: organiser.passwordHash }).from(organiser).where(eq(organiser.id, id));
  if (!row || !(await verifyPassword(current, row.hash))) throw new AccountError("WRONG_PASSWORD");
  if (current === next) throw new AccountError("SAME_PASSWORD");
  await db.update(organiser).set({ passwordHash: await hashPassword(next), mustChangePassword: false, updatedAt: new Date() }).where(eq(organiser.id, id));
  await db.insert(auditLog).values({ actorKind: "organiser", actorId: id, organiserId: id, action: "organiser.password_change", details: {} });
}

export async function getAdmin(db: DB, id: string) {
  const [a] = await db.select({ id: superAdmin.id, name: superAdmin.name, mobile: superAdmin.mobile }).from(superAdmin).where(eq(superAdmin.id, id));
  return a ?? null;
}
