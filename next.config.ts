import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep visited tabs in the browser for a few minutes: switching back is instant.
  // Saves call router.refresh(), which clears this.
  experimental: { staleTimes: { dynamic: 180, static: 300 } },
  images: { remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }] },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
