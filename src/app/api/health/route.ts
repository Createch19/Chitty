import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db/client";

/** Coolify health check: the server is up and the database answers. */
export async function GET() {
  await connection();
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
