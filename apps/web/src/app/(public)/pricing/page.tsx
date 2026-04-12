'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button, cn } from '@intelliflow/ui';
import pricingData from '@/data/pricing-data.json';
import { PlanCard } from '@/components/billing/plan-card';
import { PlanComparisonTable, PlanFaq } from '@/components/billing/plan-comparison-table';

export default function PricingPage() {
  const [billing, setBilling] = React.useState<'monthly' | 'annual'>('annual');

  return (
    <>
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-white to-[#f6f7f8] dark:from-[#1e2936] dark:to-[#101922] py-16 lg:py-24">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              Simple, Transparent Pricing
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 mb-8">
              Choose the perfect plan for your team. All plans include a 14-day free trial.
            </p>

            {/* Billing Toggle */}
            <div className="inline-flex items-center gap-4 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                className={cn(
                  'px-4 py-2 rounded-md transition-all font-medium text-sm',
                  billing === 'monthly'
                    ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                )}
                onClick={() => setBilling('monthly')}
              >
                Monthly
              </button>
              <button
                className={cn(
                  'px-4 py-2 rounded-md transition-all font-medium text-sm flex items-center gap-2',
                  billing === 'annual'
                    ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                )}
                onClick={() => setBilling('annual')}
              >
                Annual{' '}
                <span className="text-xs bg-[#10b981] text-white px-2 py-0.5 rounded">
                  Save 17%
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Grid */}
      <section className="py-16 lg:py-24">
        <div className="container px-4 lg:px-6 mx-auto max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {pricingData.tiers.map((tier) => {
              const price = billing === 'monthly' ? tier.price.monthly : tier.price.annual;
              const isCustom = !!tier.price.custom;

              return (
                <PlanCard
                  key={tier.id}
                  variant="public"
                  name={tier.name}
                  description={tier.description}
                  icon={tier.icon}
                  price={isCustom ? (tier.price.label ?? 'Contact Sales') : `£${price}`}
                  priceSubtext={!isCustom && billing === 'annual' ? 'Billed annually' : undefined}
                  features={tier.features}
                  cta={tier.cta}
                  ctaLink={tier.ctaLink}
                  isPopular={tier.mostPopular}
                  isCustom={isCustom}
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-16 lg:py-24 bg-slate-50 dark:bg-slate-900">
        <div className="container px-4 lg:px-6 mx-auto max-w-7xl">
          <PlanComparisonTable />
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 lg:py-24">
        <div className="container px-4 lg:px-6 mx-auto">
          <PlanFaq />
        </div>
      </section>

      {/* CTA Section */}
      <section
        data-testid="cta-section"
        className="py-16 lg:py-24 bg-linear-to-r from-ds-primary to-ds-primary-hover"
      >
        <div className="container px-4 lg:px-6 mx-auto max-w-4xl text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
            Ready to Transform Your Sales?
          </h2>
          <p className="text-lg text-white/90 mb-8">
            Join modern sales teams using IntelliFlow CRM. Start your free 14-day trial today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              asChild
              size="lg"
              className="bg-white text-ds-primary hover:bg-white/80 min-w-50"
            >
              <Link href="/signup">Start Free Trial</Link>
            </Button>
            <Button
              asChild
              size="lg"
              className="border-white text-white hover:bg-white/40 min-w-50"
            >
              <Link href="/contact">Contact Sales</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
