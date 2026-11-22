import { appManifest, manifestHeaders } from "@/lib/manifest";

export function GET() {
  return Response.json(appManifest("/open"), { headers: { ...manifestHeaders, "Cache-Control": "public, max-age=3600" } });
}
