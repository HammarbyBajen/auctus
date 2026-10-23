import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  // The hours section was first called Lön (2026-10-14).
  async redirects() {
    return [{ source: "/lon/:path*", destination: "/timmar", permanent: false }];
  },
  experimental: {
    // Coding agents are reminded when a Next.js security update is out (set by `next upgrade --agent=security`).
    agentUpgrade: "security",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withWorkflow(nextConfig);
