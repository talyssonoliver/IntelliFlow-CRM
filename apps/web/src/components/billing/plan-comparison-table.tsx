'use client';

/**
 * Plan Comparison Table + FAQ
 *
 * Shared component rendering the detailed feature comparison table
 * and FAQ accordion. Used by both the public /pricing page and
 * the authenticated /billing/plans page.
 *
 * Data sourced from pricing-data.json (single source of truth).
 */

import * as React from 'react';
import pricingData from '@/data/pricing-data.json';
import { cn } from '@intelliflow/ui';

// ============================================
// Comparison Table
// ============================================

interface PlanComparisonTableProps {
  className?: string;
}

export function PlanComparisonTable({ className }: PlanComparisonTableProps) {
  return (
    <div className={cn('flex flex-col gap-12', className)}>
      {/* Comparison Table */}
      <div>
        <div className="text-center max-w-3xl mx-auto mb-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Compare Plans</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
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
                {pricingData.tiers.map((tier) => (
                  <th
                    key={tier.id}
                    scope="col"
                    className="text-center p-4 font-semibold text-slate-900 dark:text-white"
                  >
                    {tier.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pricingData.comparisonFeatures.map((category, catIndex) => (
                <React.Fragment key={catIndex}>
                  {/* Category Header */}
                  <tr className="bg-slate-50 dark:bg-slate-900">
                    <td
                      colSpan={pricingData.tiers.length + 1}
                      className="p-4 font-semibold text-slate-900 dark:text-white"
                    >
                      {category.category}
                    </td>
                  </tr>

                  {/* Features */}
                  {category.features.map((feature, featIndex) => (
                    <tr key={featIndex} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="p-4 text-slate-600 dark:text-slate-400">{feature.name}</td>
                      <td className="p-4 text-center">{renderFeatureValue(feature.starter)}</td>
                      <td className="p-4 text-center">
                        {renderFeatureValue(feature.professional)}
                      </td>
                      <td className="p-4 text-center">{renderFeatureValue(feature.enterprise)}</td>
                      <td className="p-4 text-center">{renderFeatureValue(feature.custom)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================
// FAQ Accordion
// ============================================

interface PlanFaqProps {
  className?: string;
}

export function PlanFaq({ className }: PlanFaqProps) {
  const [openFaq, setOpenFaq] = React.useState<number | null>(null);

  return (
    <div className={cn('max-w-4xl mx-auto', className)}>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Frequently Asked Questions
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Everything you need to know about our pricing
        </p>
      </div>

      <div className="space-y-3">
        {pricingData.faqs.map((faq, index) => (
          <div
            key={index}
            className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden"
          >
            <button
              className="w-full text-left p-5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              onClick={() => setOpenFaq(openFaq === index ? null : index)}
              aria-expanded={openFaq === index}
            >
              <span className="font-semibold text-slate-900 dark:text-white text-sm">
                {faq.question}
              </span>
              <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">
                {openFaq === index ? 'expand_less' : 'expand_more'}
              </span>
            </button>
            {openFaq === index && (
              <div className="px-5 pb-5 text-sm text-slate-600 dark:text-slate-400">
                {faq.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Helper
// ============================================

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
