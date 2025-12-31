import { describe, it, expect } from 'vitest';
import { calculatePrice, formatCurrency, getStripePriceId } from '../calculator';
import pricingData from '@/data/pricing-data.json';

/**
 * Pricing Calculator Logic Tests
 *
 * Tests the pricing calculation utilities to ensure
 * correct price calculations, discounts, and formatting.
 */

describe('Pricing Calculator', () => {
  const starterTier = pricingData.tiers.find(t => t.id === 'starter')!;
  const professionalTier = pricingData.tiers.find(t => t.id === 'professional')!;

  describe('calculatePrice', () => {
    it('should calculate monthly price correctly', () => {
      const result = calculatePrice(starterTier, 5, 'monthly');

      expect(result.pricePerUser).toBe(29);
      expect(result.totalMonthly).toBe(145); // 29 * 5
      expect(result.totalAnnual).toBeUndefined();
      expect(result.savings).toBeUndefined();
    });

    it('should calculate annual price with 17% discount', () => {
      const result = calculatePrice(starterTier, 5, 'annual');

      expect(result.pricePerUser).toBe(24); // 29 * 0.83 ≈ 24
      expect(result.totalMonthly).toBe(120); // 24 * 5
      expect(result.totalAnnual).toBe(1440); // 120 * 12
    });

    it('should calculate savings correctly for annual billing', () => {
      const result = calculatePrice(starterTier, 5, 'annual');

      const monthlyTotal = 29 * 5 * 12; // 1740
      const annualTotal = result.totalAnnual || 0; // 1440
      const expectedSavings = monthlyTotal - annualTotal; // 300

      expect(result.savings).toBe(expectedSavings);
    });

    it('should handle multiple users correctly', () => {
      const result = calculatePrice(professionalTier, 10, 'monthly');

      expect(result.pricePerUser).toBe(79);
      expect(result.totalMonthly).toBe(790); // 79 * 10
    });

    it('should handle 1 user correctly', () => {
      const result = calculatePrice(starterTier, 1, 'monthly');

      expect(result.pricePerUser).toBe(29);
      expect(result.totalMonthly).toBe(29);
    });

    it('should handle 100+ users correctly', () => {
      const result = calculatePrice(professionalTier, 150, 'annual');

      expect(result.pricePerUser).toBe(65);
      expect(result.totalMonthly).toBe(9750); // 65 * 150
      expect(result.totalAnnual).toBe(117000); // 9750 * 12
    });

    it('should return zero for custom tier (no fixed price)', () => {
      const customTier = pricingData.tiers.find(t => t.id === 'custom')!;
      const result = calculatePrice(customTier, 10, 'monthly');

      expect(result.pricePerUser).toBe(0);
      expect(result.totalMonthly).toBe(0);
    });
  });

  describe('formatCurrency', () => {
    it('should format GBP correctly', () => {
      expect(formatCurrency(29, 'GBP')).toBe('£29');
      expect(formatCurrency(1000, 'GBP')).toBe('£1,000');
      expect(formatCurrency(1234567, 'GBP')).toBe('£1,234,567');
    });

    it('should handle decimals correctly (round to nearest)', () => {
      expect(formatCurrency(29.5, 'GBP')).toBe('£30');
      expect(formatCurrency(29.4, 'GBP')).toBe('£29');
    });

    it('should default to GBP when currency not specified', () => {
      expect(formatCurrency(100)).toBe('£100');
    });

    it('should handle zero correctly', () => {
      expect(formatCurrency(0, 'GBP')).toBe('£0');
    });

    it('should handle negative numbers correctly', () => {
      expect(formatCurrency(-50, 'GBP')).toBe('-£50');
    });
  });

  describe('getStripePriceId', () => {
    it('should return correct price ID for starter monthly', () => {
      const priceId = getStripePriceId('starter', 'monthly');
      expect(priceId).toBe('price_starter_monthly');
    });

    it('should return correct price ID for professional annual', () => {
      const priceId = getStripePriceId('professional', 'annual');
      expect(priceId).toBe('price_professional_annual');
    });

    it('should return correct price ID for enterprise monthly', () => {
      const priceId = getStripePriceId('enterprise', 'monthly');
      expect(priceId).toBe('price_enterprise_monthly');
    });

    it('should handle all tier and billing combinations', () => {
      const tiers = ['starter', 'professional', 'enterprise'];
      const billings: Array<'monthly' | 'annual'> = ['monthly', 'annual'];

      tiers.forEach(tier => {
        billings.forEach(billing => {
          const priceId = getStripePriceId(tier, billing);
          expect(priceId).toBe(`price_${tier}_${billing}`);
        });
      });
    });
  });

  describe('Price Calculation Edge Cases', () => {
    it('should handle very large user counts', () => {
      const result = calculatePrice(professionalTier, 1000, 'annual');

      expect(result.totalMonthly).toBe(65000); // 65 * 1000
      expect(result.totalAnnual).toBe(780000); // 65000 * 12
    });

    it('should maintain precision for small decimals', () => {
      // Annual price should be exactly 83% of monthly
      const monthlyPrice = starterTier.price.monthly!;
      const annualPrice = starterTier.price.annual!;

      const ratio = annualPrice / monthlyPrice;
      expect(ratio).toBeCloseTo(0.83, 2);
    });
  });
});
