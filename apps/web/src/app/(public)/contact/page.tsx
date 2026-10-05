import type { Metadata } from 'next';
import { ContactForm } from '@/components/shared/contact-form';
import { OG_IMAGES } from '@/lib/og-images';
import './contact.css';

/**
 * Contact, in the Aurora design: how to reach the team, what happens next,
 * the contact form, and the questions people ask before they get in touch.
 */

export const metadata: Metadata = {
  title: 'Contact us',
  description:
    "Get in touch with the Aurora team. We're here to answer your questions about our AI-powered CRM.",
  openGraph: {
    images: OG_IMAGES,
    title: 'Contact Aurora',
    description:
      'Have questions about Aurora? Our team is ready to help you discover how our AI-powered platform can transform your sales process.',
    url: 'https://intelliflow-crm.com/contact',
    siteName: 'Aurora',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Contact Aurora',
    description:
      'Get in touch with our team to learn how Aurora can streamline your customer relationships.',
  },
  alternates: {
    canonical: '/contact',
  },
};

const EXPECT = [
  'Personalised demo tailored to your needs',
  'No commitment or credit card required',
  'Direct access to our product experts',
  'Custom pricing based on your team size',
];

const FAQS: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: 'How quickly can we get started?',
    a: 'Most teams are up and running within 48 hours. We provide guided onboarding, data migration support, and training to ensure a smooth transition.',
  },
  {
    q: 'Do you offer a free trial?',
    a: 'Yes! We offer a 14-day free trial with full access to all features. No credit card required. Contact us to get started.',
  },
  {
    q: 'Can Aurora connect to the tools we already use?',
    a: 'Yes. Aurora connects to Gmail, Outlook, Slack, Microsoft Teams, Stripe and PayPal, and your team can sign in with Google or Microsoft. A TypeScript SDK is in beta for custom work.',
  },
  {
    q: 'Is my data secure?',
    a: "No AI action goes out without a person's approval. Each workspace's data is kept apart, multi-factor sign-in is available on every account, and every change is written to an audit log.",
  },
];

export default function ContactPage() {
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'crm@leangency.com';

  return (
    <div className="aurora-contact">
      <section className="as-hero">
        <div className="as-wrap">
          <p className="as-eyebrow">Contact</p>
          <h1 className="as-h1">Get in touch</h1>
          <p className="as-lede">
            Have questions about Aurora? Want to see a demo? Our team is ready to help you discover
            how our AI-powered platform can transform your sales process.
          </p>
        </div>
      </section>

      <section className="ac-body" aria-label="Contact details and form">
        <div className="as-wrap ac-grid">
          <div className="ac-info">
            <h2 className="as-h2 ac-h2">Let&apos;s talk</h2>
            <p className="ac-intro">
              Fill out the form and our team will get back to you within 24 hours. You can also
              reach us through the channels below.
            </p>

            <ul className="ac-methods">
              <li>
                <span className="material-symbols-outlined ac-tile" aria-hidden="true">
                  mail
                </span>
                <div>
                  <h3>Email</h3>
                  <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
                </div>
              </li>
              <li>
                <span className="material-symbols-outlined ac-tile" aria-hidden="true">
                  schedule
                </span>
                <div>
                  <h3>Response time</h3>
                  <p>We typically respond within 24 hours during business days</p>
                </div>
              </li>
              <li>
                <span className="material-symbols-outlined ac-tile" aria-hidden="true">
                  chat
                </span>
                <div>
                  <h3>Live support</h3>
                  <p>Monday - Friday, 9:00 AM - 6:00 PM EST</p>
                </div>
              </li>
            </ul>

            <div className="as-card ac-expect">
              <h3>What to expect</h3>
              <ul>
                {EXPECT.map((item) => (
                  <li key={item}>
                    <span className="material-symbols-outlined" aria-hidden="true">
                      check_circle
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="as-card ac-form">
            <ContactForm />
          </div>
        </div>
      </section>

      <section className="as-section" aria-labelledby="contact-faq">
        <div className="as-wrap ac-faq">
          <h2 id="contact-faq" className="as-h2 ac-center">
            Frequently asked questions
          </h2>
          <div className="as-faq-list">
            {FAQS.map(({ q, a }) => (
              <details key={q} className="as-card as-faq-item">
                <summary>
                  {q}
                  <span className="material-symbols-outlined" aria-hidden="true">
                    expand_more
                  </span>
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
