/**
 * Group link + PIN (BUSINESS-CONCEPT §10). A chit has one link for its WhatsApp group; each person has one fixed
 * 6-digit PIN per chit, shared by all the IDs under the same mobile. The PIN opens the member's page on a phone
 * and confirms every bid. PINs are random, sealed with the Aadhaar key (CHITTY_AADHAAR_KEY), and only the organiser can show them.
 */
import { randomInt, timingSafeEqual } from "node:crypto";
import { and, asc, count, eq, gte, inArray, isNull } from "drizzle-orm";
import type { DB } from "@/db/client";
import { auditLog, chit, loginAttempt, memberLink, organiser, seat } from "@/db/schema";
import { withOrganiser } from "@/db/tenant";
import { newToken, sha256 } from "./accounts";
import { ChitError, seatCode } from "./chits";
import { openAadhaar, sealAadhaar } from "./people";
import { openRoomsAfter } from "./people-events";

const newPin = () => String(randomInt(1_000_000)).padStart(6, "0");
const seal = (seatId: string, pin: string) => sealAadhaar(`pin:${seatId}`, pin);
const open = (seatId: string, blob: Buffer) => openAadhaar(`pin:${seatId}`, blob);
const log = (organiserId: string, action: string, details: object, seatId?: string) => ({ organiserId, actorKind: seatId ? "member" : "organiser", actorId: seatId ?? organiserId, action, details });

/* ------------------------------ organiser ------------------------------ */

/** Every PIN of a chit (also before it starts), one row per person; missing ones are made now. Viewing is audited. */
export async function chitPins(db: DB, orgId: string, chitId: string) {
  return withOrganiser(db, orgId, async (tx) => {
    const [c] = await tx.select().from(chit).where(eq(chit.id, chitId)).for("update");
    if (!c) throw new ChitError("CHIT_NOT_FOUND");
    const seats = await tx.select().from(seat).where(eq(seat.chitId, chitId)).orderBy(asc(seat.number));
    const people = new Map<string, { seatId: string; name: string; phone: string; codes: string[]; pin: string }>();
    let made = 0;
    for (const s of seats) {
      const p = people.get(s.phone);
      let pin = s.pinEnc ? open(s.id, s.pinEnc) : null;
      if (!pin || (p && p.pin !== pin)) {
        const other = p ? null : seats.find((x) => x.phone === s.phone && x.pinEnc);
        pin = p?.pin ?? (other ? open(other.id, other.pinEnc!) : newPin());
        await tx.update(seat).set({ pinEnc: seal(s.id, pin) }).where(eq(seat.id, s.id));
        made++;
      }
      if (p) p.codes.push(seatCode(c.code, s.number));
      else people.set(s.phone, { seatId: s.id, name: s.name, phone: s.phone, codes: [seatCode(c.code, s.number)], pin });
    }
    await tx.insert(auditLog).values(log(orgId, "pin.view", { chitId, made }));
    return [...people.values()];
  });
}

/** New PIN for this person (all their IDs in the chit); phones that joined with the old PIN are signed out. */
export async function resetPin(db: DB, orgId: string, seatId: string, now = new Date()) {
  const { pin, live } = await withOrganiser(db, orgId, async (tx) => {
    const [s] = await tx.select().from(seat).where(eq(seat.id, seatId));
    if (!s) throw new ChitError("SEAT_NOT_FOUND");
    await tx.select({ id: chit.id }).from(chit).where(eq(chit.id, s.chitId)).for("update");
    const mine = await tx.select({ id: seat.id }).from(seat).where(and(eq(seat.chitId, s.chitId), eq(seat.phone, s.phone)));
    const pin = newPin();
    for (const m of mine) await tx.update(seat).set({ pinEnc: seal(m.id, pin) }).where(eq(seat.id, m.id));
    await tx.update(memberLink).set({ revokedAt: now }).where(and(inArray(memberLink.seatId, mine.map((m) => m.id)), eq(memberLink.kind, "device"), isNull(memberLink.revokedAt)));
    await tx.insert(auditLog).values(log(orgId, "pin.reset", { seatId, chitId: s.chitId, ids: mine.length }));
    return { pin, live: await openRoomsAfter(tx, s.chitId) };
  });
  live();
  return pin;
}

/** The chit's group link token (made on first use). `renew` replaces it; phones already in stay in. */
export async function groupToken(db: DB, orgId: string, chitId: string, renew = false) {
  return withOrganiser(db, orgId, async (tx) => {
    const [c] = await tx.select().from(chit).where(eq(chit.id, chitId)).for("update");
    if (!c) throw new ChitError("CHIT_NOT_FOUND");
    if (c.groupToken && !renew) return c.groupToken;
    const token = newToken();
    await tx.update(chit).set({ groupToken: token }).where(eq(chit.id, chitId));
    await tx.insert(auditLog).values(log(orgId, c.groupToken ? "group.renew" : "group.create", { chitId }));
    return token;
  });
}

/* ------------------------------ member ------------------------------ */

export type Group = { chitId: string; organiserId: string };

/** Group token → chit. Runs as the owner, like resolveLink. */
export async function resolveGroup(db: DB, token: string): Promise<Group | "paused" | null> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [r] = await db
    .select({ chitId: chit.id, organiserId: chit.organiserId, active: organiser.active })
    .from(chit)
    .innerJoin(organiser, eq(organiser.id, chit.organiserId))
    .where(eq(chit.groupToken, token));
  if (!r) return null;
  return r.active ? { chitId: r.chitId, organiserId: r.organiserId } : "paused";
}

