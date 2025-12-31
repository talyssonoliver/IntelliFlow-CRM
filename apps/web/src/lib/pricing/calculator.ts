/**
 * Pricing Calculator Utilities
 *
 * Provides functions for calculating prices, discounts, and formatting
 * for the pricing page.
 */

interface PricingTier {
  id: string;
  name: string;
  description: string;
  price: {
    monthly: number | null;
    annual: number | null;
    custom?: boolean;
    label?: string;
  };
  features: string[];
  cta: string;
  ctaLink: string;
  mostPopular: boolean;
  icon: string;
}

interface PriceCalculation {
  pricePerUser: number;
  totalMonthly: number;
  totalAnnual?: number;
  savings?: number;
}

/**
 * Calculate price for a given tier, user count, and billing frequency
 */
export function calculatePrice(
  tier: PricingTier,
  userCount: number,
  billing: 'monthly' | 'annual'
): PriceCalculation {
  const basePrice = billing === 'monthly' ? tier.price.monthly : tier.price.annual;

  if (!basePrice || basePrice === 0) {
    return {
      pricePerUser: 0,
      totalMonthly: 0,
    };
  }

  const totalMonthly = basePrice * userCount;

  if (billing === 'annual') {
    const totalAnnual = totalMonthly * 12;
    const monthlyEquivalent = (tier.price.monthly || 0) * userCount * 12;
    const savings = monthlyEquivalent - totalAnnual;

    return {
      pricePerUser: basePrice,
      totalMonthly,
      totalAnnual,
      savings,
    };
  }

  return {
    pricePerUser: basePrice,
    totalMonthly,
  };
}

/**
 * Format currency value to GBP string
 */
export function formatCurrency(amount: number, currency: string = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Stripe Price IDs (mock for MVP)
 */
const stripePriceIds = {
  starter_monthly: 'price_starter_monthly',
  starter_annual: 'price_starter_annual',
  professional_monthly: 'price_professional_monthly',
  professional_annual: 'price_professional_annual',
  enterprise_monthly: 'price_enterprise_monthly',
  enterprise_annual: 'price_enterprise_annual',
};

/**
 * Get Stripe price ID for a tier and billing frequency
 */
export function getStripePriceId(tier: string, billing: 'monthly' | 'annual'): string {
  const key = `${tier}_${billing}` as keyof typeof stripePriceIds;
  return stripePriceIds[key] || '';
}

/**
 * Redirect to checkout (mock for MVP - redirects to sign-up)
 */
export async function redirectToCheckout(tier: string, billing: 'monthly' | 'annual', userCount: number) {
  const params = new URLSearchParams({
    plan: tier,
    billing,
    users: userCount.toString(),
  });

  if (typeof window !== 'undefined') {
    window.location.href = `/sign-up?${params}`;
  }
}
