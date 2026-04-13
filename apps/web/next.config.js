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
    '@opentelemetry/instrumentation',
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
    // Optimize package imports
    optimizePackageImports: ['@intelliflow/ui', 'recharts'],
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
          {
            key: 'Content-Security-Policy',
            // Note: Next.js (Turbopack/webpack) injects inline scripts for HMR in development,
            // requiring 'unsafe-inline' for script-src in dev mode. React 19 + Turbopack also
            // require 'unsafe-eval' in development for dev-mode debugging features like
            // callstack reconstruction across environments; production builds never use eval().
            value:
              process.env.NODE_ENV === 'production'
                ? [
                    "default-src 'self'",
                    "script-src 'self' https://js.stripe.com",
                    "style-src 'self' 'unsafe-inline'",
                    "img-src 'self' data: blob: https:",
                    "font-src 'self' data:",
                    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com",
                    "frame-src 'self' https://js.stripe.com",
                    "base-uri 'self'",
                    "form-action 'self'",
                    "object-src 'none'",
                  ].join('; ')
                : [
                    "default-src 'self'",
                    // 'unsafe-inline' needed for HMR injected scripts; 'unsafe-eval' needed
                    // for React 19 + Turbopack dev-mode debugging (not used in production).
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
                    "style-src 'self' 'unsafe-inline'",
                    "img-src 'self' data: blob: https:",
                    "font-src 'self' data:",
                    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com ws://localhost:*",
                    "frame-src 'self' https://js.stripe.com",
                    "base-uri 'self'",
                    "form-action 'self'",
                    "object-src 'none'",
                  ].join('; '),
          },
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
        source:
          '/calendar/:id((?!new$|availability$|calendar-settings$|event-types$)[^/]+)',
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
