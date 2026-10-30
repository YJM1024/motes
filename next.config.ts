import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // Only pages that host application previews. Keep platform/auth routes and
    // Vinext scripts, styles and connector integrations under their own policy.
    const previewHost = [{ key: "Content-Security-Policy", value: "frame-src 'self'" }];
    return [
      { source: "/", headers: previewHost },
      { source: "/manage", headers: previewHost },
      { source: "/manage/:path*", headers: previewHost },
      { source: "/compare", headers: previewHost },
    ];
  },
};

export default nextConfig;
