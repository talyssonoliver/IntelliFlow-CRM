import { describe, it, expect } from 'vitest';
import landingPagesData from '@/data/landing-pages.json';

/** The campaign pages carry only what the product backs today. */
describe('campaign page content', () => {
  const pages = Object.values(landingPagesData.pages);

  it('keeps the three campaign slugs the sitemap and ads point at', () => {
    expect(Object.keys(landingPagesData.pages).sort()).toEqual(['ai-crm', 'enterprise', 'startup']);
  });

  it('shows no customer logos or testimonials', () => {
    for (const page of pages) {
      const types = page.sections.map((s) => s.type);
      expect(types).not.toContain('logo-cloud');
      expect(types).not.toContain('testimonials');
    }
  });

  it('claims no invented metric, certification, free plan or price', () => {
    const text = JSON.stringify(landingPagesData.pages).toLowerCase();
    for (const claim of [
      '%',
      'soc 2',
      'iso 27001',
      'certified',
      '24/7',
      'customers',
      'thousands',
      '1,000+',
      '500+',
      'forever',
      '$',
      'unlimited users',
      'zapier',
      '/demo',
    ]) {
      expect(text, claim).not.toContain(claim);
    }
  });

  it('uses only the facts the landing page states for its numbers', () => {
    for (const page of pages) {
      const stats = page.sections.find((s) => s.type === 'stats') as
        | { stats: Array<{ value: string }> }
        | undefined;
      for (const { value } of stats?.stats ?? []) {
        expect(['15', '6', '212']).toContain(value);
      }
    }
  });

  it('carries no old brand name', () => {
    expect(JSON.stringify(landingPagesData)).not.toMatch(/IntelliFlow/);
  });
});
