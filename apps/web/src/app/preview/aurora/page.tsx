import type { Metadata } from 'next';
import { AuroraLandingPage } from '@/components/aurora-landing/AuroraLandingPage';

/**
 * Aurora landing page — work-in-progress preview.
 *
 * Lives outside the (public) route group on purpose: the live homepage at `/`,
 * its header, footer and metadata stay untouched until the owner signs this
 * design off. Not linked from anywhere and kept out of search indexes.
 */
export const metadata: Metadata = {
  title: { absolute: 'Aurora — the AI-native CRM (preview)' },
  description:
    'Aurora scores your leads, keeps your pipeline current and drafts the next follow-up.',
  robots: { index: false, follow: false },
};

export default function AuroraPreviewPage() {
  return <AuroraLandingPage />;
}
