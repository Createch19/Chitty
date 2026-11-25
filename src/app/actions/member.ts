"use server";

/** Member actions. The link token is the credential; it is re-checked on every call. */
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { groupCookie } from "@/lib/group";
import { joinWithPin, resolveGroup } from "@/server/pins";
import { ChitError } from "@/server/chits";
import { memberBid, memberJoin, resolveLink } from "@/server/members";
import { clientIp } from "@/server/session";
import { removeSubscription, saveSubscription, validSub } from "@/server/notify";

export type MemberResult = { ok: true; nextMinPaise?: number } | { ok: false; error: string; minPaise?: number };

async function withLink<T>(token: string, fn: (db: Awaited<ReturnType<typeof getDb>>, link: Exclude<Awaited<ReturnType<typeof resolveLink>>, null | "paused">) => Promise<T>) {
  const db = await getDb();
  const link = await resolveLink(db, token);
  if (link === "paused") return { ok: false as const, error: "PAUSED" };
  if (!link) return { ok: false as const, error: "LINK_INVALID" };
  try {
    return await fn(db, link);
  } catch (e) {
    if (e instanceof ChitError) return { ok: false as const, error: e.code, minPaise: e.details?.minPaise as number | undefined };
    throw e;
  }
}

export async function memberJoinAction(token: string, monthId: string): Promise<MemberResult> {
  return withLink(token, async (db, link) => {
    await memberJoin(db, link, monthId);
    return { ok: true as const };
  });
}

export async function memberBidAction(token: string, monthId: string, amountRupees: number, pin: string): Promise<MemberResult> {
  return withLink(token, async (db, link) => {
    const r = await memberBid(db, link, monthId, amountRupees, pin, await clientIp());
    return { ok: true as const, nextMinPaise: r.nextMinPaise };
  });
}

/**
 * Turn notifications on for every member ID saved on this phone (one browser subscription, many IDs).
 * Also re-sent when the member changes language, so pushes come in their language.
 */
export async function memberSubscribeAction(tokens: string[], sub: unknown, lang: string): Promise<{ ok: boolean; count: number }> {
  if (!Array.isArray(tokens) || tokens.length > 12 || !validSub(sub)) return { ok: false, count: 0 };
  const l = lang === "ta" ? "ta" : "en";
  const db = await getDb();
  let count = 0;
  for (const t of tokens) {
    const link = await resolveLink(db, t);
    if (!link || link === "paused") continue;
    await saveSubscription(db, link.organiserId, link.seatId, sub, l);
    count++;
  }
  return { ok: count > 0, count };
}

export async function memberUnsubscribeAction(tokens: string[], endpoint: string): Promise<{ ok: boolean }> {
  if (!Array.isArray(tokens) || tokens.length > 12 || typeof endpoint !== "string") return { ok: false };
  const db = await getDb();
  for (const t of tokens) {
    const link = await resolveLink(db, t);
    if (link && link !== "paused") await removeSubscription(db, link.organiserId, link.seatId, endpoint);
  }
  return { ok: true };
}

export type Joined = { token: string; code: string; business: string; seat: string; chosen: boolean };

/** Group link + PIN: signs this phone in to the person's IDs. The cookie is only read by the group page. */
export async function groupJoinAction(token: string, seatId: string, pin: string): Promise<{ ok: true; ids: Joined[] } | { ok: false; error: string }> {
  const db = await getDb();
  const g = await resolveGroup(db, token);
  if (g === "paused") return { ok: false, error: "PAUSED" };
  if (!g) return { ok: false, error: "LINK_INVALID" };
  try {
    const ids = await joinWithPin(db, g, seatId, pin, await clientIp());
    (await cookies()).set(groupCookie(g.chitId), ids.find((x) => x.chosen)!.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/c", maxAge: 400 * 86_400 });
    return { ok: true, ids };
  } catch (e) {
    if (e instanceof ChitError) return { ok: false, error: e.code };
    throw e;
  }
}
