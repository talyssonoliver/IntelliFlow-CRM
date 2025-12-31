/**
 * A/B Testing Framework
 *
 * Lightweight A/B testing framework for landing pages and feature experiments.
 * Supports variant assignment, conversion tracking, and analytics integration.
 *
 * Task: PG-013
 */

export type VariantId = string;

export interface Variant {
  id: VariantId;
  name: string;
  weight: number; // 0-100 percentage
}

export interface Experiment {
  id: string;
  name: string;
  description?: string;
  variants: Variant[];
  active: boolean;
  startDate?: string;
  endDate?: string;
}

export interface ExperimentAssignment {
  experimentId: string;
  variantId: VariantId;
  assignedAt: number;
}

export interface ConversionEvent {
  experimentId: string;
  variantId: VariantId;
  eventType: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

const STORAGE_KEY = 'intelliflow_ab_assignments';
const CONVERSION_QUEUE_KEY = 'intelliflow_ab_conversions';

/**
 * Get stored experiment assignments from localStorage
 */
function getStoredAssignments(): Record<string, ExperimentAssignment> {
  if (typeof window === 'undefined') return {};

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/**
 * Store experiment assignment in localStorage
 */
function storeAssignment(assignment: ExperimentAssignment): void {
  if (typeof window === 'undefined') return;

  try {
    const assignments = getStoredAssignments();
    assignments[assignment.experimentId] = assignment;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
  } catch {
    // Silent fail for storage errors
  }
}

/**
 * Select a variant based on weights using weighted random selection
 */
function selectVariant(variants: Variant[]): Variant {
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  let random = Math.random() * totalWeight;

  for (const variant of variants) {
    random -= variant.weight;
    if (random <= 0) {
      return variant;
    }
  }

  // Fallback to first variant
  return variants[0];
}

/**
 * Get or assign a variant for an experiment
 * Returns consistent variant for returning users
 */
export function getVariant(experiment: Experiment): Variant | null {
  if (!experiment.active || experiment.variants.length === 0) {
    return null;
  }

  // Check date bounds
  const now = Date.now();
  if (experiment.startDate && new Date(experiment.startDate).getTime() > now) {
    return null;
  }
  if (experiment.endDate && new Date(experiment.endDate).getTime() < now) {
    return null;
  }

  // Check for existing assignment
  const assignments = getStoredAssignments();
  const existing = assignments[experiment.id];

  if (existing) {
    const variant = experiment.variants.find((v) => v.id === existing.variantId);
    if (variant) {
      return variant;
    }
  }

  // Assign new variant
  const selectedVariant = selectVariant(experiment.variants);

  storeAssignment({
    experimentId: experiment.id,
    variantId: selectedVariant.id,
    assignedAt: now,
  });

  return selectedVariant;
}

/**
 * Track a conversion event for an experiment
 */
export function trackConversion(
  experimentId: string,
  eventType: string,
  metadata?: Record<string, unknown>
): void {
  if (typeof window === 'undefined') return;

  const assignments = getStoredAssignments();
  const assignment = assignments[experimentId];

  if (!assignment) {
    console.warn(`No assignment found for experiment: ${experimentId}`);
    return;
  }

  const event: ConversionEvent = {
    experimentId,
    variantId: assignment.variantId,
    eventType,
    metadata,
    timestamp: Date.now(),
  };

  // Queue conversion for batch sending
  queueConversion(event);

  // Send immediately if analytics is available
  sendConversion(event);
}

/**
 * Queue conversion event for batch processing
 */
function queueConversion(event: ConversionEvent): void {
  try {
    const queue = JSON.parse(localStorage.getItem(CONVERSION_QUEUE_KEY) || '[]');
    queue.push(event);
    localStorage.setItem(CONVERSION_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Silent fail
  }
}

/**
 * Send conversion event to analytics
 */
function sendConversion(event: ConversionEvent): void {
  // Integration with analytics providers
  if (typeof window !== 'undefined') {
    // Google Analytics 4
    if ('gtag' in window && typeof (window as { gtag?: Function }).gtag === 'function') {
      (window as { gtag: Function }).gtag('event', 'ab_conversion', {
        experiment_id: event.experimentId,
        variant_id: event.variantId,
        event_type: event.eventType,
        ...event.metadata,
      });
    }

    // Custom event for internal tracking
    window.dispatchEvent(
      new CustomEvent('ab_conversion', { detail: event })
    );
  }
}

/**
 * Clear all experiment assignments (useful for testing)
 */
export function clearAssignments(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(CONVERSION_QUEUE_KEY);
}

/**
 * Get all current assignments (for debugging)
 */
export function getAssignments(): Record<string, ExperimentAssignment> {
  return getStoredAssignments();
}

/**
 * React hook for A/B testing
 */
export function useExperiment(experiment: Experiment): {
  variant: Variant | null;
  trackConversion: (eventType: string, metadata?: Record<string, unknown>) => void;
} {
  // Note: This is a simplified version. In production, use useState/useEffect
  const variant = getVariant(experiment);

  return {
    variant,
    trackConversion: (eventType: string, metadata?: Record<string, unknown>) => {
      trackConversion(experiment.id, eventType, metadata);
    },
  };
}

/**
 * Predefined experiments for landing pages
 */
export const LANDING_PAGE_EXPERIMENTS: Record<string, Experiment> = {
  hero_cta: {
    id: 'lp_hero_cta',
    name: 'Hero CTA Button Text',
    description: 'Test different CTA button text on landing pages',
    active: true,
    variants: [
      { id: 'control', name: 'Start Free Trial', weight: 50 },
      { id: 'variant_a', name: 'Get Started Free', weight: 25 },
      { id: 'variant_b', name: 'Try It Free', weight: 25 },
    ],
  },
  social_proof: {
    id: 'lp_social_proof',
    name: 'Social Proof Position',
    description: 'Test social proof placement on landing pages',
    active: true,
    variants: [
      { id: 'above_fold', name: 'Above the Fold', weight: 50 },
      { id: 'below_hero', name: 'Below Hero', weight: 50 },
    ],
  },
  pricing_display: {
    id: 'lp_pricing_display',
    name: 'Pricing Display Style',
    description: 'Test pricing display formats',
    active: true,
    variants: [
      { id: 'monthly', name: 'Monthly First', weight: 50 },
      { id: 'annual', name: 'Annual First', weight: 50 },
    ],
  },
};
