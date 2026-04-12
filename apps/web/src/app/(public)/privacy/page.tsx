import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import { formatPolicyDate, getPrivacyPolicy } from '@/lib/legal/consent-tracker';

export const metadata: Metadata = {
  title: 'Privacy Policy | IntelliFlow CRM',
  description:
    'Review how IntelliFlow CRM collects, uses, protects, and retains personal data across our public site and product experiences.',
  openGraph: {
    title: 'Privacy Policy | IntelliFlow CRM',
    description:
      'Read the IntelliFlow CRM Privacy Policy, including data handling principles, retention, subprocessors, and data-subject rights.',
    url: 'https://intelliflow-crm.com/privacy',
    siteName: 'IntelliFlow CRM',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Privacy Policy | IntelliFlow CRM',
    description:
      'Learn how IntelliFlow CRM handles personal data, consent, retention, and privacy requests.',
  },
  alternates: {
    canonical: '/privacy',
  },
};

export default function PrivacyPage() {
  const policy = getPrivacyPolicy();
  const formattedDate = formatPolicyDate(policy.metadata.effectiveDate);

  return (
    <main id="main-content" className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922]">
      <section className="bg-gradient-to-b from-white to-[#edf4ff] dark:from-[#162231] dark:to-[#101922] py-16 lg:py-24">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#137fec]/10 px-4 py-2 text-sm font-medium text-[#137fec]">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                verified_user
              </span>
              {' '}Transparency and privacy-by-design
            </div>

            <h1 className="mt-6 text-4xl font-bold text-slate-900 dark:text-white lg:text-5xl">
              {policy.metadata.title}
            </h1>

            <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">
              IntelliFlow CRM is built to help teams move quickly without losing control. This
              policy explains what personal data we process, why we process it, and how customers
              can reach us about privacy concerns or data-subject rights.
            </p>
          </div>
        </div>
      </section>

      <section className="py-10 lg:py-14">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#162231]">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                Policy at a glance
              </h2>
              <ul className="mt-4 space-y-3">
                {policy.metadata.summary.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300"
                  >
                    <span
                      className="material-symbols-outlined mt-0.5 text-base text-[#137fec]"
                      aria-hidden="true"
                    >
                      check_circle
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="border-slate-200 bg-slate-900 p-6 text-white shadow-sm dark:border-slate-700 dark:bg-[#0f172a]">
              <h2 className="text-xl font-semibold">Current version</h2>
              <dl className="mt-4 space-y-4 text-sm">
                <div>
                  <dt className="text-slate-300">Policy version</dt>
                  <dd className="mt-1 text-lg font-semibold">{policy.metadata.version}</dd>
                </div>
                <div>
                  <dt className="text-slate-300">Effective date</dt>
                  <dd className="mt-1">{formattedDate}</dd>
                </div>
                <div>
                  <dt className="text-slate-300">Privacy contact</dt>
                  <dd className="mt-1">
                    <a
                      href={`mailto:${policy.metadata.contactEmail}`}
                      className="text-[#7cc4ff] hover:underline"
                    >
                      {policy.metadata.contactEmail}
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
                <nav aria-label="Privacy policy sections" className="mt-4">
                  <ul className="space-y-3 text-sm">
                    {policy.sections.map((section) => (
                      <li key={section.id}>
                        <a
                          href={`#${section.id}`}
                          className="text-slate-600 transition-colors hover:text-[#137fec] dark:text-slate-300 dark:hover:text-[#7cc4ff]"
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

              <Card className="border-slate-200 bg-[#137fec]/5 p-6 shadow-sm dark:border-slate-800 dark:bg-[#137fec]/10">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                  Need more information?
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  If you need help with a privacy request, contact{' '}
                  <a
                    href={`mailto:${policy.metadata.contactEmail}`}
                    className="font-medium text-[#137fec] hover:underline"
                  >
                    {policy.metadata.contactEmail}
                  </a>
                  . You can also return to the public site or review our{' '}
                  <Link href="/security" className="font-medium text-[#137fec] hover:underline">
                    security overview
                  </Link>{' '}
                  for additional governance details.
                </p>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
