import { ImageResponse } from "next/og";

/** PNG app icons drawn from the Chitty coin. Maskable ones keep the coin inside the 80% safe zone. */
export async function GET(_req: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const { size: raw } = await ctx.params;
  const maskable = raw.endsWith("-maskable");
  const size = Number.parseInt(raw, 10);
  if (![180, 192, 512].includes(size)) return new Response("Not found", { status: 404 });
  const coin = Math.round(size * (maskable ? 0.62 : 0.84));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 70% 10%, #3d2c70 0%, #161130 55%, #0a0813 100%)" }}>
        <svg width={coin} height={coin} viewBox="0 0 40 40">
          <defs>
            <radialGradient id="g" cx="35%" cy="28%" r="80%">
              <stop offset="0" stopColor="#fff6c2" />
              <stop offset=".38" stopColor="#ffd34d" />
              <stop offset=".78" stopColor="#e39a05" />
              <stop offset="1" stopColor="#8f5200" />
            </radialGradient>
          </defs>
          <circle cx="20" cy="20" r="18" fill="url(#g)" />
          <circle cx="20" cy="20" r="14.5" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.2" />
          <path d="M14 13h12M14 18h12M18.5 13c5.5 0 5.5 9.5 0 9.5H14l9 6.5" fill="none" stroke="#5b3a05" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
