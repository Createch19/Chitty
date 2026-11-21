import { getDb } from "@/db/client";
import { readSession } from "@/server/accounts";
import { buildTemplate } from "@/server/importer";
import { COOKIE } from "@/server/session";

/** The Excel template with a filled sample chit (BUSINESS-CONCEPT §14). */
export async function GET(req: Request) {
  const token = req.headers.get("cookie")?.match(new RegExp(`(?:^|; )${COOKIE.organiser}=([^;]+)`))?.[1];
  const s = await readSession(await getDb(), "organiser", token ? decodeURIComponent(token) : undefined);
  if (!s) return new Response("unauthorised", { status: 401 });
  return new Response(new Uint8Array(await buildTemplate()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="chitty-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
