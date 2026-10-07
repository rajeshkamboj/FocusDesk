import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/curious',
        destination: '/curiosity',
        permanent: true,
      },
      {
        // "Milestones" became "Learnings" in Phase 3. Old bookmarks and a
        // remembered last section keep working. Deliberately temporary (307):
        // browsers never cache it, so /milestones stays free to be reused
        // later (e.g. for a project-milestones view) without a stale redirect.
        source: '/milestones',
        destination: '/learnings',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
