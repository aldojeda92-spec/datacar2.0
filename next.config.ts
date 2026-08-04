import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        pathname: '/v0/b/datacar2-0.firebasestorage.app/**',
      },
    ],
    qualities: [75],
  },
};

export default nextConfig;
