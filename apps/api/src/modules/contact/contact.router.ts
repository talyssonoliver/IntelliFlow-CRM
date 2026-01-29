/**
 * Contact Router (IFC-089)
 *
 * Provides type-safe tRPC endpoints for contact management:
 * - CRUD operations (create, read, update, delete)
 * - List with filtering and pagination
 * - Optimized search with <200ms target (KPI requirement)
 * - Link/unlink from accounts
 *
 * Uses ContactService from application layer (hexagonal architecture)
 *
 * @see Sprint 5 - IFC-089: Contacts Module - Create/Edit/Search
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  createContactSchema,
  updateContactSchema,
  contactQuerySchema,
  idSchema,
} from '@intelliflow/validators/contact';
import {
  bulkEmailContactsSchema,
  bulkExportContactsSchema,
  bulkDeleteContactsSchema,
} from '@intelliflow/validators';
import { mapContactToResponse } from '../../shared/mappers';
import type { Context } from '../../context';
import {
  getTenantContext,
  createTenantWhereClause,
  type TenantAwareContext
} from '../../security/tenant-context';

/**
 * Search schema optimized for performance
 * Minimal fields to enable fast database queries
 */
const contactSearchSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().positive().max(50).default(20),
  includeAccount: z.boolean().default(false),
});

/**
 * Helper to get contact service with null check
 */
function getContactService(ctx: Context) {
  if (!ctx.services?.contact) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Contact service not available',
    });
  }
  return ctx.services.contact;
}

