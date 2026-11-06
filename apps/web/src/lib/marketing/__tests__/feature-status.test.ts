import { describe, it, expect } from 'vitest';
import pricingData from '@/data/pricing-data.json';
import featuresContent from '@/data/features-content.json';
import { featureIcon, isPlannedFeature } from '../feature-status';

describe('feature status', () => {
  it.each([
    'Workflow automation (planned)',
    'Multi-step workflows, planned',
    'More planned',
    'Webhooks planned',
    'API keys coming soon',
  ])('treats "%s" as not built yet', (text) => {
    expect(isPlannedFeature(text)).toBe(true);
    expect(featureIcon(text)).toBe('schedule');
  });

  it.each(['Your own mailbox', 'TypeScript SDK in beta', 'Priority support (4h response)'])(
    'keeps the tick on "%s"',
    (text) => {
      expect(isPlannedFeature(text)).toBe(false);
      expect(featureIcon(text)).toBe('check_circle');
    }
  );

  it('marks the planned lines the public pages show today', () => {
    const professional = pricingData.tiers.find((tier) => tier.id === 'professional');
    expect(professional?.features.filter(isPlannedFeature)).toEqual([
      'Workflow automation (planned)',
    ]);
    expect(JSON.stringify(featuresContent).match(/, planned"/g)?.length).toBe(3);
  });
});
