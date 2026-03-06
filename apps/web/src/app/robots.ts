import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://intelliflow-crm.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // Authenticated CRM modules
          '/dashboard',
          '/leads',
          '/contacts',
          '/accounts',
          '/deals',
          '/tasks',
          '/calendar',
          '/email',
          '/cases',
          '/tickets',
          '/documents',
          '/analytics',
          '/agent-approvals',
          '/billing',
          '/governance',
          '/notifications',
          '/settings',
          '/profile',
          // Developer portal (SUPER_ADMIN only)
          '/docs',
          // Auth flow paths
          '/auth/',
          '/mfa/',
          '/verify-email/',
          '/reset-password/',
          '/forgot-password',
          '/logout',
          // Redirect-only paths
          '/appointments',
          '/home',
          // API routes
          '/api/',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
