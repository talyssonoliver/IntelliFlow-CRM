import type { Metadata } from 'next';
import { OG_IMAGES } from '@/lib/og-images';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Aurora pricing: Starter, Professional, Enterprise and Custom plans, each with a 14-day free trial and no credit card. Save 17% with annual billing.',
  openGraph: {
    images: OG_IMAGES,
    title: 'Aurora pricing: start free, pick a plan when you are ready',
    description:
      'Transparent per-user pricing. Starter, Professional, Enterprise, and Custom plans. All include a 14-day free trial with 17% annual savings.',
    url: 'https://intelliflow-crm.com/pricing',
    siteName: 'Aurora',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aurora pricing: start free, pick a plan when you are ready',
    description:
      'Transparent per-user pricing. Start free for 14 days. Annual plans save 17%. Starter, Professional, Enterprise, and Custom tiers.',
  },
  alternates: {
    canonical: '/pricing',
  },
};

export default function PricingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
