const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@intelliflow/ui'],
  turbopack: {
    root: path.join(__dirname, '..', '..'),
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  typedRoutes: true,
};

module.exports = nextConfig;
