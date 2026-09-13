import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    // Next 16 requires an explicit allowlist. 85 is reserved for hero / PDP imagery.
    qualities: [60, 75, 85],
    // Catalogue imagery is versioned by URL, so long-lived caching is safe.
    minimumCacheTTL: 2678400,
    remotePatterns: [
      // Placeholder photography — see src/data/media-credits.md.
      { protocol: "https", hostname: "images.unsplash.com" },
      // Product media storage (Phase 8).
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
