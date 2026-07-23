import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Optional runtime-only dependency (portal automation workers). Keeping it
  // external stops the bundler from trying to resolve it at build time.
  serverExternalPackages: ["playwright"],
};

export default nextConfig;
