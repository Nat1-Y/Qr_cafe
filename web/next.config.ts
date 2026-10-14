import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a minimal standalone server bundle for Docker deployment.
  output: "standalone",
  // This app has its own lockfile; don't let Next guess a parent folder as the
  // workspace root when another lockfile sits higher up (e.g. a home/OneDrive
  // folder) — that breaks routing and Tailwind's source scanning in dev.
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
