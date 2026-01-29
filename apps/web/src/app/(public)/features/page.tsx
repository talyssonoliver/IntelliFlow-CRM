import * as React from 'react';
import Link from 'next/link';
import { Button, Card } from '@intelliflow/ui';
import featuresData from '@/data/features-content.json';

export const metadata = {
  title: 'Powerful Features for Modern Sales Teams | IntelliFlow CRM',
  description:
    'Discover AI-powered CRM features including lead scoring, workflow automation, predictive analytics, and enterprise-grade security.',
};

export default function FeaturesPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-white to-[#f6f7f8] dark:from-[#1e2936] dark:to-[#101922] py-16 lg:py-24">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              Powerful Features for Modern Sales Teams
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 mb-8">
              AI-first CRM with modern automation and governance-grade
              validation. Everything you need to close more deals, faster.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#137fec]/10 dark:bg-[#137fec]/20 rounded-full">
              <span className="material-symbols-outlined text-[#137fec] text-sm">
                auto_awesome
              </span>
              <span className="text-sm font-medium text-[#137fec]">
                {featuresData.metadata.totalFeatures}+ Features
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 lg:py-24">
        <div className="container px-4 lg:px-6 mx-auto max-w-7xl">
          {featuresData.categories.map((category, categoryIndex) => (
            <div
              key={category.id}
              data-testid="category-section"
              className={categoryIndex > 0 ? 'mt-20' : ''}
            >
              {/* Category Header */}
              <div className="text-center max-w-3xl mx-auto mb-12">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-[#137fec]/10 dark:bg-[#137fec]/20 rounded-2xl mb-4">
                  <span className="material-symbols-outlined text-[#137fec] text-3xl">
                    {category.icon}
                  </span>
                </div>
                <h2 className="text-2xl lg:text-3xl font-semibold text-slate-900 dark:text-white mb-3">
                  {category.name}
                </h2>
                <p className="text-base text-slate-600 dark:text-slate-400">
                  {category.description}
                </p>
              </div>

              {/* Features Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
                {category.features.map((feature) => (
                  <Card
                    key={feature.id}
                    data-testid="feature-card"
                    className="p-6 hover:border-[#137fec] hover:shadow-lg transition-all bg-white dark:bg-[#1e2936]"
                  >
                    {/* Feature Icon */}
                    <div
                      className="w-12 h-12 bg-[#137fec]/10 dark:bg-[#137fec]/20 rounded-lg flex items-center justify-center mb-4"
                      data-testid="feature-icon"
                    >
                      <span className="material-symbols-outlined text-2xl text-[#137fec]">
                        {feature.icon}
                      </span>
                    </div>

                    {/* Feature Title */}
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                      {feature.title}
                    </h3>

                    {/* Feature Description */}
                    <p className="text-base text-slate-600 dark:text-slate-400 mb-4">
                      {feature.description}
                    </p>

                    {/* Benefits List */}
                    <ul className="space-y-2 mb-4">
                      {feature.benefits.map((benefit, index) => (
                        <li
                          key={index}
                          className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400"
                        >
                          <span className="material-symbols-outlined text-[#137fec] text-base mt-0.5 flex-shrink-0">
                            check_circle
                          </span>
                          <span>{benefit}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Learn More Link */}
                    <Link
                      href={feature.learnMoreUrl}
                      className="inline-flex items-center gap-1 text-[#137fec] text-sm font-medium hover:gap-2 transition-all"
                      aria-label={`Learn more about ${feature.title}`}
                    >
                      Learn more
                      <span className="material-symbols-outlined text-base">
                        arrow_forward
                      </span>
                    </Link>
                  </Card>
                ))}
              </div>
            </div>
          ))}
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
            Join modern sales teams using IntelliFlow CRM to close more deals
            with AI-powered automation.
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
              <Link href="/pricing">View Pricing</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
