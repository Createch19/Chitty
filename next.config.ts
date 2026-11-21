import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // One small self-contained server for the Docker image (see Dockerfile).
  output: "standalone",
  // Dev only: lets a phone on the same Wi-Fi open http://192.168.x.x:3100 (HMR + dev assets).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  // PGlite (embedded PostgreSQL for local dev/tests) ships WASM + data files; keep it out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "exceljs"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
