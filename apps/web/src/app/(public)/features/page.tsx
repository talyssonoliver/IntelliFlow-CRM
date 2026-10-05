import * as React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import featuresData from '@/data/features-content.json';
import { OG_IMAGES } from '@/lib/og-images';
import './features.css';

/**
 * Features, in the Aurora design. Every feature and claim comes from
 * data/features-content.json, which only holds what the product does today.
 * The product tour anchors on the `data-tour` attributes.
 */

export const metadata: Metadata = {
  title: 'Features',
  description:
    'What Aurora does: AI agents that score leads and draft follow-ups for your approval, one approval queue, your pipeline, cases, email and calendar, six connectors and security on from day one.',
  openGraph: {
    images: OG_IMAGES,
    title: 'Aurora features: agents that do the work, with you in charge',
    description:
      'Lead scoring, drafted follow-ups, one approval queue, pipeline, cases, email and calendar, and six connectors.',
    url: 'https://intelliflow-crm.com/features',
    siteName: 'Aurora',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aurora features: agents that do the work, with you in charge',
    description:
      'Lead scoring, drafted follow-ups, one approval queue, pipeline, cases and six connectors. 14-day free trial.',
  },
  alternates: {
    canonical: '/features',
  },
};

export default function FeaturesPage() {
  return (
    <div className="aurora-features">
      <section className="as-hero" data-tour="hero">
        <div className="as-wrap">
          <p className="as-eyebrow">Features</p>
          <h1 className="as-h1">Everything Aurora does, with you in charge.</h1>
          <p className="as-lede">
            AI agents prepare the work across your leads, deals and cases. You approve every step.
          </p>
          <p className="afe-chip">
            <span className="material-symbols-outlined" aria-hidden="true">
              apps
            </span>
            <span>212 product screens</span>
          </p>
        </div>
      </section>

      {featuresData.categories.map((category) => (
        <section key={category.id} className="afe-category" aria-labelledby={`cat-${category.id}`}>
          <div className="as-wrap">
            <div className="afe-head">
              <span className="material-symbols-outlined afe-head-icon" aria-hidden="true">
                {category.icon}
              </span>
              <div>
                <h2 id={`cat-${category.id}`} className="as-h2 afe-h2">
                  {category.name}
                </h2>
                <p>{category.description}</p>
              </div>
            </div>
            <ul className="afe-grid">
              {category.features.map((feature) => (
                <li key={feature.id} className="as-card afe-card" data-tour={feature.id}>
                  <span className="material-symbols-outlined afe-icon" aria-hidden="true">
                    {feature.icon}
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                  <ul className="afe-benefits">
                    {feature.benefits.map((benefit) => (
                      <li key={benefit}>
                        <span className="material-symbols-outlined" aria-hidden="true">
                          check_circle
                        </span>
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={feature.learnMoreUrl}
                    className="afe-more"
                    aria-label={`Learn more about ${feature.title}`}
                  >
                    <span>Learn more</span>
                    <span className="material-symbols-outlined" aria-hidden="true">
                      arrow_forward
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section className="afe-category" data-testid="cta-section" aria-labelledby="features-close">
        <div className="as-wrap">
          <div className="afe-close">
            <div className="afe-close-art" aria-hidden="true">
              <img src="/brand/aurora/bg/ribbon-right.webp" alt="" />
            </div>
            <h2 id="features-close">See it on your own pipeline.</h2>
            <p>14 days free · No credit card · Every AI action waits for your yes</p>
            <div className="afe-close-cta">
              <Link href="/signup" className="as-btn as-btn-primary">
                Start free
              </Link>
              <Link href="/pricing" className="as-btn as-btn-onDark">
                See pricing
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
