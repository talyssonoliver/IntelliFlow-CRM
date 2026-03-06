import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Simple, transparent pricing for IntelliFlow CRM. Starter, Professional, Enterprise, and Custom plans with a 14-day free trial. Save 17% with annual billing.',
  openGraph: {
    title: 'IntelliFlow CRM Pricing — Plans That Scale With Your Team',
    description:
      'Transparent per-user pricing. Starter, Professional, Enterprise, and Custom plans. All include a 14-day free trial with 17% annual savings.',
    url: 'https://intelliflow-crm.com/pricing',
    siteName: 'IntelliFlow CRM',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'IntelliFlow CRM Pricing — Plans That Scale With Your Team',
    description:
      'Transparent per-user pricing. Start free for 14 days. Annual plans save 17%. Starter, Professional, Enterprise, and Custom tiers.',
  },
  alternates: {
    canonical: '/pricing',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
