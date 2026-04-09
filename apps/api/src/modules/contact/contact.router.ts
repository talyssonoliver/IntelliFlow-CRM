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
  linkToLeadSchema,
  unlinkFromLeadSchema,
  contactTimelineSchema,
  contactTimelineResponseSchema,
  logActivitySchema,
  addContactNoteSchema,
} from '@intelliflow/validators/contact';
import {
  bulkEmailContactsSchema,
  bulkExportContactsSchema,
  bulkDeleteContactsSchema,
} from '@intelliflow/validators';
import { mapContactToResponse } from '../../shared/mappers';
import type { Context } from '../../context';
import { loadBullMQ } from '../../lib/load-bullmq';
import {
  getTenantContext,
  createTenantWhereClause,
  type TenantAwareContext,
} from '../../security/tenant-context';
import { deriveContactInsights } from '../../shared/contact-insight-deriver';

/**
 * Search schema optimized for performance
 * Minimal fields to enable fast database queries
 */
const contactSearchSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().positive().max(50).default(20),
  includeAccount: z.boolean().default(false),
});

type UpdateContactData = Record<string, unknown> & {
  phone?: string | { toValue?: () => string };
  firstName?: string;
  lastName?: string;
  title?: string;
  department?: string;
  status?: string;
  streetAddress?: string;
  city?: string;
  zipCode?: string;
  company?: string;
  linkedInUrl?: string;
  contactType?: string;
  tags?: string[];
  contactNotes?: string;
};

const CONTACT_INFO_FIELDS = [
  'firstName', 'lastName', 'title', 'department', 'status',
  'streetAddress', 'city', 'zipCode', 'company', 'linkedInUrl',
  'contactType', 'tags', 'contactNotes',
] as const;

/**
 * Build the info-update payload from a contact update input, extracting
 * all scalar fields and resolving the phone Value Object.
 */
function buildContactInfoUpdates(data: UpdateContactData): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const field of CONTACT_INFO_FIELDS) {
    if (data[field] !== undefined) updates[field] = data[field];
  }
  if (data.phone !== undefined) {
    updates.phone = typeof data.phone === 'string' ? data.phone : data.phone?.toValue?.();
  }
  return updates;
}

/**
 * Build the base WHERE clause for the contacts list query.
 * Extracted to reduce cognitive complexity of the list procedure.
 */
