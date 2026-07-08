import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    viewTransition: true,
  },
  // Hides the floating dev-tools "N" badge during normal (error-free) dev
  // usage. Next.js still forces it visible on build errors, runtime errors,
  // and warnings regardless of this setting, and it's already a no-op in
  // production builds.
  devIndicators: false,
};

export default nextConfig;
