/**
 * Enterprise SSO Page — Server Component
 *
 * Provides page metadata for SEO/accessibility and renders
 * the SsoPageClient island for interactive SSO lookup.
 *
 * IMPLEMENTS: PG-124 AC-005 (SSO page with email lookup form)
 */

import type { Metadata } from 'next';
import SsoPageClient from './SsoPageClient';

export const metadata: Metadata = {
  title: 'Enterprise SSO | IntelliFlow CRM',
  description: 'Sign in with your organization\'s SSO provider. Enter your work email to discover your enterprise authentication.',
};

export default function SsoPage() {
  return <SsoPageClient />;
}
