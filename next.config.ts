import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        pathname: `/v0/b/${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/**`,
      },
    ],
    qualities: [75],
    // AVIF (con fallback a WebP) para bajar el peso de las imágenes de vehículo,
    // que son el elemento LCP en fichas y grillas.
    formats: ['image/avif', 'image/webp'],
    // Las imágenes de catálogo cambian poco; cachear el resultado optimizado
    // más tiempo evita re-optimizar en cada revalidación.
    minimumCacheTTL: 2678400, // 31 días
  },
};

export default nextConfig;
