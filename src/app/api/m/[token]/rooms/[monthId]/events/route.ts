import { getDb } from "@/db/client";
import { memberRoom, resolveLink } from "@/server/members";
import { sseStream } from "@/server/sse";

/** Live room for one member ID (the token in the URL is the credential). */
export async function GET(req: Request, ctx: RouteContext<"/api/m/[token]/rooms/[monthId]/events">) {
  const { token, monthId } = await ctx.params;
  const db = await getDb();
  const link = await resolveLink(db, token);
  if (link === "paused") return new Response("paused", { status: 423 });
  if (!link || !/^[0-9a-f-]{36}$/i.test(monthId)) return new Response("not found", { status: 404 });
  try {
    await memberRoom(db, link, monthId);
  } catch {
    return new Response("not found", { status: 404 });
  }
  return sseStream(req, monthId, async () => {
    const now = await resolveLink(db, token); // a revoked link stops getting data at the next change
    if (!now || now === "paused") throw new Error("gone");
    return memberRoom(db, now, monthId);
  });
}
