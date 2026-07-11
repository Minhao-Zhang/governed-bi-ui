import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this repo (a stray lockfile in a parent dir would
  // otherwise be inferred as the root).
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
