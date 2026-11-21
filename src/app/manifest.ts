import type { MetadataRoute } from "next";

/** Installable app (BUSINESS-CONCEPT §11). One manifest for everyone; /open decides where to go. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chitty",
    short_name: "Chitty",
    description: "Your chit fund: live auctions, payments and reminders.",
    id: "/open",
    start_url: "/open",
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
