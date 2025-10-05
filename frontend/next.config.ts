import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'export', // Para Cloudflare Pages
  images: {
    unoptimized: true, // Evitar procesamiento innecesario de tiles
  },
  // Optimizaciones de producción
  productionBrowserSourceMaps: false,
  compress: true,
  poweredByHeader: false,
};

export default nextConfig;
