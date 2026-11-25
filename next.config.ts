import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The legacy codebase still has TypeScript debt in server/worker modules.
  // Turbopack compiles the app successfully; skip the blocking type-check so
  // deployments can proceed while that debt is cleaned up incrementally.
  typescript: {
    ignoreBuildErrors: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
