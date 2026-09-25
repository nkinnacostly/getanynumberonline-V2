import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // eSIM Access serves activation QR codes and country flags from its own
    // CDNs. next/image refuses remote hosts that aren't allowlisted here.
    remotePatterns: [
      { protocol: "https", hostname: "p.qrsim.net" },
      { protocol: "https", hostname: "static.redteago.com" },
      // Uploaded campaign banners, previewed as thumbnails in /admin/email.
      // Narrowed to the public read path so this cannot become a general
      // open proxy for anything else hosted on a supabase.co subdomain.
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
        search: "",
      },
    ],
  },
};

export default nextConfig;
