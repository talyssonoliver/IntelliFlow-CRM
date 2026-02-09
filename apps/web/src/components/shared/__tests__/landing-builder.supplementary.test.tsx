/**
 * @vitest-environment happy-dom
 * Supplementary tests for landing-builder.tsx
 *
 * Covers: LandingBuilder, LandingHero, LandingFeatures, LandingTestimonials,
 * LandingStats, LandingPricing, LandingFaq, LandingCta, LandingLogoCloud.
 * Tests section rendering, A/B test integration, and CTA click tracking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const mockTrackConversion = vi.hoisted(() => vi.fn());
const mockGetVariant = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/shared/ab-test-framework', () => ({
  trackConversion: mockTrackConversion,
  getVariant: mockGetVariant,
}));

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className, ...props }: any) =>
    React.createElement('div', { className, 'data-testid': 'card', ...props }, children),
  Button: ({ children, className, asChild, variant, ...props }: any) =>
    React.createElement('button', { className, 'data-variant': variant, ...props }, children),
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

import {
  LandingBuilder,
  LandingHero,
  LandingFeatures,
  LandingTestimonials,
  LandingStats,
  LandingPricing,
  LandingFaq,
  LandingCta,
  LandingLogoCloud,
  type LandingPageConfig,
  type HeroSection,
  type FeaturesSection,
  type TestimonialsSection,
  type StatsSection,
  type PricingSection,
  type FaqSection,
  type CtaSection,
  type LogoCloudSection,
} from '../landing-builder';

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const heroSection: HeroSection = {
  type: 'hero',
  badge: 'New Feature',
  badgeIcon: 'star',
  headline: 'Transform Your CRM',
  subheadline: 'AI-powered intelligence for your sales team',
  primaryCta: { text: 'Get Started', href: '/signup' },
  secondaryCta: { text: 'Learn More', href: '/features' },
};

const featuresSection: FeaturesSection = {
  type: 'features',
  title: 'Features',
  subtitle: 'Everything you need',
  features: [
    { icon: 'analytics', title: 'Analytics', description: 'Real-time analytics' },
    { icon: 'smart_toy', title: 'AI Insights', description: 'AI-powered insights' },
  ],
  columns: 2,
};

const testimonialsSection: TestimonialsSection = {
  type: 'testimonials',
  title: 'Testimonials',
  subtitle: 'What our customers say',
  testimonials: [
    {
      quote: 'Amazing product!',
      author: 'John Doe',
      role: 'CTO',
      company: 'TechCorp',
    },
  ],
};

const statsSection: StatsSection = {
  type: 'stats',
  title: 'Our Numbers',
  stats: [
    { value: '10K+', label: 'Users' },
    { value: '99.9%', label: 'Uptime' },
  ],
  background: 'brand',
};

const pricingSection: PricingSection = {
  type: 'pricing',
  title: 'Pricing',
  subtitle: 'Simple pricing for everyone',
  tiers: [
    {
      name: 'Starter',
      price: '29',
      period: 'month',
      description: 'For small teams',
      features: ['5 users', '1000 contacts'],
      cta: { text: 'Start Free', href: '/signup' },
    },
    {
      name: 'Pro',
      price: '79',
      period: 'month',
      description: 'For growing teams',
      features: ['25 users', '10000 contacts', 'AI scoring'],
      cta: { text: 'Try Pro', href: '/signup?plan=pro' },
      highlighted: true,
    },
  ],
};

const faqSection: FaqSection = {
  type: 'faq',
  title: 'FAQ',
  subtitle: 'Common questions',
  items: [
    { question: 'How does it work?', answer: 'It works great!' },
    { question: 'Is there a free trial?', answer: 'Yes, 14 days free.' },
  ],
};

const ctaSection: CtaSection = {
  type: 'cta',
  title: 'Ready to Start?',
  subtitle: 'Join thousands of teams',
  primaryCta: { text: 'Start Now', href: '/signup' },
  secondaryCta: { text: 'Contact Sales', href: '/contact' },
};

const logoCloudSection: LogoCloudSection = {
  type: 'logo-cloud',
  title: 'Trusted by',
  logos: [
    { name: 'TechCorp' },
    { name: 'SalesCo' },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LandingHero', () => {
  beforeEach(() => {
    mockGetVariant.mockReturnValue(null);
    mockTrackConversion.mockClear();
  });

  it('renders headline and subheadline', () => {
    render(<LandingHero section={heroSection} pageSlug="test" />);

    expect(screen.getByText('Transform Your CRM')).toBeDefined();
    expect(screen.getByText('AI-powered intelligence for your sales team')).toBeDefined();
  });

  it('renders badge with icon', () => {
    render(<LandingHero section={heroSection} pageSlug="test" />);

    expect(screen.getByText('New Feature')).toBeDefined();
    expect(screen.getByText('star')).toBeDefined();
  });

  it('renders primary CTA button', () => {
    render(<LandingHero section={heroSection} pageSlug="test" />);

    expect(screen.getByText('Get Started')).toBeDefined();
  });

  it('renders secondary CTA when provided', () => {
    render(<LandingHero section={heroSection} pageSlug="test" />);

    expect(screen.getByText('Learn More')).toBeDefined();
  });

  it('does not render secondary CTA when not provided', () => {
    const sectionNoSecondary: HeroSection = {
      ...heroSection,
      secondaryCta: undefined,
    };
    render(<LandingHero section={sectionNoSecondary} pageSlug="test" />);

    expect(screen.queryByText('Learn More')).toBeNull();
  });

  it('does not render badge when not provided', () => {
    const sectionNoBadge: HeroSection = {
      ...heroSection,
      badge: undefined,
      badgeIcon: undefined,
    };
    render(<LandingHero section={sectionNoBadge} pageSlug="test" />);

    expect(screen.queryByText('New Feature')).toBeNull();
  });

  it('tracks conversion on CTA click', () => {
    render(<LandingHero section={heroSection} pageSlug="homepage" />);

    const cta = screen.getByText('Get Started');
    fireEvent.click(cta);

    expect(mockTrackConversion).toHaveBeenCalledWith(
      'lp_homepage',
      'hero_cta_click',
      expect.objectContaining({ variant: undefined })
    );
  });

  it('uses A/B test variant name for CTA text', () => {
    mockGetVariant.mockReturnValue({ id: 'v1', name: 'Try Free Now' });
    const heroWithExperiment: HeroSection = {
      ...heroSection,
      experiment: { id: 'exp-1', name: 'cta-test', variants: [] } as any,
    };

    render(<LandingHero section={heroWithExperiment} pageSlug="test" />);

    expect(screen.getByText('Try Free Now')).toBeDefined();
  });

  it('renders badge without badgeIcon', () => {
    const sectionBadgeNoIcon: HeroSection = {
      ...heroSection,
      badgeIcon: undefined,
    };
    render(<LandingHero section={sectionBadgeNoIcon} pageSlug="test" />);

    expect(screen.getByText('New Feature')).toBeDefined();
  });
});

describe('LandingFeatures', () => {
  it('renders title and subtitle', () => {
    render(<LandingFeatures section={featuresSection} />);

    expect(screen.getByText('Features')).toBeDefined();
    expect(screen.getByText('Everything you need')).toBeDefined();
  });

  it('renders all feature items', () => {
    render(<LandingFeatures section={featuresSection} />);

    expect(screen.getByText('Analytics')).toBeDefined();
    expect(screen.getByText('AI Insights')).toBeDefined();
  });

  it('does not render subtitle when not provided', () => {
    const sectionNoSubtitle: FeaturesSection = {
      ...featuresSection,
      subtitle: undefined,
    };
    render(<LandingFeatures section={sectionNoSubtitle} />);

    expect(screen.queryByText('Everything you need')).toBeNull();
  });

  it('uses default 3-column grid when columns not specified', () => {
    const sectionDefaultCols: FeaturesSection = {
      ...featuresSection,
      columns: undefined,
    };
    const { container } = render(<LandingFeatures section={sectionDefaultCols} />);

    // Default should use lg:grid-cols-3
    expect(container.innerHTML).toContain('lg:grid-cols-3');
  });

  it('uses 4-column grid when specified', () => {
    const section4Cols: FeaturesSection = {
      ...featuresSection,
      columns: 4,
    };
    const { container } = render(<LandingFeatures section={section4Cols} />);

    expect(container.innerHTML).toContain('lg:grid-cols-4');
  });
});

describe('LandingTestimonials', () => {
  it('renders testimonials with quotes', () => {
    render(<LandingTestimonials section={testimonialsSection} />);

    expect(screen.getByText(/Amazing product!/)).toBeDefined();
    expect(screen.getByText('John Doe')).toBeDefined();
  });

  it('renders subtitle when provided', () => {
    render(<LandingTestimonials section={testimonialsSection} />);

    expect(screen.getByText('What our customers say')).toBeDefined();
  });

  it('does not render subtitle when not provided', () => {
    const sectionNoSub: TestimonialsSection = {
      ...testimonialsSection,
      subtitle: undefined,
    };
    render(<LandingTestimonials section={sectionNoSub} />);

    expect(screen.queryByText('What our customers say')).toBeNull();
  });
});

describe('LandingStats', () => {
  it('renders stat values and labels', () => {
    render(<LandingStats section={statsSection} />);

    expect(screen.getByText('10K+')).toBeDefined();
    expect(screen.getByText('Users')).toBeDefined();
    expect(screen.getByText('99.9%')).toBeDefined();
  });

  it('renders title when provided', () => {
    render(<LandingStats section={statsSection} />);

    expect(screen.getByText('Our Numbers')).toBeDefined();
  });

  it('does not render title when not provided', () => {
    const sectionNoTitle: StatsSection = {
      ...statsSection,
      title: undefined,
    };
    render(<LandingStats section={sectionNoTitle} />);

    expect(screen.queryByText('Our Numbers')).toBeNull();
  });

  it('applies light background by default', () => {
    const sectionLight: StatsSection = {
      ...statsSection,
      background: undefined,
    };
    const { container } = render(<LandingStats section={sectionLight} />);
    expect(container.innerHTML).toContain('bg-white');
  });

  it('applies dark background class', () => {
    const sectionDark: StatsSection = {
      ...statsSection,
      background: 'dark',
    };
    const { container } = render(<LandingStats section={sectionDark} />);
    expect(container.innerHTML).toContain('bg-slate-900');
  });

  it('applies brand gradient background class', () => {
    const { container } = render(<LandingStats section={statsSection} />);
    expect(container.innerHTML).toContain('bg-gradient-to-r');
  });
});

describe('LandingPricing', () => {
  it('renders pricing tiers', () => {
    render(<LandingPricing section={pricingSection} />);

    expect(screen.getByText('Starter')).toBeDefined();
    expect(screen.getByText('Pro')).toBeDefined();
  });

  it('renders highlighted tier with "Most Popular" badge', () => {
    render(<LandingPricing section={pricingSection} />);

    expect(screen.getByText('Most Popular')).toBeDefined();
  });

  it('renders subtitle when provided', () => {
    render(<LandingPricing section={pricingSection} />);

    expect(screen.getByText('Simple pricing for everyone')).toBeDefined();
  });

  it('does not render subtitle when not provided', () => {
    const sectionNoSub: PricingSection = {
      ...pricingSection,
      subtitle: undefined,
    };
    render(<LandingPricing section={sectionNoSub} />);

    expect(screen.queryByText('Simple pricing for everyone')).toBeNull();
  });

  it('renders feature lists for each tier', () => {
    render(<LandingPricing section={pricingSection} />);

    expect(screen.getByText('5 users')).toBeDefined();
    expect(screen.getByText('AI scoring')).toBeDefined();
  });
});

describe('LandingFaq', () => {
  it('renders FAQ items', () => {
    render(<LandingFaq section={faqSection} />);

    expect(screen.getByText('How does it work?')).toBeDefined();
    expect(screen.getByText('Is there a free trial?')).toBeDefined();
  });

  it('renders subtitle when provided', () => {
    render(<LandingFaq section={faqSection} />);

    expect(screen.getByText('Common questions')).toBeDefined();
  });

  it('does not render subtitle when not provided', () => {
    const sectionNoSub: FaqSection = {
      ...faqSection,
      subtitle: undefined,
    };
    render(<LandingFaq section={sectionNoSub} />);

    expect(screen.queryByText('Common questions')).toBeNull();
  });
});

describe('LandingCta', () => {
  beforeEach(() => {
    mockTrackConversion.mockClear();
  });

  it('renders CTA title and subtitle', () => {
    render(<LandingCta section={ctaSection} pageSlug="home" />);

    expect(screen.getByText('Ready to Start?')).toBeDefined();
    expect(screen.getByText('Join thousands of teams')).toBeDefined();
  });

  it('does not render subtitle when not provided', () => {
    const sectionNoSub: CtaSection = {
      ...ctaSection,
      subtitle: undefined,
    };
    render(<LandingCta section={sectionNoSub} pageSlug="home" />);

    expect(screen.queryByText('Join thousands of teams')).toBeNull();
  });

  it('renders secondary CTA when provided', () => {
    render(<LandingCta section={ctaSection} pageSlug="home" />);

    expect(screen.getByText('Contact Sales')).toBeDefined();
  });

  it('does not render secondary CTA when not provided', () => {
    const sectionNoSecondary: CtaSection = {
      ...ctaSection,
      secondaryCta: undefined,
    };
    render(<LandingCta section={sectionNoSecondary} pageSlug="home" />);

    expect(screen.queryByText('Contact Sales')).toBeNull();
  });

  it('tracks conversion on CTA click', () => {
    render(<LandingCta section={ctaSection} pageSlug="homepage" />);

    const cta = screen.getByText('Start Now');
    fireEvent.click(cta);

    expect(mockTrackConversion).toHaveBeenCalledWith('lp_homepage', 'footer_cta_click');
  });
});

describe('LandingLogoCloud', () => {
  it('renders logo names', () => {
    render(<LandingLogoCloud section={logoCloudSection} />);

    expect(screen.getByText('TechCorp')).toBeDefined();
    expect(screen.getByText('SalesCo')).toBeDefined();
  });

  it('renders title when provided', () => {
    render(<LandingLogoCloud section={logoCloudSection} />);

    expect(screen.getByText('Trusted by')).toBeDefined();
  });

  it('does not render title when not provided', () => {
    const sectionNoTitle: LogoCloudSection = {
      ...logoCloudSection,
      title: undefined,
    };
    render(<LandingLogoCloud section={sectionNoTitle} />);

    expect(screen.queryByText('Trusted by')).toBeNull();
  });
});

describe('LandingBuilder', () => {
  beforeEach(() => {
    mockTrackConversion.mockClear();
    mockGetVariant.mockReturnValue(null);
  });

  it('renders all section types', () => {
    const config: LandingPageConfig = {
      slug: 'test-page',
      title: 'Test Page',
      description: 'Test description',
      sections: [
        heroSection,
        featuresSection,
        testimonialsSection,
        statsSection,
        pricingSection,
        faqSection,
        ctaSection,
        logoCloudSection,
      ],
    };

    render(<LandingBuilder config={config} />);

    expect(screen.getByText('Transform Your CRM')).toBeDefined();
    expect(screen.getByText('Features')).toBeDefined();
    expect(screen.getByText('Testimonials')).toBeDefined();
    expect(screen.getByText('Our Numbers')).toBeDefined();
    expect(screen.getByText('Pricing')).toBeDefined();
    expect(screen.getByText('FAQ')).toBeDefined();
    expect(screen.getByText('Ready to Start?')).toBeDefined();
    expect(screen.getByText('Trusted by')).toBeDefined();
  });

  it('tracks page view on mount', () => {
    const config: LandingPageConfig = {
      slug: 'my-landing',
      title: 'Landing',
      description: 'desc',
      sections: [],
    };

    render(<LandingBuilder config={config} />);

    expect(mockTrackConversion).toHaveBeenCalledWith('lp_my-landing', 'page_view');
  });

  it('renders nothing for empty sections', () => {
    const config: LandingPageConfig = {
      slug: 'empty',
      title: 'Empty',
      description: 'desc',
      sections: [],
    };

    const { container } = render(<LandingBuilder config={config} />);
    // The fragment wrapper should be essentially empty (no section elements)
    expect(container.querySelectorAll('section').length).toBe(0);
  });

  it('returns null for unknown section type', () => {
    const config: LandingPageConfig = {
      slug: 'test',
      title: 'Test',
      description: 'desc',
      sections: [
        { type: 'unknown-section' } as any,
      ],
    };

    const { container } = render(<LandingBuilder config={config} />);
    expect(container.querySelectorAll('section').length).toBe(0);
  });
});