export const contactRouter = createTRPCRouter({
  /**
   * Create a new contact using ContactService
   */
  create: tenantProcedure.input(createContactSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const contactService = getContactService(ctx);

    const result = await contactService.createContact({
      ...input,
      ownerId: typedCtx.tenant.userId,
      tenantId: typedCtx.tenant.tenantId,
    });

    if (result.isFailure) {
      const errorMessage = result.error.message;
      if (errorMessage.includes('already exists')) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: errorMessage,
        });
      }
      if (errorMessage.includes('not found')) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: errorMessage,
        });
      }
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: errorMessage,
      });
    }

    return mapContactToResponse(result.value);
  }),

  /**
   * Get a single contact by ID using ContactService
   * Note: For complex includes (relations), we still use Prisma directly
   * as the service returns domain entities without ORM relations
   */
  getById: tenantProcedure.input(z.object({ id: idSchema })).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const contactService = getContactService(ctx);

    // First verify contact exists via service
    const result = await contactService.getContactById(input.id);
    if (result.isFailure) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Contact with ID ${input.id} not found`,
      });
    }

    // For complex includes, use Prisma to get related data
    const contactWithRelations = await typedCtx.prismaWithTenant.contact.findUnique({
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

    return contactWithRelations;
  }),

  /**
   * Get a contact by email using ContactService
   */
  getByEmail: tenantProcedure
    .input(z.object({ email: z.string().email() }))
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const contactService = getContactService(ctx);

      const result = await contactService.getContactByEmail(input.email);
      if (result.isFailure) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Contact with email ${input.email} not found`,
        });
      }

      // For relations, use Prisma
      const contactWithRelations = await typedCtx.prismaWithTenant.contact.findUnique({
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

      return contactWithRelations;
    }),

  /**
   * List contacts with filtering and pagination
   * Uses direct Prisma for complex query building with relations
   * SECURITY: Uses tenantProcedure and createTenantWhereClause for isolation
   */
  list: tenantProcedure.input(contactQuerySchema).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const {
      page = 1,
      limit = 20,
      search,
      accountId,
      ownerId,
      department,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = input;

    const skip = (page - 1) * limit;

    // Build where clause with tenant isolation
    const baseWhere: any = {};

    if (search) {
      baseWhere.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (accountId) {
      baseWhere.accountId = accountId;
    }

    if (ownerId) {
      baseWhere.ownerId = ownerId;
    }

    if (department) {
      baseWhere.department = { contains: department, mode: 'insensitive' };
    }

    if (status) {
      baseWhere.status = status;
    }

    // Apply tenant filtering
    const where = createTenantWhereClause(typedCtx.tenant, baseWhere);

    // Execute queries in parallel using tenant-scoped Prisma
    const [contacts, total] = await Promise.all([
      typedCtx.prismaWithTenant.contact.findMany({
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
      typedCtx.prismaWithTenant.contact.count({ where }),
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
   * Update a contact using ContactService
   */
  update: tenantProcedure.input(updateContactSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const { id, accountId, ...data } = input;
    const contactService = getContactService(ctx);

    // Handle contact info updates via service
    if (data.firstName || data.lastName || data.title || data.phone || data.department || data.status) {
      const result = await contactService.updateContactInfo(
        id,
        {
          firstName: data.firstName,
          lastName: data.lastName,
          title: data.title,
          phone: data.phone?.toValue?.() ?? (data.phone as string | undefined),
          department: data.department,
          status: data.status,
        },
        typedCtx.tenant.userId
      );

      if (result.isFailure) {
        throw new TRPCError({
          code: result.error.message.includes('not found') ? 'NOT_FOUND' : 'BAD_REQUEST',
          message: result.error.message,
        });
      }
    }

    // Handle account association changes via service
    if (accountId !== undefined) {
      if (accountId === null) {
        // Disassociate from account
        const result = await contactService.disassociateFromAccount(id, typedCtx.tenant.userId);
        if (result.isFailure && !result.error.message.includes('not associated')) {
          throw new TRPCError({
            code: result.error.message.includes('not found') ? 'NOT_FOUND' : 'BAD_REQUEST',
            message: result.error.message,
          });
        }
      } else {
        // Associate with new account
        const result = await contactService.associateWithAccount(id, accountId, typedCtx.tenant.userId);
        if (result.isFailure) {
          throw new TRPCError({
            code: result.error.message.includes('not found') ? 'NOT_FOUND' : 'BAD_REQUEST',
            message: result.error.message,
          });
        }
      }
    }

    // Fetch updated contact
    const updatedResult = await contactService.getContactById(id);
    if (updatedResult.isFailure) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: updatedResult.error.message,
      });
    }

    return mapContactToResponse(updatedResult.value);
  }),

  /**
   * Delete a contact using ContactService
   */
  delete: tenantProcedure.input(z.object({ id: idSchema })).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const contactService = getContactService(ctx);

    // Check for opportunities (business rule not in service yet)
    const existingContact = await typedCtx.prismaWithTenant.contact.findUnique({
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

    // Delete via service
    const result = await contactService.deleteContact(input.id);
    if (result.isFailure) {
      throw new TRPCError({
        code: result.error.message.includes('not found') ? 'NOT_FOUND' : 'BAD_REQUEST',
        message: result.error.message,
      });
    }

    return { success: true, id: input.id };
  }),

  /**
   * Link a contact to an account using ContactService
   */
  linkToAccount: tenantProcedure
    .input(
      z.object({
        contactId: idSchema,
        accountId: idSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const contactService = getContactService(ctx);

      const result = await contactService.associateWithAccount(
        input.contactId,
        input.accountId,
        typedCtx.tenant.userId
      );

      if (result.isFailure) {
        const errorMessage = result.error.message;
        if (errorMessage.includes('not found')) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: errorMessage,
          });
        }
        if (errorMessage.includes('already associated')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: errorMessage,
          });
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: errorMessage,
        });
      }

      return mapContactToResponse(result.value);
    }),

  /**
   * Unlink a contact from an account using ContactService
   */
  unlinkFromAccount: tenantProcedure
    .input(z.object({ contactId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const contactService = getContactService(ctx);

      const result = await contactService.disassociateFromAccount(
        input.contactId,
        typedCtx.tenant.userId
      );

      if (result.isFailure) {
        const errorMessage = result.error.message;
        if (errorMessage.includes('not found')) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: errorMessage,
          });
        }
        if (errorMessage.includes('not associated')) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Contact is not linked to any account',
          });
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: errorMessage,
        });
      }

      return mapContactToResponse(result.value);
    }),

  /**
   * Get contact statistics using ContactService
   */
  stats: tenantProcedure.query(async ({ ctx }) => {
   const typedCtx = getTenantContext(ctx);
    const contactService = getContactService(ctx);

    const stats = await contactService.getContactStatistics(ctx.user?.userId);

    return {
      total: stats.total,
      byDepartment: stats.byDepartment,
      withAccounts: stats.withAccount,
      withoutAccounts: stats.withoutAccount,
    };
  }),

  /**
   * Optimized search endpoint (IFC-089)
   * Uses direct Prisma for performance optimization
   *
   * KPI Target: <200ms response time
   *
   * Performance optimizations:
   * - Uses database indexes on email, firstName, lastName
   * - Minimal select fields to reduce payload
   * - Parallel query execution
   * - Limited result set (max 50)
   * - Optional account include to minimize joins
   */
  search: tenantProcedure.input(contactSearchSchema).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const startTime = Date.now();
    const { query, limit, includeAccount } = input;

    // Build optimized where clause using indexed fields
    const where = {
      OR: [
        { email: { contains: query, mode: 'insensitive' as const } },
        { firstName: { contains: query, mode: 'insensitive' as const } },
        { lastName: { contains: query, mode: 'insensitive' as const } },
      ],
    };

    // Execute search with minimal data fetch
    const contacts = await typedCtx.prismaWithTenant.contact.findMany({
      where,
      take: limit,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        title: true,
        phone: true,
        department: true,
        status: true,
        accountId: true,
        ...(includeAccount && {
          account: {
            select: {
              id: true,
              name: true,
            },
          },
        }),
      },
    });

    const durationMs = Date.now() - startTime;

    // Log performance warning if exceeds target
    if (durationMs > 200) {
      console.warn(
        `[contact.search] SLOW QUERY: ${durationMs}ms (target: <200ms) for query: "${query}"`
      );
    }

    return {
      contacts,
      count: contacts.length,
      durationMs,
      performanceTarget: 200,
      meetsKpi: durationMs < 200,
    };
  }),

  /**
   * Get filter options with counts
   *
   * Returns available filter values with count of matching records.
   * Used for dynamic filters that hide options with 0 matches.
   */
  filterOptions: tenantProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z.array(z.string()).optional(),
        accountId: z.string().optional(),
        department: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);

      // Build base where clause with current filters
      const baseWhere: Record<string, unknown> = {};

      if (input?.search) {
        baseWhere.OR = [
          { email: { contains: input.search, mode: 'insensitive' } },
          { firstName: { contains: input.search, mode: 'insensitive' } },
          { lastName: { contains: input.search, mode: 'insensitive' } },
        ];
      }

      if (input?.accountId) {
        baseWhere.accountId = input.accountId;
      }

      if (input?.department) {
        baseWhere.department = { contains: input.department, mode: 'insensitive' };
      }

      const where = createTenantWhereClause(typedCtx.tenant, baseWhere);

      // Get counts for each filter option
      const [departmentCounts, accountCounts] = await Promise.all([
        typedCtx.prismaWithTenant.contact.groupBy({
          by: ['department'],
          where,
          _count: true,
        }),
        typedCtx.prismaWithTenant.contact.groupBy({
          by: ['accountId'],
          where,
          _count: true,
        }),
      ]);

      // Get account names for display
      const accountIds = accountCounts.map(a => a.accountId).filter(Boolean) as string[];
      const accounts = accountIds.length > 0
        ? await typedCtx.prismaWithTenant.account.findMany({
            where: { id: { in: accountIds } },
            select: { id: true, name: true },
          })
        : [];
      const accountMap = new Map(accounts.map(a => [a.id, a.name]));

      return {
        departments: departmentCounts
          .filter(d => d.department)
          .map(d => ({
            value: d.department as string,
            label: d.department as string,
            count: d._count,
          })),
        accounts: accountCounts
          .filter(a => a.accountId)
          .map(a => ({
            value: a.accountId as string,
            label: accountMap.get(a.accountId as string) ?? a.accountId ?? 'Unknown',
            count: a._count,
          })),
      };
    }),

  /**
   * Bulk email contacts - returns email addresses for mailto:
   */
  bulkEmail: tenantProcedure
    .input(bulkEmailContactsSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const { ids } = input;

      const contacts = await typedCtx.prismaWithTenant.contact.findMany({
        where: { id: { in: ids } },
        select: { id: true, email: true },
      });

      const emails = contacts.map(c => c.email);
      const mailtoUrl = `mailto:${emails.join(',')}`;

      return {
        successful: contacts.map(c => c.id),
        failed: ids.filter((id: string) => !contacts.find(c => c.id === id)).map((id: string) => ({
          id,
          error: 'Contact not found'
        })),
        totalProcessed: ids.length,
        emails,
        mailtoUrl,
      };
    }),

  /**
   * Bulk export contacts as CSV/JSON
   */
  bulkExport: tenantProcedure
    .input(bulkExportContactsSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const { ids, format } = input;

      const contacts = await typedCtx.prismaWithTenant.contact.findMany({
        where: { id: { in: ids } },
        include: {
          account: { select: { name: true } },
        },
      });

      let data: string;
      if (format === 'csv') {
        const headers = 'Email,First Name,Last Name,Title,Phone,Department,Account\n';
        const rows = contacts.map(c =>
          `"${c.email}","${c.firstName}","${c.lastName}","${c.title || ''}","${c.phone || ''}","${c.department || ''}","${c.account?.name || ''}"`
        ).join('\n');
        data = headers + rows;
      } else {
        data = JSON.stringify(contacts, null, 2);
      }

      return {
        successful: contacts.map(c => c.id),
        failed: ids.filter((id: string) => !contacts.find(c => c.id === id)).map((id: string) => ({
          id,
          error: 'Contact not found'
        })),
        totalProcessed: ids.length,
        data,
        count: contacts.length,
      };
    }),

  /**
   * Bulk delete contacts
   */
  bulkDelete: tenantProcedure
    .input(bulkDeleteContactsSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const contactService = getContactService(ctx);
      const { ids } = input;

      const successful: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];

      for (const contactId of ids) {
        try {
          // Check for opportunities first
          const contact = await typedCtx.prismaWithTenant.contact.findUnique({
            where: { id: contactId },
            include: { _count: { select: { opportunities: true } } },
          });

          if (!contact) {
            failed.push({ id: contactId, error: 'Contact not found' });
            continue;
          }

          if (contact._count.opportunities > 0) {
            failed.push({
              id: contactId,
              error: `Contact has ${contact._count.opportunities} opportunities`
            });
            continue;
          }

          const result = await contactService.deleteContact(contactId);
          if (result.isSuccess) {
            successful.push(contactId);
          } else {
            failed.push({ id: contactId, error: result.error.message });
          }
        } catch (error) {
          failed.push({
            id: contactId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return { successful, failed, totalProcessed: ids.length };
    }),
});
