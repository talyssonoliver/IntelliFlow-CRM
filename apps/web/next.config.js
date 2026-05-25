const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Set `NEXT_OUTPUT=standalone` for Docker/CI builds (Windows requires symlink support)
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' } : {}),

  // Enable strict mode for better error detection
  reactStrictMode: true,

  // Configure server external packages (fix Prisma in monorepo)
  serverExternalPackages: [
    '@prisma/client',
    '.prisma/client',
    '@prisma/engines',
    '@prisma/adapter-pg',
    '@intelliflow/db',
    '@sentry/node',
    '@fastify/otel',
    '@opentelemetry/api',
    '@opentelemetry/auto-instrumentations-node',
    '@opentelemetry/instrumentation',
    '@opentelemetry/resources',
    '@opentelemetry/sdk-node',
    '@opentelemetry/semantic-conventions',
    'require-in-the-middle',
    '@bull-board/api',
    'bullmq',
    'ioredis',
  ],

  // Compiler options
  compiler: {
    // Remove console logs in production
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? {
            exclude: ['error', 'warn'],
          }
        : false,
  },

  // Experimental features
  experimental: {
    // Server actions configuration
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // Optimize package imports (barrel-file tree-shaking — Next.js 13.5+).
    // Adding @tanstack/*, react-hook-form, and zod (heavy aggregate, frequently
    // imported via barrel files) addresses the Lighthouse script-bundle audit
    // (#84). Each added package can save 50-300KB from the client bundle when
    // consumers import only specific exports. Only listed packages that have
    // actual imports in apps/web/src or packages/ (verified via grep).
    optimizePackageImports: [
      '@intelliflow/ui',
      '@intelliflow/validators',
      '@intelliflow/domain',
      'recharts',
      '@tanstack/react-query',
      '@tanstack/react-table',
      '@tanstack/react-virtual',
      'react-hook-form',
      'zod',
    ],
    // Enable 'use cache' directive, cacheLife(), cacheTag() without PPR
    useCache: true,
  },

  // Turbopack configuration (Next.js 16+ default bundler)
  turbopack: {
    root: path.resolve(__dirname, '../../'), // Monorepo root (absolute path)
    rules: {
      // Add support for SVG imports (equivalent to @svgr/webpack)
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Headers for security
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // Content-Security-Policy is set per-request in apps/web/proxy.ts so
          // it can include a unique nonce that Next.js stamps onto every inline
          // <script> emitted by streaming SSR. A static CSP defined here would
          // need either 'unsafe-inline' (defeats CSP) or it would block React's
          // RSC flight payload chunks, runtime helpers, and Suspense boundary
          // swap scripts — leaving streamed pages stuck on their fallback HTML.
        ],
      },
    ];
  },

  // Redirects
  async redirects() {
    return [
      {
        source: '/home',
        destination: '/',
        permanent: true,
      },
      // Legacy /calendar/new and /calendar/[id] → /appointments/... after the
      // appointments/calendar split migration. Settings sub-routes
      // (availability, calendar-settings, event-types) remain under /calendar.
      {
        source: '/calendar/new',
        destination: '/appointments/new',
        permanent: true,
      },
      {
        source: '/calendar/:id((?!new$|availability$|calendar-settings$|event-types$)[^/]+)',
        destination: '/appointments/:id',
        permanent: true,
      },
    ];
  },

  // Environment variables to expose to browser
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  },

  // Webpack: resolve Prisma 7 generated .js → .ts extension imports
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.js', '.ts'],
    };
    return config;
  },

  // TypeScript configuration
  typescript: {
    // Only run type checking in CI
    ignoreBuildErrors: false,
  },

  // Power features
  poweredByHeader: false,

  // Compression
  compress: true,

  // Generate ETags
  generateEtags: true,

  // Page extensions
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],

  // Trailing slash
  trailingSlash: false,
};

module.exports = nextConfig;
