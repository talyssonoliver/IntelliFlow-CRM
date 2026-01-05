'use client';

/**
 * Pricing Calculator Component
 *
 * Interactive calculator for the pricing page that allows users to
 * calculate costs based on user count and billing frequency.
 */

import { useState } from 'react';
import { calculatePrice, formatCurrency, redirectToCheckout } from '../../lib/pricing/calculator';

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

interface PricingCalculatorProps {
  tiers: PricingTier[];
}

export function PricingCalculator({ tiers }: PricingCalculatorProps) {
  const [userCount, setUserCount] = useState(5);
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');

  const handleCheckout = async (tier: PricingTier) => {
    if (tier.price.custom) {
      window.location.href = '/contact?ref=pricing';
      return;
    }

    await redirectToCheckout(tier.id, billing, userCount);
  };

  return (
    <div className="pricing-calculator">
      {/* User Count Slider */}
      <div className="calculator-controls mb-8">
        <div className="flex items-center justify-between mb-4">
          <label htmlFor="user-count" className="text-sm font-medium">
            Number of Users
          </label>
          <span className="text-lg font-semibold">{userCount}</span>
        </div>
        <input
          id="user-count"
          type="range"
          min="1"
          max="100"
          value={userCount}
          onChange={(e) => setUserCount(parseInt(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Billing Toggle */}
      <div className="billing-toggle mb-8 flex items-center justify-center gap-4">
        <button
          onClick={() => setBilling('monthly')}
          className={`px-4 py-2 rounded ${
            billing === 'monthly' ? 'bg-blue-600 text-white' : 'bg-gray-200'
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setBilling('annual')}
          className={`px-4 py-2 rounded ${
            billing === 'annual' ? 'bg-blue-600 text-white' : 'bg-gray-200'
          }`}
        >
          Annual <span className="text-xs">(Save 20%)</span>
        </button>
      </div>

      {/* Pricing Cards */}
      <div className="pricing-grid grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map((tier) => {
          const calculation = calculatePrice(tier, userCount, billing);

          return (
            <div
              key={tier.id}
              className={`pricing-card border rounded-lg p-6 ${
                tier.mostPopular ? 'border-blue-600 shadow-lg' : 'border-gray-200'
              }`}
            >
              {tier.mostPopular && (
                <div className="text-xs font-semibold text-blue-600 mb-2">MOST POPULAR</div>
              )}

              <h3 className="text-xl font-bold mb-2">{tier.name}</h3>
              <p className="text-sm text-gray-600 mb-4">{tier.description}</p>

              <div className="price mb-6">
                {tier.price.custom ? (
                  <div className="text-2xl font-bold">{tier.price.label || 'Custom'}</div>
                ) : (
                  <>
                    <div className="text-3xl font-bold">
                      {formatCurrency(calculation.pricePerUser)}
                      <span className="text-sm text-gray-600">/user/mo</span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      Total: {formatCurrency(calculation.totalMonthly)}/mo
                    </div>
                    {calculation.savings && calculation.savings > 0 && (
                      <div className="text-xs text-green-600 mt-1">
                        Save {formatCurrency(calculation.savings)}/year
                      </div>
                    )}
                  </>
                )}
              </div>

              <button
                onClick={() => handleCheckout(tier)}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 mb-4"
              >
                {tier.cta}
              </button>

              <ul className="features text-sm space-y-2">
                {tier.features.map((feature, index) => (
                  <li key={index} className="flex items-start">
                    <span className="mr-2">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
