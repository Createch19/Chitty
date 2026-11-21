/**
 * Organiser-scoped database access. EVERY read or write of chit data goes through withOrganiser():
 * the transaction switches to the restricted role chitty_app and sets app.organiser_id, so
 * PostgreSQL Row-Level Security (drizzle/0001_rls.sql) only ever shows this organiser's rows.
 */
import { sql } from "drizzle-orm";
import type { DB, Tx } from "./client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withOrganiser<T>(db: DB, organiserId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(organiserId)) throw new Error("withOrganiser: invalid organiser id");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.organiser_id', ${organiserId}, true)`);
    await tx.execute(sql`set local role chitty_app`);
    return fn(tx);
  });
}
