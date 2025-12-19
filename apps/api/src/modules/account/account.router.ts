/**
 * Account Router
 *
 * Provides type-safe tRPC endpoints for account management:
 * - CRUD operations (create, read, update, delete)
 * - List with filtering and pagination
 * - Account statistics and insights
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../server';
import {
  createAccountSchema,
  updateAccountSchema,
  accountQuerySchema,
  idSchema,
} from '@intelliflow/validators/account';

export const accountRouter = router({
  /**
   * Create a new account
   */
  create: protectedProcedure.input(createAccountSchema).mutation(async ({ ctx, input }) => {
    const account = await ctx.prisma.account.create({
      data: {
        ...input,
        ownerId: ctx.user.userId,
      },
    });

    return account;
  }),

  /**
   * Get a single account by ID
   */
  getById: protectedProcedure.input(z.object({ id: idSchema })).query(async ({ ctx, input }) => {
    const account = await ctx.prisma.account.findUnique({
      where: { id: input.id },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          },
        },
        contacts: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            title: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        opportunities: {
          select: {
            id: true,
            name: true,
            value: true,
            stage: true,
            probability: true,
            expectedCloseDate: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            contacts: true,
            opportunities: true,
          },
        },
      },
    });

    if (!account) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Account with ID ${input.id} not found`,
      });
    }

    return account;
  }),

  /**
   * List accounts with filtering and pagination
   */
  list: protectedProcedure.input(accountQuerySchema).query(async ({ ctx, input }) => {
    const {
      page = 1,
      limit = 20,
      search,
      industry,
      ownerId,
      minRevenue,
      maxRevenue,
      minEmployees,
      maxEmployees,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = input;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { website: { contains: search, mode: 'insensitive' } },
        { industry: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (industry) {
      where.industry = { contains: industry, mode: 'insensitive' };
    }

    if (ownerId) {
      where.ownerId = ownerId;
    }

    if (minRevenue !== undefined || maxRevenue !== undefined) {
      where.revenue = {};
      if (minRevenue !== undefined) where.revenue.gte = minRevenue;
      if (maxRevenue !== undefined) where.revenue.lte = maxRevenue;
    }

    if (minEmployees !== undefined || maxEmployees !== undefined) {
      where.employees = {};
      if (minEmployees !== undefined) where.employees.gte = minEmployees;
      if (maxEmployees !== undefined) where.employees.lte = maxEmployees;
    }

    // Execute queries in parallel
    const [accounts, total] = await Promise.all([
      ctx.prisma.account.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          _count: {
            select: {
              contacts: true,
              opportunities: true,
            },
          },
        },
      }),
      ctx.prisma.account.count({ where }),
    ]);

    return {
      accounts,
      total,
      page,
      limit,
      hasMore: skip + accounts.length < total,
    };
  }),

  /**
   * Update an account
   */
  update: protectedProcedure.input(updateAccountSchema).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;

    // Check if account exists
    const existingAccount = await ctx.prisma.account.findUnique({
      where: { id },
    });

    if (!existingAccount) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Account with ID ${id} not found`,
      });
    }

    // Update the account
    const account = await ctx.prisma.account.update({
      where: { id },
      data,
    });

    return account;
  }),

  /**
   * Delete an account
   */
  delete: protectedProcedure.input(z.object({ id: idSchema })).mutation(async ({ ctx, input }) => {
    // Check if account exists
    const existingAccount = await ctx.prisma.account.findUnique({
      where: { id: input.id },
      include: {
        _count: {
          select: {
            contacts: true,
            opportunities: true,
          },
        },
      },
    });

    if (!existingAccount) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Account with ID ${input.id} not found`,
      });
    }

    // Warn if account has related records
    if (existingAccount._count.contacts > 0 || existingAccount._count.opportunities > 0) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Account has ${existingAccount._count.contacts} contacts and ${existingAccount._count.opportunities} opportunities. Please reassign or delete them first.`,
      });
    }

    // Delete the account
    await ctx.prisma.account.delete({
      where: { id: input.id },
    });

    return { success: true, id: input.id };
  }),

  /**
   * Get account statistics
   */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [total, byIndustry, withContacts, totalRevenue] = await Promise.all([
      ctx.prisma.account.count(),
      ctx.prisma.account.groupBy({
        by: ['industry'],
        _count: true,
        where: {
          industry: { not: null },
        },
      }),
      ctx.prisma.account.count({
        where: {
          contacts: {
            some: {},
          },
        },
      }),
      ctx.prisma.account.aggregate({
        _sum: { revenue: true },
      }),
    ]);

    return {
      total,
      byIndustry: byIndustry.reduce(
        (acc, item) => {
          if (item.industry) {
            acc[item.industry] = item._count;
          }
          return acc;
        },
        {} as Record<string, number>
      ),
      withContacts,
      withoutContacts: total - withContacts,
      totalRevenue: totalRevenue._sum.revenue?.toString() || '0',
    };
  }),
});
