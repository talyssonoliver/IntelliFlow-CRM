import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import partnerData from '@/data/partner-benefits.json';

/**
 * Partners Page
 *
 * Public-facing partners page for IntelliFlow CRM.
 * Showcases integration partners, partnership benefits, and application process.
 *
 * Performance targets:
 * - Response time: <200ms (p95)
 * - Lighthouse score: ≥90
 * - Logos displayed correctly
 */

export const metadata: Metadata = {
  title: 'Partner with IntelliFlow CRM | Technology & Business Partners',
  description:
    'Join our partner ecosystem. Integrate your solution, resell IntelliFlow CRM, or become a certified consultant. API access, co-marketing, and revenue share programs available.',
  openGraph: {
    title: 'Partner with IntelliFlow CRM',
    description:
      'Technology integrations, reseller programs, and consultant certifications. Build with our API, earn revenue share, and grow your business.',
    url: 'https://intelliflow-crm.com/partners',
    siteName: 'IntelliFlow CRM',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Partner with IntelliFlow CRM',
    description:
      'Join our ecosystem: Technology partners, resellers, and certified consultants. API access and revenue share programs.',
  },
};

export default function PartnersPage() {
  const { partners, benefits, integration_categories, faqs } = partnerData;

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#0d1b2a] to-[#0b1f37] py-16 lg:py-24">
        <div className="absolute -left-40 top-10 h-80 w-80 rounded-full bg-[#137fec]/20 blur-3xl opacity-50" />
        <div className="absolute right-0 bottom-0 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl opacity-40" />

        <div className="container relative z-10 px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-[#7cc4ff] font-medium backdrop-blur mb-6">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                handshake
              </span>
              Partner Ecosystem
            </div>

            <h1 className="text-4xl lg:text-5xl font-bold text-white mb-6">
              Build, Sell, Grow with IntelliFlow CRM
            </h1>

            <p className="text-lg text-slate-200 max-w-2xl mx-auto mb-8">
              Join our partner ecosystem to integrate your technology, resell our platform, or become a
              certified consultant. We provide the tools, support, and revenue opportunities you need to succeed.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg
                  bg-[#137fec] text-white font-semibold hover:bg-[#0e6ac7]
                  transition-colors focus:outline-none focus:ring-2 focus:ring-[#7cc4ff]
                  focus:ring-offset-2 focus:ring-offset-[#0f172a]"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  send
                </span>
                Become a Partner
              </Link>
              <Link
                href="#benefits"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg
                  border border-white/30 text-white font-semibold hover:bg-white/10
                  transition-colors focus:outline-none focus:ring-2 focus:ring-[#7cc4ff]
                  focus:ring-offset-2 focus:ring-offset-[#0f172a]"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  info
                </span>
                Learn More
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Integration Partners Grid */}
      <section className="py-16 lg:py-20 bg-white dark:bg-slate-800">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
              Integration Partners
            </h2>
            <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              IntelliFlow CRM integrates seamlessly with the tools your team already uses.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {partners.map((partner) => (
              <Card
                key={partner.id}
                className="p-6 flex items-center justify-center border border-slate-200
                  dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:border-[#137fec]
                  hover:shadow-md transition-all group"
              >
                <div className="text-center">
                  <div
                    className="w-16 h-16 mx-auto mb-2 rounded-lg bg-slate-200 dark:bg-slate-800
                      flex items-center justify-center text-slate-600 dark:text-slate-400
                      group-hover:text-[#137fec] transition-colors"
                  >
                    <span className="font-semibold text-xs">{partner.name}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{partner.category}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Integration Categories */}
      <section className="py-16 lg:py-20 bg-slate-50 dark:bg-slate-900">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
              Integration Ecosystem
            </h2>
            <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Connect IntelliFlow CRM with your existing tech stack across all categories.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {integration_categories.map((category) => (
              <Card
                key={category.id}
                className="p-6 border border-slate-200 dark:border-slate-700 bg-white
                  dark:bg-slate-800 hover:border-[#137fec] hover:shadow-md transition-all"
              >
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${category.color}15` }}
                >
                  <span
                    className="material-symbols-outlined text-2xl"
                    style={{ color: category.color }}
                    aria-hidden="true"
                  >
                    {category.icon}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  {category.name}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {category.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Partnership Benefits */}
      <section id="benefits" className="py-16 lg:py-24 bg-white dark:bg-slate-800">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
              Partnership Benefits
            </h2>
            <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Choose the partnership type that fits your business model and goals.
            </p>
          </div>

          <div className="space-y-16">
            {/* Technology Partners */}
            <div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-8 flex items-center gap-3">
                <span
                  className="w-10 h-10 rounded-lg bg-[#137fec]/10 flex items-center justify-center"
                >
                  <span className="material-symbols-outlined text-[#137fec]" aria-hidden="true">
                    integration_instructions
                  </span>
                </span>
                Technology Partners
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {benefits.technology.map((benefit, index) => (
                  <Card
                    key={index}
                    className="p-6 border border-slate-200 dark:border-slate-700 bg-slate-50
                      dark:bg-slate-900"
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className="w-12 h-12 rounded-lg bg-[#137fec]/10 flex items-center
                          justify-center flex-shrink-0"
                      >
                        <span className="material-symbols-outlined text-[#137fec]" aria-hidden="true">
                          {benefit.icon}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900 dark:text-white mb-2">
                          {benefit.title}
                        </h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {benefit.description}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Resellers */}
            <div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-8 flex items-center gap-3">
                <span
                  className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center"
                >
                  <span className="material-symbols-outlined text-green-600" aria-hidden="true">
                    storefront
                  </span>
                </span>
                Reseller Partners
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {benefits.reseller.map((benefit, index) => (
                  <Card
                    key={index}
                    className="p-6 border border-slate-200 dark:border-slate-700 bg-slate-50
                      dark:bg-slate-900"
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center
                          justify-center flex-shrink-0"
                      >
                        <span className="material-symbols-outlined text-green-600" aria-hidden="true">
                          {benefit.icon}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900 dark:text-white mb-2">
                          {benefit.title}
                        </h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {benefit.description}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Consultants */}
            <div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-8 flex items-center gap-3">
                <span
                  className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center"
                >
                  <span className="material-symbols-outlined text-indigo-600" aria-hidden="true">
                    psychology
                  </span>
                </span>
                Consultant Partners
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {benefits.consultant.map((benefit, index) => (
                  <Card
                    key={index}
                    className="p-6 border border-slate-200 dark:border-slate-700 bg-slate-50
                      dark:bg-slate-900"
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className="w-12 h-12 rounded-lg bg-indigo-500/10 flex items-center
                          justify-center flex-shrink-0"
                      >
                        <span className="material-symbols-outlined text-indigo-600" aria-hidden="true">
                          {benefit.icon}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900 dark:text-white mb-2">
                          {benefit.title}
                        </h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {benefit.description}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-20 bg-gradient-to-r from-[#137fec] to-[#0e6ac7]">
        <div className="container px-4 lg:px-6 mx-auto max-w-5xl text-center space-y-6 text-white">
          <h2 className="text-3xl lg:text-4xl font-bold">
            Ready to Partner with IntelliFlow CRM?
          </h2>
          <p className="text-lg text-white/90 max-w-2xl mx-auto">
            Join hundreds of technology partners, resellers, and consultants building successful
            businesses with our platform.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-white
                text-[#137fec] font-semibold rounded-lg hover:bg-slate-100
                transition-colors focus:outline-none focus:ring-2 focus:ring-white
                focus:ring-offset-2 focus:ring-offset-[#137fec]"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                send
              </span>
              Apply Now
            </Link>
            <Link
              href="#faq"
              className="inline-flex items-center justify-center gap-2 px-8 py-3 border
                border-white text-white font-semibold rounded-lg hover:bg-white/10
                transition-colors focus:outline-none focus:ring-2 focus:ring-white
                focus:ring-offset-2 focus:ring-offset-[#137fec]"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                help
              </span>
              View FAQ
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-16 lg:py-20 bg-slate-50 dark:bg-slate-900">
        <div className="container px-4 lg:px-6 mx-auto max-w-4xl">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-8 text-center">
            Frequently Asked Questions
          </h2>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <details
                key={index}
                className="group bg-white dark:bg-slate-800 rounded-lg border border-slate-200
                  dark:border-slate-700"
              >
                <summary
                  className="flex items-center justify-between p-6 cursor-pointer
                    hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors rounded-lg"
                >
                  <span className="font-semibold text-slate-900 dark:text-white pr-4">
                    {faq.question}
                  </span>
                  <span
                    className="material-symbols-outlined text-slate-500 dark:text-slate-400
                      group-open:rotate-180 transition-transform flex-shrink-0"
                    aria-hidden="true"
                  >
                    expand_more
                  </span>
                </summary>
                <div className="px-6 pb-6 text-slate-600 dark:text-slate-400">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
