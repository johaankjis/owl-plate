import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const origin = process.env.OWL_API_ORIGIN || "http://127.0.0.1:8017";
    return [{ source: "/backend/:path*", destination: `${origin}/:path*` }];
  },
};

export default nextConfig;
