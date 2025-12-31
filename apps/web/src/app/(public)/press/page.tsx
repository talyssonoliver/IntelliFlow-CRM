import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import pressData from '@/data/press-releases.json';

/**
 * Press Page
 *
 * Public-facing press/media page for IntelliFlow CRM.
 * Displays press releases, media kit download, and company information.
 *
 * Task: PG-007
 * Performance targets:
 * - Response time: <200ms (p95)
 * - Lighthouse score: >=90
 */

export const metadata: Metadata = {
  title: 'Press & Media | IntelliFlow CRM',
  description:
    'Latest news, press releases, and media resources from IntelliFlow CRM. Download our media kit for brand assets and company information.',
  openGraph: {
    title: 'Press & Media | IntelliFlow CRM',
    description:
      'Latest news and press releases from IntelliFlow CRM. AI-powered CRM for modern sales teams.',
    url: 'https://intelliflow-crm.com/press',
    siteName: 'IntelliFlow CRM',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Press & Media | IntelliFlow CRM',
    description:
      'Latest news and press releases from IntelliFlow CRM. AI-powered CRM for modern sales teams.',
  },
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    Product: '#137fec',
    Security: '#10b981',
    Partnership: '#8b5cf6',
    Company: '#f59e0b',
  };
  return colors[category] || '#6b7280';
}

