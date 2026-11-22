import { appManifest, manifestHeaders } from "@/lib/manifest";

/** This member's installed app opens straight on their own link. Only the token's shape is checked; the page checks the rest. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new Response("Not found", { status: 404 });
  return Response.json(appManifest(`/m/${token}`), { headers: { ...manifestHeaders, "Cache-Control": "private, no-store" } });
}
