/**
 * Member notifications (BUSINESS-CONCEPT §12).
 *
 * 1. queueMessages() runs INSIDE the action's transaction and stores one `notification` row per member ID, so a
 *    message exists if and only if the action committed. Members can always read them in the app.
 * 2. deliverLater() then sends Web Push to every phone that subscribed for those IDs, outside the transaction.
 *    Dead subscriptions (410/404) are deleted. Without VAPID keys nothing is pushed, but the messages are still kept.
 *
 * Paused organisers send nothing.
 */
import webpush from "web-push";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DB, Tx } from "@/db/client";
import { chit, month, notification, organiser, payment, pushSubscription, seat } from "@/db/schema";
import { withOrganiser } from "@/db/tenant";
import { type Lang, type MsgFields, type MsgKind, pushText } from "@/domain/messages";
import { monthlyPayment } from "@/domain/money";
import { lastPayDate } from "@/domain/rules";

/* ------------------------------ building messages ------------------------------ */

type Target = "all" | "unpaid" | { seatIds: string[] };

/** Store a message for each targeted member ID of one month. Returns the new notification ids. */
export async function queueMessages(tx: Tx, orgId: string, monthId: string, kind: MsgKind, target: Target = "all", now = new Date()): Promise<string[]> {
  const [org] = await tx.select({ business: organiser.businessName, active: organiser.active }).from(organiser).where(eq(organiser.id, orgId));
  if (!org?.active) return [];
  const [m] = await tx.select().from(month).where(eq(month.id, monthId));
  if (!m) return [];
  const [c] = await tx.select().from(chit).where(eq(chit.id, m.chitId));
  let seats = await tx.select({ id: seat.id, number: seat.number }).from(seat).where(eq(seat.chitId, c.id)).orderBy(asc(seat.number));
  if (target === "unpaid") {
    const unpaid = new Set(
      (await tx.select({ s: payment.seatId }).from(payment).where(and(eq(payment.monthId, m.id), eq(payment.paid, false), eq(payment.adjusted, false)))).map((r) => r.s),
    );
    seats = seats.filter((s) => unpaid.has(s.id) && s.id !== m.winnerSeatId);
  } else if (target !== "all") {
    const want = new Set(target.seatIds);
    seats = seats.filter((s) => want.has(s.id));
  }
  if (!seats.length) return [];
  const terms = { totalPaise: c.totalPaise, months: c.months, rateBps: c.rateBps, incrementPaise: c.incrementPaise, installmentPaise: c.totalPaise / c.months, interestPaise: (c.totalPaise * c.rateBps) / 10000 };
  const pay = m.discountPaise != null ? monthlyPayment(terms, m.discountPaise) : null;
  const base = {
    business: org.business,
    chitCode: c.code,
    totalPaise: c.totalPaise,
    chitDay: c.startDate ? Number(c.startDate.slice(8, 10)) : null,
    month: m.month,
    auctionDate: m.auctionDate,
    lastPayDate: lastPayDate(m.auctionDate),
    discountPaise: m.discountPaise,
    sharePaise: m.discountPaise != null ? Math.round(m.discountPaise / c.months) : null,
    payPaise: pay?.payPaise ?? null,
  };
  const rows = seats.map((s) => {
    const winner = kind === "closed" && s.id === m.winnerSeatId;
    const fields: MsgFields = { ...base, code: `${c.code}${String(s.number).padStart(2, "0")}`, winner, prizePaise: winner ? pay?.prizePaise ?? null : null };
    return { organiserId: orgId, seatId: s.id, monthId: m.id, kind, fields, createdAt: now };
  });
  const ins = await tx.insert(notification).values(rows).onConflictDoNothing().returning({ id: notification.id });
  return ins.map((r) => r.id);
}

/* ------------------------------ sending ------------------------------ */

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };
export type Payload = { title: string; body: string; url: string; tag: string };
export type SendResult = "ok" | "gone" | "error";
export type Sender = (sub: PushSub, payload: Payload, urgent: boolean) => Promise<SendResult>;

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || "";
const configured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

const webPushSender: Sender = async (sub, payload, urgent) => {
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), {
      TTL: 24 * 3600,
      urgency: urgent ? "high" : "normal",
      vapidDetails: { subject: process.env.VAPID_SUBJECT || "https://chitty.creaitechnology.com", publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY! },
    });
    return "ok";
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    return code === 404 || code === 410 ? "gone" : "error";
  }
};

const g = globalThis as unknown as { __chittySender?: Sender | null; __chittyPending?: Set<Promise<void>> };
const pending = (g.__chittyPending ??= new Set());

/** Tests swap the sender; null puts the real web-push sender back. */
export function setSender(s: Sender | null) {
  g.__chittySender = s;
}
const sender = () => g.__chittySender ?? (configured() ? webPushSender : null);

/** Wait for all queued deliveries (tests, and graceful shutdown). */
export async function flushPush() {
  while (pending.size) await Promise.all([...pending]);
}

/** Send after the transaction committed. Never throws into the caller. */
export function deliverLater(db: DB, orgId: string, ids: string[]) {
  if (!ids.length || !sender()) return;
  const p: Promise<void> = deliver(db, orgId, ids)
    .catch((e) => console.error("[push]", e))
    .finally(() => pending.delete(p));
  pending.add(p);
}