export default function PressPage() {
  const { releases, mediaKit, pressContact, companyFacts, awards } = pressData;
  const featuredRelease = releases.find((r) => r.featured);
  const otherReleases = releases.filter((r) => !r.featured);

  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#0d1b2a] to-[#0b1f37] py-16 lg:py-24">
        <div className="absolute -left-40 top-10 h-80 w-80 rounded-full bg-[#137fec]/20 blur-3xl opacity-50" />
        <div className="absolute right-0 bottom-0 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl opacity-40" />

        <div className="container relative z-10 px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-[#7cc4ff] font-medium backdrop-blur mb-6">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                newspaper
              </span>
              Press & Media
            </div>

            <h1 className="text-4xl lg:text-5xl font-bold text-white mb-6">
              News & Press Releases
            </h1>

            <p className="text-lg text-slate-200 max-w-2xl mx-auto mb-8">
              Stay up to date with the latest news, product announcements, and company updates
              from IntelliFlow CRM.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href={mediaKit.downloadUrl}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg
                  bg-[#137fec] text-white font-semibold hover:bg-[#0e6ac7]
                  transition-colors focus:outline-none focus:ring-2 focus:ring-[#7cc4ff]
                  focus:ring-offset-2 focus:ring-offset-[#0f172a]"
                download
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  download
                </span>
                Download Media Kit
              </a>
              <a
                href={`mailto:${pressContact.email}`}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg
                  border border-white/30 text-white font-semibold hover:bg-white/10
                  transition-colors focus:outline-none focus:ring-2 focus:ring-[#7cc4ff]
                  focus:ring-offset-2 focus:ring-offset-[#0f172a]"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  mail
                </span>
                Media Inquiries
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Press Release */}
      {featuredRelease && (
        <section className="py-12 lg:py-16 bg-white dark:bg-slate-800">
          <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
            <div className="text-center mb-8">
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#137fec]/10 text-[#137fec] text-sm font-medium rounded-full">
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  star
                </span>
                Featured
              </span>
            </div>

            <Card className="p-8 lg:p-12 border-2 border-[#137fec]/20 bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900">
              <div className="max-w-3xl mx-auto text-center">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <span
                    className="px-3 py-1 text-xs font-semibold rounded-full"
                    style={{
                      backgroundColor: `${getCategoryColor(featuredRelease.category)}15`,
                      color: getCategoryColor(featuredRelease.category),
                    }}
                  >
                    {featuredRelease.category}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {formatDate(featuredRelease.date)}
                  </span>
                </div>

                <h2 className="text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white mb-4">
                  {featuredRelease.title}
                </h2>

                <p className="text-lg text-slate-600 dark:text-slate-400 mb-6">
                  {featuredRelease.summary}
                </p>

                <Link
                  href={`/press/${featuredRelease.id}`}
                  className="inline-flex items-center gap-2 text-[#137fec] font-semibold hover:underline"
                >
                  Read Full Release
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    arrow_forward
                  </span>
                </Link>
              </div>
            </Card>
          </div>
        </section>
      )}

      {/* Press Releases Grid */}
      <section className="py-16 lg:py-20 bg-slate-50 dark:bg-slate-900">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
              All Press Releases
            </h2>
            <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Browse our complete archive of press releases and company announcements.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {otherReleases.map((release) => (
              <Card
                key={release.id}
                className="p-6 border border-slate-200 dark:border-slate-700 bg-white
                  dark:bg-slate-800 hover:border-[#137fec] hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className="px-2 py-0.5 text-xs font-semibold rounded-full"
                    style={{
                      backgroundColor: `${getCategoryColor(release.category)}15`,
                      color: getCategoryColor(release.category),
                    }}
                  >
                    {release.category}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {formatDate(release.date)}
                  </span>
                </div>

                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  {release.title}
                </h3>

                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  {release.summary}
                </p>

                <Link
                  href={`/press/${release.id}`}
                  className="inline-flex items-center gap-1 text-[#137fec] text-sm font-medium hover:underline"
                >
                  Read more
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    arrow_forward
                  </span>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Company Facts & Awards */}
      <section className="py-16 lg:py-20 bg-white dark:bg-slate-800">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Company Facts */}
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-3">
                <span className="w-10 h-10 rounded-lg bg-[#137fec]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#137fec]" aria-hidden="true">
                    info
                  </span>
                </span>
                Company Facts
              </h2>

              <div className="grid grid-cols-2 gap-4">
                {companyFacts.map((fact, index) => (
                  <Card
                    key={index}
                    className="p-4 text-center border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  >
                    <p className="text-2xl font-bold text-[#137fec] mb-1">{fact.value}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{fact.label}</p>
                  </Card>
                ))}
              </div>
            </div>

            {/* Awards */}
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-3">
                <span className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-amber-500" aria-hidden="true">
                    emoji_events
                  </span>
                </span>
                Awards & Recognition
              </h2>

              <div className="space-y-4">
                {awards.map((award) => (
                  <Card
                    key={award.id}
                    className="p-4 flex items-center gap-4 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  >
                    <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-amber-500" aria-hidden="true">
                        military_tech
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{award.title}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {award.organization} - {award.year}
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Media Kit & Contact */}
      <section className="py-16 lg:py-20 bg-gradient-to-r from-[#137fec] to-[#0e6ac7]">
        <div className="container px-4 lg:px-6 mx-auto max-w-5xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-white">
            {/* Media Kit */}
            <div className="text-center md:text-left">
              <h2 className="text-2xl font-bold mb-4">Media Kit</h2>
              <p className="text-white/90 mb-6">{mediaKit.description}</p>
              <a
                href={mediaKit.downloadUrl}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white
                  text-[#137fec] font-semibold rounded-lg hover:bg-slate-100
                  transition-colors focus:outline-none focus:ring-2 focus:ring-white
                  focus:ring-offset-2 focus:ring-offset-[#137fec]"
                download
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  folder_zip
                </span>
                Download Media Kit
              </a>
            </div>

            {/* Press Contact */}
            <div className="text-center md:text-left">
              <h2 className="text-2xl font-bold mb-4">Press Contact</h2>
              <p className="text-white/90 mb-4">
                For media inquiries, interviews, or additional information:
              </p>
              <div className="space-y-2">
                <p className="flex items-center gap-2 justify-center md:justify-start">
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    person
                  </span>
                  {pressContact.name}
                </p>
                <p className="flex items-center gap-2 justify-center md:justify-start">
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    mail
                  </span>
                  <a href={`mailto:${pressContact.email}`} className="hover:underline">
                    {pressContact.email}
                  </a>
                </p>
                <p className="flex items-center gap-2 justify-center md:justify-start">
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    phone
                  </span>
                  <a href={`tel:${pressContact.phone}`} className="hover:underline">
                    {pressContact.phone}
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
