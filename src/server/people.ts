/**
 * Member details the organiser keeps (BUSINESS-CONCEPT §10): Aadhaar (encrypted, audited Show) and seat transfer.
 *
 * Aadhaar is sealed with AES-256-GCM. The key is CHITTY_AADHAAR_KEY (32 bytes, base64) and never lives in the
 * database; the seat id is bound in as associated data, so a sealed number can't be copied onto another seat.
 * If the key is lost, the numbers are lost too: the key needs its own safe backup.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "@/db/client";
import { auditLog, chit, memberLink, pushSubscription, seat } from "@/db/schema";
import { withOrganiser } from "@/db/tenant";
import { cleanAadhaar } from "@/domain/aadhaar";
import { ChitError, cleanName, cleanPhone } from "./chits";
import { openRoomsAfter } from "./people-events";

function key() {
  const raw = process.env.CHITTY_AADHAAR_KEY;
  const k = raw ? Buffer.from(raw, "base64") : null;
  if (!k || k.length !== 32) throw new ChitError("AADHAAR_KEY_MISSING");
  return k;
}

/** v1 | iv(12) | tag(16) | ciphertext */
export function sealAadhaar(seatId: string, n: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(Buffer.from(seatId));
  const enc = Buffer.concat([c.update(n, "utf8"), c.final()]);
  return Buffer.concat([Buffer.from([1]), iv, c.getAuthTag(), enc]);
}

export function openAadhaar(seatId: string, blob: Buffer) {
  if (blob[0] !== 1) throw new ChitError("AADHAAR_UNREADABLE");
  try {
    const d = createDecipheriv("aes-256-gcm", key(), blob.subarray(1, 13));
    d.setAAD(Buffer.from(seatId));
    d.setAuthTag(blob.subarray(13, 29));
    return Buffer.concat([d.update(blob.subarray(29)), d.final()]).toString("utf8");
  } catch (e) {
    if (e instanceof ChitError) throw e;
    throw new ChitError("AADHAAR_UNREADABLE"); // wrong key or tampered
  }
}

const audit = (organiserId: string, action: string, details: object) => ({ organiserId, actorKind: "organiser", actorId: organiserId, action, details });

/** Set, change or clear (null / "") a seat's Aadhaar. Allowed in any chit state. */
export async function setAadhaar(db: DB, orgId: string, seatId: string, value: string | null) {
  const n = value == null || String(value).trim() === "" ? null : cleanAadhaar(value);
  if (value != null && String(value).trim() !== "" && !n) throw new ChitError("INVALID_AADHAAR");
  const blob = n ? sealAadhaar(seatId, n) : null;
  await withOrganiser(db, orgId, async (tx) => {
    const [s] = await tx.select({ id: seat.id }).from(seat).where(eq(seat.id, seatId));
    if (!s) throw new ChitError("SEAT_NOT_FOUND");
    await tx.update(seat).set({ aadhaarEnc: blob, aadhaarLast4: n ? n.slice(8) : null }).where(eq(seat.id, seatId));
    await tx.insert(auditLog).values(audit(orgId, n ? "seat.aadhaar_set" : "seat.aadhaar_clear", { seatId, last4: n?.slice(8) ?? null }));
  });
}

/** The full number, for the organiser only. Every Show is audited (even if it then fails). */
export async function showAadhaar(db: DB, orgId: string, seatId: string) {
  return withOrganiser(db, orgId, async (tx) => {
    const [s] = await tx.select({ enc: seat.aadhaarEnc, last4: seat.aadhaarLast4 }).from(seat).where(eq(seat.id, seatId));
    if (!s) throw new ChitError("SEAT_NOT_FOUND");
    if (!s.enc) throw new ChitError("NO_AADHAAR");
    await tx.insert(auditLog).values(audit(orgId, "seat.aadhaar_show", { seatId, last4: s.last4 }));
    return openAadhaar(seatId, s.enc);
  });
}

/**
 * Transfer: the seat passes to a new person mid-chit. Same ID, all history kept. The old link and the old
 * person's notification phones stop at once; the new person gets a new link.
 */
export async function transferSeat(db: DB, orgId: string, seatId: string, input: { name: string; phone: string; aadhaar?: string | null }) {
  const name = cleanName(input.name);
  const phone = cleanPhone(input.phone);
  const a = input.aadhaar == null || input.aadhaar.trim() === "" ? null : cleanAadhaar(input.aadhaar);
  if (input.aadhaar && input.aadhaar.trim() !== "" && !a) throw new ChitError("INVALID_AADHAAR");
  const blob = a ? sealAadhaar(seatId, a) : null;
  const live = await withOrganiser(db, orgId, async (tx) => {
    const [s] = await tx.select().from(seat).where(eq(seat.id, seatId)).for("update");
    if (!s) throw new ChitError("SEAT_NOT_FOUND");
    const [c] = await tx.select({ status: chit.status }).from(chit).where(eq(chit.id, s.chitId));
    if (c.status !== "active") throw new ChitError("CHIT_NOT_ACTIVE"); // drafts are simply edited
    if (s.isOrganiser) throw new ChitError("ORGANISER_SEAT");
    const now = new Date();
    const links = await tx.update(memberLink).set({ revokedAt: now }).where(and(eq(memberLink.seatId, seatId), isNull(memberLink.revokedAt))).returning({ id: memberLink.id });
    await tx.delete(pushSubscription).where(eq(pushSubscription.seatId, seatId));
    await tx.update(seat).set({ name, phone, pinEnc: null, aadhaarEnc: blob, aadhaarLast4: a ? a.slice(8) : null }).where(eq(seat.id, seatId));
    await tx.insert(auditLog).values(audit(orgId, "seat.transfer", { seatId, from: { name: s.name, phone: s.phone }, to: { name, phone }, linksRevoked: links.length }));
    return openRoomsAfter(tx, s.chitId);
  });
  live();
}
