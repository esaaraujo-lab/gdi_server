import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "preview-chat-100d3966-9c60-4d2f-b22d-e8261d6e1d25.space-z.ai",
    "*.space-z.ai",
  ],
};

export default nextConfig;
