import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import { OG_IMAGES } from '@/lib/og-images';
import {
  ANTHROPIC_RETENTION_URL,
  DATA_AND_AI_LAST_UPDATED,
  REMOVED_NOTES,
  SECTIONS,
  STRIPE_NOTE,
  SUB_PROCESSORS,
} from './content';

// Fully static: no cookies, headers or per-request work, so it is built once and served from the CDN.
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Data and AI',
  description:
    'Where Aurora holds your data, which AI providers see it, what Aurora reads from Gmail and Google Calendar, and what we can erase or export.',
  openGraph: {
    images: OG_IMAGES,
    title: 'Data and AI',
    description:
      'Where Aurora holds your data, which AI providers see it, and what Aurora reads from Gmail and Google Calendar.',
    url: 'https://intelli-flow-crm-web.vercel.app/data-and-ai',
    siteName: 'Aurora',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Data and AI',
    description:
      'Aurora: where your data is held, which AI providers see it, and what we read from Google.',
  },
  alternates: {
    canonical: '/data-and-ai',
  },
};

const linkClass = 'font-medium text-[#2a78f6] hover:underline';

export default function DataAndAiPage() {
  return (
    <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922]">
      <section className="bg-gradient-to-b from-white to-[#edf4ff] dark:from-[#162231] dark:to-[#101922] py-16 lg:py-24">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white lg:text-5xl">
              Data and AI
            </h1>
            <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">
              Plain answers to where Aurora holds your data, what the AI providers see, and what
              Aurora reads from Gmail and Google Calendar.
            </p>
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              Last updated {DATA_AND_AI_LAST_UPDATED}
            </p>
          </div>
        </div>
      </section>

      <section className="pb-16 lg:pb-24">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="grid gap-10 lg:grid-cols-[0.3fr_0.7fr]">
            <aside>
              <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#162231]">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  On this page
                </h2>
                <nav aria-label="Data and AI sections" className="mt-4">
                  <ul className="space-y-3 text-sm">
                    {SECTIONS.map((section) => (
                      <li key={section.id}>
                        <a
                          href={`#${section.id}`}
                          className="text-slate-600 transition-colors hover:text-[#2a78f6] dark:text-slate-300 dark:hover:text-[#bca8ff]"
                        >
                          {section.heading}
                        </a>
                      </li>
                    ))}
                    <li>
                      <a
                        href="#sub-processors"
                        className="text-slate-600 transition-colors hover:text-[#2a78f6] dark:text-slate-300 dark:hover:text-[#bca8ff]"
                      >
                        Companies that handle your data
                      </a>
                    </li>
                  </ul>
                </nav>
              </div>
            </aside>

            <div className="min-w-0 space-y-8">
              {SECTIONS.map((section) => (
                <Card
                  key={section.id}
                  id={section.id}
                  className="scroll-mt-24 border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#162231]"
                >
                  <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                    {section.heading}
                  </h2>
                  <div className="mt-4 space-y-4">
                    {section.paragraphs?.map((paragraph) => (
                      <p
                        key={paragraph}
                        className="text-base leading-7 text-slate-600 dark:text-slate-300"
                      >
                        {paragraph}
                      </p>
                    ))}
                    {section.bullets ? (
                      <ul className="list-disc space-y-2 pl-5 text-base leading-7 text-slate-600 dark:text-slate-300">
                        {section.bullets.map((bullet) => (
                          <li key={bullet}>{bullet}</li>
                        ))}
                      </ul>
                    ) : null}
                    {section.id === 'ai-terms' ? (
                      <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                        Sources, read on 22 November 2026:{' '}
                        <a
                          href="https://www.anthropic.com/legal/commercial-terms"
                          className={linkClass}
                          rel="noopener noreferrer"
                        >
                          Anthropic Commercial Terms
                        </a>
                        ,{' '}
                        <a
                          href={ANTHROPIC_RETENTION_URL}
                          className={linkClass}
                          rel="noopener noreferrer"
                        >
                          Anthropic privacy centre
                        </a>{' '}
                        and{' '}
                        <a
                          href="https://ai.google.dev/gemini-api/terms"
                          className={linkClass}
                          rel="noopener noreferrer"
                        >
                          Gemini API Additional Terms
                        </a>
                        {'.'}
                      </p>
                    ) : null}
                  </div>
                </Card>
              ))}

              <Card
                id="sub-processors"
                className="scroll-mt-24 border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#162231]"
              >
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                  Companies that handle your data
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
                  These are the sub-processors listed in our{' '}
                  <Link href="/dpa" className={linkClass}>
                    Data Processing Addendum
                  </Link>
                  .
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                    <caption className="sr-only">Aurora sub-processors</caption>
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-900 dark:border-slate-700 dark:text-white">
                        <th scope="col" className="py-3 pr-4 font-semibold">
                          Company
                        </th>
                        <th scope="col" className="py-3 pr-4 font-semibold">
                          What it does
                        </th>
                        <th scope="col" className="py-3 pr-4 font-semibold">
                          Data it handles
                        </th>
                        <th scope="col" className="py-3 pr-4 font-semibold">
                          Location
                        </th>
                        <th scope="col" className="py-3 font-semibold">
                          Its terms
                        </th>
                      </tr>
                    </thead>
                    <tbody className="align-top text-slate-600 dark:text-slate-300">
                      {SUB_PROCESSORS.map((p) => (
                        <tr
                          key={p.name}
                          className="border-b border-slate-100 dark:border-slate-800"
                        >
                          <th
                            scope="row"
                            className="py-3 pr-4 font-medium text-slate-900 dark:text-white"
                          >
                            {p.name}
                          </th>
                          <td className="py-3 pr-4">{p.purpose}</td>
                          <td className="py-3 pr-4">{p.data}</td>
                          <td className="py-3 pr-4">{p.location}</td>
                          <td className="py-3">
                            <a href={p.termsUrl} className={linkClass} rel="noopener noreferrer">
                              {p.termsLabel}
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="mt-6 list-disc space-y-2 pl-5 text-base leading-7 text-slate-600 dark:text-slate-300">
                  <li>
                    {STRIPE_NOTE.text}{' '}
                    <a href={STRIPE_NOTE.termsUrl} className={linkClass} rel="noopener noreferrer">
                      {STRIPE_NOTE.termsLabel}
                    </a>
                    {'.'}
                  </li>
                  {REMOVED_NOTES.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </Card>

              <Card className="border-slate-200 bg-[#2a78f6]/5 p-6 shadow-sm dark:border-slate-800 dark:bg-[#2a78f6]/10">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                  Questions about your data?
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Email{' '}
                  <a href="mailto:hello@leangency.com" className={linkClass}>
                    hello@leangency.com
                  </a>
                  . You can also read our{' '}
                  <Link href="/privacy" className={linkClass}>
                    Privacy Policy
                  </Link>
                  ,{' '}
                  <Link href="/dpa" className={linkClass}>
                    Data Processing Addendum
                  </Link>{' '}
                  and{' '}
                  <Link href="/security" className={linkClass}>
                    Security Overview
                  </Link>
                  .
                </p>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
