import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents disabled — incompatible with dynamic routes using cookies/headers
  // partialPrefetching left off to avoid hydration issues
};

export default nextConfig;
