'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button, Card } from '@intelliflow/ui';
import { cn } from '@intelliflow/ui';
import pricingData from '@/data/pricing-data.json';
import { calculatePrice, formatCurrency } from '@/lib/pricing/calculator';

export default function PricingPage() {
  const [billing, setBilling] = React.useState<'monthly' | 'annual'>('annual');
  const [openFaq, setOpenFaq] = React.useState<number | null>(null);

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
                Annual
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

              return (
                <Card
                  key={tier.id}
                  className={cn(
                    'relative p-8 flex flex-col',
                    tier.mostPopular
                      ? 'border-[#137fec] border-2 shadow-xl'
                      : 'hover:border-[#137fec] hover:shadow-lg transition-all'
                  )}
                >
                  {/* Most Popular Badge */}
                  {tier.mostPopular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="bg-[#10b981] text-white px-4 py-1 rounded-full text-sm font-medium">
                        Most Popular
                      </span>
                    </div>
                  )}

                  {/* Icon */}
                  <div className="w-12 h-12 bg-[#137fec]/10 dark:bg-[#137fec]/20 rounded-lg flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-2xl text-[#137fec]">
                      {tier.icon}
                    </span>
                  </div>

                  {/* Tier Name */}
                  <h3 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">
                    {tier.name}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                    {tier.description}
                  </p>

                  {/* Price */}
                  <div className="mb-6">
                    {tier.price.custom ? (
                      <div className="text-3xl font-bold text-slate-900 dark:text-white">
                        {tier.price.label}
                      </div>
                    ) : (
                      <>
                        <div className="text-4xl font-bold text-slate-900 dark:text-white">
                          £{price}
                          <span className="text-lg text-slate-600 dark:text-slate-400">
                            /user/mo
                          </span>
                        </div>
                        {billing === 'annual' && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            Billed annually
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Features List */}
                  <ul className="space-y-3 mb-8 flex-1">
                    {tier.features.map((feature, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400"
                      >
                        <span className="material-symbols-outlined text-[#137fec] text-base mt-0.5 flex-shrink-0">
                          check_circle
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA Button */}
                  <Button
                    asChild
                    className={cn(
                      'w-full',
                      tier.mostPopular
                        ? 'bg-[#137fec] hover:bg-[#0e6ac7] text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
                    )}
                  >
                    <Link href={tier.ctaLink}>{tier.cta}</Link>
                  </Button>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-16 lg:py-24 bg-slate-50 dark:bg-slate-900">
        <div className="container px-4 lg:px-6 mx-auto max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
              Compare Plans
            </h2>
            <p className="text-base text-slate-600 dark:text-slate-400">
              Detailed feature comparison across all plans
            </p>
          </div>

          <div className="overflow-x-auto">
            <table
              role="table"
              className="w-full border-collapse bg-white dark:bg-slate-800 rounded-lg shadow-sm"
            >
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th
                    scope="col"
                    className="text-left p-4 font-semibold text-slate-900 dark:text-white"
                  >
                    Feature
                  </th>
                  <th
                    scope="col"
                    className="text-center p-4 font-semibold text-slate-900 dark:text-white"
                  >
                    Starter
                  </th>
                  <th
                    scope="col"
                    className="text-center p-4 font-semibold text-slate-900 dark:text-white"
                  >
                    Professional
                  </th>
                  <th
                    scope="col"
                    className="text-center p-4 font-semibold text-slate-900 dark:text-white"
                  >
                    Enterprise
                  </th>
                  <th
                    scope="col"
                    className="text-center p-4 font-semibold text-slate-900 dark:text-white"
                  >
                    Custom
                  </th>
                </tr>
              </thead>
              <tbody>
                {pricingData.comparisonFeatures.map((category, catIndex) => (
                  <React.Fragment key={catIndex}>
                    {/* Category Header */}
                    <tr className="bg-slate-50 dark:bg-slate-900">
                      <td
                        colSpan={5}
                        className="p-4 font-semibold text-slate-900 dark:text-white"
                      >
                        {category.category}
                      </td>
                    </tr>

                    {/* Features */}
                    {category.features.map((feature, featIndex) => (
                      <tr
                        key={featIndex}
                        className="border-t border-slate-200 dark:border-slate-700"
                      >
                        <td className="p-4 text-slate-600 dark:text-slate-400">
                          {feature.name}
                        </td>
                        <td className="p-4 text-center">
                          {renderFeatureValue(feature.starter)}
                        </td>
                        <td className="p-4 text-center">
                          {renderFeatureValue(feature.professional)}
                        </td>
                        <td className="p-4 text-center">
                          {renderFeatureValue(feature.enterprise)}
                        </td>
                        <td className="p-4 text-center">
                          {renderFeatureValue(feature.custom)}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 lg:py-24">
        <div className="container px-4 lg:px-6 mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-base text-slate-600 dark:text-slate-400">
              Everything you need to know about our pricing
            </p>
          </div>

          <div className="space-y-4">
            {pricingData.faqs.map((faq, index) => (
              <div
                key={index}
                className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden"
              >
                <button
                  className="w-full text-left p-6 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  aria-expanded={openFaq === index}
                >
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {faq.question}
                  </span>
                  <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">
                    {openFaq === index ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-6 text-slate-600 dark:text-slate-400">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section
        data-testid="cta-section"
        className="py-16 lg:py-24 bg-gradient-to-r from-[#137fec] to-[#0e6ac7]"
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
              className="bg-white text-[#137fec] hover:bg-white/90 min-w-[200px]"
            >
              <Link href="/sign-up">Start Free Trial</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white text-white hover:bg-white/10 min-w-[200px]"
            >
              <Link href="/contact">Contact Sales</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

// Helper function to render feature values
function renderFeatureValue(value: boolean | string) {
  if (typeof value === 'boolean') {
    return value ? (
      <span className="material-symbols-outlined text-[#10b981]">check_circle</span>
    ) : (
      <span className="text-slate-400">—</span>
    );
  }
  return <span className="text-slate-600 dark:text-slate-400 text-sm">{value}</span>;
}
