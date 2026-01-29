import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import securityData from '@/data/security-features.json';

/**
 * Security Page
 *
 * Public-facing security page for IntelliFlow CRM.
 * Displays security features, certifications, and compliance information.
 *
 * Task: PG-008
 * Performance targets:
 * - Response time: <200ms (p95)
 * - Lighthouse score: >=90
 */

export const metadata: Metadata = {
  title: 'Security | IntelliFlow CRM',
  description:
    'Enterprise-grade security with ISO 27001, SOC 2 Type II, and GDPR compliance. Zero-trust architecture, end-to-end encryption, and comprehensive audit logging.',
  openGraph: {
    title: 'Security | IntelliFlow CRM',
    description:
      'Enterprise-grade security protecting your data with industry-leading practices and certifications.',
    url: 'https://intelliflow-crm.com/security',
    siteName: 'IntelliFlow CRM',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Security | IntelliFlow CRM',
    description:
      'Enterprise-grade security with ISO 27001, SOC 2, and GDPR compliance.',
  },
};

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    'Data Protection': '#137fec',
    'Architecture': '#8b5cf6',
    'Compliance': '#10b981',
    'Access Control': '#f59e0b',
    'Security Operations': '#ef4444',
    'AI Safety': '#06b6d4',
  };
  return colors[category] || '#6b7280';
}

