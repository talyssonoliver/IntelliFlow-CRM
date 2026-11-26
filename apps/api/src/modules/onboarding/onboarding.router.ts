/**
 * Onboarding Router
 *
 * Manages new-user onboarding flow state via Supabase user_metadata.
 * No DB migration required — state lives in Supabase Auth user_metadata.
 *
 * Endpoints:
 * - onboarding.getState   — returns { completed, selectedPlan }
 * - onboarding.complete   — marks onboarding complete; optionally records selectedPlan
 *
 * Both endpoints use protectedProcedure (auth required, NO email-verification gate,
 * NO tenant scope) because onboarding must be reachable immediately after sign-up,
 * before the user has verified their email or fully joined a tenant.
 *
 * The plan-selection step in onboarding is intentionally skippable — if a user
 * skips it they simply continue on the PROFESSIONAL trial (see billing.getPlanState).
 *
 * @implements incident 2026-06-16 onboarding redesign
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { supabaseAdmin } from '../../lib/supabase';

// ============================================
// Type helpers
// ============================================

interface OnboardingMetadata {
  onboarding_completed?: boolean;
  onboarding_selected_plan?: string | null;
}

/**
 * True when the caller is the admin of a workspace that has not chosen its business type yet.
 * Owner ruling 23/11/2026: the business type decides which vertical modules (Cases, Tickets,
 * Commerce) a workspace can have, so it is a required onboarding question for a new workspace.
 * Invited members are never asked (the admin chooses). Unknown (no tenant, no service) is false.
 */
async function needsBusinessType(ctx: {
  user?: { tenantId?: string | null; role?: string | null } | null;
  container?: { get: <T>(name: string) => T } | null;
}): Promise<boolean> {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId || ctx.user?.role !== 'ADMIN') return false;
  const moduleAccess =
    ctx.container?.get<import('@intelliflow/application').ModuleAccessPort>('moduleAccess');
  if (!moduleAccess || typeof moduleAccess.getBusinessType !== 'function') return false;
  try {
    return (await moduleAccess.getBusinessType(tenantId)) === null;
  } catch {
    return false;
  }
}

// ============================================
// Onboarding Router
// ============================================

export const onboardingRouter = createTRPCRouter({
  /**
   * Read the current user's onboarding state.
   *
   * Returns:
   *   {
   *     completed: boolean,      // fully onboarded — flowDone AND emailConfirmed
   *     flowDone: boolean,       // finished the welcome flow (profile + plan/trial)
   *     emailConfirmed: boolean, // Supabase email_confirmed_at is set
   *     selectedPlan: string | null,
   *   }
   *
   * Reads from Supabase Auth user_metadata + the auth user record.
   * Absent keys are treated as false / null (new users start un-onboarded).
   *
   * Completion is a composite: a user is only "completed" once they have BOTH
   * finished the welcome flow (`onboarding_completed` metadata, set by the
   * `complete` mutation) AND confirmed their email. `flowDone`/`emailConfirmed`
   * are returned individually so the welcome modal can show the right step
   * (profile/plan vs. verify-email) and keep returning until email is confirmed.
   */
  getState: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user!.userId;

    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to read onboarding state: ${error.message}`,
      });
    }

    if (!data?.user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found.',
      });
    }

    const meta = (data.user.user_metadata ?? {}) as OnboardingMetadata;
    const flowDone = meta.onboarding_completed === true;
    const emailConfirmed = Boolean(data.user.email_confirmed_at);

    return {
      completed: flowDone && emailConfirmed,
      flowDone,
      emailConfirmed,
      selectedPlan: meta.onboarding_selected_plan ?? null,
      needsBusinessType: await needsBusinessType(ctx),
    };
  }),

  /**
   * Mark onboarding as complete.
   *
   * Idempotent — safe to call multiple times.
   * Optionally records the user's plan selection (for analytics / prefill);
   * this does NOT provision a paid subscription.
   *
   * Input:
   *   { selectedPlan?: string }  e.g. 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'
   *
   * Returns:
   *   { success: true }
   */
  complete: protectedProcedure
    .input(
      z.object({
        selectedPlan: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.userId;

      // The business type is required for a new workspace: finish only after the admin chose it
      // (set with moduleAccess.setBusinessType from the welcome step).
      if (await needsBusinessType(ctx)) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Choose your business type before finishing setup.',
        });
      }

      const metadataUpdate: OnboardingMetadata = {
        onboarding_completed: true,
      };

      if (input.selectedPlan !== undefined) {
        metadataUpdate.onboarding_selected_plan = input.selectedPlan;
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: metadataUpdate,
      });

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to complete onboarding: ${error.message}`,
        });
      }

      return { success: true as const };
    }),
});
