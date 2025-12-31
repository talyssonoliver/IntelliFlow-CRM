import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';

const heroStats = [
  { label: 'Response target', value: '<200ms', helper: 'Snappy hero & CTA paint with async hydration' },
  { label: 'Lighthouse baseline', value: '90%+', helper: 'Performance, a11y, SEO, best practices' },
  { label: 'Delivery efficiency', value: '50% less handoff', helper: 'Audit-ready flows with evidence trails' },
];

const valuePillars = [
  {
    title: 'Automation with safeguards',
    description:
      'AI-first workflows with approvals, rollbacks, and transparent scoring so humans stay in control.',
    icon: 'verified',
  },
  {
    title: 'Evidence-backed delivery',
    description:
      'Audit-matrix gates, performance budgets, and status evidence wired in—no more “trust me” launches.',
    icon: 'rule',
  },
  {
    title: 'Human-centered AI',
    description:
      'Assistive by default, accessible by design, with rationale surfacing so AI is never a black box.',
    icon: 'support_agent',
  },
];

const flowHighlights = [
  {
    title: 'Lead → Deal acceleration (Flow-005/006)',
    description: 'Capture, score, and convert with governed AI scoring, nudges, and approvals.',
    icon: 'bolt',
  },
  {
    title: 'Pipeline clarity (Flow-007/008)',
    description: 'Kanban, forecasting, and playbooks with SLA timers and measurable outcomes.',
    icon: 'insights',
  },
  {
    title: 'Service intelligence (Flow-011/012)',
    description: 'Intent routing, SLA-aware timers, and audit-friendly transcripts for every ticket.',
    icon: 'support',
  },
];

const howItWorks = [
  {
    title: 'Model the flow',
    description: 'Pick from sitemap-aligned templates tied to flows and DoD; tweak copy, add GTM tags.',
    icon: 'account_tree',
  },
  {
    title: 'Wire guardrails',
    description: 'Enable audit-matrix gates, WCAG patterns, performance budgets, and telemetry hooks.',
    icon: 'shield_lock',
  },
  {
    title: 'Ship with evidence',
    description: 'Emit attestation, hashes, and Lighthouse ≥90 proof so approvals are deterministic.',
    icon: 'task_alt',
  },
];

const socialProof = ['Voltstack', 'Northbeam', 'Dataplane', 'Astera', 'Driftline', 'RelayOps'];

const securityChecklist = [
  'WCAG 2.1 AA defaults: semantics, focus-visible, aria labels, dark-mode contrast',
  'Audit-matrix gates: typecheck, build, enforced coverage thresholds, lint, and security scans',
  'Zero-trust posture: least-privilege patterns, observable execution, no inline secrets',
];

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

