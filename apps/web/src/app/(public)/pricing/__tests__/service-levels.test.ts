import { describe, it, expect } from 'vitest';
import pricingData from '@/data/pricing-data.json';

/**
 * Pricing promises only what is run today: support is by email, with no phone line,
 * response-time commitment or named account manager, and regions or deployments that
 * do not exist yet are marked planned.
 */
type Row = Record<'name' | 'starter' | 'professional' | 'enterprise' | 'custom', unknown>;
const categories = pricingData.comparisonFeatures as Array<{ category: string; features: Row[] }>;
const rows = (): Row[] => categories.flatMap((c) => c.features);

const allText = JSON.stringify({
  tiers: pricingData.tiers,
  comparisonFeatures: pricingData.comparisonFeatures,
});

describe('pricing service levels', () => {
  it('says in the FAQ that support is by email and nothing more is offered yet', () => {
    const faq = pricingData.faqs.find((q) => q.question === "What's included in support?");
    expect(faq?.answer).toMatch(/support by email/);
    expect(faq?.answer).toMatch(/not offered yet/);
    expect(faq?.answer).not.toContain('SLA');
    expect(faq?.answer.toLowerCase()).not.toContain('dedicated account manager');
    expect(faq?.answer.toLowerCase()).not.toContain('-hour');
  });

  it('offers no nonprofit or education discount', () => {
    const faqText = JSON.stringify(pricingData.faqs).toLowerCase();
    expect(faqText).not.toContain('nonprofit');
    expect(faqText).not.toContain('20%');
  });

  it('promises no phone support, response time, SLA or account manager in plans or the table', () => {
    expect(allText).not.toMatch(/phone/i);
    expect(allText.toLowerCase()).not.toContain('hour');
    expect(allText).not.toContain('4h ');
    expect(allText).not.toMatch(/\bSLA\b/);
    expect(allText).not.toMatch(/account manager/i);
    expect(allText).not.toMatch(/white-glove/i);
  });

  it('marks regions and deployments that do not run yet as planned', () => {
    const features = pricingData.tiers.flatMap((t) => t.features);
    for (const f of features.filter((x) =>
      /region|residency|on-premise|dedicated infrastructure|white-label|model training|API access|explainability dashboard/i.test(
        x
      )
    )) {
      expect(f, f).toMatch(/\(planned\)/);
    }
    const residency = rows().find((r) => r.name === 'Data Residency');
    expect(residency?.custom).toBe('Planned');
  });

  it('keeps support to email on every plan', () => {
    const support = categories.find((c) => c.category === 'Support & Services');
    const channel = support?.features.find((r) => r.name === 'Support Channel');
    expect([channel?.starter, channel?.professional, channel?.enterprise]).toEqual([
      'Email',
      'Email',
      'Email',
    ]);
    expect(support?.features.map((r) => r.name)).not.toContain('Response Time');
  });
});
