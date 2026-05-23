import type { MetadataRoute } from 'next';

/**
 * PWA Web App Manifest — addresses Lighthouse audits:
 *   - `installable-manifest`: required for PWA installability
 *   - `themed-omnibox`: theme_color matches the app's dark theme (#0f172a slate-900)
 *   - `splash-screen`: name + short_name + theme_color + background_color
 *   - `maskable-icon`: icon entry with `purpose: 'maskable'` (uses app/icon.svg
 *     rendered as 512×512 with safe-area padding handled by the SVG itself)
 *
 * Next.js (App Router) serves this at `/manifest.webmanifest` automatically
 * and emits `<link rel="manifest" href="/manifest.webmanifest">` into <head>.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'IntelliFlow CRM',
    short_name: 'IntelliFlow',
    description:
      'AI-powered Customer Relationship Management — lead scoring, pipeline analytics, automated workflows.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    categories: ['business', 'productivity'],
    lang: 'en-GB',
    dir: 'ltr',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
      {
        src: '/apple-icon.svg',
        sizes: '180x180',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
