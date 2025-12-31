import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase body size limit for file uploads
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Empty turbopack config to silence the warning when using webpack
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Handle canvas for server-side rendering
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
      };
    }
    // Ignore worker files in webpack bundling
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
    };
    return config;
  },
};

export default nextConfig;
