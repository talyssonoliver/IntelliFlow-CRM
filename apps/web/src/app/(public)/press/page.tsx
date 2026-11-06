import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import pressData from '@/data/press-releases.json';
import type { PressRelease } from '@/components/press/PressReleaseDetail';
import { formatPressDate, getCategoryStyle } from '@/lib/press/utils';
import { OG_IMAGES } from '@/lib/og-images';

/**
 * Press Page
 *
 * Public-facing press/media page for Aurora. Lists only releases about events that
 * happened; with none published yet it says so, and media enquiries go to the
 * contact page.
 *
 * Task: PG-007
 */

export const metadata: Metadata = {
  title: 'Press & Media',
  description: 'News and press releases from Aurora, and how to reach us for media enquiries.',
  openGraph: {
    images: OG_IMAGES,
    title: 'Press & Media',
    description: 'News and press releases from Aurora.',
    url: 'https://intelli-flow-crm-web.vercel.app/press',
    siteName: 'Aurora',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Press & Media',
    description: 'News and press releases from Aurora.',
  },
};

const releases = pressData.releases as PressRelease[];

export default function PressPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-[#11175b] to-[#11175b] py-16 lg:py-24">
        <div className="absolute -left-40 top-10 h-80 w-80 rounded-full bg-primary/20 blur-3xl opacity-50" />
        <div className="absolute right-0 bottom-0 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl opacity-40" />

        <div className="container relative z-10 px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-sky-300 font-medium backdrop-blur mb-6">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                newspaper
              </span>{' '}
              Press & Media
            </div>

            <h1 className="text-4xl lg:text-5xl font-bold text-white mb-6">
              News & Press Releases
            </h1>

            <p className="text-lg text-slate-200 max-w-2xl mx-auto mb-8">
              News and announcements from Aurora.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg
                  border border-white/30 text-white font-semibold hover:bg-white/10
                  transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50
                  focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  mail
                </span>{' '}
                Media enquiries
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Press Releases */}
      <section className="py-16 lg:py-20 bg-slate-50 dark:bg-slate-900">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          {releases.length === 0 ? (
            <Card className="p-8 lg:p-12 max-w-2xl mx-auto text-center border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <span
                className="material-symbols-outlined text-4xl text-slate-400 mb-4"
                aria-hidden="true"
              >
                newspaper
              </span>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
                No press releases yet
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                When Aurora has news to share, it will be published here. For media enquiries, get
                in touch through the contact page.
              </p>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 text-primary font-semibold hover:underline"
              >
                Contact us{' '}
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {releases.map((release) => (
                <Card
                  key={release.id}
                  className="p-6 border border-slate-200 dark:border-slate-700 bg-white
                    dark:bg-slate-800 hover:border-primary hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getCategoryStyle(release.category)}`}
                    >
                      {release.category}
                    </span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {formatPressDate(release.date)}
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
                    className="inline-flex items-center gap-1 text-primary text-sm font-medium hover:underline"
                  >
                    Read more{' '}
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                      arrow_forward
                    </span>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
