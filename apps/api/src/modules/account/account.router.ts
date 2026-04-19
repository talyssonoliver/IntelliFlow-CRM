/**
 * Account Router
 *
 * Provides type-safe tRPC endpoints for account management:
 * - CRUD operations (create, read, update, delete)
 * - List with filtering and pagination
 * - Account statistics and insights
 *
 * Following hexagonal architecture - uses AccountService for business logic.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  createAccountSchema,
  updateAccountSchema,
  accountQuerySchema,
  idSchema,
  getAccountContactsInputSchema,
  getAccountOpportunitiesInputSchema,
  getAccountActivityInputSchema,
  getHierarchyInputSchema,
  setParentSchema,
  assignOwnerSchema,
} from '@intelliflow/validators/account';
import { mapAccountToResponse } from '../../shared/mappers';
import { type Context } from '../../context';
import { getTenantContext, createTenantWhereClause } from '../../security/tenant-context';
import { getAuditLogger } from '../../security/audit-logger';
import {
  assertCanDeleteAccount,
  assertRequiredAccountFields,
  capitalizeAccountName,
  loadAccountAutomation,
  loadRequiredAccountFields,
  normalizeWebsite,
} from './account-automation';

/**
 * Helper to get account service from context
 */
function getAccountService(ctx: Context) {
  if (!ctx.services?.account) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Account service not available',
    });
  }
  return ctx.services.account;
}

