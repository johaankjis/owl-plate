import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Leave multipart overhead so the API can enforce its 10 MiB photo bound.
  experimental: { middlewareClientMaxBodySize: "12mb" },
  async rewrites() {
    const origin = process.env.OWL_API_ORIGIN || "http://127.0.0.1:8017";
    return [{ source: "/backend/:path*", destination: `${origin}/:path*` }];
  },
};

export default nextConfig;
