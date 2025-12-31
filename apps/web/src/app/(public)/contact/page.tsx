import type { Metadata } from 'next';
import { ContactForm } from '@/components/shared/contact-form';

/**
 * Contact Page
 *
 * Public-facing contact page for IntelliFlow CRM.
 * Includes contact form with email submission, validation, and spam prevention.
 *
 * Performance targets:
 * - Response time: <200ms (p95)
 * - Lighthouse score: ≥90
 * - First Contentful Paint: <1s
 */

export const metadata: Metadata = {
  title: 'Contact Us | IntelliFlow CRM',
  description:
    'Get in touch with the IntelliFlow CRM team. We\'re here to answer your questions about our AI-powered CRM solution.',
  openGraph: {
    title: 'Contact IntelliFlow CRM',
    description:
      'Have questions about IntelliFlow CRM? Our team is ready to help you discover how our AI-powered platform can transform your sales process.',
    url: 'https://intelliflow-crm.com/contact',
    siteName: 'IntelliFlow CRM',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Contact IntelliFlow CRM',
    description:
      'Get in touch with our team to learn how IntelliFlow CRM can streamline your customer relationships.',
  },
};

export default function ContactPage() {
  return (
    <main id="main-content" className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#0d1b2a] to-[#0b1f37] py-16 lg:py-20">
        <div className="absolute -left-40 top-10 h-80 w-80 rounded-full bg-[#137fec]/20 blur-3xl opacity-50" />
        <div className="absolute right-0 bottom-0 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl opacity-40" />

        <div className="container relative z-10 px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-[#7cc4ff] font-medium backdrop-blur mb-6">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                forum
              </span>
              We're here to help
            </div>

            <h1 className="text-4xl lg:text-5xl font-bold text-white mb-6">
              Get in Touch
            </h1>

            <p className="text-lg text-slate-200 max-w-2xl mx-auto">
              Have questions about IntelliFlow CRM? Want to see a demo? Our team is ready to help you discover
              how our AI-powered platform can transform your sales process.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className="py-16 lg:py-24">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Contact Info */}
            <div className="space-y-8">
              <div>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                  Let's Talk
                </h2>
                <p className="text-slate-600 dark:text-slate-400">
                  Fill out the form and our team will get back to you within 24 hours. You can also reach
                  us through the channels below.
                </p>
              </div>

              {/* Contact Methods */}
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-[#137fec]/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[#137fec]" aria-hidden="true">
                      mail
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Email</h3>
                    <a
                      href="mailto:contact@intelliflow-crm.com"
                      className="text-[#137fec] hover:underline"
                    >
                      contact@intelliflow-crm.com
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-[#137fec]/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[#137fec]" aria-hidden="true">
                      schedule
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Response Time</h3>
                    <p className="text-slate-600 dark:text-slate-400">
                      We typically respond within 24 hours during business days
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-[#137fec]/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[#137fec]" aria-hidden="true">
                      chat
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Live Support</h3>
                    <p className="text-slate-600 dark:text-slate-400">
                      Monday - Friday, 9:00 AM - 6:00 PM EST
                    </p>
                  </div>
                </div>
              </div>

              {/* Benefits Card */}
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                  What to Expect
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-[#137fec] text-lg mt-0.5" aria-hidden="true">
                      check_circle
                    </span>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      Personalized demo tailored to your needs
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-[#137fec] text-lg mt-0.5" aria-hidden="true">
                      check_circle
                    </span>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      No commitment or credit card required
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-[#137fec] text-lg mt-0.5" aria-hidden="true">
                      check_circle
                    </span>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      Direct access to our product experts
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-[#137fec] text-lg mt-0.5" aria-hidden="true">
                      check_circle
                    </span>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      Custom pricing based on your team size
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Contact Form */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
              <ContactForm />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 lg:py-20 bg-white dark:bg-slate-800">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-8 text-center">
              Frequently Asked Questions
            </h2>

            <div className="space-y-6">
              <details className="group">
                <summary className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    How quickly can we get started?
                  </span>
                  <span className="material-symbols-outlined text-slate-500 group-open:rotate-180 transition-transform" aria-hidden="true">
                    expand_more
                  </span>
                </summary>
                <div className="p-4 text-slate-600 dark:text-slate-400">
                  Most teams are up and running within 48 hours. We provide guided onboarding,
                  data migration support, and training to ensure a smooth transition.
                </div>
              </details>

              <details className="group">
                <summary className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Do you offer a free trial?
                  </span>
                  <span className="material-symbols-outlined text-slate-500 group-open:rotate-180 transition-transform" aria-hidden="true">
                    expand_more
                  </span>
                </summary>
                <div className="p-4 text-slate-600 dark:text-slate-400">
                  Yes! We offer a 14-day free trial with full access to all features. No credit card
                  required. Contact us to get started.
                </div>
              </details>

              <details className="group">
                <summary className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Can IntelliFlow CRM integrate with our existing tools?
                  </span>
                  <span className="material-symbols-outlined text-slate-500 group-open:rotate-180 transition-transform" aria-hidden="true">
                    expand_more
                  </span>
                </summary>
                <div className="p-4 text-slate-600 dark:text-slate-400">
                  Absolutely. We integrate with popular tools like Slack, Gmail, Google Calendar,
                  and many others. We also provide a REST API for custom integrations.
                </div>
              </details>

              <details className="group">
                <summary className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Is my data secure?
                  </span>
                  <span className="material-symbols-outlined text-slate-500 group-open:rotate-180 transition-transform" aria-hidden="true">
                    expand_more
                  </span>
                </summary>
                <div className="p-4 text-slate-600 dark:text-slate-400">
                  Security is our top priority. We use enterprise-grade encryption, SOC 2 compliance,
                  and follow best practices for data protection. Your data is always yours.
                </div>
              </details>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
