import { describe, it, expect } from 'vitest';
import pricingData from '@/data/pricing-data.json';

/**
 * Data Validation Tests for Pricing Content
 *
 * Ensures pricing-data.json maintains correct structure
 * and has all required fields for the Pricing page.
 */

describe('Pricing Content Data', () => {
  describe('Metadata', () => {
    it('should have valid metadata', () => {
      expect(pricingData.metadata).toBeDefined();
      expect(pricingData.metadata.currency).toBe('GBP');
      expect(pricingData.metadata.currencySymbol).toBe('£');
      expect(pricingData.metadata.annualDiscountPercent).toBe(17);
      expect(pricingData.metadata.freeTrialDays).toBe(14);
    });

    it('should have a last updated timestamp', () => {
      expect(pricingData.metadata.lastUpdated).toBeDefined();
      expect(typeof pricingData.metadata.lastUpdated).toBe('string');
    });
  });

  describe('Pricing Tiers Structure', () => {
    it('should have exactly 4 pricing tiers', () => {
      expect(pricingData.tiers).toHaveLength(4);
    });

    it('should have required tier fields', () => {
      pricingData.tiers.forEach(tier => {
        expect(tier.id).toBeDefined();
        expect(tier.name).toBeDefined();
        expect(tier.description).toBeDefined();
        expect(tier.price).toBeDefined();
        expect(tier.features).toBeDefined();
        expect(tier.cta).toBeDefined();
        expect(tier.ctaLink).toBeDefined();
        expect(tier.icon).toBeDefined();
        expect(Array.isArray(tier.features)).toBe(true);
      });
    });

    it('should have unique tier IDs', () => {
      const ids = pricingData.tiers.map(t => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have the expected tier names', () => {
      const tierNames = pricingData.tiers.map(t => t.name);
      expect(tierNames).toContain('Starter');
      expect(tierNames).toContain('Professional');
      expect(tierNames).toContain('Enterprise');
      expect(tierNames).toContain('Custom');
    });

    it('should have exactly one "Most Popular" tier', () => {
      const popularTiers = pricingData.tiers.filter(t => t.mostPopular);
      expect(popularTiers).toHaveLength(1);
      expect(popularTiers[0].name).toBe('Professional');
    });
  });

  describe('Pricing Values', () => {
    it('should have valid monthly prices for paid tiers', () => {
      const paidTiers = pricingData.tiers.filter(t => !t.price.custom);

      paidTiers.forEach(tier => {
        expect(tier.price.monthly).toBeGreaterThan(0);
        expect(typeof tier.price.monthly).toBe('number');
      });
    });

    it('should have annual discount of approximately 17% for all paid tiers', () => {
      const paidTiers = pricingData.tiers.filter(t => !t.price.custom);

      paidTiers.forEach(tier => {
        if (tier.price.monthly && tier.price.annual) {
          const discount = 1 - (tier.price.annual / tier.price.monthly);
          const discountPercent = discount * 100;
          // Allow ±1% for rounding (17% target)
          expect(discountPercent).toBeGreaterThanOrEqual(16);
          expect(discountPercent).toBeLessThanOrEqual(18);
        }
      });
    });

    it('should have custom pricing for Custom tier', () => {
      const customTier = pricingData.tiers.find(t => t.id === 'custom');
      expect(customTier).toBeDefined();
      expect(customTier!.price.custom).toBe(true);
      expect(customTier!.price.label).toBe('Contact Sales');
    });
  });

  describe('Features Structure', () => {
    it('should have at least 5 features per tier', () => {
      pricingData.tiers.forEach(tier => {
        expect(tier.features.length).toBeGreaterThanOrEqual(5);
      });
    });

    it('should have non-empty feature descriptions', () => {
      pricingData.tiers.forEach(tier => {
        tier.features.forEach(feature => {
          expect(feature.trim().length).toBeGreaterThan(0);
        });
      });
    });

    it('should have valid CTA links', () => {
      pricingData.tiers.forEach(tier => {
        expect(tier.ctaLink).toMatch(/^\/(sign-up|contact)/);
      });
    });
  });

  describe('Comparison Features', () => {
    it('should have comparison features defined', () => {
      expect(pricingData.comparisonFeatures).toBeDefined();
      expect(pricingData.comparisonFeatures.length).toBeGreaterThan(0);
    });

    it('should have at least 3 feature categories', () => {
      expect(pricingData.comparisonFeatures.length).toBeGreaterThanOrEqual(3);
    });

    it('should have required fields for each comparison feature', () => {
      pricingData.comparisonFeatures.forEach(category => {
        expect(category.category).toBeDefined();
        expect(category.features).toBeDefined();
        expect(Array.isArray(category.features)).toBe(true);

        category.features.forEach(feature => {
          expect(feature.name).toBeDefined();
          expect(feature.starter).toBeDefined();
          expect(feature.professional).toBeDefined();
          expect(feature.enterprise).toBeDefined();
          expect(feature.custom).toBeDefined();
        });
      });
    });
  });

  describe('FAQs Structure', () => {
    it('should have at least 8 FAQs', () => {
      expect(pricingData.faqs.length).toBeGreaterThanOrEqual(8);
    });

    it('should have question and answer for each FAQ', () => {
      pricingData.faqs.forEach(faq => {
        expect(faq.question).toBeDefined();
        expect(faq.answer).toBeDefined();
        expect(faq.question.length).toBeGreaterThan(0);
        expect(faq.answer.length).toBeGreaterThan(0);
      });
    });

    it('should have descriptive answers (min 50 chars)', () => {
      pricingData.faqs.forEach(faq => {
        expect(faq.answer.length).toBeGreaterThan(50);
      });
    });
  });

  describe('Icon Names', () => {
    it('should use valid Material Symbols icon names', () => {
      const validIconPattern = /^[a-z_]+$/;

      pricingData.tiers.forEach(tier => {
        expect(tier.icon).toMatch(validIconPattern);
      });
    });
  });
});
