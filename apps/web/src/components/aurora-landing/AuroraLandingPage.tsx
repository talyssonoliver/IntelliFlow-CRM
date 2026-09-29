import Link from 'next/link';
import Image from 'next/image';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { AuroraBackground } from './AuroraBackground';
import { AuroraHeader } from './AuroraHeader';
import { AuroraLogo } from './AuroraLogo';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

const features = [
  {
    title: 'Score every lead',
    description:
      "Aurora reads each lead's activity and ranks who is ready to talk, so the first call goes to the right person.",
    icon: 'target',
    tint: 'bg-[#EFEAFE] text-[#6D3FE8]',
  },
  {
    title: 'See the whole pipeline',
    description:
      'Every deal by stage, owner and next step, on one board that updates as your team works.',
    icon: 'bar_chart',
    tint: 'bg-[#E6EEFE] text-[#1D5FD8]',
  },
  {
    title: 'Follow up on time',
    description:
      'When a deal goes quiet, Aurora drafts the next email and reminds its owner before the moment passes.',
    icon: 'mail',
    tint: 'bg-[#E1F6F7] text-[#0E7F8A]',
  },
];

const workspacePoints = [
  'Contacts and companies with their full history',
  'Emails and meetings logged to the right deal',
  'Reports built from the same data your team works in',
];

const pipelineStages = [
  {
    label: 'New',
    cards: [
      ['80%', '55%', 'bg-[#CFF5F9]'],
      ['70%', '45%', 'bg-[#DCE6FD]'],
      ['75%', '50%', ''],
    ],
  },
  {
    label: 'Qualified',
    cards: [
      ['85%', '60%', 'focus'],
      ['65%', '40%', 'bg-[#DCE6FD]'],
    ],
  },
  {
    label: 'Proposal',
    cards: [
      ['78%', '50%', 'bg-[#E7DEFD]'],
      ['60%', '42%', ''],
    ],
  },
  { label: 'Won', cards: [['72%', '48%', 'bg-[#CDEFE3]']] },
] as const;

const footerColumns = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '/features' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Integrations', href: '/integrations' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Blog', href: '/blog' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Cookies', href: '/cookies' },
    ],
  },
];

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D3FE8] focus-visible:ring-offset-2';
const primaryButton = `inline-flex h-14 items-center justify-center rounded-2xl sm:rounded-full bg-gradient-to-r from-[#1570C8] to-[#6D3FE8] px-8 text-lg font-bold text-white shadow-[0_14px_30px_-12px_rgba(76,63,232,0.75)] transition-[filter] hover:brightness-110 ${focusRing}`;
const secondaryButton = `inline-flex h-14 items-center justify-center rounded-2xl sm:rounded-full border-[1.5px] border-[#5B5FD9] bg-white/85 px-8 text-lg font-bold text-[#3438C4] transition-colors hover:bg-white ${focusRing}`;

function Skeleton({ className }: { className: string }) {
  return <div className={`rounded-full ${className}`} />;
}

