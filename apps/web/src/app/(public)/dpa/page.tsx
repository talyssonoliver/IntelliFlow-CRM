import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import { getDpa, formatDpaDate } from '@/lib/legal/signature-handler';
import { DpaSignaturePanel } from '@/components/legal/dpa-signature-panel';

export const metadata: Metadata = {
  title: 'Data Processing Addendum | IntelliFlow CRM',
  description:
    'Review the IntelliFlow CRM Data Processing Addendum governing our GDPR Article 28 data processor relationship with enterprise customers.',
  openGraph: {
    title: 'Data Processing Addendum | IntelliFlow CRM',
    description:
      'Read the IntelliFlow CRM DPA covering processing subject matter, sub-processors, security measures, and controller obligations under GDPR Article 28.',
    url: 'https://intelliflow-crm.com/dpa',
    siteName: 'IntelliFlow CRM',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Data Processing Addendum | IntelliFlow CRM',
    description:
      'IntelliFlow CRM DPA — GDPR Article 28 data processor agreement for enterprise customers.',
  },
  alternates: {
    canonical: '/dpa',
  },
};

export default function DpaPage() {
  const dpa = getDpa();
  const formattedDate = formatDpaDate(dpa.metadata.effectiveDate);

  return (
    <main id="main-content" className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922]">
      <section className="bg-gradient-to-b from-white to-[#edf4ff] dark:from-[#162231] dark:to-[#101922] py-16 lg:py-24">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#137fec]/10 px-4 py-2 text-sm font-medium text-[#137fec]">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                assignment
              </span>{' '}
              GDPR Article 28 — Data Processor Agreement
            </div>

            <h1 className="mt-6 text-4xl font-bold text-slate-900 dark:text-white lg:text-5xl">
              {dpa.metadata.title}
            </h1>

            <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">
              This addendum governs the data processor relationship between IntelliFlow CRM and
              enterprise customers, ensuring your organisation&apos;s personal data is handled in
              accordance with GDPR Article 28 requirements.
            </p>
          </div>
        </div>
      </section>

      <section className="py-10 lg:py-14">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#162231]">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                DPA at a glance
              </h2>
              <ul className="mt-4 space-y-3">
                {dpa.metadata.summary.map((item) => (
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
                  <dt className="text-slate-300">DPA version</dt>
                  <dd className="mt-1 text-lg font-semibold">{dpa.metadata.version}</dd>
                </div>
                <div>
                  <dt className="text-slate-300">Effective date</dt>
                  <dd className="mt-1">{formattedDate}</dd>
                </div>
                <div>
                  <dt className="text-slate-300">Legal contact</dt>
                  <dd className="mt-1">
                    <a
                      href={`mailto:${dpa.metadata.contactEmail}`}
                      className="text-[#7cc4ff] hover:underline"
                    >
                      {dpa.metadata.contactEmail}
                    </a>
                  </dd>
                </div>
              </dl>
              <div className="mt-6">
                {/* TODO: Replace placeholder PDF with legal-reviewed DPA template before production deploy */}
                <a
                  href="/legal/dpa-template.pdf"
                  download
                  className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    download
                  </span>
                  Download DPA Template
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
                <nav aria-label="DPA sections" className="mt-4">
                  <ul className="space-y-3 text-sm">
                    {dpa.sections.map((section) => (
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
              {dpa.sections.map((section) => (
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
                  Questions about this agreement?
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Contact our legal team at{' '}
                  <a
                    href={`mailto:${dpa.metadata.contactEmail}`}
                    className="font-medium text-[#137fec] hover:underline"
                  >
                    {dpa.metadata.contactEmail}
                  </a>{' '}
                  for enterprise DPA enquiries, countersigned copies, or audit requests. You may
                  also review our{' '}
                  <Link href="/privacy" className="font-medium text-[#137fec] hover:underline">
                    Privacy Policy
                  </Link>{' '}
                  and{' '}
                  <Link href="/security" className="font-medium text-[#137fec] hover:underline">
                    Security Overview
                  </Link>{' '}
                  for additional data governance information.
                </p>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <DpaSignaturePanel
        currentVersion={dpa.metadata.version}
        downloadPath="/legal/dpa-template.pdf"
      />
    </main>
  );
}
