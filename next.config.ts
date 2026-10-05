import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/curious',
        destination: '/curiosity',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