function buildContactListWhere(filters: {
  search?: string;
  accountId?: string;
  ownerId?: string;
  department?: string;
  status?: string;
}): Record<string, unknown> {
  const { search, accountId, ownerId, department, status } = filters;
  const baseWhere: Record<string, unknown> = {};

  if (search) {
    baseWhere.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { title: { contains: search, mode: 'insensitive' } },
      { department: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (accountId) baseWhere.accountId = accountId;
  if (ownerId) baseWhere.ownerId = ownerId;
  if (department) baseWhere.department = { contains: department, mode: 'insensitive' };
  if (status) baseWhere.status = status;

  return baseWhere;
}

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

// ── Error-mapping helpers (reduce cognitive complexity in procedures) ──

function throwContactCreateError(message: string): never {
  if (message.includes('already exists')) {
    throw new TRPCError({ code: 'CONFLICT', message });
  }
  if (message.includes('not found')) {
    throw new TRPCError({ code: 'NOT_FOUND', message });
  }
  throw new TRPCError({ code: 'BAD_REQUEST', message });
}

function throwContactAssociationError(message: string): never {
  if (message.includes('not found')) {
    throw new TRPCError({ code: 'NOT_FOUND', message });
  }
  if (message.includes('already associated')) {
    throw new TRPCError({ code: 'CONFLICT', message });
  }
  throw new TRPCError({ code: 'BAD_REQUEST', message });
}

function throwContactLinkLeadError(message: string): never {
  if (message.includes('not found')) {
    throw new TRPCError({ code: 'NOT_FOUND', message });
  }
  if (message.includes('already linked') || message.includes('Unique constraint')) {
    throw new TRPCError({ code: 'CONFLICT', message });
  }
  if (message.includes('same tenant')) {
    throw new TRPCError({ code: 'FORBIDDEN', message });
  }
  throw new TRPCError({ code: 'BAD_REQUEST', message });
}

/**
 * Handle account disassociation (null accountId) in update
 */
async function handleDisassociateAccount(
  contactService: ReturnType<typeof getContactService>,
  id: string,
  userId: string
): Promise<void> {
  const result = await contactService.disassociateFromAccount(id, userId);
  if (result.isFailure && !result.error.message.includes('not associated')) {
    const msg = result.error.message;
    throw new TRPCError({
      code: msg.includes('not found') ? 'NOT_FOUND' : 'BAD_REQUEST',
      message: msg,
    });
  }
}

/**
 * Handle account association (non-null accountId) in update
 */
async function handleAssociateAccount(
  contactService: ReturnType<typeof getContactService>,
  id: string,
  accountId: string,
  userId: string,
  tenantId: string
): Promise<void> {
  const result = await contactService.associateWithAccount(id, accountId, userId, tenantId);
  if (result.isFailure) {
    const msg = result.error.message;
    throw new TRPCError({
      code: msg.includes('not found') ? 'NOT_FOUND' : 'BAD_REQUEST',
      message: msg,
    });
  }
}

/**
 * Parse a base64-encoded cursor string into timestamp and ID components.
 */
function parseTimelineCursor(cursor: string): { timestamp: Date; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const [ts, id] = decoded.split(':');
    return { timestamp: new Date(ts), id };
  } catch {
    return null;
  }
}

/**
 * Build the cursor filter for a paginated task query.
 */
function buildTaskCursorFilter(
  cursorTimestamp: Date,
  cursorId: string | undefined,
  sortOrder: 'asc' | 'desc'
): Record<string, unknown> {
  return {
    OR: [
      { createdAt: sortOrder === 'desc' ? { lt: cursorTimestamp } : { gt: cursorTimestamp } },
      { createdAt: cursorTimestamp, id: cursorId ? { lt: cursorId } : undefined },
    ],
  };
}

type PrismaWithTenant = TenantAwareContext['prismaWithTenant'];
type NoteRecord = { id: string; content: string; createdAt: Date };

/**
 * Fetch contact notes using a raw SQL query with optional date filter.
 * IFC-254: Fixed table name ("notes" → "contact_notes"), added tenantId filter,
 * and replaced silent error swallowing with logged error handling.
 */
async function fetchContactNotes(
  prismaWithTenant: PrismaWithTenant,
  contactId: string,
  tenantId: string,
  dateFilter: { gte?: Date; lte?: Date },
  fetchLimit: number
): Promise<NoteRecord[]> {
  const handleError = (err: unknown): NoteRecord[] => {
    console.error('[fetchContactNotes] Query failed', { contactId, error: err });
    return [] as NoteRecord[];
  };

  if (dateFilter.gte && dateFilter.lte) {
    return prismaWithTenant.$queryRaw<NoteRecord[]>`
      SELECT id, content, "createdAt" FROM "contact_notes"
      WHERE "contactId" = ${contactId}
        AND "tenantId" = ${tenantId}
        AND "createdAt" >= ${dateFilter.gte}
        AND "createdAt" <= ${dateFilter.lte}
      ORDER BY "createdAt" DESC
      LIMIT ${fetchLimit}
    `.catch(handleError);
  }

  if (dateFilter.gte) {
    return prismaWithTenant.$queryRaw<NoteRecord[]>`
      SELECT id, content, "createdAt" FROM "contact_notes"
      WHERE "contactId" = ${contactId}
        AND "tenantId" = ${tenantId}
        AND "createdAt" >= ${dateFilter.gte}
      ORDER BY "createdAt" DESC
      LIMIT ${fetchLimit}
    `.catch(handleError);
  }

  if (dateFilter.lte) {
    return prismaWithTenant.$queryRaw<NoteRecord[]>`
      SELECT id, content, "createdAt" FROM "contact_notes"
      WHERE "contactId" = ${contactId}
        AND "tenantId" = ${tenantId}
        AND "createdAt" <= ${dateFilter.lte}
      ORDER BY "createdAt" DESC
      LIMIT ${fetchLimit}
    `.catch(handleError);
  }

  return prismaWithTenant.$queryRaw<NoteRecord[]>`
    SELECT id, content, "createdAt" FROM "contact_notes"
    WHERE "contactId" = ${contactId}
      AND "tenantId" = ${tenantId}
    ORDER BY "createdAt" DESC
    LIMIT ${fetchLimit}
  `.catch(handleError);
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
      throwContactCreateError(result.error.message);
    }

    return mapContactToResponse(result.value);
  }),

  /**
   * Get a single contact by ID using ContactService
   * Note: For complex includes (relations), we still use Prisma directly
   * as the service returns domain entities without ORM relations
   */
  // IFC-252: direct tenant-scoped query replaces unscoped service pre-flight
  getById: tenantProcedure.input(z.object({ id: idSchema })).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);

    // Contact 360 view — tenant-scoped findFirst (compound WHERE is not a unique constraint)
    const contactWithRelations = await typedCtx.prismaWithTenant.contact.findFirst({
      where: createTenantWhereClause(typedCtx.tenant, { id: input.id }),
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          },
        },
        account: {
          select: {
            id: true,
            name: true,
            industry: true,
            website: true,
          },
        },
        lead: {
          select: {
            id: true,
            email: true,
            status: true,
            score: true,
          },
        },
        // Contact 360: Activities timeline
        activities: {
          orderBy: { timestamp: 'desc' },
          take: 50,
        },
        // Contact 360: Notes
        notes: {
          orderBy: { createdAt: 'desc' },
        },
        // Contact 360: AI Insights
        aiInsight: true,
        // Contact 360: Deals/Opportunities
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
        // Contact 360: Tasks
        tasks: {
          where: { status: { not: 'COMPLETED' } },
          orderBy: { dueDate: 'asc' },
          take: 10,
        },
        // Contact 360: Calendar Events (upcoming meetings)
        calendarEvents: {
          where: {
            startTime: { gte: new Date() },
          },
          orderBy: { startTime: 'asc' },
          take: 5,
        },
      },
    });

    if (!contactWithRelations) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Contact with ID ${input.id} not found`,
      });
    }

    // Derive AI insights when none exist in DB (ensures entity pages always show data)
    if (!contactWithRelations.aiInsight) {
      const derived = deriveContactInsights({
        lastContactedAt: contactWithRelations.lastContactedAt,
        createdAt: contactWithRelations.createdAt,
        title: contactWithRelations.title,
        department: contactWithRelations.department,
        status: contactWithRelations.status,
        leadScore: contactWithRelations.lead?.score,
        opportunities: contactWithRelations.opportunities?.map((o: any) => ({
          value: Number(o.value) || 0,
          stage: o.stage,
        })),
      });

      const syntheticInsight = {
        id: `derived-${contactWithRelations.id}`,
        contactId: contactWithRelations.id,
        tenantId: typedCtx.tenant.tenantId,
        ...derived,
        recommendations: derived.recommendations as unknown,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Fire-and-forget: persist so future visits read from DB
      ctx.prismaWithTenant.contactAIInsight
        ?.upsert({
          where: { contactId: contactWithRelations.id },
          create: {
            contactId: contactWithRelations.id,
            tenantId: typedCtx.tenant.tenantId,
            ...derived,
            recommendations: derived.recommendations,
          },
          update: {},
        })
        ?.catch(() => {}); // Best-effort persistence — silently ignore

      return { ...contactWithRelations, aiInsight: syntheticInsight };
    }

    return contactWithRelations;
  }),

  /**
   * Get a contact by email using ContactService
   */
  // IFC-252: direct tenant-scoped query replaces unscoped service pre-flight
  getByEmail: tenantProcedure
    .input(z.object({ email: z.email() }))
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);

      // Tenant-scoped findFirst with ownerId filter
      const contactWithRelations = await typedCtx.prismaWithTenant.contact.findFirst({
        where: createTenantWhereClause(typedCtx.tenant, { email: input.email }),
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

      if (!contactWithRelations) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Contact with email ${input.email} not found`,
        });
      }

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

    // Apply tenant filtering
    const where = createTenantWhereClause(typedCtx.tenant, buildContactListWhere({ search, accountId, ownerId, department, status }));

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

    // Build info update payload (all non-account, non-email fields)
    const infoUpdates = buildContactInfoUpdates(data as UpdateContactData);

    if (Object.keys(infoUpdates).length > 0) {
      const result = await contactService.updateContactInfo(
        id,
        infoUpdates as any,
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
        await handleDisassociateAccount(contactService, id, typedCtx.tenant.userId);
      } else {
        await handleAssociateAccount(contactService, id, accountId, typedCtx.tenant.userId, typedCtx.tenant.tenantId);
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
        typedCtx.tenant.userId,
        typedCtx.tenant.tenantId
      );

      if (result.isFailure) {
        throwContactAssociationError(result.error.message);
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
          throw new TRPCError({ code: 'NOT_FOUND', message: errorMessage });
        }
        if (errorMessage.includes('not associated')) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Contact is not linked to any account',
          });
        }
        throw new TRPCError({ code: 'BAD_REQUEST', message: errorMessage });
      }

      return mapContactToResponse(result.value);
    }),

  /**
   * Get contact statistics using ContactService
   */
  // IFC-252: bypasses ContactService for tenant-scoped DB-level aggregation
  stats: tenantProcedure.query(async ({ ctx }) => {
    const typedCtx = getTenantContext(ctx);
    const where = { ...createTenantWhereClause(typedCtx.tenant, {}), tenantId: typedCtx.tenant.tenantId };

    const [total, withAccounts, byDepartmentRaw] = await Promise.all([
      typedCtx.prismaWithTenant.contact.count({ where }),
      typedCtx.prismaWithTenant.contact.count({ where: { ...where, accountId: { not: null } } }),
      typedCtx.prismaWithTenant.contact.groupBy({ by: ['department'], where, _count: true }),
    ]);

    return {
      total,
      byDepartment: Object.fromEntries(
        byDepartmentRaw.filter(g => g.department).map(g => [g.department!, g._count])
      ),
      withAccounts,
      withoutAccounts: total - withAccounts,
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

    // IFC-252: tenant isolation — ownerId scoping (defense-in-depth with RLS via IFC-237)
    const where = createTenantWhereClause(typedCtx.tenant, {
      OR: [
        { email: { contains: query, mode: 'insensitive' as const } },
        { firstName: { contains: query, mode: 'insensitive' as const } },
        { lastName: { contains: query, mode: 'insensitive' as const } },
      ],
    });

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
      z
        .object({
          search: z.string().optional(),
          status: z.array(z.string()).optional(),
          accountId: z.string().optional(),
          department: z.string().optional(),
        })
        .optional()
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

      // IFC-254 R-12: Apply status filter
      if (input?.status && input.status.length > 0) {
        baseWhere.status = { in: input.status };
      }

      const where = createTenantWhereClause(typedCtx.tenant, baseWhere);

      // Get counts for each filter option
      const [departmentCounts, accountCounts, statusCounts] = await Promise.all([
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
        typedCtx.prismaWithTenant.contact.groupBy({
          by: ['status'],
          where,
          _count: true,
        }),
      ]);

      // Get account names for display
      const accountIds = (accountCounts ?? []).map((a) => a.accountId).filter(Boolean) as string[];
      const accounts =
        accountIds.length > 0
          ? await typedCtx.prismaWithTenant.account.findMany({
              where: { id: { in: accountIds } },
              select: { id: true, name: true },
            })
          : [];
      const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

      return {
        departments: (departmentCounts ?? [])
          .filter((d) => d.department)
          .map((d) => ({
            value: d.department as string,
            label: d.department as string,
            count: d._count,
          })),
        accounts: (accountCounts ?? [])
          .filter((a) => a.accountId)
          .map((a) => ({
            value: a.accountId as string,
            label: accountMap.get(a.accountId as string) ?? a.accountId ?? 'Unknown',
            count: a._count,
          })),
        statuses: (statusCounts ?? []).map((s) => ({
          value: s.status,
          label: s.status,
          count: s._count,
        })),
      };
    }),

  /**
   * Bulk email contacts - returns email addresses for mailto:
   */
  // IFC-252: tenant isolation — ownerId + tenantId scoping
  bulkEmail: tenantProcedure.input(bulkEmailContactsSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const { ids } = input;

    const contacts = await typedCtx.prismaWithTenant.contact.findMany({
      where: { ...createTenantWhereClause(typedCtx.tenant, { id: { in: ids } }), tenantId: typedCtx.tenant.tenantId },
      select: { id: true, email: true },
    });

    const emails = contacts.map((c) => c.email);
    const mailtoUrl = `mailto:${emails.join(',')}`;

    return {
      successful: contacts.map((c) => c.id),
      failed: ids
        .filter((id: string) => !contacts.some((c) => c.id === id))
        .map((id: string) => ({
          id,
          error: 'Contact not found',
        })),
      totalProcessed: ids.length,
      emails,
      mailtoUrl,
    };
  }),

  /**
   * Bulk export contacts as CSV/JSON
   */
  // IFC-252: tenant isolation — ownerId + tenantId scoping
  bulkExport: tenantProcedure.input(bulkExportContactsSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const { ids, format } = input;

    const contacts = await typedCtx.prismaWithTenant.contact.findMany({
      where: { ...createTenantWhereClause(typedCtx.tenant, { id: { in: ids } }), tenantId: typedCtx.tenant.tenantId },
      include: {
        account: { select: { name: true } },
      },
    });

    let data: string;
    if (format === 'csv') {
      const headers = 'Email,First Name,Last Name,Title,Phone,Department,Account\n';
      const rows = contacts
        .map(
          (c) =>
            `"${c.email}","${c.firstName}","${c.lastName}","${c.title || ''}","${c.phone || ''}","${c.department || ''}","${c.account?.name || ''}"`
        )
        .join('\n');
      data = headers + rows;
    } else {
      data = JSON.stringify(contacts, null, 2);
    }

    return {
      successful: contacts.map((c) => c.id),
      failed: ids
        .filter((id: string) => !contacts.some((c) => c.id === id))
        .map((id: string) => ({
          id,
          error: 'Contact not found',
        })),
      totalProcessed: ids.length,
      data,
      count: contacts.length,
    };
  }),

  /**
   * Bulk delete contacts
   */
  bulkDelete: tenantProcedure.input(bulkDeleteContactsSchema).mutation(async ({ ctx, input }) => {
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
            error: `Contact has ${contact._count.opportunities} opportunities`,
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
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { successful, failed, totalProcessed: ids.length };
  }),

  /**
   * Link a contact to a lead (IFC-184)
   * This is for retroactive association, distinct from lead conversion.
   */
  linkToLead: tenantProcedure.input(linkToLeadSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const contactService = getContactService(ctx);

    const result = await contactService.linkToLead(
      input.contactId,
      input.leadId,
      typedCtx.tenant.userId
    );

    if (result.isFailure) {
      throwContactLinkLeadError(result.error.message);
    }

    return mapContactToResponse(result.value);
  }),

  /**
   * Unlink a contact from a lead (IFC-184)
   */
  unlinkFromLead: tenantProcedure.input(unlinkFromLeadSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const contactService = getContactService(ctx);

    const result = await contactService.unlinkFromLead(input.contactId, typedCtx.tenant.userId);

    if (result.isFailure) {
      const errorMessage = result.error.message;
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
   * Get timeline events for a contact (IFC-184)
   * Aggregates activities, notes, tasks, and appointments with cursor-based pagination.
   *
   * KPI Target: <1000ms response time
   */
  getTimeline: tenantProcedure
    .input(contactTimelineSchema)
    .output(contactTimelineResponseSchema.extend({ performanceTarget: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const startTime = Date.now();

      // 1. Verify contact exists and belongs to tenant
      const contact = await typedCtx.prismaWithTenant.contact.findUnique({
        where: { id: input.contactId },
        select: { id: true, leadId: true, tenantId: true },
      });

      if (!contact) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Contact not found',
        });
      }

      // 2. Build date filter
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (input.fromDate) dateFilter.gte = input.fromDate;
      if (input.toDate) dateFilter.lte = input.toDate;

      // 3. Decode cursor if provided
      const parsedCursor = input.cursor ? parseTimelineCursor(input.cursor) : null;
      const cursorTimestamp = parsedCursor?.timestamp;
      const cursorId = parsedCursor?.id;

      // 4. Parallel queries to data sources with cursor-based pagination
      const fetchLimit = input.limit + 1; // Fetch one extra to check for more

      const [tasks, notes] = await Promise.all([
        // Tasks
        typedCtx.prismaWithTenant.task.findMany({
          where: {
            contactId: input.contactId,
            ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
            ...(cursorTimestamp && buildTaskCursorFilter(cursorTimestamp, cursorId, input.sortOrder)),
          },
          orderBy: { createdAt: input.sortOrder },
          take: fetchLimit,
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            priority: true,
            dueDate: true,
            createdAt: true,
            owner: { select: { id: true, name: true } },
          },
        }),
        // Notes (using ContactNote model via raw query with tenant isolation)
        fetchContactNotes(typedCtx.prismaWithTenant, input.contactId, typedCtx.tenant.tenantId, dateFilter, fetchLimit),
      ]);

      // 5. Map to timeline events
      type TimelineEvent = {
        id: string;
        type:
          | 'email'
          | 'task'
          | 'appointment'
          | 'activity'
          | 'note'
          | 'call'
          | 'status_change'
          | 'meeting';
        title: string;
        description?: string;
        timestamp: Date;
        actor?: { id: string; name: string };
        metadata?: Record<string, unknown>;
      };

      const events: TimelineEvent[] = [];

      // Map tasks
      for (const task of tasks) {
        events.push({
          id: `task-${task.id}`,
          type: 'task',
          title: task.title,
          description: task.description ?? undefined,
          timestamp: task.createdAt,
          actor: task.owner ? { id: task.owner.id, name: task.owner.name ?? 'Unknown' } : undefined,
          metadata: { status: task.status, priority: task.priority, dueDate: task.dueDate },
        });
      }

      // Map notes (if returned)
      for (const note of notes) {
        events.push({
          id: `note-${note.id}`,
          type: 'note',
          title: 'Note added',
          description: note.content,
          timestamp: note.createdAt,
        });
      }

      // 6. Sort all events by timestamp
      events.sort((a, b) => {
        const diff =
          input.sortOrder === 'desc'
            ? b.timestamp.getTime() - a.timestamp.getTime()
            : a.timestamp.getTime() - b.timestamp.getTime();
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      });

      // 7. Apply limit and determine if there are more results
      const hasMore = events.length > input.limit;
      const paginatedEvents = events.slice(0, input.limit);

      // 8. Generate next cursor
      let nextCursor: string | null = null;
      if (hasMore && paginatedEvents.length > 0) {
        const lastEvent = paginatedEvents.at(-1)!;
        const cursorString = `${lastEvent.timestamp.toISOString()}:${lastEvent.id}`;
        nextCursor = Buffer.from(cursorString).toString('base64');
      }

      const durationMs = Date.now() - startTime;

      // Log performance warning if exceeds target
      if (durationMs > 1000) {
        console.warn(
          `[contact.getTimeline] SLOW QUERY: ${durationMs}ms (target: <1000ms) for contact: "${input.contactId}"`
        );
      }

      return {
        events: paginatedEvents,
        nextCursor,
        totalCount: events.length,
        durationMs,
        performanceTarget: 1000,
        meetsKpi: durationMs < 1000,
      };
    }),

  // IFC-192: Log activity on a contact (updates lastContactedAt for qualifying types)
  // IFC-252: tenant isolation — getTenantContext + prismaWithTenant.$transaction
  logActivity: tenantProcedure.input(logActivitySchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const { tenantId, userId } = typedCtx.tenant;

    // Verify contact exists and belongs to tenant
    const contact = await typedCtx.prismaWithTenant.contact.findUnique({
      where: { id: input.contactId },
    });

    if (!contact) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Contact not found: ${input.contactId}`,
      });
    }

    // Transaction: create activity record + update lastContactedAt atomically
    const now = new Date();
    const updatedContact = await typedCtx.prismaWithTenant.$transaction(async (tx) => {
      // 1. Create ContactActivity record
      await tx.contactActivity.create({
        data: {
          contactId: input.contactId,
          type: input.type,
          title: input.title,
          description: input.description ?? '',
          timestamp: now,
          userId,
          userName: typedCtx.user?.email ?? 'Unknown',
          tenantId,
        },
      });

      // 2. Update lastContactedAt directly via tx (atomic with activity insert)
      // IFC-252: tenant-scoped WHERE with ownerId
      const updated = await tx.contact.update({
        where: { id: input.contactId, ...createTenantWhereClause(typedCtx.tenant, {}) },
        data: {
          lastContactedAt: now,
          updatedAt: now,
        },
      });

      return updated;
    });

    // 3. Post-transaction: run domain logic for event emission (non-critical)
    const contactService = getContactService(ctx);
    await contactService.recordInteraction(input.contactId, input.type, userId);

    // Return the tx-committed Prisma record (authoritative)
    return {
      id: updatedContact.id,
      email: updatedContact.email,
      firstName: updatedContact.firstName,
      lastName: updatedContact.lastName,
      title: updatedContact.title ?? null,
      phone: updatedContact.phone ?? null,
      department: updatedContact.department ?? null,
      status: updatedContact.status,
      accountId: updatedContact.accountId ?? null,
      leadId: updatedContact.leadId ?? null,
      ownerId: updatedContact.ownerId,
      tenantId: updatedContact.tenantId,
      streetAddress: updatedContact.streetAddress ?? null,
      city: updatedContact.city ?? null,
      zipCode: updatedContact.zipCode ?? null,
      company: updatedContact.company ?? null,
      linkedInUrl: updatedContact.linkedInUrl ?? null,
      contactType: updatedContact.contactType ?? null,
      tags: updatedContact.tags ?? [],
      contactNotes: updatedContact.contactNotes ?? null,
      lastContactedAt: updatedContact.lastContactedAt ?? null,
      createdAt: updatedContact.createdAt,
      updatedAt: updatedContact.updatedAt,
    };
  }),

  /**
   * Add a note to a contact (mirrors lead.addNote pattern).
   */
  addNote: tenantProcedure.input(addContactNoteSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);

    const contact = await typedCtx.prismaWithTenant.contact.findUnique({
      where: { id: input.contactId },
    });

    if (!contact) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Contact not found: ${input.contactId}`,
      });
    }

    const note = await ctx.prismaWithTenant.contactNote.create({
      data: {
        content: input.content,
        author: ctx.user?.email ?? 'Unknown',
        contactId: input.contactId,
        tenantId: typedCtx.tenant.tenantId,
      },
    });

    return note;
  }),

  /**
   * Score a contact with AI — derives insights and persists them.
   * Fire-and-forget: enqueues background LLM enrichment if Redis available.
   * IFC-220
   */
  scoreWithAI: tenantProcedure
    .input(z.object({ contactId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);

      const contact = await typedCtx.prismaWithTenant.contact.findUnique({
        where: { id: input.contactId },
        select: {
          id: true,
          lastContactedAt: true,
          createdAt: true,
          title: true,
          department: true,
          status: true,
          lead: { select: { score: true } },
          opportunities: { select: { value: true, stage: true } },
        },
      });

      if (!contact) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Contact not found: ${input.contactId}`,
        });
      }

      const derived = deriveContactInsights({
        lastContactedAt: contact.lastContactedAt,
        createdAt: contact.createdAt,
        title: contact.title,
        department: contact.department,
        status: contact.status,
        leadScore: contact.lead?.score,
        opportunities: contact.opportunities?.map((o: any) => ({
          value: Number(o.value) || 0,
          stage: o.stage,
        })),
      });

      const insight = await ctx.prismaWithTenant.contactAIInsight.upsert({
        where: { contactId: input.contactId },
        create: {
          contactId: input.contactId,
          tenantId: typedCtx.tenant.tenantId,
          ...derived,
          recommendations: derived.recommendations,
        },
        update: {
          ...derived,
          recommendations: derived.recommendations,
        },
      });

      // Fire-and-forget: enqueue background LLM enrichment (best-effort)
      try {
        const { Queue } = await loadBullMQ();
        const { QUEUE_NAMES } = await import('@intelliflow/platform/queues/types');
        const queue = new Queue(QUEUE_NAMES.AI_PREDICTION, {
          connection: { host: process.env.REDIS_HOST ?? 'localhost', port: Number.parseInt(process.env.REDIS_PORT || '6379', 10) },
        });
        await queue.add('predict', {
          entityType: 'contact',
          entityId: input.contactId,
          predictionType: 'CHURN_RISK',
          tenantId: typedCtx.tenant.tenantId,
        });
        await queue.close();
      } catch {
        // Redis/BullMQ unavailable — silently skip background enrichment
      }

      return insight;
    }),
});