/** What the join page may show: every ID with its name, so members find their own. Never phones or PINs. */
export async function groupView(db: DB, g: Group) {
  return withOrganiser(db, g.organiserId, async (tx) => {
    const [org] = await tx.select({ business: organiser.businessName, businessTa: organiser.businessNameTa }).from(organiser);
    const [c] = await tx.select().from(chit).where(eq(chit.id, g.chitId));
    const seats = await tx.select({ id: seat.id, number: seat.number, name: seat.name }).from(seat).where(eq(seat.chitId, g.chitId)).orderBy(asc(seat.number));
    return { ...org, code: c.code, totalPaise: c.totalPaise, seats: seats.map((s) => ({ id: s.id, label: `${seatCode(c.code, s.number)} · ${s.name}` })) };
  });
}

const PIN_WINDOW_MS = 15 * 60_000;
const PIN_MAX_PER_PHONE = 5; // per member ID and network address, so a stranger's guesses don't lock the member out
const PIN_MAX_PER_IP = 20; // across IDs: one address can't try a common PIN on everybody
const PIN_MAX_PER_SEAT = 30;

/** The try is recorded before it is checked, so parallel guesses can't get past the limit; a right PIN removes it again. */
export async function checkPin(db: DB, who: { organiserId: string; seatId: string }, pin: unknown, ip: string, why: object) {
  if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) throw new ChitError("PIN_NEEDED");
  const addr = ip || "unknown";
  const limits: [string, number][] = [
    [`pin:${who.seatId}:${addr}`, PIN_MAX_PER_PHONE],
    [`pin-ip:${addr}`, PIN_MAX_PER_IP],
    [`pin:${who.seatId}`, PIN_MAX_PER_SEAT],
  ];
  const mine = (await db.insert(loginAttempt).values(limits.map(([key]) => ({ key }))).returning({ id: loginAttempt.id })).map((r) => r.id);
  const forget = () => db.delete(loginAttempt).where(inArray(loginAttempt.id, mine));
  for (const [key, max] of limits) {
    const [{ n }] = await db.select({ n: count() }).from(loginAttempt).where(and(eq(loginAttempt.key, key), gte(loginAttempt.at, new Date(Date.now() - PIN_WINDOW_MS))));
    if (n > max) {
      await forget();
      throw new ChitError("PIN_LOCKED");
    }
  }
  const result = await withOrganiser(db, who.organiserId, async (tx) => {
    const [s] = await tx.select({ enc: seat.pinEnc }).from(seat).where(eq(seat.id, who.seatId));
    if (!s?.enc) return "PIN_NOT_SET" as const;
    if (timingSafeEqual(Buffer.from(open(who.seatId, s.enc)), Buffer.from(pin))) return "ok" as const;
    await tx.insert(auditLog).values(log(who.organiserId, "pin.wrong", { seatId: who.seatId, ...why }, who.seatId));
    return "PIN_WRONG" as const;
  });
  if (result !== "PIN_WRONG") await forget();
  if (result !== "ok") throw new ChitError(result);
}

const DEVICES_PER_SEAT = 5;

/** PIN accepted: this phone gets its own link for each of the person's IDs in the chit. */
export async function joinWithPin(db: DB, g: Group, seatId: string, pin: unknown, ip: string, now = new Date()) {
  if (typeof seatId !== "string" || !/^[0-9a-f-]{36}$/i.test(seatId)) throw new ChitError("SEAT_NOT_FOUND");
  const inChit = await withOrganiser(db, g.organiserId, (tx) => tx.select({ id: seat.id }).from(seat).where(and(eq(seat.id, seatId), eq(seat.chitId, g.chitId))));
  if (!inChit.length) throw new ChitError("SEAT_NOT_FOUND");
  await checkPin(db, { organiserId: g.organiserId, seatId }, pin, ip, { at: "group" });
  return withOrganiser(db, g.organiserId, async (tx) => {
    const [c] = await tx.select().from(chit).where(eq(chit.id, g.chitId)).for("update");
    const [org] = await tx.select({ business: organiser.businessName }).from(organiser);
    const [me] = await tx.select().from(seat).where(eq(seat.id, seatId));
    // the PIN could have been reset between the check and this lock
    if (!me.pinEnc || open(me.id, me.pinEnc) !== pin) throw new ChitError("PIN_WRONG");
    const mine = (await tx.select().from(seat).where(and(eq(seat.chitId, g.chitId), eq(seat.phone, me.phone))).orderBy(asc(seat.number))).filter((s) => s.pinEnc && open(s.id, s.pinEnc) === pin);
    const out = [];
    for (const s of mine) {
      const old = await tx.select({ id: memberLink.id }).from(memberLink).where(and(eq(memberLink.seatId, s.id), eq(memberLink.kind, "device"), isNull(memberLink.revokedAt))).orderBy(asc(memberLink.createdAt));
      const drop = old.slice(0, Math.max(0, old.length - (DEVICES_PER_SEAT - 1))).map((x) => x.id);
      if (drop.length) await tx.update(memberLink).set({ revokedAt: now }).where(inArray(memberLink.id, drop));
      const token = newToken();
      await tx.insert(memberLink).values({ organiserId: g.organiserId, seatId: s.id, tokenHash: sha256(token), kind: "device", createdAt: now });
      out.push({ token, code: seatCode(c.code, s.number), seat: s.id, business: org.business, chosen: s.id === seatId });
    }
    await tx.insert(auditLog).values(log(g.organiserId, "link.device", { seatId, chitId: g.chitId, ids: out.length }, seatId));
    return out;
  });
}
