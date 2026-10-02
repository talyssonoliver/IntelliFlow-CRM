import type { CSSProperties } from 'react';
import Link from 'next/link';
import './pricing-section.css';

/** Pricing: an invitation to start free, never a barrier. Plans come later, on real data. */
export function PricingSection() {
  return (
    <section
      className="pricing aurora-pricing"
      id="pricing"
      data-bridge-section
      style={{ '--bridge-accent': 'var(--blue)' } as CSSProperties}
    >
      <div className="wrap">
        <div className="price-card reveal" data-reveal>
          <div className="price-copy">
            <p className="eyebrow">Pricing</p>
            <h2>Start free. Bring your pipeline in today.</h2>
            <p className="section-lede">
              Try Aurora free for 14 days. No credit card. Import your leads and deals, let the
              agents get to work, and choose a plan once you&apos;ve seen it run on your own data.
            </p>
            <ul className="trial-facts" aria-label="Your trial">
              <li>
                <span className="material-symbols-outlined">event_available</span>14 days free
              </li>
              <li>
                <span className="material-symbols-outlined">credit_card_off</span>No credit card
              </li>
              <li>
                <span className="material-symbols-outlined">upload</span>Your own data from day one
              </li>
            </ul>
            <div className="cta-row">
              <Link href="/signup" className="btn btn-primary">
                Start free
              </Link>
              <Link href="/contact" className="btn btn-secondary">
                Talk to us
              </Link>
            </div>
          </div>

          <ul className="includes">
            <li>
              <span className="material-symbols-outlined">check</span>15 AI agent types
            </li>
            <li>
              <span className="material-symbols-outlined">check</span>Approval queue and audit log
            </li>
            <li>
              <span className="material-symbols-outlined">check</span>Pipeline, leads and accounts
            </li>
            <li>
              <span className="material-symbols-outlined">check</span>Cases, tickets and SLAs
            </li>
            <li>
              <span className="material-symbols-outlined">check</span>Insights hub
            </li>
            <li>
              <span className="material-symbols-outlined">check</span>Gmail, Outlook, Slack and
              Teams
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
