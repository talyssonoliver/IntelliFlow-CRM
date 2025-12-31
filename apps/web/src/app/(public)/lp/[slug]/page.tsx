import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LandingBuilder, type LandingPageConfig } from '@/components/shared/landing-builder';
import landingPagesData from '@/data/landing-pages.json';

/**
 * Dynamic Landing Page Template
 *
 * Renders landing pages based on slug using the LandingBuilder component.
 * Supports A/B testing, conversion tracking, and consistent branding.
 *
 * Task: PG-013
 * Performance targets:
 * - Response time: <200ms (p95)
 * - Lighthouse score: >=90
 */

interface LandingPageProps {
  params: Promise<{ slug: string }>;
}

// Type for the pages object from JSON
type PagesData = Record<string, LandingPageConfig>;

/**
 * Generate static params for all landing pages
 */
export async function generateStaticParams() {
  const pages = landingPagesData.pages as PagesData;
  return Object.keys(pages).map((slug) => ({
    slug,
  }));
}

/**
 * Generate metadata for the landing page
 */
export async function generateMetadata({ params }: LandingPageProps): Promise<Metadata> {
  const { slug } = await params;
  const pages = landingPagesData.pages as PagesData;
  const pageConfig = pages[slug];

  if (!pageConfig) {
    return {
      title: 'Page Not Found | IntelliFlow CRM',
    };
  }

  return {
    title: pageConfig.title,
    description: pageConfig.description,
    openGraph: {
      title: pageConfig.title,
      description: pageConfig.description,
      url: `https://intelliflow-crm.com/lp/${slug}`,
      siteName: 'IntelliFlow CRM',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: pageConfig.title,
      description: pageConfig.description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

/**
 * Landing Page Component
 */
export default async function LandingPage({ params }: LandingPageProps) {
  const { slug } = await params;
  const pages = landingPagesData.pages as PagesData;
  const pageConfig = pages[slug];

  if (!pageConfig) {
    notFound();
  }

  return <LandingBuilder config={pageConfig} />;
}
