import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    unoptimized: true, // Evitar procesamiento innecesario de tiles
  },
  // Optimizaciones de producción
  productionBrowserSourceMaps: false,
  compress: true,
  poweredByHeader: false,
  // Headers para caché de tiles
  async headers() {
    return [
      {
        source: '/tiles/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
