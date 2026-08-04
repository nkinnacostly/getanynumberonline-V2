import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // eSIM Access serves activation QR codes and country flags from its own
    // CDNs. next/image refuses remote hosts that aren't allowlisted here.
    remotePatterns: [
      { protocol: "https", hostname: "p.qrsim.net" },
      { protocol: "https", hostname: "static.redteago.com" },
    ],
  },
};

export default nextConfig;