export default function PublicHomePage() {
  return (
    <main id="main-content" className="bg-[#0f172a] text-slate-50">
      <section aria-labelledby="hero-heading" className="relative overflow-hidden py-16 lg:py-24">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#0d1b2a] to-[#0b1f37]" />
        <div className="absolute -left-40 top-10 h-80 w-80 rounded-full bg-[#137fec]/30 blur-3xl opacity-60" />
        <div className="absolute right-0 bottom-0 h-96 w-96 rounded-full bg-indigo-500/30 blur-3xl opacity-50" />

        <div className="container relative z-10 px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-center">
            <div className="flex-1 space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-[#7cc4ff] font-medium backdrop-blur">
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  auto_awesome
                </span>
                AI-first CRM with evidence-first delivery
              </div>

              <h1 id="hero-heading" className="text-4xl lg:text-5xl font-bold leading-tight text-white">
                Move faster, stay governed. Ship AI-first customer journeys without losing control.
              </h1>
              <p className="text-lg text-slate-200 max-w-3xl">
                Design flows once and launch with guardrails: audit-matrix gates, WCAG defaults,
                performance budgets, and live evidence to unblock approvals.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <Link
                  href="/sign-up"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#137fec] text-white font-semibold hover:bg-[#0e6ac7] transition-colors focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-[#0f172a]"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    rocket_launch
                  </span>
                  Start free trial
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-white/30 text-white font-semibold hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-[#0f172a]"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    forum
                  </span>
                  Talk to sales
                </Link>
              </div>

              <div className="flex flex-wrap gap-3 text-sm text-slate-200">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/10">
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    bolt
                  </span>
                  AI playbooks with approvals
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/10">
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    check_circle
                  </span>
                  Audit-matrix ready
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/10">
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    visibility
                  </span>
                  Accessible by design
                </span>
              </div>
            </div>

            <div className="flex-1">
              <Card className="relative overflow-hidden border border-white/10 bg-white/5 backdrop-blur p-6 rounded-2xl shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-[#137fec]/5 to-indigo-500/5" />
                <div className="relative space-y-4 text-slate-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg text-[#7cc4ff]" aria-hidden="true">
                        dashboard_customize
                      </span>
                      <p className="text-sm text-slate-300">Command Center</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-[#137fec]/20 text-[#7cc4ff]">
                      Live
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {heroStats.map((stat) => (
                      <div
                        key={stat.label}
                        data-testid="hero-stat"
                        className="p-3 rounded-xl bg-white/5 border border-white/10"
                      >
                        <p className="text-xs text-slate-300 mb-1">{stat.label}</p>
                        <p className="text-xl font-bold text-white">{stat.value}</p>
                        <p className="text-xs text-slate-400">{stat.helper}</p>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-200">
                      <span className="material-symbols-outlined text-base text-[#7cc4ff]" aria-hidden="true">
                        shield_person
                      </span>
                      Live governance health
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-300">
                      <span>WCAG AA checks</span>
                      <span className="font-semibold text-[#7cc4ff]">Passing</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-300">
                      <span>Audit gates</span>
                      <span className="font-semibold text-[#7cc4ff]">Ready</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-300">
                      <span>LCP budget</span>
                      <span className="font-semibold text-[#7cc4ff]">&lt;1.8s target</span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-10">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-4">Trusted by teams shipping faster</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-slate-500 text-sm">
            {socialProof.map((name) => (
              <div key={name} className="px-3 py-2 rounded-lg bg-slate-50 text-center border border-slate-100">
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="pillars-heading" className="py-16 lg:py-24 bg-slate-50 text-slate-900">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl space-y-10">
          <div className="max-w-3xl space-y-3">
            <h2 id="pillars-heading" className="text-3xl lg:text-4xl font-bold">
              Built for teams that need speed without losing control
            </h2>
            <p className="text-base text-slate-600">
              Guardrailed automation, evidence-led releases, and human-first AI ensure every release
              is observable, auditable, and accessible.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {valuePillars.map((pillar) => (
              <Card
                key={pillar.title}
                data-testid="value-pillar"
                className="p-6 h-full border border-border-light bg-white hover:border-[#137fec] transition-colors shadow-sm"
              >
                <div className="w-12 h-12 rounded-lg bg-[#137fec]/10 flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-2xl text-[#137fec]" aria-hidden="true">
                    {pillar.icon}
                  </span>
                </div>
                <h3 className="text-xl font-semibold mb-2 text-slate-900">{pillar.title}</h3>
                <p className="text-sm text-slate-600">{pillar.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="flows-heading" className="py-16 lg:py-24 bg-white text-slate-900">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl space-y-8">
          <div className="max-w-3xl space-y-2">
            <h2 id="flows-heading" className="text-3xl font-bold">
              Flows mapped to your sprint tracker
            </h2>
            <p className="text-base text-slate-600">
              Launch production-ready experiences faster with predefined flows linked to the sitemap
              and audit-matrix so your team stays aligned on outcomes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {flowHighlights.map((flow) => (
              <Card
                key={flow.title}
                data-testid="flow-card"
                className="p-6 h-full border border-border-light bg-slate-50 hover:border-[#137fec] transition-colors shadow-sm"
              >
                <div className="w-12 h-12 rounded-lg bg-[#137fec]/10 flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-2xl text-[#137fec]" aria-hidden="true">
                    {flow.icon}
                  </span>
                </div>
                <h3 className="text-lg font-semibold mb-2 text-slate-900">{flow.title}</h3>
                <p className="text-sm text-slate-600">{flow.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-slate-900 text-white">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl space-y-10">
          <div className="max-w-3xl space-y-3">
            <h2 className="text-3xl lg:text-4xl font-bold">How it works</h2>
            <p className="text-base text-slate-200">Go from idea to audited launch without losing momentum.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {howItWorks.map((step, index) => (
              <Card
                key={step.title}
                className="p-6 h-full border border-white/10 bg-white/5 backdrop-blur shadow-lg"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-full bg-[#137fec]/20 flex items-center justify-center text-white font-semibold">
                    {index + 1}
                  </div>
                  <span className="material-symbols-outlined text-[#7cc4ff]" aria-hidden="true">
                    {step.icon}
                  </span>
                </div>
                <h3 className="text-lg font-semibold mb-2 text-white">{step.title}</h3>
                <p className="text-sm text-slate-200">{step.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="assurance-heading" className="py-16 lg:py-24 bg-white text-slate-900">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl space-y-8">
          <div className="max-w-3xl space-y-2">
            <h2 id="assurance-heading" className="text-3xl font-bold">
              Security, accessibility, and reliability by default
            </h2>
            <p className="text-base text-slate-600">
              Aligns with IntelliFlow&apos;s constitution and audit-matrix so every release is
              observable, compliant, and ready for production.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {securityChecklist.map((item) => (
              <Card key={item} className="p-6 border border-border-light bg-slate-50">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[#137fec]" aria-hidden="true">
                    shield_person
                  </span>
                  <p className="text-sm text-slate-700">{item}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section
        data-testid="cta-section"
        aria-labelledby="cta-heading"
        className="py-16 lg:py-24 bg-gradient-to-r from-[#137fec] to-[#0e6ac7]"
      >
        <div className="container px-4 lg:px-6 mx-auto max-w-5xl text-center space-y-6 text-white">
          <h2 id="cta-heading" className="text-3xl lg:text-4xl font-bold">
            Ready to launch AI-first, governed experiences in days?
          </h2>
          <p className="text-lg text-white/90">
            Keep automation guardrails, accessibility, and performance budgets in one place from
            day one.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-white text-[#137fec] font-semibold rounded-lg hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#137fec]"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                trending_up
              </span>
              Begin your trial
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 px-8 py-3 border border-white text-white font-semibold rounded-lg hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#137fec]"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                forum
              </span>
              Book a call with sales
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
