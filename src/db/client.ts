/**
 * Database connection.
 * - DATABASE_URL set (production / Coolify): real PostgreSQL via postgres.js.
 * - Not set (local dev, tests): PGlite, an embedded PostgreSQL 17 (WASM). No install, no password.
 * Migrations in ./drizzle run automatically on first use.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Handle = { db: DB; close: () => Promise<void> };

const migrationsFolder = path.join(process.cwd(), "drizzle");

export async function createDb(opts: { url?: string; dataDir?: string } = {}): Promise<Handle> {
  // Tests only: CHITTY_TEST_PG=<server url> gives every createDb() a fresh database on a real PostgreSQL server.
  const testServer = process.env.CHITTY_TEST_PG;
  if (!opts.url && !opts.dataDir && testServer && process.env.VITEST) {
    const name = `chitty_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const admin = postgres(testServer, { max: 1, onnotice: () => {} });
    await admin.unsafe(`create database ${name}`);
    const url = new URL(testServer);
    url.pathname = `/${name}`;
    const h = await createDb({ url: url.toString() });
    return {
      db: h.db,
      close: async () => {
        await h.close();
        await admin.unsafe(`drop database if exists ${name} with (force)`);
        await admin.end();
      },
    };
  }
  if (opts.url) {
    const client = postgres(opts.url, { max: 10, onnotice: () => {} });
    const db = drizzlePg(client, { schema }) as unknown as DB;
    await migratePg(db as never, { migrationsFolder });
    return { db, close: () => client.end() };
  }
  if (opts.dataDir) mkdirSync(opts.dataDir, { recursive: true });
  const client = opts.dataDir ? new PGlite(opts.dataDir) : new PGlite();
  const db = drizzlePglite(client, { schema }) as unknown as DB;
  await migratePglite(db as never, { migrationsFolder });
  return { db, close: () => client.close() };
}

const g = globalThis as unknown as { __chittyDb?: Promise<Handle> };

/** The app-wide connection (one per server process). */
export function getDb(): Promise<DB> {
  g.__chittyDb ??= createDb({
    url: process.env.DATABASE_URL || undefined,
    dataDir: process.env.PGLITE_DIR || path.join(process.cwd(), ".data", "pglite"),
  });
  return g.__chittyDb.then((h) => h.db);
}
