import type { MetadataRoute } from 'next';

/**
 * PWA Web App Manifest — addresses Lighthouse audits:
 *   - `installable-manifest`: required for PWA installability
 *   - `themed-omnibox`: theme_color is Aurora Navy (#11175B)
 *   - `splash-screen`: name + short_name + theme_color + background_color
 *   - `maskable-icon`: icon entry with `purpose: 'maskable'` (uses app/icon.svg
 *     rendered as 512×512 with safe-area padding handled by the SVG itself)
 *
 * Next.js (App Router) serves this at `/manifest.webmanifest` automatically
 * and emits `<link rel="manifest" href="/manifest.webmanifest">` into <head>.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Aurora',
    short_name: 'Aurora',
    description:
      'The AI CRM that asks before it acts: lead scoring, pipeline and ' +
      'follow-ups drafted by AI agents, each waiting for your yes.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#11175B',
    theme_color: '#11175B',
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
