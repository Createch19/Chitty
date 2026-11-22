/**
 * Installable app (BUSINESS-CONCEPT §11).
 * - Organisers and the general site: start at /open, which picks the last member ID or the organiser login.
 * - A member page links its own manifest whose start page is that member's link. iPhone home-screen apps (and
 *   Chrome's) don't share storage with the browser they were added from, so /open would find no saved ID there
 *   and land on the organiser login.
 */
export function appManifest(startUrl: string) {
  return {
    name: "Chitty",
    short_name: "Chitty",
    description: "Your chit fund: live auctions, payments and reminders.",
    id: startUrl,
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0813",
    theme_color: "#0a0813",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

export const manifestHeaders = { "Content-Type": "application/manifest+json" };
