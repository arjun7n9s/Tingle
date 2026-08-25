import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

/** Baked in at build time. On Vercel, TINGLE_API_PROXY must be set before the build. */
function tingleOrigin(): string {
  const raw = process.env.TINGLE_API_PROXY?.trim().replace(/\/$/, "") ?? "";
  if (raw) return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  if (process.env.VERCEL) return "https://api.tejs.dev";
  return "http://127.0.0.1:8788";
}

const tingleApi = tingleOrigin();

const nextConfig: NextConfig = {
  transpilePackages: ["lenis"],
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  async rewrites() {
    return [
      {
        source: "/tingle/projects/:id",
        destination: "/tingle/file?id=:id",
      },
      {
        source: "/tingle-api/:path*",
        destination: `${tingleApi}/:path*`,
      },
    ];
  },
};

export default nextConfig;
