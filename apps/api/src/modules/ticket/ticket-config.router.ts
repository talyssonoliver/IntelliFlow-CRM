/**
 * Ticket Config Router - PG-173
 *
 * Lightweight tRPC router for SLA policy and ticket category CRUD.
 * Uses direct Prisma access with tenantProcedure for tenant scoping.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  createSlaPolicySchema,
  updateSlaPolicySchema,
  createTicketCategorySchema,
  updateTicketCategorySchema,
  reorderTicketCategorySchema,
} from '@intelliflow/validators';

export const slaPolicyRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    return ctx.prismaWithTenant.sLAPolicy.findMany({
      where: { tenantId: ctx.tenant.tenantId },
      orderBy: { name: 'asc' },
    });
  }),

  getById: tenantProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    return ctx.prismaWithTenant.sLAPolicy.findFirst({
      where: { id: input.id, tenantId: ctx.tenant.tenantId },
    });
  }),

  create: tenantProcedure.input(createSlaPolicySchema).mutation(async ({ ctx, input }) => {
    return ctx.prismaWithTenant.sLAPolicy.create({
      data: { ...input, tenantId: ctx.tenant.tenantId },
    });
  }),

  update: tenantProcedure.input(updateSlaPolicySchema).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    const existing = await ctx.prismaWithTenant.sLAPolicy.findFirst({
      where: { id, tenantId: ctx.tenant.tenantId },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'SLA policy not found' });
    }
    return ctx.prismaWithTenant.sLAPolicy.update({ where: { id }, data });
  }),

  delete: tenantProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prismaWithTenant.sLAPolicy.findFirst({
      where: { id: input.id, tenantId: ctx.tenant.tenantId },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'SLA policy not found' });
    }
    return ctx.prismaWithTenant.sLAPolicy.update({
      where: { id: input.id },
      data: { isActive: false },
    });
  }),

  setDefault: tenantProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;
      return ctx.prismaWithTenant.$transaction(async (tx) => {
        await tx.sLAPolicy.updateMany({
          where: { tenantId },
          data: { isDefault: false },
        });
        return tx.sLAPolicy.update({
          where: { id: input.id },
          data: { isDefault: true },
        });
      });
    }),
});

const categoryRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    return ctx.prismaWithTenant.ticketCategory.findMany({
      where: { tenantId: ctx.tenant.tenantId },
      orderBy: { sortOrder: 'asc' },
    });
  }),

  getById: tenantProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    return ctx.prismaWithTenant.ticketCategory.findFirst({
      where: { id: input.id, tenantId: ctx.tenant.tenantId },
    });
  }),

  create: tenantProcedure.input(createTicketCategorySchema).mutation(async ({ ctx, input }) => {
    return ctx.prismaWithTenant.ticketCategory.create({
      data: {
        ...input,
        parentId: input.parentId ?? null,
        color: input.color ?? null,
        icon: input.icon ?? null,
        slaPolicyId: input.slaPolicyId ?? null,
        tenantId: ctx.tenant.tenantId,
      },
    });
  }),

  update: tenantProcedure.input(updateTicketCategorySchema).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    const existing = await ctx.prismaWithTenant.ticketCategory.findFirst({
      where: { id, tenantId: ctx.tenant.tenantId },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket category not found' });
    }
    return ctx.prismaWithTenant.ticketCategory.update({ where: { id }, data });
  }),

  delete: tenantProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prismaWithTenant.ticketCategory.findFirst({
      where: { id: input.id, tenantId: ctx.tenant.tenantId },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket category not found' });
    }
    const activeChildren = await ctx.prismaWithTenant.ticketCategory.count({
      where: { parentId: input.id, isActive: true, tenantId: ctx.tenant.tenantId },
    });
    if (activeChildren > 0) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Cannot delete: ${activeChildren} active child categories exist`,
      });
    }
    return ctx.prismaWithTenant.ticketCategory.update({
      where: { id: input.id },
      data: { isActive: false },
    });
  }),

  reorder: tenantProcedure.input(reorderTicketCategorySchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const ids = input.items.map((i) => i.id);
    const ownedCount = await ctx.prismaWithTenant.ticketCategory.count({
      where: { id: { in: ids }, tenantId },
    });
    if (ownedCount !== ids.length) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'One or more categories do not belong to this tenant',
      });
    }
    await ctx.prismaWithTenant.$transaction(
      input.items.map((item) =>
        ctx.prismaWithTenant.ticketCategory.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        })
      )
    );
    return { success: true };
  }),
});

export const ticketConfigRouter = createTRPCRouter({
  slaPolicy: slaPolicyRouter,
  category: categoryRouter,
});
