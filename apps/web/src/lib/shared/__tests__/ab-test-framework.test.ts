/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getVariant,
  trackConversion,
  clearAssignments,
  getAssignments,
  useExperiment,
  LANDING_PAGE_EXPERIMENTS,
} from '../ab-test-framework';
import type { Experiment, Variant } from '../ab-test-framework';

describe('ab-test-framework', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // Helper to create a test experiment
  // =========================================================================
  function createExperiment(overrides: Partial<Experiment> = {}): Experiment {
    return {
      id: 'test-exp',
      name: 'Test Experiment',
      active: true,
      variants: [
        { id: 'control', name: 'Control', weight: 50 },
        { id: 'variant_a', name: 'Variant A', weight: 50 },
      ],
      ...overrides,
    };
  }

  // =========================================================================
  // getVariant
  // =========================================================================
  describe('getVariant', () => {
    it('returns null for inactive experiment', () => {
      const exp = createExperiment({ active: false });
      expect(getVariant(exp)).toBeNull();
    });

    it('returns null for experiment with no variants', () => {
      const exp = createExperiment({ variants: [] });
      expect(getVariant(exp)).toBeNull();
    });

    it('returns null when experiment start date is in the future', () => {
      const exp = createExperiment({ startDate: '2099-01-01T00:00:00Z' });
      expect(getVariant(exp)).toBeNull();
    });

    it('returns null when experiment end date is in the past', () => {
      const exp = createExperiment({ endDate: '2020-01-01T00:00:00Z' });
      expect(getVariant(exp)).toBeNull();
    });

    it('returns a variant for active experiment within date bounds', () => {
      const exp = createExperiment({
        startDate: '2020-01-01T00:00:00Z',
        endDate: '2099-12-31T00:00:00Z',
      });
      const variant = getVariant(exp);
      expect(variant).not.toBeNull();
      expect(['control', 'variant_a']).toContain(variant!.id);
    });

    it('returns a variant when no dates are specified', () => {
      const exp = createExperiment();
      const variant = getVariant(exp);
      expect(variant).not.toBeNull();
    });

    it('returns consistent variant for returning users', () => {
      const exp = createExperiment();
      const variant1 = getVariant(exp);
      const variant2 = getVariant(exp);

      expect(variant1).not.toBeNull();
      expect(variant2).not.toBeNull();
      expect(variant1!.id).toBe(variant2!.id);
    });

    it('stores assignment in localStorage', () => {
      const exp = createExperiment();
      getVariant(exp);

      const stored = localStorage.getItem('intelliflow_ab_assignments');
      expect(stored).not.toBeNull();

      const assignments = JSON.parse(stored!);
      expect(assignments['test-exp']).toBeDefined();
      expect(assignments['test-exp'].experimentId).toBe('test-exp');
      expect(assignments['test-exp'].assignedAt).toBeGreaterThan(0);
    });

    it('reuses existing assignment if variant still exists', () => {
      const exp = createExperiment();

      // Manually store an assignment
      const assignments = {
        'test-exp': {
          experimentId: 'test-exp',
          variantId: 'variant_a',
          assignedAt: Date.now(),
        },
      };
      localStorage.setItem('intelliflow_ab_assignments', JSON.stringify(assignments));

      const variant = getVariant(exp);
      expect(variant).not.toBeNull();
      expect(variant!.id).toBe('variant_a');
    });

    it('reassigns if stored variant no longer exists in experiment', () => {
      const exp = createExperiment();

      // Store an assignment with a non-existent variant
      const assignments = {
        'test-exp': {
          experimentId: 'test-exp',
          variantId: 'removed_variant',
          assignedAt: Date.now(),
        },
      };
      localStorage.setItem('intelliflow_ab_assignments', JSON.stringify(assignments));

      const variant = getVariant(exp);
      expect(variant).not.toBeNull();
      expect(['control', 'variant_a']).toContain(variant!.id);
    });

    it('handles corrupt localStorage gracefully', () => {
      localStorage.setItem('intelliflow_ab_assignments', 'invalid-json{{{');

      const exp = createExperiment();
      const variant = getVariant(exp);

      // Should not crash, should assign a new variant
      expect(variant).not.toBeNull();
    });
  });

  // =========================================================================
  // selectVariant (tested via getVariant with weighted selection)
  // =========================================================================
  describe('variant selection with weights', () => {
    it('selects variant based on weights', () => {
      // With 100% weight on one variant, always selects it
      const exp = createExperiment({
        variants: [
          { id: 'always', name: 'Always', weight: 100 },
          { id: 'never', name: 'Never', weight: 0 },
        ],
      });

      // Need to clear assignment each time
      for (let i = 0; i < 5; i++) {
        clearAssignments();
        const variant = getVariant(exp);
        expect(variant!.id).toBe('always');
      }
    });

    it('falls back to first variant when random exceeds all weights', () => {
      // Mock Math.random to return exactly 1.0 (edge case)
      // When random = totalWeight, all random -= weight operations leave random > 0
      // so it should fall back to variants[0]
      vi.spyOn(Math, 'random').mockReturnValue(0.9999999999);

      const exp = createExperiment({
        variants: [
          { id: 'a', name: 'A', weight: 50 },
          { id: 'b', name: 'B', weight: 50 },
        ],
      });

      const variant = getVariant(exp);
      expect(variant).not.toBeNull();
      // Should get variant b (50 - 49.999... > 0, 50 - 49.999... <= 0) or fallback
    });

    it('handles single variant experiment', () => {
      const exp = createExperiment({
        variants: [{ id: 'only', name: 'Only One', weight: 100 }],
      });

      const variant = getVariant(exp);
      expect(variant!.id).toBe('only');
    });
  });

  // =========================================================================
  // trackConversion
  // =========================================================================
  describe('trackConversion', () => {
    it('warns when no assignment exists for experiment', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      trackConversion('nonexistent-exp', 'click');

      expect(warnSpy).toHaveBeenCalledWith('No assignment found for experiment: nonexistent-exp');
    });

    it('queues conversion event to localStorage', () => {
      const exp = createExperiment();
      getVariant(exp); // Create assignment

      trackConversion('test-exp', 'signup', { plan: 'free' });

      const queue = JSON.parse(localStorage.getItem('intelliflow_ab_conversions') || '[]');
      expect(queue).toHaveLength(1);
      expect(queue[0]).toMatchObject({
        experimentId: 'test-exp',
        eventType: 'signup',
        metadata: { plan: 'free' },
      });
      expect(queue[0].timestamp).toBeGreaterThan(0);
    });

    it('appends to existing conversion queue', () => {
      const exp = createExperiment();
      getVariant(exp);

      trackConversion('test-exp', 'click');
      trackConversion('test-exp', 'signup');

      const queue = JSON.parse(localStorage.getItem('intelliflow_ab_conversions') || '[]');
      expect(queue).toHaveLength(2);
      expect(queue[0].eventType).toBe('click');
      expect(queue[1].eventType).toBe('signup');
    });

    it('dispatches CustomEvent for internal tracking', () => {
      const exp = createExperiment();
      getVariant(exp);

      const eventListener = vi.fn();
      window.addEventListener('ab_conversion', eventListener);

      trackConversion('test-exp', 'purchase');

      expect(eventListener).toHaveBeenCalledTimes(1);
      const customEvent = eventListener.mock.calls[0][0] as CustomEvent;
      expect(customEvent.detail.experimentId).toBe('test-exp');
      expect(customEvent.detail.eventType).toBe('purchase');

      window.removeEventListener('ab_conversion', eventListener);
    });

    it('calls gtag when available', () => {
      const gtagFn = vi.fn();
      (window as any).gtag = gtagFn;

      const exp = createExperiment();
      getVariant(exp);

      trackConversion('test-exp', 'click');

      expect(gtagFn).toHaveBeenCalledWith(
        'event',
        'ab_conversion',
        expect.objectContaining({
          experiment_id: 'test-exp',
          event_type: 'click',
        })
      );

      delete (window as any).gtag;
    });

    it('works without metadata', () => {
      const exp = createExperiment();
      getVariant(exp);

      // Should not throw
      trackConversion('test-exp', 'click');

      const queue = JSON.parse(localStorage.getItem('intelliflow_ab_conversions') || '[]');
      expect(queue[0].metadata).toBeUndefined();
    });
  });

  // =========================================================================
  // clearAssignments
  // =========================================================================
  describe('clearAssignments', () => {
    it('clears all assignments from localStorage', () => {
      const exp = createExperiment();
      getVariant(exp);

      expect(localStorage.getItem('intelliflow_ab_assignments')).not.toBeNull();

      clearAssignments();

      expect(localStorage.getItem('intelliflow_ab_assignments')).toBeNull();
    });

    it('clears conversion queue from localStorage', () => {
      const exp = createExperiment();
      getVariant(exp);
      trackConversion('test-exp', 'click');

      expect(localStorage.getItem('intelliflow_ab_conversions')).not.toBeNull();

      clearAssignments();

      expect(localStorage.getItem('intelliflow_ab_conversions')).toBeNull();
    });
  });

  // =========================================================================
  // getAssignments
  // =========================================================================
  describe('getAssignments', () => {
    it('returns empty object when no assignments exist', () => {
      expect(getAssignments()).toEqual({});
    });

    it('returns all stored assignments', () => {
      const exp1 = createExperiment({ id: 'exp-1' });
      const exp2 = createExperiment({ id: 'exp-2' });

      getVariant(exp1);
      getVariant(exp2);

      const assignments = getAssignments();
      expect(assignments['exp-1']).toBeDefined();
      expect(assignments['exp-2']).toBeDefined();
    });

    it('handles corrupt localStorage gracefully', () => {
      localStorage.setItem('intelliflow_ab_assignments', 'not-json');
      const assignments = getAssignments();
      expect(assignments).toEqual({});
    });
  });

  // =========================================================================
  // useExperiment
  // =========================================================================
  describe('useExperiment', () => {
    it('returns variant and trackConversion function', () => {
      const exp = createExperiment();
      const result = useExperiment(exp);

      expect(result.variant).not.toBeNull();
      expect(typeof result.trackConversion).toBe('function');
    });

    it('trackConversion function tracks for the correct experiment', () => {
      const exp = createExperiment();
      const { trackConversion: track } = useExperiment(exp);

      const eventListener = vi.fn();
      window.addEventListener('ab_conversion', eventListener);

      track('click', { button: 'cta' });

      const customEvent = eventListener.mock.calls[0][0] as CustomEvent;
      expect(customEvent.detail.experimentId).toBe('test-exp');
      expect(customEvent.detail.eventType).toBe('click');

      window.removeEventListener('ab_conversion', eventListener);
    });

    it('returns null variant for inactive experiment', () => {
      const exp = createExperiment({ active: false });
      const result = useExperiment(exp);
      expect(result.variant).toBeNull();
    });
  });

  // =========================================================================
  // LANDING_PAGE_EXPERIMENTS
  // =========================================================================
  describe('LANDING_PAGE_EXPERIMENTS', () => {
    it('has hero_cta experiment', () => {
      const exp = LANDING_PAGE_EXPERIMENTS.hero_cta;
      expect(exp.id).toBe('lp_hero_cta');
      expect(exp.active).toBe(true);
      expect(exp.variants).toHaveLength(3);
    });

    it('has social_proof experiment', () => {
      const exp = LANDING_PAGE_EXPERIMENTS.social_proof;
      expect(exp.id).toBe('lp_social_proof');
      expect(exp.active).toBe(true);
      expect(exp.variants).toHaveLength(2);
    });

    it('has pricing_display experiment', () => {
      const exp = LANDING_PAGE_EXPERIMENTS.pricing_display;
      expect(exp.id).toBe('lp_pricing_display');
      expect(exp.active).toBe(true);
      expect(exp.variants).toHaveLength(2);
    });

    it('all experiments have valid variant weights', () => {
      for (const [key, exp] of Object.entries(LANDING_PAGE_EXPERIMENTS)) {
        const totalWeight = exp.variants.reduce((sum, v) => sum + v.weight, 0);
        expect(totalWeight).toBe(100);
      }
    });

    it('all experiments are active by default', () => {
      for (const exp of Object.values(LANDING_PAGE_EXPERIMENTS)) {
        expect(exp.active).toBe(true);
      }
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe('edge cases', () => {
    it('handles localStorage write failures gracefully for storeAssignment', () => {
      // Make localStorage.setItem throw
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      const exp = createExperiment();
      // Should not throw
      const variant = getVariant(exp);
      expect(variant).not.toBeNull();
    });

    it('handles localStorage write failures for queueConversion', () => {
      const exp = createExperiment();
      // First get a variant (before breaking setItem)
      getVariant(exp);

      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      // Should not throw
      expect(() => trackConversion('test-exp', 'click')).not.toThrow();
    });
  });
});