export const accountRouter = createTRPCRouter({
  /**
   * Create a new account
   */
  create: tenantProcedure.input(createAccountSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const accountService = getAccountService(ctx);

    // PG-183: apply tenant automation + required-field policy before the
    // domain service takes over.
    const [flags, requiredFields] = await Promise.all([
      loadAccountAutomation(typedCtx),
      loadRequiredAccountFields(typedCtx),
    ]);

    const rawWebsite =
      (input as { website?: { toValue?: () => string } | string | null | undefined }).website ??
      null;
    const websiteString =
      typeof rawWebsite === 'object' && rawWebsite !== null && 'toValue' in rawWebsite
        ? (rawWebsite.toValue?.() ?? null)
        : (rawWebsite as string | null);

    assertRequiredAccountFields(
      {
        name: input.name,
        industry: (input as { industry?: string | null }).industry,
        website: websiteString,
        ownerId: typedCtx.tenant.userId, // always satisfied for create
        employees: (input as { employees?: number | null }).employees,
        revenue: (input as { revenue?: number | string | null }).revenue,
      },
      requiredFields,
      'create'
    );

    const hygieneInput = {
      ...input,
      name: capitalizeAccountName(input.name, flags) ?? input.name,
      ...(websiteString !== null
        ? { website: normalizeWebsite(websiteString, flags) ?? websiteString }
        : {}),
    };

    const result = await accountService.createAccount({
      ...hygieneInput,
      ownerId: typedCtx.tenant.userId,
      tenantId: typedCtx.tenant.tenantId,
    });

    if (result.isFailure) {
      const errorCode = result.error.code;
      if (errorCode === 'VALIDATION_ERROR') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: result.error.message,
        });
      }
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: result.error.message,
      });
    }

    // IFC-269 B-07: Audit logging
    getAuditLogger(ctx.prisma)
      .logAction('CREATE', 'account', result.value.id.value, typedCtx.tenant.tenantId, {
        actorId: typedCtx.tenant.userId,
        resourceName: result.value.name,
      })
      .catch((err) => console.error('[account.router] Audit log failed:', err));

    return mapAccountToResponse(result.value);
  }),

  /**
   * Get a single account by ID
   * Includes tenant isolation check to prevent cross-tenant data access
   */
  getById: tenantProcedure.input(z.object({ id: idSchema })).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const accountService = getAccountService(ctx);

    // IFC-269 B-02: Tenant isolation via service+repository layer
    const result = await accountService.getAccountById(input.id, typedCtx.tenant.tenantId);

    if (result.isFailure) {
      // F5: Log potential cross-tenant access attempt
      getAuditLogger(ctx.prisma)
        .logPermissionDenied('account', input.id, 'account:read', typedCtx.tenant.tenantId, {
          actorId: typedCtx.tenant.userId,
        })
        .catch((err) => console.error('[account.router] Audit log failed:', err));

      throw new TRPCError({
        code: 'NOT_FOUND',
        message: result.error.message,
      });
    }

    const account = result.value;

    // Fetch counts and owner relation — defense-in-depth: include tenantId (F3 fix)
    const enriched = await typedCtx.prismaWithTenant.account.findFirst({
      where: { id: input.id, tenantId: typedCtx.tenant.tenantId },
      select: {
        _count: {
          select: { contacts: true, opportunities: true },
        },
        owner: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return {
      ...mapAccountToResponse(result.value),
      _count: enriched?._count ?? { contacts: 0, opportunities: 0 },
      owner: enriched?.owner ?? null,
    };
  }),

  /**
   * List accounts with filtering and pagination
   * Uses Prisma for complex queries with joins for performance
   */
  list: tenantProcedure.input(accountQuerySchema).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
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

    // Build where clause with tenant isolation
    const baseWhere: Record<string, unknown> = {};

    if (search) {
      baseWhere.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { website: { contains: search, mode: 'insensitive' } },
        { industry: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (industry) {
      baseWhere.industry = { contains: industry, mode: 'insensitive' };
    }

    if (ownerId) {
      baseWhere.ownerId = ownerId;
    }

    if (minRevenue !== undefined || maxRevenue !== undefined) {
      baseWhere.revenue = {};
      if (minRevenue !== undefined) (baseWhere.revenue as Record<string, number>).gte = minRevenue;
      if (maxRevenue !== undefined) (baseWhere.revenue as Record<string, number>).lte = maxRevenue;
    }

    if (minEmployees !== undefined || maxEmployees !== undefined) {
      baseWhere.employees = {};
      if (minEmployees !== undefined)
        (baseWhere.employees as Record<string, number>).gte = minEmployees;
      if (maxEmployees !== undefined)
        (baseWhere.employees as Record<string, number>).lte = maxEmployees;
    }

    // Apply tenant filtering
    const where = createTenantWhereClause(typedCtx.tenant, baseWhere);

    // Execute queries in parallel
    const [accounts, total] = await Promise.all([
      typedCtx.prismaWithTenant.account.findMany({
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
          parentAccount: {
            select: {
              id: true,
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
      typedCtx.prismaWithTenant.account.count({ where }),
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
   * Includes tenant isolation check before modification
   */
  update: tenantProcedure.input(updateAccountSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const accountService = getAccountService(ctx);
    const { id, ...data } = input;

    // PG-183: apply tenant automation + required-field policy before
    // handing off to the service.
    const [flags, requiredFields] = await Promise.all([
      loadAccountAutomation(typedCtx),
      loadRequiredAccountFields(typedCtx),
    ]);

    // Convert WebsiteUrl Value Object to string for service
    const websiteString = data.website?.toValue?.() ?? (data.website as string | undefined);

    assertRequiredAccountFields(
      {
        ...(Object.prototype.hasOwnProperty.call(data, 'name')
          ? { name: (data as { name?: string }).name }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'industry')
          ? { industry: (data as { industry?: string | null }).industry }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'website')
          ? { website: websiteString ?? null }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'employees')
          ? { employees: (data as { employees?: number | null }).employees }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'revenue')
          ? { revenue: (data as { revenue?: number | string | null }).revenue }
          : {}),
      },
      requiredFields,
      'update'
    );

    const updateData = {
      ...data,
      ...(data.name !== undefined
        ? { name: capitalizeAccountName(data.name, flags) ?? data.name }
        : {}),
      ...(websiteString !== undefined
        ? { website: normalizeWebsite(websiteString, flags) ?? websiteString }
        : {}),
    } as Record<string, unknown>;

    // IFC-269 B-05: Wrap in transaction to prevent TOCTOU
    const result = await accountService.updateAccountInfo(
      id,
      updateData,
      typedCtx.tenant.userId,
      typedCtx.tenant.tenantId
    );

    if (result.isFailure) {
      const errorCode = result.error.code;
      if (errorCode === 'NOT_FOUND_ERROR') {
        // F5: Log potential cross-tenant access attempt
        getAuditLogger(ctx.prisma)
          .logPermissionDenied('account', id, 'account:update', typedCtx.tenant.tenantId, {
            actorId: typedCtx.tenant.userId,
          })
          .catch((err) => console.error('[account.router] Audit log failed:', err));
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: result.error.message,
        });
      }
      if (errorCode === 'VALIDATION_ERROR') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: result.error.message,
        });
      }
      if (errorCode === 'UNAUTHORIZED_ERROR') {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: result.error.message,
        });
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error.message,
      });
    }

    // IFC-269 B-07: Audit logging
    getAuditLogger(ctx.prisma)
      .logAction('UPDATE', 'account', id, typedCtx.tenant.tenantId, {
        actorId: typedCtx.tenant.userId,
      })
      .catch((err) => console.error('[account.router] Audit log failed:', err));

    return mapAccountToResponse(result.value);
  }),

  /**
   * Delete an account
   * Includes tenant isolation check before deletion
   */
  delete: tenantProcedure.input(z.object({ id: idSchema })).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const accountService = getAccountService(ctx);

    // PG-183: respect the tenant's "prevent delete with open opportunities"
    // toggle before touching the account. Counts closed as stage IN
    // (CLOSED_WON, CLOSED_LOST); everything else is active.
    const flags = await loadAccountAutomation(typedCtx);
    if (flags.preventDeleteWithOpenOpportunities) {
      const activeOpportunities = await typedCtx.prismaWithTenant.opportunity.count({
        where: {
          accountId: input.id,
          tenantId: typedCtx.tenant.tenantId,
          stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
          deletedAt: null,
        },
      });
      assertCanDeleteAccount({ activeOpportunities }, flags);
    }

    // IFC-269 B-02+B-05: Tenant isolation via service layer (repository enforces tenantId)
    const result = await accountService.deleteAccount(input.id, typedCtx.tenant.tenantId);

    if (result.isFailure) {
      const errorCode = result.error.code;
      if (errorCode === 'NOT_FOUND_ERROR' || errorCode === 'VALIDATION_ERROR') {
        const isNotFound = result.error.message.includes('not found');
        if (isNotFound) {
          // F5: Log potential cross-tenant access attempt
          getAuditLogger(ctx.prisma)
            .logPermissionDenied('account', input.id, 'account:delete', typedCtx.tenant.tenantId, {
              actorId: typedCtx.tenant.userId,
            })
            .catch((err) => console.error('[account.router] Audit log failed:', err));
        }
        throw new TRPCError({
          code: isNotFound ? 'NOT_FOUND' : 'PRECONDITION_FAILED',
          message: result.error.message,
        });
      }
      if (errorCode === 'UNAUTHORIZED_ERROR') {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: result.error.message,
        });
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error.message,
      });
    }

    // IFC-269 B-07: Audit logging
    getAuditLogger(ctx.prisma)
      .logAction('DELETE', 'account', input.id, typedCtx.tenant.tenantId, {
        actorId: typedCtx.tenant.userId,
      })
      .catch((err) => console.error('[account.router] Audit log failed:', err));

    return { success: true, id: input.id };
  }),

  /**
   * Get account statistics
   * Uses Prisma for aggregations (read-side CQRS pattern)
   */
  stats: tenantProcedure.query(async ({ ctx }) => {
    const typedCtx = getTenantContext(ctx);
    const scopedWhere = createTenantWhereClause(typedCtx.tenant, {});
    const [total, byIndustry, withContacts, withOpportunities, totalRevenue] = await Promise.all([
      typedCtx.prismaWithTenant.account.count({ where: scopedWhere }),
      typedCtx.prismaWithTenant.account.groupBy({
        by: ['industry'],
        _count: true,
        where: {
          ...scopedWhere,
          industry: { not: null },
        },
      }),
      typedCtx.prismaWithTenant.account.count({
        where: {
          ...scopedWhere,
          contacts: {
            some: {},
          },
        },
      }),
      typedCtx.prismaWithTenant.account.count({
        where: {
          ...scopedWhere,
          opportunities: {
            some: {},
          },
        },
      }),
      typedCtx.prismaWithTenant.account.aggregate({
        where: scopedWhere,
        _sum: { revenue: true },
      }),
    ]);

    return {
      total: total ?? 0,
      byIndustry: (byIndustry ?? []).reduce(
        (acc, item) => {
          if (item.industry) {
            acc[item.industry] = item._count;
          }
          return acc;
        },
        {} as Record<string, number>
      ),
      withContacts: withContacts ?? 0,
      withoutContacts: (total ?? 0) - (withContacts ?? 0),
      withOpportunities: withOpportunities ?? 0,
      totalRevenue: totalRevenue?._sum?.revenue?.toString() || '0',
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
          industry: z.string().optional(),
          ownerId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);

      // Build base where clause with current filters
      const baseWhere: Record<string, unknown> = {};

      if (input?.search) {
        baseWhere.OR = [
          { name: { contains: input.search, mode: 'insensitive' } },
          { website: { contains: input.search, mode: 'insensitive' } },
          { industry: { contains: input.search, mode: 'insensitive' } },
        ];
      }

      if (input?.industry) {
        baseWhere.industry = { contains: input.industry, mode: 'insensitive' };
      }

      if (input?.ownerId) {
        baseWhere.ownerId = input.ownerId;
      }

      const where = createTenantWhereClause(typedCtx.tenant, baseWhere);

      // Get counts for each filter option
      const [industryCounts, ownerCounts] = await Promise.all([
        typedCtx.prismaWithTenant.account.groupBy({
          by: ['industry'],
          where,
          _count: true,
        }),
        typedCtx.prismaWithTenant.account.groupBy({
          by: ['ownerId'],
          where,
          _count: true,
        }),
      ]);

      // Get owner names for display
      const ownerIds = (ownerCounts ?? []).map((o) => o.ownerId).filter(Boolean);
      const owners =
        ownerIds.length > 0
          ? await ctx.prismaWithTenant.user.findMany({
              where: { id: { in: ownerIds } },
              select: { id: true, name: true, email: true },
            })
          : [];
      const ownerMap = new Map(owners.map((o) => [o.id, o.name || o.email]));

      return {
        industries: (industryCounts ?? [])
          .filter((i) => i.industry)
          .map((i) => ({
            value: i.industry!,
            label: i.industry!,
            count: i._count,
          })),
        owners: (ownerCounts ?? [])
          .filter((o) => o.ownerId)
          .map((o) => ({
            value: o.ownerId,
            label: ownerMap.get(o.ownerId as string) || o.ownerId,
            count: o._count,
          })),
      };
    }),

  /**
   * Get contacts associated with an account (IFC-185)
   * Supports cursor-based pagination and status filtering
   */
  getContacts: tenantProcedure
    .input(getAccountContactsInputSchema)
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const accountService = getAccountService(ctx);

      const result = await accountService.getAccountContacts(
        input.accountId,
        typedCtx.tenant.tenantId,
        {
          limit: input.limit,
          cursor: input.cursor,
          status: input.status,
        }
      );

      if (result.isFailure) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: result.error.message,
        });
      }

      return result.value;
    }),

  /**
   * Get opportunities associated with an account (IFC-185)
   * Supports cursor-based pagination, stage filtering, and summary calculation
   */
  getOpportunities: tenantProcedure
    .input(getAccountOpportunitiesInputSchema)
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const accountService = getAccountService(ctx);

      const result = await accountService.getAccountOpportunities(
        input.accountId,
        typedCtx.tenant.tenantId,
        {
          limit: input.limit,
          cursor: input.cursor,
          stage: input.stage,
        }
      );

      if (result.isFailure) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: result.error.message,
        });
      }

      return result.value;
    }),

  /**
   * Get activity feed for an account (IFC-185)
   * Aggregates contact and opportunity activities sorted by date descending
   */
  getActivity: tenantProcedure
    .input(getAccountActivityInputSchema)
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const accountService = getAccountService(ctx);

      const result = await accountService.getAccountActivity(
        input.accountId,
        typedCtx.tenant.tenantId,
        {
          limit: input.limit,
          cursor: input.cursor,
          types: input.types,
        }
      );

      if (result.isFailure) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: result.error.message,
        });
      }

      return result.value;
    }),

  /**
   * Get account hierarchy (PG-134)
   * Returns ancestors, current node with children tree
   */
  getHierarchy: tenantProcedure.input(getHierarchyInputSchema).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const accountService = getAccountService(ctx);

    const result = await accountService.getHierarchy(
      input.accountId,
      typedCtx.tenant.tenantId,
      input.maxDepth
    );

    if (result.isFailure) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: result.error.message,
      });
    }

    return result.value;
  }),

  /**
   * Set or remove parent account (PG-134)
   * Includes cycle detection and max depth enforcement
   */
  setParent: tenantProcedure.input(setParentSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const accountService = getAccountService(ctx);

    const result = await accountService.setParent(
      input.accountId,
      input.parentAccountId,
      typedCtx.tenant.tenantId,
      typedCtx.user!.userId
    );

    if (result.isFailure) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: result.error.message,
      });
    }

    // IFC-269 B-07: Audit logging
    getAuditLogger(ctx.prisma)
      .logAction('UPDATE', 'account', input.accountId, typedCtx.tenant.tenantId, {
        actorId: typedCtx.tenant.userId,
        afterState: { parentAccountId: input.parentAccountId },
      })
      .catch((err) => console.error('[account.router] Audit log failed:', err));

    return mapAccountToResponse(result.value);
  }),

  /**
   * List assignable users for account owner assignment (IFC-268)
   */
  assignees: tenantProcedure.query(async ({ ctx }) => {
    const typedCtx = getTenantContext(ctx);

    const users = await typedCtx.prismaWithTenant.user.findMany({
      where: { tenantId: typedCtx.tenant.tenantId },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    });

    return users.map((u) => ({
      id: u.id,
      name: (u.name ?? u.email).trim(),
      title: getAccountOwnerTitle(u.role),
      avatar: u.avatarUrl ?? null,
    }));
  }),

  /**
   * Assign or reassign account owner (IFC-268)
   */
  assignOwner: tenantProcedure.input(assignOwnerSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const accountService = getAccountService(ctx);
    const tenantId = typedCtx.tenant.tenantId;

    // IFC-269 B-05: Wrap in transaction to prevent TOCTOU between verify+assign+persist
    const txResult = await typedCtx.prismaWithTenant.$transaction(async (tx) => {
      // Verify account exists and belongs to tenant
      const existingAccount = await tx.account.findFirst({
        where: { id: input.id, tenantId },
      });

      if (!existingAccount) {
        return { error: 'ACCOUNT_NOT_FOUND' as const };
      }

      // Verify target user exists and belongs to same tenant
      const targetUser = await tx.user.findFirst({
        where: { id: input.ownerId, tenantId },
        select: { id: true, name: true, email: true },
      });

      if (!targetUser) {
        return { error: 'USER_NOT_FOUND' as const };
      }

      // Load domain entity and assign owner
      const accountResult = await accountService.getAccountById(input.id, tenantId);
      if (accountResult.isFailure) {
        return { error: 'ACCOUNT_LOAD_FAILED' as const, message: accountResult.error.message };
      }

      const account = accountResult.value;
      const assignResult = account.assignOwner(input.ownerId, typedCtx.user!.userId);

      if (assignResult.isFailure) {
        return { error: 'ASSIGN_FAILED' as const, message: assignResult.error.message };
      }

      // Persist with tenant-scoped WHERE (F4 fix: defense-in-depth)
      const { count } = await tx.account.updateMany({
        where: { id: input.id, tenantId },
        data: { ownerId: input.ownerId },
      });

      if (count === 0) {
        // Account was deleted between the read above and this write (TOCTOU).
        return {
          error: 'ACCOUNT_NOT_FOUND' as const,
          message: 'Account not found or was concurrently deleted',
        };
      }

      return { success: true as const, targetUser };
    });

    if ('error' in txResult) {
      if (
        txResult.error === 'ACCOUNT_NOT_FOUND' ||
        txResult.error === 'USER_NOT_FOUND' ||
        txResult.error === 'ACCOUNT_LOAD_FAILED'
      ) {
        // F5: Log permission denied for cross-tenant attempts
        getAuditLogger(ctx.prisma)
          .logPermissionDenied('account', input.id, 'account:assignOwner', tenantId, {
            actorId: typedCtx.tenant.userId,
          })
          .catch((err) => console.error('[account.router] Audit log failed:', err));

        throw new TRPCError({
          code: 'NOT_FOUND',
          message:
            txResult.error === 'USER_NOT_FOUND' ? 'Target user not found' : 'Account not found',
        });
      }
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: txResult.message ?? 'Assignment failed',
      });
    }

    // IFC-269 B-07: Audit logging
    getAuditLogger(ctx.prisma)
      .logAction('UPDATE', 'account', input.id, tenantId, {
        actorId: typedCtx.tenant.userId,
        afterState: { ownerId: input.ownerId },
      })
      .catch((err) => console.error('[account.router] Audit log failed:', err));

    return {
      success: true as const,
      id: input.id,
      ownerId: input.ownerId,
      owner: {
        id: txResult.targetUser.id,
        name: txResult.targetUser.name,
        email: txResult.targetUser.email,
      },
    };
  }),
});

function getAccountOwnerTitle(role: string): string {
  switch (role) {
    case 'ADMIN':
      return 'Administrator';
    case 'MANAGER':
      return 'Sales Manager';
    case 'SALES_REP':
      return 'Sales Representative';
    default:
      return 'Team Member';
  }
}
