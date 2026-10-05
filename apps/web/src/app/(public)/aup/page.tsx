import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import {
  VIOLATION_REPORT_MAILTO_SUBJECT,
  formatAupDate,
  getAup,
} from '@/lib/legal/violation-tracker';
import { OG_IMAGES } from '@/lib/og-images';

export const metadata: Metadata = {
  title: 'Acceptable Use Policy',
  description:
    'Review the Aurora Acceptable Use Policy covering prohibited activities, content rules, security expectations, and the violation-reporting process.',
  openGraph: {
    images: OG_IMAGES,
    title: 'Acceptable Use Policy',
    description:
      'Read the Aurora AUP: boundaries that protect every customer, end user, integration, and partner on the platform.',
    url: 'https://intelliflow-crm.com/aup',
    siteName: 'Aurora',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Acceptable Use Policy',
    description:
      'Aurora AUP: prohibited activities, content rules, security expectations, and reporting.',
  },
  alternates: {
    canonical: '/aup',
  },
};

export default function AupPage() {
  const policy = getAup();
  const formattedDate = formatAupDate(policy.metadata.effectiveDate);
  const reportMailto = `mailto:${policy.metadata.contactEmail}?subject=${VIOLATION_REPORT_MAILTO_SUBJECT}`;

  return (
    <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922]">
      <section className="bg-gradient-to-b from-white to-[#edf4ff] dark:from-[#162231] dark:to-[#101922] py-16 lg:py-24">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#2a78f6]/10 px-4 py-2 text-sm font-medium text-[#2a78f6]">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                shield_person
              </span>{' '}
              Boundaries that protect every customer
            </div>

            <h1 className="mt-6 text-4xl font-bold text-slate-900 dark:text-white lg:text-5xl">
              {policy.metadata.title}
            </h1>

            <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">
              Aurora is a shared platform. This Acceptable Use Policy explains the activities,
              content, and behaviours that keep it safe and dependable for everyone, and the
              channels available to report a suspected violation.
            </p>
          </div>
        </div>
      </section>

      <section className="py-10 lg:py-14">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#162231]">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                AUP at a glance
              </h2>
              <ul className="mt-4 space-y-3">
                {policy.metadata.summary.map((item) => (
                  <li
                    key={item}
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
                  <dt className="text-slate-300">AUP version</dt>
                  <dd className="mt-1 text-lg font-semibold">{policy.metadata.version}</dd>
                </div>
                <div>
                  <dt className="text-slate-300">Effective date</dt>
                  <dd className="mt-1">{formattedDate}</dd>
                </div>
                <div>
                  <dt className="text-slate-300">Legal contact</dt>
                  <dd className="mt-1">
                    <a
                      href={`mailto:${policy.metadata.contactEmail}`}
                      className="text-[#bca8ff] hover:underline"
                    >
                      {policy.metadata.contactEmail}
                    </a>
                  </dd>
                </div>
              </dl>
              <div className="mt-6">
                <a
                  href={reportMailto}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    flag
                  </span>{' '}
                  Report a violation
                </a>
              </div>
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
                <nav aria-label="AUP sections" className="mt-4">
                  <ul className="space-y-3 text-sm">
                    {policy.sections.map((section) => (
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
              {policy.sections.map((section) => (
                <Card
                  key={section.id}
                  id={section.id}
                  className="scroll-mt-24 border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#162231]"
                >
                  <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                    {section.heading}
                  </h2>
                  <div className="mt-4 space-y-4">
                    {section.body.map((paragraph) => (
                      <p
                        key={paragraph}
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
                  Questions about enforcement?
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Email our legal team at{' '}
                  <a
                    href={`mailto:${policy.metadata.contactEmail}`}
                    className="font-medium text-[#2a78f6] hover:underline"
                  >
                    {policy.metadata.contactEmail}
                  </a>{' '}
                  for enforcement enquiries or appeals. You can also review our{' '}
                  <Link href="/privacy" className="font-medium text-[#2a78f6] hover:underline">
                    Privacy Policy
                  </Link>{' '}
                  and{' '}
                  <Link href="/terms" className="font-medium text-[#2a78f6] hover:underline">
                    Terms of Service
                  </Link>{' '}
                  for the broader contractual framework.
                </p>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
