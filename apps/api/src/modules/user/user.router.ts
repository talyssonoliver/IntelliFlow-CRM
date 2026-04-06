/**
 * User Router
 *
 * Provides user profile and timezone management endpoints.
 *
 * Task: IFC-191 — User Timezone Support
 */

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { updateTimezoneInputSchema } from '@intelliflow/validators';

export const userRouter = createTRPCRouter({
  /**
   * Get the authenticated user's profile (name, email, role, timezone).
   */
  getProfile: tenantProcedure.query(async ({ ctx }) => {
    if (!ctx.user?.userId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'User ID not found in context',
      });
    }

    const user = await ctx.prismaWithTenant.user.findUnique({
      where: { id: ctx.user.userId },
      select: { name: true, email: true, role: true, timezone: true },
    });

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return {
      name: user.name ?? null,
      email: user.email,
      role: user.role,
      timezone: user.timezone ?? 'Europe/London',
    };
  }),

  /**
   * Update the authenticated user's timezone.
   * Validates the timezone is a valid IANA identifier.
   */
  updateTimezone: tenantProcedure
    .input(updateTimezoneInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.userId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'User ID not found in context',
        });
      }

      await ctx.prismaWithTenant.user.update({
        where: { id: ctx.user.userId },
        data: { timezone: input.timezone },
      });

      return { success: true, timezone: input.timezone };
    }),
});
