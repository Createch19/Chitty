import { getDb } from "@/db/client";
import { readSession } from "@/server/accounts";
import { getMonthBoard } from "@/server/chits";
import { sseStream } from "@/server/sse";
import { COOKIE } from "@/server/session";

/** Tells the organiser's month page that something changed (the page then refreshes itself). */
export async function GET(req: Request, ctx: RouteContext<"/api/org/months/[monthId]/events">) {
  const { monthId } = await ctx.params;
  const token = req.headers.get("cookie")?.match(new RegExp(`(?:^|; )${COOKIE.organiser}=([^;]+)`))?.[1];
  const db = await getDb();
  const s = await readSession(db, "organiser", token ? decodeURIComponent(token) : undefined);
  if (!s || !/^[0-9a-f-]{36}$/i.test(monthId)) return new Response("unauthorised", { status: 401 });
  try {
    await getMonthBoard(db, s.subjectId, monthId); // RLS: only this organiser's months
  } catch {
    return new Response("not found", { status: 404 });
  }
  return sseStream(req, monthId, async () => ({ at: Date.now() }), "changed");
}
