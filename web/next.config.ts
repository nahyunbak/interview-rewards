import path from "node:path";
import type { NextConfig } from "next";
const config: NextConfig = {
  turbopack: { root: path.resolve(process.cwd(), "..") },
  outputFileTracingRoot: path.resolve(process.cwd(), ".."),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:3411/api/:path*",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self)",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};
export default config;
