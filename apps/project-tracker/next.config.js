/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@intelliflow/ui'],
  typescript: {
    ignoreBuildErrors: false,
  },
  typedRoutes: true,
};

module.exports = nextConfig;
