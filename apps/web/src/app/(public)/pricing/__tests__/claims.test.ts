import { describe, it, expect } from 'vitest';
import pricingData from '@/data/pricing-data.json';

/**
 * Owner ruling 2026-10-07: the pricing page claims nothing the product or the
 * Terms of Service cannot back. Each case below was a published claim with no
 * evidence behind it:
 *
 * - a 99.9% uptime SLA: only an internal SLO target exists
 *   (docs/operations/slo-definitions.md), with no contract or service credits;
 * - iOS and Android apps: the repo has no mobile app;
 * - a 30-day money-back guarantee: the Terms of Service promise no refund.
 */
describe('pricing claims', () => {
  const text = JSON.stringify(pricingData);

  it.each([
    ['an uptime percentage guarantee', /\d{2}(\.\d+)?%\s*(SLA|uptime)/i],
    ['an SLA guarantee', /SLA guarantee/i],
    ['mobile apps', /mobile apps?|iOS|Android/i],
    ['a money-back guarantee', /money[- ]back|no questions asked|moneyBackGuarantee/i],
  ])('makes no %s claim', (_label, pattern) => {
    expect(text).not.toMatch(pattern);
  });

  it('answers the refund question with what the Terms of Service say', () => {
    const refund = pricingData.faqs.find((f) => /refund/i.test(f.question));
    expect(refund?.answer).toMatch(/cancelling stops future renewals/);
    expect(refund?.answer).toContain('legal@leangency.com');
  });
});
