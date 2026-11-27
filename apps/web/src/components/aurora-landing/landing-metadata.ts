import type { Metadata } from 'next';
import { OG_IMAGES } from '@/lib/og-images';

/**
 * Metadata for `/`. Both renderings of the home page use it: the prerendered landing page for
 * signed-out visitors and the signed-in home the proxy rewrites `/` to (see lib/auth/home-paths).
 */
export const LANDING_METADATA: Metadata = {
  title: { absolute: 'Aurora, the AI CRM that asks before it acts' },
  description:
    'Aurora scores your leads, keeps your pipeline current and drafts the next follow-up. Nothing goes out until a person says yes.',
  openGraph: {
    images: OG_IMAGES,
    title: 'Aurora, the AI CRM that asks before it acts',
    description:
      'Aurora scores your leads, keeps your pipeline current and drafts the next follow-up. Nothing goes out until a person says yes.',
    url: 'https://intelli-flow-crm-web.vercel.app',
    siteName: 'Aurora',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aurora, the AI CRM that asks before it acts',
    description:
      'Lead scoring, pipeline and follow-ups drafted by AI agents, with every action waiting for your yes.',
  },
};