async function deliver(db: DB, orgId: string, ids: string[]) {
  const send = sender();
  if (!send) return;
  const jobs = await withOrganiser(db, orgId, (tx) =>
    tx
      .select({ id: notification.id, kind: notification.kind, fields: notification.fields, monthId: notification.monthId, seatId: notification.seatId, subId: pushSubscription.id, endpoint: pushSubscription.endpoint, p256dh: pushSubscription.p256dh, auth: pushSubscription.auth, lang: pushSubscription.lang })
      .from(notification)
      .innerJoin(pushSubscription, eq(pushSubscription.seatId, notification.seatId))
      .where(inArray(notification.id, ids)),
  );
  if (!jobs.length) return;
  const results = await Promise.all(
    jobs.map(async (j) => {
      const kind = j.kind as MsgKind;
      const t = pushText(kind, j.fields as MsgFields, j.lang as Lang);
      const url = `/open?s=${j.seatId}&n=${j.id}${kind === "open" ? `&room=${j.monthId}` : ""}`;
      const r = await send({ endpoint: j.endpoint, keys: { p256dh: j.p256dh, auth: j.auth } }, { ...t, url, tag: `${j.monthId}:${kind}` }, kind === "open" || kind === "reminder");
      return { j, r };
    }),
  );
  const now = new Date();
  await withOrganiser(db, orgId, async (tx) => {
    const gone = results.filter((x) => x.r === "gone").map((x) => x.j.subId);
    const okSubs = [...new Set(results.filter((x) => x.r === "ok").map((x) => x.j.subId))];
    const okNotes = results.filter((x) => x.r === "ok").map((x) => x.j.id);
    if (gone.length) await tx.delete(pushSubscription).where(inArray(pushSubscription.id, gone));
    if (okSubs.length) await tx.update(pushSubscription).set({ lastOkAt: now }).where(inArray(pushSubscription.id, okSubs));
    for (const id of new Set(okNotes)) {
      const n = okNotes.filter((x) => x === id).length;
      await tx.update(notification).set({ pushed: sql`${notification.pushed} + ${n}` }).where(eq(notification.id, id));
    }
  });
}

/* ------------------------------ 2-day reminder ------------------------------ */

/**
 * Called by the scheduler every minute. From 9:00 AM IST on the day two days before the last pay day (and, if the
 * server was down, any later day up to the last day), unpaid IDs get one reminder. The unique index stops repeats.
 */
export async function sendReminders(db: DB, today: string, time: string, now = new Date()) {
  if (time < "09:00") return 0;
  const due = (await db.execute(sql`
    select m.id, m.organiser_id as "organiserId"
    from month m
    join chit c on c.id = m.chit_id
    join organiser o on o.id = m.organiser_id
    where m.status = 'closed' and c.status = 'active' and o.active
      and m.auction_date + 8 <= ${today}::date and m.auction_date + 10 >= ${today}::date
      and exists (select 1 from payment p where p.month_id = m.id and not p.paid and not p.adjusted and p.seat_id <> m.winner_seat_id)
  `)) as unknown as { rows?: { id: string; organiserId: string }[] } | { id: string; organiserId: string }[];
  const rows = Array.isArray(due) ? due : (due.rows ?? []);
  let sent = 0;
  for (const r of rows) {
    const ids = await withOrganiser(db, r.organiserId, (tx) => queueMessages(tx, r.organiserId, r.id, "reminder", "unpaid", now));
    sent += ids.length;
    deliverLater(db, r.organiserId, ids);
  }
  return sent;
}

/* ------------------------------ subscriptions (member side) ------------------------------ */

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export function validSub(x: unknown): x is PushSub {
  const s = x as PushSub;
  if (!s || typeof s.endpoint !== "string" || s.endpoint.length > 1000 || !s.keys) return false;
  try {
    if (new URL(s.endpoint).protocol !== "https:") return false;
  } catch {
    return false;
  }
  return typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string" && B64URL.test(s.keys.p256dh) && B64URL.test(s.keys.auth) && s.keys.p256dh.length <= 200 && s.keys.auth.length <= 100;
}

export async function saveSubscription(db: DB, orgId: string, seatId: string, sub: PushSub, lang: Lang) {
  await withOrganiser(db, orgId, async (tx) => {
    await tx
      .insert(pushSubscription)
      .values({ organiserId: orgId, seatId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, lang })
      .onConflictDoUpdate({ target: [pushSubscription.seatId, pushSubscription.endpoint], set: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, lang } });
    // at most 5 phones per ID: drop the oldest
    const all = await tx.select({ id: pushSubscription.id }).from(pushSubscription).where(eq(pushSubscription.seatId, seatId)).orderBy(sql`${pushSubscription.createdAt} desc`);
    if (all.length > 5) await tx.delete(pushSubscription).where(inArray(pushSubscription.id, all.slice(5).map((r) => r.id)));
  });
}

export async function removeSubscription(db: DB, orgId: string, seatId: string, endpoint: string) {
  await withOrganiser(db, orgId, (tx) => tx.delete(pushSubscription).where(and(eq(pushSubscription.seatId, seatId), eq(pushSubscription.endpoint, endpoint))));
}

/** The member's last messages, newest first (their in-app inbox). */
export async function messagesFor(db: DB, orgId: string, seatId: string, limit = 20) {
  return withOrganiser(db, orgId, (tx) =>
    tx
      .select({ id: notification.id, kind: notification.kind, fields: notification.fields, monthId: notification.monthId, createdAt: notification.createdAt })
      .from(notification)
      .where(eq(notification.seatId, seatId))
      .orderBy(sql`${notification.createdAt} desc`)
      .limit(limit),
  );
}
