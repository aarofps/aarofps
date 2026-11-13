import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads the local SQLite DB per request, so no prerender caching.
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2"],
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
