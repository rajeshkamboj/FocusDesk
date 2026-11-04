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
        // Speak Better is no longer a section of its own: its daily lesson and its
        // practice library are part of Curiosity. Old bookmarks and any link still
        // pointing here land on the Speak Better card instead of a dead route.
        // Temporary (307) for the same reason as /milestones: browsers do not cache
        // it, so the path stays available if it is ever wanted again.
        source: '/speak-better',
        destination: '/curiosity#speak-better',
        permanent: false,
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
