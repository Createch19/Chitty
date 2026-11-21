/**
 * Automatic auction opening (BUSINESS-CONCEPT §5): on the auction day, at the chit's open time
 * (Asia/Kolkata), a pending month opens — only if the previous month is closed and the organiser
 * is active. The last month has no auction: opening it closes it with the one remaining seat.
 * Safe to run every minute: each month is opened at most once (row lock + status check).
 */
import { sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { ChitError, openMonth } from "./chits";
import { sendReminders } from "./notify";

/** Calendar date and HH:MM in India for a given instant. */
export function istNow(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** One pass. Runs as the database owner to look across organisers, then acts through each organiser's RLS scope. */
export async function tick(db: DB, now = new Date()) {
  const { date, time } = istNow(now);
  const due = (await db.execute(sql`
    select m.id, m.organiser_id as "organiserId"
    from month m
    join chit c on c.id = m.chit_id
    join organiser o on o.id = m.organiser_id
    where m.status = 'pending'
      and c.status = 'active'
      and o.active
      and (m.auction_date < ${date}::date or (m.auction_date = ${date}::date and to_char(c.open_time, 'HH24:MI') <= ${time}))
      and not exists (
        select 1 from month p where p.chit_id = m.chit_id and p.month = m.month - 1 and p.status <> 'closed'
      )
    order by m.auction_date, m.month
  `)) as unknown as { rows?: { id: string; organiserId: string }[] } | { id: string; organiserId: string }[];
  const rows = Array.isArray(due) ? due : (due.rows ?? []);
  const opened: string[] = [];
  for (const r of rows) {
    try {
      await openMonth(db, r.organiserId, r.id, now, { kind: "system", id: null });
      opened.push(r.id);
    } catch (e) {
      if (!(e instanceof ChitError)) throw e; // someone else opened it first, or it is no longer pending
    }
  }
  await sendReminders(db, date, time, now); // 2 days before the last pay day, unpaid IDs only
  return opened;
}

const g = globalThis as unknown as { __chittyScheduler?: NodeJS.Timeout };

export function startScheduler(getDb: () => Promise<DB>, everyMs = 60_000) {
  if (g.__chittyScheduler) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const opened = await tick(await getDb());
      if (opened.length) console.log(`[chitty] scheduler opened ${opened.length} month(s)`);
    } catch (e) {
      console.error("[chitty] scheduler error", e);
    } finally {
      running = false;
    }
  };
  g.__chittyScheduler = setInterval(run, everyMs);
  setTimeout(run, 5_000);
}
