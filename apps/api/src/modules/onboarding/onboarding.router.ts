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

// ============================================
// Onboarding Router
// ============================================

export const onboardingRouter = createTRPCRouter({
  /**
   * Read the current user's onboarding state.
   *
   * Returns:
   *   { completed: boolean, selectedPlan: string | null }
   *
   * Reads from Supabase Auth user_metadata.
   * Absent keys are treated as false / null (new users start un-onboarded).
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

    return {
      completed: meta.onboarding_completed === true,
      selectedPlan: meta.onboarding_selected_plan ?? null,
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
