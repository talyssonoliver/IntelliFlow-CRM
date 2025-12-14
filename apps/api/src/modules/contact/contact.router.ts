/**
 * Contact Router
 *
 * Provides type-safe tRPC endpoints for contact management:
 * - CRUD operations (create, read, update, delete)
 * - List with filtering and pagination
 * - Link/unlink from accounts
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../server';
import {
  createContactSchema,
  updateContactSchema,
  contactQuerySchema,
  idSchema,
} from '@intelliflow/validators/contact';

export const contactRouter = router({
  /**
   * Create a new contact
   */
  create: protectedProcedure
    .input(createContactSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if email already exists
      const existingContact = await ctx.prisma.contact.findUnique({
        where: { email: input.email },
      });

      if (existingContact) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Contact with email ${input.email} already exists`,
        });
      }

      // Validate account exists if provided
      if (input.accountId) {
        const account = await ctx.prisma.account.findUnique({
          where: { id: input.accountId },
        });

        if (!account) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Account with ID ${input.accountId} not found`,
          });
        }
      }

      const contact = await ctx.prisma.contact.create({
        data: {
          ...input,
          ownerId: ctx.user.userId,
        },
      });

      return contact;
    }),

  /**
   * Get a single contact by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: idSchema }))
    .query(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findUnique({
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
          account: true,
          lead: {
            select: {
              id: true,
              email: true,
              status: true,
              score: true,
            },
          },
          opportunities: {
            orderBy: { createdAt: 'desc' },
            include: {
              account: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          tasks: {
            where: { status: { not: 'COMPLETED' } },
            orderBy: { dueDate: 'asc' },
          },
        },
      });

      if (!contact) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Contact with ID ${input.id} not found`,
        });
      }

      return contact;
    }),

  /**
   * Get a contact by email
   */
  getByEmail: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .query(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findUnique({
        where: { email: input.email },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          account: true,
        },
      });

      if (!contact) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Contact with email ${input.email} not found`,
        });
      }

      return contact;
    }),

  /**
   * List contacts with filtering and pagination
   */
  list: protectedProcedure
    .input(contactQuerySchema)
    .query(async ({ ctx, input }) => {
      const {
        page = 1,
        limit = 20,
        search,
        accountId,
        ownerId,
        department,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = input;

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {};

      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
          { department: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (accountId) {
        where.accountId = accountId;
      }

      if (ownerId) {
        where.ownerId = ownerId;
      }

      if (department) {
        where.department = { contains: department, mode: 'insensitive' };
      }

      // Execute queries in parallel
      const [contacts, total] = await Promise.all([
        ctx.prisma.contact.findMany({
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
            account: {
              select: {
                id: true,
                name: true,
                industry: true,
              },
            },
            _count: {
              select: {
                opportunities: true,
                tasks: true,
              },
            },
          },
        }),
        ctx.prisma.contact.count({ where }),
      ]);

      return {
        contacts,
        total,
        page,
        limit,
        hasMore: skip + contacts.length < total,
      };
    }),

  /**
   * Update a contact
   */
  update: protectedProcedure
    .input(updateContactSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, accountId, ...data } = input;

      // Check if contact exists
      const existingContact = await ctx.prisma.contact.findUnique({
        where: { id },
      });

      if (!existingContact) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Contact with ID ${id} not found`,
        });
      }

      // Validate account exists if provided
      if (accountId !== undefined && accountId !== null) {
        const account = await ctx.prisma.account.findUnique({
          where: { id: accountId },
        });

        if (!account) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Account with ID ${accountId} not found`,
          });
        }
      }

      // Update the contact
      const contact = await ctx.prisma.contact.update({
        where: { id },
        data: {
          ...data,
          ...(accountId !== undefined && { accountId }),
        },
      });

      return contact;
    }),

  /**
   * Delete a contact
   */
  delete: protectedProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      // Check if contact exists
      const existingContact = await ctx.prisma.contact.findUnique({
        where: { id: input.id },
        include: {
          _count: {
            select: {
              opportunities: true,
            },
          },
        },
      });

      if (!existingContact) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Contact with ID ${input.id} not found`,
        });
      }

      // Warn if contact has opportunities
      if (existingContact._count.opportunities > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Contact has ${existingContact._count.opportunities} associated opportunities. Please reassign or delete them first.`,
        });
      }

      // Delete the contact
      await ctx.prisma.contact.delete({
        where: { id: input.id },
      });

      return { success: true, id: input.id };
    }),

  /**
   * Link a contact to an account
   */
  linkToAccount: protectedProcedure
    .input(
      z.object({
        contactId: idSchema,
        accountId: idSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate contact exists
      const contact = await ctx.prisma.contact.findUnique({
        where: { id: input.contactId },
      });

      if (!contact) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Contact with ID ${input.contactId} not found`,
        });
      }

      // Validate account exists
      const account = await ctx.prisma.account.findUnique({
        where: { id: input.accountId },
      });

      if (!account) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Account with ID ${input.accountId} not found`,
        });
      }

      // Link the contact to the account
      const updatedContact = await ctx.prisma.contact.update({
        where: { id: input.contactId },
        data: { accountId: input.accountId },
      });

      return updatedContact;
    }),

  /**
   * Unlink a contact from an account
   */
  unlinkFromAccount: protectedProcedure
    .input(z.object({ contactId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findUnique({
        where: { id: input.contactId },
      });

      if (!contact) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Contact with ID ${input.contactId} not found`,
        });
      }

      if (!contact.accountId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Contact is not linked to any account',
        });
      }

      // Unlink the contact from the account
      const updatedContact = await ctx.prisma.contact.update({
        where: { id: input.contactId },
        data: { accountId: null },
      });

      return updatedContact;
    }),

  /**
   * Get contact statistics
   */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [total, byDepartment, withAccounts] = await Promise.all([
      ctx.prisma.contact.count(),
      ctx.prisma.contact.groupBy({
        by: ['department'],
        _count: true,
        where: {
          department: { not: null },
        },
      }),
      ctx.prisma.contact.count({
        where: { accountId: { not: null } },
      }),
    ]);

    return {
      total,
      byDepartment: byDepartment.reduce((acc, item) => {
        if (item.department) {
          acc[item.department] = item._count;
        }
        return acc;
      }, {} as Record<string, number>),
      withAccounts,
      withoutAccounts: total - withAccounts,
    };
  }),
});
