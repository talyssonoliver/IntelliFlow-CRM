import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTROLS } from './controls';
import './security.css';

/**
 * Security, in the Aurora design. Every control listed here is one the product
 * has today; nothing is claimed that the code does not back (no certifications,
 * no third-party audits, no figures).
 */

export const metadata: Metadata = {
  title: 'Security',
  description:
    "Aurora's security, on from day one: no AI action goes out without a person's approval, each workspace's data is kept apart, multi-factor sign-in is available on every account and every change is logged.",
  openGraph: {
    title: 'Aurora security: on from day one',
    description:
      "No AI action goes out without a person's approval. Each workspace's data is kept apart and every change is logged.",
    url: 'https://intelliflow-crm.com/security',
    siteName: 'Aurora',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aurora security: on from day one',
    description:
      "No AI action goes out without a person's approval. Each workspace's data is kept apart and every change is logged.",
  },
  alternates: {
    canonical: '/security',
  },
};

export default function SecurityPage() {
  return (
    <div className="aurora-security">
      <section className="asec-hero">
        <div className="asec-art" aria-hidden="true">
          <img src="/brand/aurora/bg/ribbon-left.webp" alt="" className="left" />
          <img src="/brand/aurora/bg/ribbon-right.webp" alt="" className="right" />
        </div>
        <div className="as-wrap asec-hero-inner">
          <p className="as-eyebrow asec-eyebrow">Security</p>
          <h1 className="as-h1 asec-h1">Enterprise security, on from day one.</h1>
          <p className="as-lede asec-lede">
            No AI action goes out without a person&apos;s approval. Each workspace&apos;s data is
            kept apart, multi-factor sign-in is available on every account, and every change is
            logged.
          </p>
        </div>
      </section>

      {CONTROLS.map(({ group, items }) => (
        <section key={group} className="asec-group" aria-labelledby={`g-${slug(group)}`}>
          <div className="as-wrap">
            <h2 id={`g-${slug(group)}`} className="as-h2 asec-h2">
              {group}
            </h2>
            <ul className="asec-grid">
              {items.map(({ icon, title, body }) => (
                <li key={title} className="as-card asec-card">
                  <span className="material-symbols-outlined asec-icon" aria-hidden="true">
                    {icon}
                  </span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section className="asec-close" aria-labelledby="security-questions">
        <div className="as-wrap">
          <div className="as-card asec-close-card">
            <h2 id="security-questions">Questions about security?</h2>
            <p>
              Ask us anything about how Aurora handles your data, or report a security concern, and
              the people who build it will answer.
            </p>
            <div className="asec-close-cta">
              <Link href="/contact" className="as-btn as-btn-primary">
                Talk to us
              </Link>
              <Link href="/privacy" className="as-btn as-btn-secondary">
                Privacy policy
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
