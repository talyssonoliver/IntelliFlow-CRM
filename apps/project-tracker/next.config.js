/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@intelliflow/ui'],
  typescript: {
    ignoreBuildErrors: false,
  },
  typedRoutes: true,
  eslint: {
    dirs: ['app', 'components', 'lib'],
  },
}

module.exports = nextConfig