export default function SecurityPage() {
  const { hero, certifications, securityFeatures, trustCenter, securityContact } = securityData;

  // Group features by category
  const featuresByCategory = securityFeatures.reduce(
    (acc, feature) => {
      if (!acc[feature.category]) {
        acc[feature.category] = [];
      }
      acc[feature.category].push(feature);
      return acc;
    },
    {} as Record<string, typeof securityFeatures>
  );

  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#0d1b2a] to-[#0b1f37] py-16 lg:py-24">
        <div className="absolute -left-40 top-10 h-80 w-80 rounded-full bg-[#137fec]/20 blur-3xl opacity-50" />
        <div className="absolute right-0 bottom-0 h-96 w-96 rounded-full bg-green-500/20 blur-3xl opacity-40" />

        <div className="container relative z-10 px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-emerald-400 font-medium backdrop-blur mb-6">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                verified_user
              </span>
              Security & Compliance
            </div>

            <h1 className="text-4xl lg:text-5xl font-bold text-white mb-6">{hero.title}</h1>

            <p className="text-lg text-slate-200 max-w-2xl mx-auto mb-8">{hero.subtitle}</p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href={trustCenter.url}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg
                  bg-emerald-500 text-white font-semibold hover:bg-emerald-600
                  transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400
                  focus:ring-offset-2 focus:ring-offset-[#0f172a]"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  shield
                </span>
                Visit Trust Center
              </Link>
              <a
                href={`mailto:${securityContact.email}`}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg
                  border border-white/30 text-white font-semibold hover:bg-white/10
                  transition-colors focus:outline-none focus:ring-2 focus:ring-white
                  focus:ring-offset-2 focus:ring-offset-[#0f172a]"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  mail
                </span>
                Security Inquiries
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Certifications */}
      <section className="py-12 lg:py-16 bg-white dark:bg-slate-800">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
              Certifications & Compliance
            </h2>
            <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              We maintain rigorous compliance with industry standards and regulations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {certifications.map((cert) => (
              <Card
                key={cert.id}
                className="p-6 text-center border-2 border-emerald-500/20 bg-gradient-to-br from-white to-emerald-50/50 dark:from-slate-800 dark:to-emerald-900/20"
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-3xl text-emerald-600" aria-hidden="true">
                    {cert.icon}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{cert.name}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{cert.description}</p>
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-500/10 text-emerald-600 text-sm font-medium rounded-full">
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    check_circle
                  </span>
                  {cert.status}
                </span>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Security Features by Category */}
      <section className="py-16 lg:py-20 bg-slate-50 dark:bg-slate-900">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
              Security Features
            </h2>
            <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Comprehensive security controls protecting your data at every layer.
            </p>
          </div>

          <div className="space-y-16">
            {Object.entries(featuresByCategory).map(([category, features]) => (
              <div key={category}>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-8 flex items-center gap-3">
                  <span
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${getCategoryColor(category)}15` }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ color: getCategoryColor(category) }}
                      aria-hidden="true"
                    >
                      {category === 'Data Protection'
                        ? 'lock'
                        : category === 'Architecture'
                          ? 'architecture'
                          : category === 'Compliance'
                            ? 'gavel'
                            : category === 'Access Control'
                              ? 'key'
                              : category === 'Security Operations'
                                ? 'shield'
                                : 'smart_toy'}
                    </span>
                  </span>
                  {category}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {features.map((feature) => (
                    <Card
                      key={feature.id}
                      className="p-6 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-500 hover:shadow-md transition-all"
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${getCategoryColor(feature.category)}15` }}
                        >
                          <span
                            className="material-symbols-outlined"
                            style={{ color: getCategoryColor(feature.category) }}
                            aria-hidden="true"
                          >
                            {feature.icon}
                          </span>
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-slate-900 dark:text-white mb-2">
                            {feature.title}
                          </h4>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                            {feature.description}
                          </p>
                          <ul className="space-y-1">
                            {feature.highlights.map((highlight, index) => (
                              <li
                                key={index}
                                className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
                              >
                                <span
                                  className="material-symbols-outlined text-sm text-emerald-500"
                                  aria-hidden="true"
                                >
                                  check
                                </span>
                                {highlight}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Center & Documents */}
      <section className="py-16 lg:py-20 bg-white dark:bg-slate-800">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
              {trustCenter.title}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              {trustCenter.description}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {trustCenter.documents.map((doc, index) => (
              <Card
                key={index}
                className="p-6 text-center border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:border-[#137fec] hover:shadow-md transition-all"
              >
                <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-[#137fec]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#137fec]" aria-hidden="true">
                    {doc.type === 'PDF' ? 'picture_as_pdf' : 'request_quote'}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{doc.name}</h3>
                <Link
                  href={doc.url}
                  className="inline-flex items-center gap-1 text-[#137fec] text-sm font-medium hover:underline"
                >
                  {doc.type === 'PDF' ? 'Download' : 'Request Access'}
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    {doc.type === 'PDF' ? 'download' : 'arrow_forward'}
                  </span>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Security Contact & Bug Bounty */}
      <section className="py-16 lg:py-20 bg-gradient-to-r from-emerald-600 to-emerald-700">
        <div className="container px-4 lg:px-6 mx-auto max-w-5xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-white">
            {/* Responsible Disclosure */}
            <div className="text-center md:text-left">
              <h2 className="text-2xl font-bold mb-4">Responsible Disclosure</h2>
              <p className="text-white/90 mb-4">
                Found a security vulnerability? We appreciate your help in keeping IntelliFlow CRM
                safe. Please report security issues through our bug bounty program.
              </p>
              <a
                href={securityContact.bugBounty}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white
                  text-emerald-700 font-semibold rounded-lg hover:bg-slate-100
                  transition-colors focus:outline-none focus:ring-2 focus:ring-white
                  focus:ring-offset-2 focus:ring-offset-emerald-600"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  bug_report
                </span>
                Bug Bounty Program
              </a>
            </div>

            {/* Security Contact */}
            <div className="text-center md:text-left">
              <h2 className="text-2xl font-bold mb-4">Security Team</h2>
              <p className="text-white/90 mb-4">
                For security questions, compliance inquiries, or to request security documentation:
              </p>
              <div className="space-y-2">
                <p className="flex items-center gap-2 justify-center md:justify-start">
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    mail
                  </span>
                  <a href={`mailto:${securityContact.email}`} className="hover:underline">
                    {securityContact.email}
                  </a>
                </p>
                <p className="flex items-center gap-2 justify-center md:justify-start">
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    key
                  </span>
                  <a
                    href={securityContact.pgpKey}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    PGP Key (security.txt)
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
