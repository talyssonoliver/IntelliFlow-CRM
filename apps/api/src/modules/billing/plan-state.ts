/**
 * One answer to "what plan is this workspace on, and is it on a trial?" (#1220).
 *
 * - The tier is always `Tenant.plan`: the value access enforcement reads, and the one the
 *   Stripe webhook writes after a purchase. The badge and the gates can't disagree.
 * - A live subscription (ACTIVE or PAST_DUE) means a paid plan: no trial.
 * - PARTNER_FREE is granted by a partner (ADR-070): never on a trial clock.
 * - Otherwise the workspace is on its trial, which ends at `Tenant.trialEndsAt` (created + 14
 *   days for rows not yet backfilled). Once that passes the status is TRIAL_ENDED, and stays
 *   so until a plan is bought: an ended trial is never shown as "0 days left".
 */

import type { PlanTier } from '@intelliflow/domain';
import { effectiveTrialEnd, trialDaysLeft } from './trial';

export interface PlanStateInput {
  activeSub: { status: string; currentPeriodEnd: Date | null } | null;
  tenant: { plan: PlanTier; createdAt: Date; trialEndsAt: Date | null } | null;
  now: Date;
}

export type PlanState =
  | {
      source: 'stripe';
      tier: PlanTier;
      status: 'ACTIVE' | 'PAST_DUE';
      currentPeriodEnd: string | null;
      trialEndsAt: null;
      daysLeft: null;
    }
  | {
      source: 'partner';
      tier: 'PARTNER_FREE';
      status: 'ACTIVE';
      currentPeriodEnd: null;
      trialEndsAt: null;
      daysLeft: null;
    }
  | {
      source: 'trial';
      tier: PlanTier;
      status: 'TRIALING' | 'TRIAL_ENDED';
      currentPeriodEnd: null;
      trialEndsAt: string;
      daysLeft: number;
    };

export function resolvePlanState({ activeSub, tenant, now }: PlanStateInput): PlanState {
  // A tenant row always exists for a tenant context; STARTER mirrors the column default.
  const plan: PlanTier = tenant?.plan ?? 'STARTER';

  if (activeSub) {
    return {
      source: 'stripe',
      tier: plan,
      status: activeSub.status === 'PAST_DUE' ? 'PAST_DUE' : 'ACTIVE',
      currentPeriodEnd: activeSub.currentPeriodEnd?.toISOString() ?? null,
      trialEndsAt: null,
      daysLeft: null,
    };
  }

  if (plan === 'PARTNER_FREE') {
    return {
      source: 'partner',
      tier: 'PARTNER_FREE',
      status: 'ACTIVE',
      currentPeriodEnd: null,
      trialEndsAt: null,
      daysLeft: null,
    };
  }

  const trialEndsAt = effectiveTrialEnd(tenant ?? { trialEndsAt: null, createdAt: now });
  const ended = trialEndsAt.getTime() <= now.getTime();
  return {
    source: 'trial',
    tier: plan,
    status: ended ? 'TRIAL_ENDED' : 'TRIALING',
    currentPeriodEnd: null,
    trialEndsAt: trialEndsAt.toISOString(),
    daysLeft: ended ? 0 : trialDaysLeft(trialEndsAt, now),
  };
}
