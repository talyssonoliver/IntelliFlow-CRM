import { describe, it, expect } from 'vitest';
import {
  publicFeedbackInputSchema,
  tourStepSchema,
  tourConfigSchema,
  onboardingConfigSchema,
} from '../public-onboarding';

describe('publicFeedbackInputSchema', () => {
  const base = {
    rating: 4,
    source: '/features',
  };

  it('accepts valid minimal input (rating + source)', () => {
    expect(() => publicFeedbackInputSchema.parse(base)).not.toThrow();
  });

  it('accepts optional comment, email, userAgent, honeypot', () => {
    const parsed = publicFeedbackInputSchema.parse({
      ...base,
      comment: 'Looks great',
      email: 'user@example.com',
      userAgent: 'Mozilla/5.0',
      __honeypot: '',
    });
    expect(parsed.rating).toBe(4);
    expect(parsed.email).toBe('user@example.com');
  });

  it.each([0, 6, -1, 1.5])('rejects rating out of 1..5: %s', (rating) => {
    expect(() =>
      publicFeedbackInputSchema.parse({ ...base, rating })
    ).toThrow();
  });

  it('rejects non-integer rating', () => {
    expect(() =>
      publicFeedbackInputSchema.parse({ ...base, rating: 3.5 })
    ).toThrow();
  });

  it('rejects comment longer than 1000 chars', () => {
    expect(() =>
      publicFeedbackInputSchema.parse({
        ...base,
        comment: 'x'.repeat(1001),
      })
    ).toThrow();
  });

  it('accepts comment exactly 1000 chars', () => {
    expect(() =>
      publicFeedbackInputSchema.parse({
        ...base,
        comment: 'x'.repeat(1000),
      })
    ).not.toThrow();
  });

  it('rejects invalid email', () => {
    expect(() =>
      publicFeedbackInputSchema.parse({ ...base, email: 'not-an-email' })
    ).toThrow();
  });

  it('rejects email longer than 254 chars', () => {
    // "x".repeat(250) + "@e.co" = 255 chars — over the 254-char limit.
    const local = 'x'.repeat(250);
    expect(() =>
      publicFeedbackInputSchema.parse({
        ...base,
        email: `${local}@e.co`,
      })
    ).toThrow();
  });

  it('rejects missing source', () => {
    expect(() =>
      publicFeedbackInputSchema.parse({ rating: 3 } as never)
    ).toThrow();
  });

  it('rejects non-empty __honeypot (literal empty string only)', () => {
    expect(() =>
      publicFeedbackInputSchema.parse({ ...base, __honeypot: 'spam' })
    ).toThrow();
  });

  it('rejects userAgent longer than 500 chars', () => {
    expect(() =>
      publicFeedbackInputSchema.parse({
        ...base,
        userAgent: 'x'.repeat(501),
      })
    ).toThrow();
  });
});

describe('tourStepSchema', () => {
  const baseStep = {
    id: 'hero',
    targetSelector: '[data-tour="hero"]',
    title: 'Welcome',
    description: 'This is the hero section.',
  };

  it('accepts a minimal step', () => {
    expect(() => tourStepSchema.parse(baseStep)).not.toThrow();
  });

  it('requires targetSelector', () => {
    expect(() =>
      tourStepSchema.parse({ ...baseStep, targetSelector: '' })
    ).toThrow();
  });

  it('limits title to 60 chars', () => {
    expect(() =>
      tourStepSchema.parse({ ...baseStep, title: 'x'.repeat(61) })
    ).toThrow();
  });

  it('limits description to 240 chars', () => {
    expect(() =>
      tourStepSchema.parse({ ...baseStep, description: 'x'.repeat(241) })
    ).toThrow();
  });

  it('accepts valid placement enum', () => {
    for (const placement of ['top', 'bottom', 'left', 'right', 'center'] as const) {
      expect(() =>
        tourStepSchema.parse({ ...baseStep, placement })
      ).not.toThrow();
    }
  });

  it('rejects unknown placement', () => {
    expect(() =>
      tourStepSchema.parse({ ...baseStep, placement: 'diagonal' as never })
    ).toThrow();
  });

  it('accepts optional cta with label and href', () => {
    expect(() =>
      tourStepSchema.parse({
        ...baseStep,
        cta: { label: 'Learn more', href: '/signup' },
      })
    ).not.toThrow();
  });

  it('rejects cta with empty label', () => {
    expect(() =>
      tourStepSchema.parse({
        ...baseStep,
        cta: { label: '', href: '/x' },
      })
    ).toThrow();
  });
});

describe('tourConfigSchema', () => {
  const baseTour = {
    id: 'features-v1',
    route: '/features',
    steps: [
      {
        id: 'hero',
        targetSelector: '[data-tour="hero"]',
        title: 'Welcome',
        description: 'Hero section.',
      },
    ],
  };

  it('accepts a valid tour', () => {
    expect(() => tourConfigSchema.parse(baseTour)).not.toThrow();
  });

  it('requires route starting with /', () => {
    expect(() =>
      tourConfigSchema.parse({ ...baseTour, route: 'features' })
    ).toThrow();
  });

  it('requires at least one step', () => {
    expect(() => tourConfigSchema.parse({ ...baseTour, steps: [] })).toThrow();
  });

  it('rejects more than 6 steps', () => {
    const steps = Array.from({ length: 7 }, (_, i) => ({
      id: `s${i}`,
      targetSelector: `[data-tour="s${i}"]`,
      title: `T${i}`,
      description: `D${i}`,
    }));
    expect(() => tourConfigSchema.parse({ ...baseTour, steps })).toThrow();
  });
});

describe('onboardingConfigSchema', () => {
  const tour = {
    id: 'features-v1',
    route: '/features',
    steps: [
      {
        id: 'hero',
        targetSelector: '[data-tour="hero"]',
        title: 'Welcome',
        description: 'Hero section.',
      },
    ],
  };

  it('accepts a config with one tour', () => {
    expect(() =>
      onboardingConfigSchema.parse({ tours: [tour] })
    ).not.toThrow();
  });

  it('requires at least one tour', () => {
    expect(() => onboardingConfigSchema.parse({ tours: [] })).toThrow();
  });
});
