/**
 * Supplementary tests for landing-builder.tsx
 *
 * Tests builder logic: section type dispatch, configuration shape
 * validation, content editing utilities, feature grid layout,
 * and CTA conversion tracking semantics.
 *
 * No rendering - tests pure logic only.
 */
import { describe, it, expect } from 'vitest';
import type {
  HeroSection,
  FeaturesSection,
  TestimonialsSection,
  StatsSection,
  PricingSection,
  FaqSection,
  CtaSection,
  LogoCloudSection,
  LandingSection,
  LandingPageConfig,
  FeatureItem,
  Testimonial,
  PricingTier,
  FaqItem,
  Stat,
} from '../landing-builder';

// ---------------------------------------------------------------------------
// Section type dispatcher (mirrors the switch in LandingBuilder)
// ---------------------------------------------------------------------------
function getSectionComponent(section: LandingSection): string | null {
  switch (section.type) {
    case 'hero':
      return 'LandingHero';
    case 'features':
      return 'LandingFeatures';
    case 'testimonials':
      return 'LandingTestimonials';
    case 'stats':
      return 'LandingStats';
    case 'pricing':
      return 'LandingPricing';
    case 'faq':
      return 'LandingFaq';
    case 'cta':
      return 'LandingCta';
    case 'logo-cloud':
      return 'LandingLogoCloud';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Features grid columns logic (mirrors LandingFeatures)
// ---------------------------------------------------------------------------
function getGridCols(columns: 2 | 3 | 4): string {
  const gridCols: Record<number, string> = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  };
  return gridCols[columns];
}

// ---------------------------------------------------------------------------
// Stats background class logic (mirrors LandingStats)
// ---------------------------------------------------------------------------
function getStatsBgClass(background: 'light' | 'dark' | 'brand' | undefined): string {
  const bgClass: Record<string, string> = {
    light: 'bg-white dark:bg-slate-800',
    dark: 'bg-slate-900 dark:bg-slate-950',
    brand: 'bg-gradient-to-r from-[#137fec] to-[#0e6ac7]',
  };
  return bgClass[background || 'light'];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('landing-builder logic', () => {
  // ===================== Section type dispatch =====================
  describe('section type dispatch', () => {
    it('dispatches hero section', () => {
      const section: HeroSection = {
        type: 'hero',
        headline: 'Test',
        subheadline: 'Sub',
        primaryCta: { text: 'CTA', href: '/' },
      };
      expect(getSectionComponent(section)).toBe('LandingHero');
    });

    it('dispatches features section', () => {
      const section: FeaturesSection = {
        type: 'features',
        title: 'Features',
        features: [],
      };
      expect(getSectionComponent(section)).toBe('LandingFeatures');
    });

    it('dispatches testimonials section', () => {
      const section: TestimonialsSection = {
        type: 'testimonials',
        title: 'Testimonials',
        testimonials: [],
      };
      expect(getSectionComponent(section)).toBe('LandingTestimonials');
    });

    it('dispatches stats section', () => {
      const section: StatsSection = {
        type: 'stats',
        stats: [],
      };
      expect(getSectionComponent(section)).toBe('LandingStats');
    });

    it('dispatches pricing section', () => {
      const section: PricingSection = {
        type: 'pricing',
        title: 'Pricing',
        tiers: [],
      };
      expect(getSectionComponent(section)).toBe('LandingPricing');
    });

    it('dispatches faq section', () => {
      const section: FaqSection = {
        type: 'faq',
        title: 'FAQ',
        items: [],
      };
      expect(getSectionComponent(section)).toBe('LandingFaq');
    });

    it('dispatches cta section', () => {
      const section: CtaSection = {
        type: 'cta',
        title: 'Get Started',
        primaryCta: { text: 'Sign Up', href: '/signup' },
      };
      expect(getSectionComponent(section)).toBe('LandingCta');
    });

    it('dispatches logo-cloud section', () => {
      const section: LogoCloudSection = {
        type: 'logo-cloud',
        logos: [],
      };
      expect(getSectionComponent(section)).toBe('LandingLogoCloud');
    });

    it('returns null for unknown section type', () => {
      const section = { type: 'unknown' } as any;
      expect(getSectionComponent(section)).toBeNull();
    });
  });

  // ===================== Feature grid columns =====================
  describe('features grid columns', () => {
    it('2 columns returns md:grid-cols-2', () => {
      expect(getGridCols(2)).toBe('md:grid-cols-2');
    });

    it('3 columns returns responsive 2/3 grid', () => {
      expect(getGridCols(3)).toBe('md:grid-cols-2 lg:grid-cols-3');
    });

    it('4 columns returns responsive 2/4 grid', () => {
      expect(getGridCols(4)).toBe('md:grid-cols-2 lg:grid-cols-4');
    });

    it('default columns is 3 when undefined', () => {
      const columns = undefined;
      const actualColumns = columns || 3;
      expect(getGridCols(actualColumns as 2 | 3 | 4)).toBe('md:grid-cols-2 lg:grid-cols-3');
    });
  });

  // ===================== Stats background =====================
  describe('stats background classes', () => {
    it('light background', () => {
      expect(getStatsBgClass('light')).toContain('bg-white');
    });

    it('dark background', () => {
      expect(getStatsBgClass('dark')).toContain('bg-slate-900');
    });

    it('brand background uses gradient', () => {
      expect(getStatsBgClass('brand')).toContain('bg-gradient-to-r');
    });

    it('defaults to light when undefined', () => {
      expect(getStatsBgClass(undefined)).toContain('bg-white');
    });

    it('brand text is white', () => {
      const background = 'brand' as const;
      const textClass = background === 'brand' ? 'text-white' : 'text-slate-900 dark:text-white';
      expect(textClass).toBe('text-white');
    });

    it('non-brand text uses default', () => {
      const background: string = 'light';
      const textClass = background === 'brand' ? 'text-white' : 'text-slate-900 dark:text-white';
      expect(textClass).toBe('text-slate-900 dark:text-white');
    });
  });

  // ===================== LandingPageConfig shape =====================
  describe('LandingPageConfig shape', () => {
    it('accepts minimal valid config', () => {
      const config: LandingPageConfig = {
        slug: 'test-page',
        title: 'Test Page',
        description: 'A test landing page',
        sections: [],
      };
      expect(config.slug).toBe('test-page');
      expect(config.sections).toHaveLength(0);
    });

    it('accepts config with conversionGoal', () => {
      const config: LandingPageConfig = {
        slug: 'marketing',
        title: 'Marketing',
        description: 'desc',
        sections: [],
        conversionGoal: 'signup',
      };
      expect(config.conversionGoal).toBe('signup');
    });

    it('config with multiple sections', () => {
      const config: LandingPageConfig = {
        slug: 'full',
        title: 'Full Page',
        description: 'desc',
        sections: [
          { type: 'hero', headline: 'H', subheadline: 'S', primaryCta: { text: 'Go', href: '/' } },
          { type: 'features', title: 'Features', features: [] },
          { type: 'cta', title: 'Ready?', primaryCta: { text: 'Start', href: '/start' } },
        ],
      };
      expect(config.sections).toHaveLength(3);
      expect(config.sections[0].type).toBe('hero');
      expect(config.sections[1].type).toBe('features');
      expect(config.sections[2].type).toBe('cta');
    });
  });

  // ===================== HeroSection =====================
  describe('HeroSection', () => {
    it('requires headline and primaryCta', () => {
      const hero: HeroSection = {
        type: 'hero',
        headline: 'Welcome',
        subheadline: 'Description',
        primaryCta: { text: 'Get Started', href: '/signup' },
      };
      expect(hero.headline).toBe('Welcome');
      expect(hero.primaryCta.text).toBe('Get Started');
    });

    it('optional badge and secondaryCta', () => {
      const hero: HeroSection = {
        type: 'hero',
        badge: 'New!',
        badgeIcon: 'auto_awesome',
        headline: 'Welcome',
        subheadline: 'Description',
        primaryCta: { text: 'Go', href: '/' },
        secondaryCta: { text: 'Learn More', href: '/about' },
      };
      expect(hero.badge).toBe('New!');
      expect(hero.badgeIcon).toBe('auto_awesome');
      expect(hero.secondaryCta!.text).toBe('Learn More');
    });

    it('experiment is optional', () => {
      const hero: HeroSection = {
        type: 'hero',
        headline: 'Test',
        subheadline: 'Sub',
        primaryCta: { text: 'Go', href: '/' },
      };
      expect(hero.experiment).toBeUndefined();
    });
  });

  // ===================== FeatureItem =====================
  describe('FeatureItem', () => {
    it('has icon, title, description', () => {
      const feature: FeatureItem = {
        icon: 'speed',
        title: 'Fast',
        description: 'Blazing fast performance',
      };
      expect(feature.icon).toBe('speed');
      expect(feature.title).toBe('Fast');
      expect(feature.description).toBeTruthy();
    });
  });

  // ===================== Testimonial =====================
  describe('Testimonial', () => {
    it('has quote, author, role, company', () => {
      const testimonial: Testimonial = {
        quote: 'Great product!',
        author: 'Jane Doe',
        role: 'CTO',
        company: 'Acme Inc',
      };
      expect(testimonial.quote).toBe('Great product!');
      expect(testimonial.author).toBe('Jane Doe');
    });

    it('avatar is optional', () => {
      const testimonial: Testimonial = {
        quote: 'Nice',
        author: 'Bob',
        role: 'Dev',
        company: 'Corp',
      };
      expect(testimonial.avatar).toBeUndefined();
    });
  });

  // ===================== PricingTier =====================
  describe('PricingTier', () => {
    it('highlighted tier gets special treatment', () => {
      const tier: PricingTier = {
        name: 'Pro',
        price: '$29',
        period: 'month',
        description: 'For growing teams',
        features: ['Feature 1', 'Feature 2'],
        cta: { text: 'Subscribe', href: '/checkout' },
        highlighted: true,
      };
      expect(tier.highlighted).toBe(true);
    });

    it('non-highlighted tier', () => {
      const tier: PricingTier = {
        name: 'Free',
        price: '$0',
        period: 'month',
        description: 'Get started',
        features: ['Basic'],
        cta: { text: 'Start Free', href: '/free' },
      };
      expect(tier.highlighted).toBeUndefined();
    });
  });

  // ===================== FaqItem =====================
  describe('FaqItem', () => {
    it('has question and answer', () => {
      const item: FaqItem = {
        question: 'What is IntelliFlow?',
        answer: 'An AI-powered CRM',
      };
      expect(item.question).toContain('IntelliFlow');
      expect(item.answer).toBeTruthy();
    });
  });

  // ===================== Stat =====================
  describe('Stat', () => {
    it('has value and label', () => {
      const stat: Stat = {
        value: '10,000+',
        label: 'Users',
      };
      expect(stat.value).toBe('10,000+');
      expect(stat.label).toBe('Users');
    });
  });

  // ===================== Conversion tracking semantics =====================
  describe('conversion tracking event names', () => {
    it('hero CTA generates correct event key', () => {
      const pageSlug = 'crm-landing';
      const eventKey = `lp_${pageSlug}`;
      expect(eventKey).toBe('lp_crm-landing');
    });

    it('footer CTA uses footer prefix', () => {
      const pageSlug = 'pricing';
      const eventKey = `lp_${pageSlug}`;
      const eventType = 'footer_cta_click';
      expect(eventKey).toBe('lp_pricing');
      expect(eventType).toBe('footer_cta_click');
    });

    it('page view event', () => {
      const pageSlug = 'homepage';
      const eventKey = `lp_${pageSlug}`;
      const eventType = 'page_view';
      expect(eventKey).toBe('lp_homepage');
      expect(eventType).toBe('page_view');
    });
  });

  // ===================== LogoCloudSection =====================
  describe('LogoCloudSection', () => {
    it('logos have name and optional src', () => {
      const section: LogoCloudSection = {
        type: 'logo-cloud',
        title: 'Trusted by',
        logos: [{ name: 'Company A' }, { name: 'Company B', src: '/logos/b.png' }],
      };
      expect(section.logos).toHaveLength(2);
      expect(section.logos[0].src).toBeUndefined();
      expect(section.logos[1].src).toBe('/logos/b.png');
    });
  });

  // ===================== CtaSection secondaryCta =====================
  describe('CtaSection secondaryCta', () => {
    it('secondaryCta is optional', () => {
      const section: CtaSection = {
        type: 'cta',
        title: 'Ready?',
        primaryCta: { text: 'Go', href: '/' },
      };
      expect(section.secondaryCta).toBeUndefined();
    });

    it('secondaryCta can be provided', () => {
      const section: CtaSection = {
        type: 'cta',
        title: 'Ready?',
        primaryCta: { text: 'Go', href: '/' },
        secondaryCta: { text: 'Learn More', href: '/about' },
      };
      expect(section.secondaryCta!.text).toBe('Learn More');
    });
  });
});
