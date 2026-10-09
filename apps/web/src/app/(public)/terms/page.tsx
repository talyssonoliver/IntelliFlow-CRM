import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import { formatTermsDate, getTermsOfService } from '@/lib/legal/acceptance-tracker';
import { TermsAcceptanceConfirm } from '@/components/legal/TermsAcceptanceConfirm';
import { OG_IMAGES } from '@/lib/og-images';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'Review the Aurora Terms of Service, including acceptable use, account obligations, intellectual property, and governing law.',
  openGraph: {
    images: OG_IMAGES,
    title: 'Terms of Service',
    description:
      'Read the Aurora Terms of Service, including subscription terms, prohibited activities, disclaimers, and limitation of liability.',
    url: 'https://intelliflow-crm.com/terms',
    siteName: 'Aurora',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Terms of Service',
    description:
      'Learn about the terms governing your use of Aurora, including rights, obligations, and dispute resolution.',
  },
  alternates: {
    canonical: '/terms',
  },
};

export default function TermsPage() {
  const terms = getTermsOfService();
  const formattedDate = formatTermsDate(terms.metadata.effectiveDate);

  return (
    <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922]">
      <section className="bg-gradient-to-b from-white to-[#edf4ff] dark:from-[#162231] dark:to-[#101922] py-16 lg:py-24">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#2a78f6]/10 px-4 py-2 text-sm font-medium text-[#2a78f6]">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                gavel
              </span>{' '}
              Legal agreement governing your use of Aurora
            </div>

            <h1 className="mt-6 text-4xl font-bold text-slate-900 dark:text-white lg:text-5xl">
              {terms.metadata.title}
            </h1>

            <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">
              These terms establish the rights and responsibilities between you and Leangency when
              using Aurora. Please read them carefully before using the service.
            </p>
          </div>
        </div>
      </section>

      <section className="py-10 lg:py-14">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#162231]">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                Terms at a glance
              </h2>
              <ul className="mt-4 space-y-3">
                {terms.metadata.summary.map((item, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300"
                  >
                    <span
                      className="material-symbols-outlined mt-0.5 text-base text-[#2a78f6]"
                      aria-hidden="true"
                    >
                      check_circle
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="border-transparent bg-[#11175b] p-6 text-white shadow-sm">
              <h2 className="text-xl font-semibold">Current version</h2>
              <dl className="mt-4 space-y-4 text-sm">
                <div>
                  <dt className="text-slate-300">Terms version</dt>
                  <dd className="mt-1 text-lg font-semibold">{terms.metadata.version}</dd>
                </div>
                <div>
                  <dt className="text-slate-300">Effective date</dt>
                  <dd className="mt-1">{formattedDate}</dd>
                </div>
                <div>
                  <dt className="text-slate-300">Legal contact</dt>
                  <dd className="mt-1">
                    <a
                      href={`mailto:${terms.metadata.contactEmail}`}
                      className="text-[#bca8ff] hover:underline"
                    >
                      {terms.metadata.contactEmail}
                    </a>
                  </dd>
                </div>
              </dl>
            </Card>
          </div>
        </div>
      </section>

      <section className="pb-16 lg:pb-24">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="grid gap-10 lg:grid-cols-[0.3fr_0.7fr]">
            <aside>
              <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#162231]">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  Quick links
                </h2>
                <nav aria-label="Terms sections" className="mt-4">
                  <ul className="space-y-3 text-sm">
                    {terms.sections.map((section) => (
                      <li key={section.id}>
                        <a
                          href={`#${section.id}`}
                          className="text-slate-600 transition-colors hover:text-[#2a78f6] dark:text-slate-300 dark:hover:text-[#bca8ff]"
                        >
                          {section.heading}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </aside>

            <div className="space-y-8">
              {terms.sections.map((section) => (
                <Card
                  key={section.id}
                  id={section.id}
                  className="scroll-mt-24 border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#162231]"
                >
                  <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                    {section.heading}
                  </h2>
                  <div className="mt-4 space-y-4">
                    {section.body.map((paragraph, index) => (
                      <p
                        key={index}
                        className="text-base leading-7 text-slate-600 dark:text-slate-300"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </Card>
              ))}

              <Card className="border-slate-200 bg-[#2a78f6]/5 p-6 shadow-sm dark:border-slate-800 dark:bg-[#2a78f6]/10">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                  Questions about these terms?
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  For questions about this agreement, contact{' '}
                  <a
                    href={`mailto:${terms.metadata.contactEmail}`}
                    className="font-medium text-[#2a78f6] hover:underline"
                  >
                    {terms.metadata.contactEmail}
                  </a>
                  . You can also review our{' '}
                  <Link href="/privacy" className="font-medium text-[#2a78f6] hover:underline">
                    Privacy Policy
                  </Link>{' '}
                  for information on how we handle your data.
                </p>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* IFC-309: Server-side terms acceptance: renders only for authenticated users */}
      <section className="pb-8 lg:pb-12">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <TermsAcceptanceConfirm termsVersion={terms.metadata.version} />
          </div>
        </div>
      </section>
    </div>
  );
}
