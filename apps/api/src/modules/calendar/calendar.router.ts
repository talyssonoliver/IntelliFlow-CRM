/**
 * Calendar Router
 *
 * Provides tRPC endpoints for custom calendar management:
 * - List all custom calendars for the tenant
 * - Create a custom calendar
 * - Update calendar name/color (owner-only)
 * - Delete a custom calendar (owner-only), resetting calendarId on linked items
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { createCalendarSchema, updateCalendarSchema } from '@intelliflow/validators';

export const calendarRouter = createTRPCRouter({
  /**
   * List all custom calendars for the current tenant
   */
  list: tenantProcedure.query(async ({ ctx }) => {
    const calendars = await ctx.prisma.calendar.findMany({
      where: { tenantId: ctx.tenant.tenantId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        color: true,
        ownerId: true,
        createdAt: true,
      },
    });
    return calendars;
  }),

  /**
   * Create a new custom calendar
   */
  create: tenantProcedure.input(createCalendarSchema).mutation(async ({ ctx, input }) => {
    const calendar = await ctx.prisma.calendar.create({
      data: {
        name: input.name,
        color: input.color,
        tenantId: ctx.tenant.tenantId,
        ownerId: ctx.tenant.userId,
      },
      select: {
        id: true,
        name: true,
        color: true,
        ownerId: true,
        createdAt: true,
      },
    });
    return calendar;
  }),

  /**
   * Update a custom calendar (name and/or color). Owner-only.
   */
  update: tenantProcedure.input(updateCalendarSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.calendar.findFirst({
      where: { id: input.id, tenantId: ctx.tenant.tenantId },
    });

    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Calendar not found',
      });
    }

    if (existing.ownerId !== ctx.tenant.userId && !ctx.tenant.canAccessAllTenantData) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only the calendar owner or an admin can update this calendar',
      });
    }

    const calendar = await ctx.prisma.calendar.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.color !== undefined && { color: input.color }),
      },
      select: {
        id: true,
        name: true,
        color: true,
        ownerId: true,
        createdAt: true,
      },
    });
    return calendar;
  }),

  /**
   * Delete a custom calendar. Owner-only.
   * Resets calendarId to null on all linked appointments and tasks.
   */
  delete: tenantProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.calendar.findFirst({
      where: { id: input.id, tenantId: ctx.tenant.tenantId },
    });

    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Calendar not found',
      });
    }

    if (existing.ownerId !== ctx.tenant.userId && !ctx.tenant.canAccessAllTenantData) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only the calendar owner or an admin can delete this calendar',
      });
    }

    // Reset calendarId on linked items, then delete
    await ctx.prisma.$transaction([
      ctx.prisma.appointment.updateMany({
        where: { calendarId: input.id },
        data: { calendarId: null },
      }),
      ctx.prisma.task.updateMany({
        where: { calendarId: input.id },
        data: { calendarId: null },
      }),
      ctx.prisma.calendar.delete({
        where: { id: input.id },
      }),
    ]);

    return { success: true };
  }),
});
