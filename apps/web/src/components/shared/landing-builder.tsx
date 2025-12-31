'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, Button } from '@intelliflow/ui';
import { trackConversion, getVariant, type Experiment } from '@/lib/shared/ab-test-framework';

/**
 * Landing Page Builder
 *
 * Composable components for building high-converting landing pages.
 * Supports A/B testing, conversion tracking, and consistent branding.
 *
 * Task: PG-013
 */

// ============================================================================
// Types
// ============================================================================

export interface HeroSection {
  type: 'hero';
  badge?: string;
  badgeIcon?: string;
  headline: string;
  subheadline: string;
  primaryCta: {
    text: string;
    href: string;
  };
  secondaryCta?: {
    text: string;
    href: string;
  };
  image?: string;
  experiment?: Experiment;
}

export interface FeatureItem {
  icon: string;
  title: string;
  description: string;
}

export interface FeaturesSection {
  type: 'features';
  title: string;
  subtitle?: string;
  features: FeatureItem[];
  columns?: 2 | 3 | 4;
}

export interface Testimonial {
  quote: string;
  author: string;
  role: string;
  company: string;
  avatar?: string;
}

export interface TestimonialsSection {
  type: 'testimonials';
  title: string;
  subtitle?: string;
  testimonials: Testimonial[];
}

export interface Stat {
  value: string;
  label: string;
}

export interface StatsSection {
  type: 'stats';
  title?: string;
  stats: Stat[];
  background?: 'light' | 'dark' | 'brand';
}

export interface PricingTier {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: {
    text: string;
    href: string;
  };
  highlighted?: boolean;
}

