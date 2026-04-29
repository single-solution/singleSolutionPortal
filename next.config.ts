import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["framer-motion", "@xyflow/react", "react-hot-toast"],
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "Accept-CH", value: "Sec-CH-UA-Mobile, Sec-CH-UA-Platform, Sec-CH-UA" },
      ],
    },
  ],
};

export default nextConfig;
