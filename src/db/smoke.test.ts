import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDb } from "./client";

const rows = (r: unknown) => ((r as { rows?: Record<string, unknown>[] }).rows ?? (r as Record<string, unknown>[]));

describe("migrations", () => {
  it("create every table, the restricted role and RLS on all tenant tables", async () => {
    const { db, close } = await createDb();
    try {
      const tables = rows(await db.execute(sql`select tablename from pg_tables where schemaname = 'public' order by 1`)).map((r) => r.tablename);
      expect(tables).toEqual(["audit_log", "bid", "chit", "login_attempt", "member_link", "month", "notification", "organiser", "payment", "payout", "push_subscription", "room_join", "seat", "session", "super_admin"]);
      expect(rows(await db.execute(sql`select 1 from pg_roles where rolname = 'chitty_app'`))).toHaveLength(1);
      const rls = rows(await db.execute(sql`select relname from pg_class where relrowsecurity and relkind = 'r' order by 1`)).map((r) => r.relname);
      expect(rls).toEqual(["audit_log", "bid", "chit", "member_link", "month", "notification", "organiser", "payment", "payout", "push_subscription", "room_join", "seat"]);
    } finally {
      await close();
    }
  });
});
