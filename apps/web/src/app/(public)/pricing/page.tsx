'use client';

import * as React from 'react';
import Link from 'next/link';
import pricingData from '@/data/pricing-data.json';
import './pricing.css';

type Billing = 'monthly' | 'annual';
type Cell = string | boolean | null;

const { tiers, comparisonFeatures, faqs, metadata } = pricingData;
const TIER_IDS = tiers.map((t) => t.id) as ReadonlyArray<string>;

/** A comparison cell: a tick, a dash, or the plan's own value. */
function CellValue({ value }: { value: Cell }) {
  if (value === true) {
    return (
      <span className="material-symbols-outlined ap-yes" aria-label="Included">
        check
      </span>
    );
  }
  if (value === false || value === null) {
    return (
      <span className="ap-no" aria-label="Not included">
        –
      </span>
    );
  }
  return <>{value}</>;
}

/** The line under a price: how it is billed. */
function billedNote(custom: boolean, billing: Billing): string {
  if (custom) return 'Priced to your team';
  return billing === 'annual' ? 'Billed annually' : 'Billed monthly';
}

/**
 * Pricing, in the Aurora design. Every price, feature and answer comes from
 * data/pricing-data.json, the same source the billing pages read.
 */
export default function PricingPage() {
  const [billing, setBilling] = React.useState<Billing>('annual');

  return (
    <div className="aurora-pricing">
      <section className="as-hero">
        <div className="as-wrap">
          <p className="as-eyebrow">Pricing</p>
          <h1 className="as-h1">Start free. Pick a plan when you are ready.</h1>
          <p className="as-lede">
            Every plan starts with a {metadata.freeTrialDays}-day free trial, no credit card needed.
            Prices are per user, in pounds, before VAT.
          </p>

          <fieldset className="ap-toggle">
            <legend className="sr-only">Billing period</legend>
            <button
              type="button"
              aria-pressed={billing === 'monthly'}
              onClick={() => setBilling('monthly')}
            >
              Monthly
            </button>
            <button
              type="button"
              aria-pressed={billing === 'annual'}
              onClick={() => setBilling('annual')}
            >
              Annual <span className="ap-save">Save {metadata.annualDiscountPercent}%</span>
            </button>
          </fieldset>
        </div>
      </section>

      <section className="ap-plans-section" aria-label="Plans">
        <div className="as-wrap ap-plans">
          {tiers.map((tier) => {
            const custom = 'custom' in tier.price && !!tier.price.custom;
            const price = billing === 'monthly' ? tier.price.monthly : tier.price.annual;
            return (
              <article
                key={tier.id}
                className={`as-card ap-plan${tier.mostPopular ? ' ap-popular' : ''}`}
                aria-labelledby={`plan-${tier.id}`}
              >
                {tier.mostPopular && <p className="ap-badge">Most popular</p>}
                <span className="material-symbols-outlined ap-plan-icon" aria-hidden="true">
                  {tier.icon}
                </span>
                <h2 id={`plan-${tier.id}`} className="ap-plan-name">
                  {tier.name}
                </h2>
                <p className="ap-plan-desc">{tier.description}</p>
                <p className="ap-price">
                  {custom ? (
                    <b className="ap-price-label">
                      {'label' in tier.price ? tier.price.label : 'Contact Sales'}
                    </b>
                  ) : (
                    <>
                      <b>£{price}</b>
                      <span>/user/month</span>
                    </>
                  )}
                </p>
                <p className="ap-billed">{billedNote(custom, billing)}</p>
                <Link
                  href={tier.ctaLink}
                  className={`as-btn ${tier.mostPopular ? 'as-btn-primary' : 'as-btn-secondary'} ap-cta`}
                >
                  {tier.cta}
                </Link>
                <ul className="ap-features">
                  {tier.features.map((feature) => (
                    <li key={feature}>
                      <span className="material-symbols-outlined" aria-hidden="true">
                        check_circle
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <section className="as-section" aria-labelledby="compare-heading">
        <div className="as-wrap">
          <h2 id="compare-heading" className="as-h2 ap-center">
            Compare the plans
          </h2>
          <div className="as-card ap-table-card">
            <div className="ap-table-scroll" tabIndex={0} aria-label="Plan comparison">
              <table className="ap-table">
                <thead>
                  <tr>
                    <th scope="col">Feature</th>
                    {tiers.map((t) => (
                      <th scope="col" key={t.id}>
                        {t.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                {comparisonFeatures.map((group) => (
                  <tbody key={group.category}>
                    <tr className="ap-group">
                      <th scope="colgroup" colSpan={TIER_IDS.length + 1}>
                        {group.category}
                      </th>
                    </tr>
                    {group.features.map((feature) => (
                      <tr key={feature.name}>
                        <th scope="row">{feature.name}</th>
                        {TIER_IDS.map((id) => (
                          <td key={id}>
                            <CellValue value={(feature as Record<string, Cell>)[id] ?? null} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="as-section ap-faq-section" aria-labelledby="faq-heading">
        <div className="as-wrap ap-faq">
          <h2 id="faq-heading" className="as-h2 ap-center">
            Questions about pricing
          </h2>
          <div className="as-faq-list">
            {faqs.map((faq) => (
              <details key={faq.question} className="as-card as-faq-item">
                <summary>
                  {faq.question}
                  <span className="material-symbols-outlined" aria-hidden="true">
                    expand_more
                  </span>
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="ap-close" data-testid="cta-section" aria-labelledby="close-heading">
        <div className="as-wrap">
          <div className="ap-close-panel">
            <div className="ap-close-art" aria-hidden="true">
              <img src="/brand/aurora/bg/ribbon-right.webp" alt="" />
            </div>
            <h2 id="close-heading">Your first week with Aurora is free.</h2>
            <p>
              {metadata.freeTrialDays} days free · No credit card · Every AI action waits for your
              yes
            </p>
            <div className="ap-close-cta">
              <Link href="/signup" className="as-btn as-btn-primary">
                Start free
              </Link>
              <Link href="/contact" className="as-btn as-btn-onDark">
                Talk to us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
