import type { BounceKind, HardBounceAction, SuppressionReason } from './email-constants';

export interface BounceRules {
  hardBounceAction: HardBounceAction;
  softBounceThreshold: number;
}

export interface BounceDecision {
  suppress: boolean;
  reason: SuppressionReason | null;
}

const KEEP: BounceDecision = { suppress: false, reason: null };

/**
 * Decides whether a bounce suppresses the address. `softCount` is the number
 * of soft bounces for the address inside the soft-bounce window, INCLUDING
 * the one being evaluated (so threshold 3 suppresses on the third).
 */
export function evaluateBounce(
  kind: BounceKind,
  rules: BounceRules,
  softCount: number
): BounceDecision {
  if (kind === 'HARD') {
    return rules.hardBounceAction === 'SUPPRESS' ? { suppress: true, reason: 'HARD_BOUNCE' } : KEEP;
  }
  if (kind === 'SOFT' && softCount >= rules.softBounceThreshold) {
    return { suppress: true, reason: 'SOFT_BOUNCE_LIMIT' };
  }
  return KEEP;
}