export interface PricingSection {
  type: 'pricing';
  title: string;
  subtitle?: string;
  tiers: PricingTier[];
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqSection {
  type: 'faq';
  title: string;
  subtitle?: string;
  items: FaqItem[];
}

export interface CtaSection {
  type: 'cta';
  title: string;
  subtitle?: string;
  primaryCta: {
    text: string;
    href: string;
  };
  secondaryCta?: {
    text: string;
    href: string;
  };
}

export interface LogoCloudSection {
  type: 'logo-cloud';
  title?: string;
  logos: { name: string; src?: string }[];
}

export type LandingSection =
  | HeroSection
  | FeaturesSection
  | TestimonialsSection
  | StatsSection
  | PricingSection
  | FaqSection
  | CtaSection
  | LogoCloudSection;

export interface LandingPageConfig {
  slug: string;
  title: string;
  description: string;
  sections: LandingSection[];
  conversionGoal?: string;
}

// ============================================================================
// Section Components
// ============================================================================

export function LandingHero({ section, pageSlug }: { section: HeroSection; pageSlug: string }) {
  const variant = section.experiment ? getVariant(section.experiment) : null;
  const ctaText = variant?.name || section.primaryCta.text;

  const handleCtaClick = () => {
    trackConversion(`lp_${pageSlug}`, 'hero_cta_click', { variant: variant?.id });
  };

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#0d1b2a] to-[#0b1f37] py-16 lg:py-24">
      <div className="absolute -left-40 top-10 h-80 w-80 rounded-full bg-[#137fec]/20 blur-3xl opacity-50" />
      <div className="absolute right-0 bottom-0 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl opacity-40" />

      <div className="container relative z-10 px-4 lg:px-6 mx-auto max-w-6xl">
        <div className="max-w-3xl mx-auto text-center">
          {section.badge && (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-[#7cc4ff] font-medium backdrop-blur mb-6">
              {section.badgeIcon && (
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  {section.badgeIcon}
                </span>
              )}
              {section.badge}
            </div>
          )}

          <h1 className="text-4xl lg:text-5xl font-bold text-white mb-6">{section.headline}</h1>

          <p className="text-lg text-slate-200 max-w-2xl mx-auto mb-8">{section.subheadline}</p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href={section.primaryCta.href}
              onClick={handleCtaClick}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg
                bg-[#137fec] text-white font-semibold hover:bg-[#0e6ac7]
                transition-colors focus:outline-none focus:ring-2 focus:ring-[#7cc4ff]
                focus:ring-offset-2 focus:ring-offset-[#0f172a]"
            >
              {ctaText}
            </Link>
            {section.secondaryCta && (
              <Link
                href={section.secondaryCta.href}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg
                  border border-white/30 text-white font-semibold hover:bg-white/10
                  transition-colors"
              >
                {section.secondaryCta.text}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function LandingFeatures({ section }: { section: FeaturesSection }) {
  const columns = section.columns || 3;
  const gridCols = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  }[columns];

  return (
    <section className="py-16 lg:py-20 bg-white dark:bg-slate-800">
      <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">{section.title}</h2>
          {section.subtitle && (
            <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">{section.subtitle}</p>
          )}
        </div>

        <div className={`grid grid-cols-1 ${gridCols} gap-6`}>
          {section.features.map((feature, index) => (
            <Card
              key={index}
              className="p-6 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:border-[#137fec] hover:shadow-md transition-all"
            >
              <div className="w-12 h-12 rounded-lg bg-[#137fec]/10 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-[#137fec]" aria-hidden="true">
                  {feature.icon}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">{feature.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingTestimonials({ section }: { section: TestimonialsSection }) {
  return (
    <section className="py-16 lg:py-20 bg-slate-50 dark:bg-slate-900">
      <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">{section.title}</h2>
          {section.subtitle && (
            <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">{section.subtitle}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {section.testimonials.map((testimonial, index) => (
            <Card
              key={index}
              className="p-6 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <blockquote className="text-slate-600 dark:text-slate-400 mb-4">
                "{testimonial.quote}"
              </blockquote>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#137fec]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#137fec]" aria-hidden="true">
                    person
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{testimonial.author}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {testimonial.role}, {testimonial.company}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingStats({ section }: { section: StatsSection }) {
  const bgClass = {
    light: 'bg-white dark:bg-slate-800',
    dark: 'bg-slate-900 dark:bg-slate-950',
    brand: 'bg-gradient-to-r from-[#137fec] to-[#0e6ac7]',
  }[section.background || 'light'];

  const textClass = section.background === 'brand' ? 'text-white' : 'text-slate-900 dark:text-white';

  return (
    <section className={`py-12 lg:py-16 ${bgClass}`}>
      <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
        {section.title && (
          <h2 className={`text-2xl font-bold text-center mb-8 ${textClass}`}>{section.title}</h2>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {section.stats.map((stat, index) => (
            <div key={index} className="text-center">
              <p className={`text-4xl font-bold mb-2 ${section.background === 'brand' ? 'text-white' : 'text-[#137fec]'}`}>
                {stat.value}
              </p>
              <p className={`text-sm ${section.background === 'brand' ? 'text-white/80' : 'text-slate-600 dark:text-slate-400'}`}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingPricing({ section }: { section: PricingSection }) {
  return (
    <section className="py-16 lg:py-20 bg-white dark:bg-slate-800">
      <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">{section.title}</h2>
          {section.subtitle && (
            <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">{section.subtitle}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {section.tiers.map((tier, index) => (
            <Card
              key={index}
              className={`p-6 ${
                tier.highlighted
                  ? 'border-2 border-[#137fec] shadow-lg scale-105'
                  : 'border border-slate-200 dark:border-slate-700'
              } bg-white dark:bg-slate-900`}
            >
              {tier.highlighted && (
                <span className="inline-block px-3 py-1 bg-[#137fec] text-white text-xs font-semibold rounded-full mb-4">
                  Most Popular
                </span>
              )}
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{tier.name}</h3>
              <div className="mb-4">
                <span className="text-4xl font-bold text-slate-900 dark:text-white">{tier.price}</span>
                <span className="text-slate-600 dark:text-slate-400">/{tier.period}</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">{tier.description}</p>
              <ul className="space-y-3 mb-6">
                {tier.features.map((feature, fIndex) => (
                  <li key={fIndex} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <span className="material-symbols-outlined text-emerald-500 text-base mt-0.5" aria-hidden="true">
                      check_circle
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                asChild
                className={`w-full ${tier.highlighted ? 'bg-[#137fec] hover:bg-[#0e6ac7]' : ''}`}
                variant={tier.highlighted ? 'default' : 'outline'}
              >
                <Link href={tier.cta.href}>{tier.cta.text}</Link>
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingFaq({ section }: { section: FaqSection }) {
  return (
    <section className="py-16 lg:py-20 bg-slate-50 dark:bg-slate-900">
      <div className="container px-4 lg:px-6 mx-auto max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">{section.title}</h2>
          {section.subtitle && (
            <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">{section.subtitle}</p>
          )}
        </div>

        <div className="space-y-4">
          {section.items.map((item, index) => (
            <details
              key={index}
              className="group bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors rounded-lg">
                <span className="font-semibold text-slate-900 dark:text-white pr-4">{item.question}</span>
                <span className="material-symbols-outlined text-slate-500 group-open:rotate-180 transition-transform" aria-hidden="true">
                  expand_more
                </span>
              </summary>
              <div className="px-6 pb-6 text-slate-600 dark:text-slate-400">{item.answer}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingCta({ section, pageSlug }: { section: CtaSection; pageSlug: string }) {
  const handleCtaClick = () => {
    trackConversion(`lp_${pageSlug}`, 'footer_cta_click');
  };

  return (
    <section className="py-16 lg:py-20 bg-gradient-to-r from-[#137fec] to-[#0e6ac7]">
      <div className="container px-4 lg:px-6 mx-auto max-w-4xl text-center">
        <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">{section.title}</h2>
        {section.subtitle && <p className="text-lg text-white/90 mb-8">{section.subtitle}</p>}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href={section.primaryCta.href}
            onClick={handleCtaClick}
            className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-white
              text-[#137fec] font-semibold rounded-lg hover:bg-slate-100
              transition-colors"
          >
            {section.primaryCta.text}
          </Link>
          {section.secondaryCta && (
            <Link
              href={section.secondaryCta.href}
              className="inline-flex items-center justify-center gap-2 px-8 py-3 border
                border-white text-white font-semibold rounded-lg hover:bg-white/10
                transition-colors"
            >
              {section.secondaryCta.text}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

export function LandingLogoCloud({ section }: { section: LogoCloudSection }) {
  return (
    <section className="py-12 lg:py-16 bg-slate-50 dark:bg-slate-900">
      <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
        {section.title && (
          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mb-8">{section.title}</p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-8 lg:gap-12">
          {section.logos.map((logo, index) => (
            <div
              key={index}
              className="h-8 px-4 py-2 bg-slate-200 dark:bg-slate-800 rounded flex items-center justify-center text-slate-500 dark:text-slate-400 text-sm font-medium"
            >
              {logo.name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Main Landing Builder Component
// ============================================================================

export function LandingBuilder({ config }: { config: LandingPageConfig }) {
  React.useEffect(() => {
    // Track page view
    trackConversion(`lp_${config.slug}`, 'page_view');
  }, [config.slug]);

  return (
    <>
      {config.sections.map((section, index) => {
        switch (section.type) {
          case 'hero':
            return <LandingHero key={index} section={section} pageSlug={config.slug} />;
          case 'features':
            return <LandingFeatures key={index} section={section} />;
          case 'testimonials':
            return <LandingTestimonials key={index} section={section} />;
          case 'stats':
            return <LandingStats key={index} section={section} />;
          case 'pricing':
            return <LandingPricing key={index} section={section} />;
          case 'faq':
            return <LandingFaq key={index} section={section} />;
          case 'cta':
            return <LandingCta key={index} section={section} pageSlug={config.slug} />;
          case 'logo-cloud':
            return <LandingLogoCloud key={index} section={section} />;
          default:
            return null;
        }
      })}
    </>
  );
}

export default LandingBuilder;
