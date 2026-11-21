import { getDb } from "@/db/client";
import { readSession } from "@/server/accounts";
import { loadReport, parseQuery } from "@/server/report-load";
import { toCsv } from "@/server/reports";
import { istNow } from "@/server/scheduler";
import { COOKIE } from "@/server/session";

/** CSV download of one report (opens in Excel / Google Sheets). Organiser session required; data is RLS-scoped. */
export async function GET(req: Request) {
  const token = req.headers.get("cookie")?.match(new RegExp(`(?:^|; )${COOKIE.organiser}=([^;]+)`))?.[1];
  const db = await getDb();
  const s = await readSession(db, "organiser", token ? decodeURIComponent(token) : undefined);
  if (!s) return new Response("unauthorised", { status: 401 });
  const url = new URL(req.url);
  const q = parseQuery(Object.fromEntries(url.searchParams));
  const r = await loadReport(db, s.subjectId, q, istNow(new Date()).date);
  if (!r) return new Response("not found", { status: 404 });
  const lang = url.searchParams.get("lang") === "ta" ? "ta" : "en";
  const name = `chitty-${r.kind}-${r.title.en.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}.csv`;
  return new Response(toCsv(r, lang), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