/** Decorative pipeline board: shape only, no invented deals or numbers. */
function PipelinePreview() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto w-full max-w-[620px] pb-10 pl-4 pt-4 sm:pl-6 sm:pt-6"
    >
      <div className="rounded-[26px] border border-white/95 bg-white/80 p-4 shadow-[0_40px_80px_-30px_rgba(40,50,130,0.35)] backdrop-blur-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2 pl-10 sm:pl-0">
          <span className="hidden h-2.5 w-2.5 rounded-full bg-[#E1E3EF] sm:block" />
          <span className="hidden h-2.5 w-2.5 rounded-full bg-[#E1E3EF] sm:block" />
          <span className="hidden h-2.5 w-2.5 rounded-full bg-[#E1E3EF] sm:block" />
          <Skeleton className="ml-0 h-7 flex-1 bg-[#EEF0F7] sm:ml-3" />
          <span className="h-7 w-7 rounded-full bg-gradient-to-br from-[#7DEBF5] to-[#6D3FE8]" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {pipelineStages.map((stage, stageIndex) => (
            <div
              key={stage.label}
              className={`flex-col gap-2.5 ${stageIndex > 1 ? 'hidden sm:flex' : 'flex'}`}
            >
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#5C6386] sm:text-xs">
                {stage.label}
              </div>
              {stage.cards.map(([w1, w2, chip], cardIndex) => (
                <div
                  key={cardIndex}
                  className={`flex flex-col gap-2 rounded-xl bg-white p-3 ${
                    chip === 'focus'
                      ? 'border-[1.5px] border-[#8FA8F8] shadow-[0_8px_18px_-10px_rgba(59,108,246,0.6)]'
                      : 'border border-[#ECEEF6]'
                  }`}
                >
                  <div className="h-2 rounded-full bg-[#D9DCEB]" style={{ width: w1 }} />
                  <div className="h-1.5 rounded-full bg-[#E9EBF4]" style={{ width: w2 }} />
                  {chip === 'focus' && (
                    <div className="h-3.5 w-10 rounded-full bg-gradient-to-r from-[#38BDF8] to-[#6D3FE8]" />
                  )}
                  {chip !== 'focus' && chip !== '' && (
                    <div className={`h-3.5 w-8 rounded-full ${chip}`} />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="absolute left-0 top-0 flex h-[58px] w-[58px] items-center justify-center rounded-full bg-white shadow-[0_12px_28px_-10px_rgba(76,63,232,0.5)] sm:h-[68px] sm:w-[68px]">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#3B82F6] to-[#7C4DF5] sm:h-[52px] sm:w-[52px]">
          <span className="material-symbols-outlined text-2xl text-white">auto_awesome</span>
        </div>
      </div>

      <div className="absolute bottom-0 right-0 flex w-[210px] flex-col gap-2.5 rounded-2xl bg-white p-3.5 shadow-[0_24px_50px_-20px_rgba(40,50,130,0.45)] sm:left-0 sm:right-auto sm:w-[260px] sm:p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#38BDF8] to-[#6D3FE8]">
            <span className="material-symbols-outlined text-base text-white">auto_awesome</span>
          </span>
          <span className="text-sm font-bold text-[#0C1238]">Next best action</span>
        </div>
        <Skeleton className="h-1.5 w-[90%] bg-[#E3E5F0]" />
        <Skeleton className="h-1.5 w-[62%] bg-[#E3E5F0]" />
        <span className="hidden self-start rounded-full bg-[#EEF0FF] px-3 py-1.5 text-xs font-bold text-[#3438C4] sm:inline-block">
          Draft follow-up
        </span>
      </div>
    </div>
  );
}

/** Decorative phone showing a contact timeline, again shape only. */
function WorkspacePreview() {
  return (
    <div
      aria-hidden="true"
      className="relative h-[380px] w-full overflow-hidden rounded-[28px] bg-gradient-to-br from-[#2F7CF6] via-[#5B5CF2] to-[#7C4DF5] sm:h-[500px] sm:rounded-[32px] lg:w-[560px] lg:flex-shrink-0"
    >
      <div className="absolute -left-10 top-16 h-16 w-[130%] -rotate-6 rounded-full bg-white/10 blur-sm" />
      <div className="absolute -left-10 bottom-16 h-20 w-[130%] rotate-3 rounded-full bg-[#7DEBF5]/25 blur-sm" />
      <div className="absolute left-1/2 top-11 flex h-[440px] w-[210px] -translate-x-1/2 flex-col gap-3 rounded-[36px] border-[8px] border-[#11163A] bg-[#F7F8FD] px-3.5 pt-8 sm:top-[60px] sm:w-[250px] sm:px-[18px]">
        <div className="absolute left-1/2 top-2 h-3.5 w-16 -translate-x-1/2 rounded-full bg-[#11163A]" />
        <div className="flex items-center gap-2.5">
          <span className="h-10 w-10 rounded-full bg-gradient-to-br from-[#7DEBF5] to-[#6D3FE8]" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-2 w-4/5 bg-[#CDD1E4]" />
            <Skeleton className="h-1.5 w-1/2 bg-[#E1E4F0]" />
          </div>
        </div>
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-14 bg-[#E6EEFE]" />
          <Skeleton className="h-5 w-11 bg-[#EFEAFE]" />
        </div>
        {['bg-[#38BDF8]', 'bg-[#7C4DF5]', 'bg-[#2563EB]'].map((dot) => (
          <div key={dot} className="flex gap-2 rounded-xl border border-[#ECEEF6] bg-white p-2.5">
            <span className={`mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${dot}`} />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-1.5 w-[85%] bg-[#D9DCEB]" />
              <Skeleton className="h-1.5 w-[55%] bg-[#E9EBF4]" />
            </div>
          </div>
        ))}
      </div>
      <div className="absolute bottom-10 left-6 hidden w-[180px] flex-col gap-2.5 rounded-2xl bg-white/95 p-3.5 shadow-[0_20px_40px_-18px_rgba(12,18,56,0.5)] sm:flex">
        <span className="text-xs font-bold text-[#0C1238]">Deal moved to Proposal</span>
        <Skeleton className="h-1.5 w-[85%] bg-[#E3E5F0]" />
        <Skeleton className="h-1.5 w-[55%] bg-[#E3E5F0]" />
      </div>
    </div>
  );
}

export function AuroraLandingPage() {
  const year = new Date().getFullYear();

  return (
    <div className={`${jakarta.className} min-h-screen bg-[#F3F4FB] text-[#0C1238]`}>
      {/* The root layout's skip link lands above this page's own header, so
          this one skips past it. Its id must not repeat the layout's #main-content. */}
      <a
        href="#aurora-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#11175B] focus:shadow-lg"
      >
        Skip to content
      </a>
      <AuroraHeader />

      <main id="aurora-main" tabIndex={-1} className="outline-none">
        <div className="relative overflow-hidden">
          <AuroraBackground />

          <section
            aria-labelledby="hero-heading"
            data-testid="aurora-hero"
            className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 pb-8 pt-10 text-center lg:grid-cols-2 lg:gap-12 lg:pb-14 lg:pt-20 lg:text-left"
          >
            <div className="flex flex-col items-center gap-5 lg:items-start lg:gap-6">
              <span className="inline-flex h-9 items-center gap-2 rounded-full border border-[#D6D8F2] bg-white/80 px-4 text-sm font-semibold text-[#3438C4]">
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  auto_awesome
                </span>{' '}
                AI-native CRM
              </span>
              <h1
                id="hero-heading"
                className="text-[38px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[#0C1238] sm:text-5xl lg:text-[62px] lg:leading-[1.06]"
              >
                Close more deals with a CRM that{' '}
                <span className="bg-gradient-to-r from-[#1570C8] to-[#6D3FE8] bg-clip-text text-transparent">
                  thinks ahead
                </span>
              </h1>
              <p className="max-w-xl text-[17px] leading-relaxed text-[#474E72] lg:text-[19px]">
                Aurora scores your leads, keeps your pipeline current and drafts the next follow-up,
                so your team spends its day selling instead of updating records.
              </p>
              <div className="flex w-full flex-col gap-3 pt-2 sm:w-auto sm:flex-row">
                <Link href="/signup" className={primaryButton}>
                  Get started
                </Link>
                <Link href="/contact" className={secondaryButton}>
                  Book a demo
                </Link>
              </div>
              <Link
                href="/features?tour=1"
                data-testid="tour-trigger-link"
                data-tour-id="features-v1"
                className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-base font-semibold text-[#3438C4] hover:text-[#1F2296] ${focusRing}`}
              >
                <span className="material-symbols-outlined text-xl" aria-hidden="true">
                  play_circle
                </span>{' '}
                Take the tour
              </Link>
            </div>

            <PipelinePreview />
          </section>

          <section
            aria-labelledby="features-heading"
            className="relative mx-auto max-w-6xl px-6 pb-16 pt-6 lg:pb-28"
          >
            <h2 id="features-heading" className="sr-only">
              What Aurora does for your team
            </h2>
            <ul className="grid gap-3.5 md:grid-cols-3 md:gap-7">
              {features.map((feature) => (
                <li key={feature.title} data-testid="feature-card">
                  <Link
                    href="/features"
                    className={`group flex h-full items-center gap-4 rounded-[20px] border border-[#E6E8F3] bg-white/90 p-4 shadow-[0_18px_40px_-28px_rgba(40,50,130,0.4)] transition-shadow hover:shadow-[0_24px_50px_-24px_rgba(40,50,130,0.45)] md:flex-col md:items-start md:gap-4 md:rounded-[22px] md:p-8 ${focusRing}`}
                  >
                    <span
                      className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl md:h-[60px] md:w-[60px] ${feature.tint}`}
                    >
                      <span className="material-symbols-outlined text-[28px]" aria-hidden="true">
                        {feature.icon}
                      </span>
                    </span>
                    <span className="flex flex-1 flex-col gap-1 text-left md:gap-3">
                      <span className="text-lg font-bold text-[#0C1238] md:text-[22px]">
                        {feature.title}
                      </span>
                      <span className="text-[15px] leading-normal text-[#474E72] md:text-base md:leading-relaxed">
                        {feature.description}
                      </span>
                      <span className="hidden items-center gap-1.5 pt-2 text-[15px] font-bold text-[#3438C4] md:inline-flex">
                        Learn more{' '}
                        <span
                          className="material-symbols-outlined text-lg transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        >
                          arrow_forward
                        </span>
                      </span>
                    </span>
                    {/* The icon font sets its own display, so hide a wrapper instead. */}
                    <span
                      className="flex flex-shrink-0 text-[#5C6386] md:hidden"
                      aria-hidden="true"
                    >
                      <span className="material-symbols-outlined">chevron_right</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section
          aria-labelledby="workspace-heading"
          className="mx-auto flex max-w-6xl flex-col gap-10 px-6 pb-16 lg:flex-row lg:items-center lg:justify-between lg:gap-20 lg:pb-28"
        >
          <div className="flex max-w-[520px] flex-col gap-5">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#4B3FD6] lg:text-[13px]">
              One workspace
            </span>
            <h2
              id="workspace-heading"
              className="text-[30px] font-extrabold leading-[1.15] tracking-[-0.02em] lg:text-[46px] lg:leading-[1.12]"
            >
              Every contact, deal and conversation in one place
            </h2>
            <p className="text-[17px] leading-relaxed text-[#474E72] lg:text-lg">
              Stop stitching together spreadsheets, inboxes and notes. Aurora keeps the record
              complete, on your desk and in your pocket.
            </p>
            <ul className="flex flex-col gap-3.5 pt-1">
              {workspacePoints.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-3 text-base font-medium lg:text-[17px]"
                >
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#E6EEFE] text-[#1D5FD8]">
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                      check
                    </span>
                  </span>
                  <span className="pt-0.5">{point}</span>
                </li>
              ))}
            </ul>
          </div>
          <WorkspacePreview />
        </section>

        <section
          data-testid="cta-section"
          aria-labelledby="cta-heading"
          className="relative mx-4 overflow-hidden rounded-[28px] bg-[#0C1238] px-6 py-12 text-center sm:mx-6 lg:mx-auto lg:max-w-6xl lg:rounded-[36px] lg:px-20 lg:py-20"
        >
          <Image
            src="/brand/aurora/aurora-wave.webp"
            alt=""
            width={460}
            height={174}
            className="pointer-events-none absolute -right-24 -top-8 w-[280px] opacity-35 lg:-right-20 lg:w-[460px]"
          />
          <div className="relative mx-auto flex max-w-xl flex-col items-center gap-4 lg:gap-5">
            <h2
              id="cta-heading"
              className="text-[30px] font-extrabold leading-[1.15] tracking-[-0.02em] text-white lg:text-[44px]"
            >
              Put Aurora on your pipeline
            </h2>
            <p className="text-base leading-relaxed text-[#C9CDEA] lg:text-lg">
              Bring your contacts and deals across, and see which leads Aurora puts at the top of
              your list.
            </p>
            <div className="flex w-full flex-col gap-3 pt-2 sm:w-auto sm:flex-row">
              <Link href="/signup" className={primaryButton}>
                Get started
              </Link>
              <Link
                href="/contact"
                className={`inline-flex h-14 items-center justify-center rounded-2xl border-[1.5px] border-white/60 px-8 text-lg font-bold text-white transition-colors hover:bg-white/10 sm:rounded-full ${focusRing} focus-visible:ring-offset-[#0C1238]`}
              >
                Book a demo
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-6 pb-10 pt-14 lg:pb-12 lg:pt-20">
        <div className="flex flex-col gap-9 lg:flex-row lg:justify-between">
          <div className="flex flex-col gap-3">
            <AuroraLogo height={30} />
            <p className="text-[15px] text-[#474E72]">The AI-native CRM.</p>
          </div>
          <div className="grid grid-cols-3 gap-4 lg:gap-24">
            {footerColumns.map((column) => (
              <nav key={column.title} aria-label={column.title} className="flex flex-col gap-1">
                <h2 className="pb-1 text-xs font-bold uppercase tracking-[0.1em] text-[#0C1238] lg:text-[13px]">
                  {column.title}
                </h2>
                {column.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex min-h-9 items-center text-[15px] text-[#474E72] hover:text-[#3438C4]"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            ))}
          </div>
        </div>
        <p className="mt-10 border-t border-[#E1E3EF] pt-5 text-sm text-[#5C6386]">
          © {year} Aurora. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
