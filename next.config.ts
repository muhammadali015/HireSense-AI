import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicitly tell Turbopack where the workspace root is to avoid picking the parent folder's lockfiles
  turbopack: {
    root: __dirname,
  },
  // Allow localhost dev origin for hot‑reload
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;

