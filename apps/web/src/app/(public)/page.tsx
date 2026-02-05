import type { Metadata } from 'next';
import { HomePageContent } from '@/components/home';

export const metadata: Metadata = {
  title: 'AI-first CRM with Governance Built In | IntelliFlow CRM',
  description:
    'IntelliFlow CRM pairs automation with governance-grade validation. Launch AI-first sales, pipeline, and service flows with evidence-backed quality gates.',
  openGraph: {
    title: 'IntelliFlow CRM — AI-first CRM with governed automation',
    description:
      'Automate sales and service with AI while keeping governance, accessibility, and performance guardrails in place.',
    url: 'https://intelliflow-crm.com',
    siteName: 'IntelliFlow CRM',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'IntelliFlow CRM — Governed AI for Sales Teams',
    description:
      'Automation with safeguards, audit-ready validation, WCAG-aligned experiences, and performance-first UX.',
  },
};

export default function HomePage() {
  return <HomePageContent />;
}
