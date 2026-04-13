/**
 * User Router
 *
 * Provides user profile and timezone management endpoints.
 *
 * Task: IFC-191 — User Timezone Support
 * Phase 2: Profile field expansion (avatar, bio, contact info, OAuth metadata)
 */

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { updateTimezoneInputSchema, updateProfileInputSchema } from '@intelliflow/validators';

export const userRouter = createTRPCRouter({
  /**
   * Get the authenticated user's full profile.
   * Returns identity, contact info, OAuth metadata, and preferences.
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
      select: {
        name: true,
        givenName: true,
        familyName: true,
        email: true,
        avatarUrl: true,
        role: true,
        timezone: true,
        locale: true,
        phone: true,
        company: true,
        department: true,
        location: true,
        website: true,
        bio: true,
        provider: true,
        emailVerified: true,
        lastSignInAt: true,
        signInCount: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return {
      name: user.name ?? null,
      givenName: user.givenName ?? null,
      familyName: user.familyName ?? null,
      email: user.email,
      avatarUrl: user.avatarUrl ?? null,
      role: user.role,
      timezone: user.timezone ?? 'UTC',
      locale: user.locale ?? 'en-GB',
      phone: user.phone ?? null,
      company: user.company ?? null,
      department: user.department ?? null,
      location: user.location ?? null,
      website: user.website ?? null,
      bio: user.bio ?? null,
      provider: user.provider ?? null,
      emailVerified: user.emailVerified,
      lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
      signInCount: user.signInCount,
      createdAt: user.createdAt.toISOString(),
    };
  }),

  /**
   * Update the authenticated user's timezone.
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

  /**
   * Update the authenticated user's profile fields.
   * Only provided fields are updated; omitted fields are unchanged.
   * Email and role are NOT updatable here (managed separately).
   */
  updateProfile: tenantProcedure
    .input(updateProfileInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.userId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'User ID not found in context',
        });
      }

      const data: Record<string, unknown> = {};
      for (const key of Object.keys(input) as Array<keyof typeof input>) {
        if (input[key] !== undefined) data[key] = input[key];
      }

      // Keep `name` synced with given/family if either is provided
      if (input.givenName !== undefined || input.familyName !== undefined) {
        const current = await ctx.prismaWithTenant.user.findUnique({
          where: { id: ctx.user.userId },
          select: { givenName: true, familyName: true },
        });
        const givenName = input.givenName ?? current?.givenName ?? '';
        const familyName = input.familyName ?? current?.familyName ?? '';
        const composed = [givenName, familyName].filter(Boolean).join(' ').trim();
        if (composed && input.name === undefined) {
          data.name = composed;
        }
      }

      await ctx.prismaWithTenant.user.update({
        where: { id: ctx.user.userId },
        data,
      });

      return { success: true };
    }),
});
