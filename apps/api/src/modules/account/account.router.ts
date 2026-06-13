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
  updateAccountRevenueSchema,
  updateAccountEmployeeCountSchema,
  updateAccountIndustrySchema,
  accountQuerySchema,
  idSchema,
  getAccountContactsInputSchema,
  getAccountOpportunitiesInputSchema,
  getAccountActivityInputSchema,
  getHierarchyInputSchema,
  setParentSchema,
  assignOwnerSchema,
  reassignAccountSchema,
  bulkReassignAccountsSchema,
  accountSuggestTagsInputSchema,
  accountSuggestTagsOutputSchema,
  accountGenerateInsightInputSchema,
  accountGenerateInsightOutputSchema,
  accountScoreInputSchema,
  accountScoreOutputSchema,
  accountGetAiInsightInputSchema,
  accountGetAiInsightOutputSchema,
  accountAddTagsInputSchema,
  accountAddTagsOutputSchema,
  type CreateAccountInput,
  type UpdateAccountInput,
} from '@intelliflow/validators/account';
import { mapAccountToResponse } from '../../shared/mappers';
import { type Context } from '../../context';
import { getTenantContext, createTenantWhereClause } from '../../security/tenant-context';
import { getAuditLogger } from '../../security/audit-logger';
import { context as otelContext, propagation } from '@opentelemetry/api';
import { loadBullMQ } from '../../lib/load-bullmq';
import {
  assertCanDeleteAccount,
  assertRequiredAccountFields,
  capitalizeAccountName,
  loadAccountAutomation,
  loadRequiredAccountFields,
  normalizeWebsite,
} from './account-automation';
import {
  performAccountReassign,
  emitAccountReassignSideEffects,
  logAccountReassignPermissionDenied,
  REASSIGN_ADMIN_ROLES,
} from './account-reassign';
import { requiredProdEnv } from '@intelliflow/validators/required-url';

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

// IFC-311: Reassign helpers extracted to ./account-reassign for clean coverage scoping.

// ─── Account helper functions ───────────────────────────────────────────────

/** Resolve website input (possibly a Value Object) to a plain string or null. */
function resolveWebsiteString(
  website: { toValue?: () => string } | string | null | undefined
): string | null {
  if (website === null || website === undefined) return null;
  if (typeof website === 'object' && 'toValue' in website) return website.toValue?.() ?? null;
  return website as string | null;
}

/** IFC-310: Best-effort auto-link contacts to a new account by email domain. */
async function autoLinkContactsByDomain(
  duplicateService: NonNullable<Context['services']>['accountDuplicateDetection'],
  typedCtx: ReturnType<typeof getTenantContext>,
  accountId: string,
  website: string
): Promise<void> {
  try {
    const domain = website
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split(/[/?#]/)[0];
    if (domain && domain.includes('.')) {
      await duplicateService!.linkContactsByDomain(typedCtx, accountId, domain);
    }
  } catch (error) {
    console.warn('[account.router] auto-link-by-domain failed (non-fatal):', error);
  }
}

/** IFC-312: Fire-and-forget AI enrichment queue job for an account entity. */
async function enqueueAccountAIEnrichment(entityId: string, tenantId: string): Promise<void> {
  try {
    const { Queue } = await loadBullMQ();
    const { QUEUE_NAMES } = await import('@intelliflow/platform/queues/types');
    const queue = new Queue(QUEUE_NAMES.AI_ENRICHMENT, {
      connection: {
        host: requiredProdEnv('REDIS_HOST', process.env.REDIS_HOST, 'localhost'),
        port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
        ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
        ...(process.env.REDIS_USERNAME ? { username: process.env.REDIS_USERNAME } : {}),
      },
    });
    const otelCarrier: Record<string, string> = {};
    propagation.inject(otelContext.active(), otelCarrier);
    await queue.add('enrich', {
      entityType: 'account',
      entityId,
      tenantId,
      _otelCarrier: otelCarrier,
    });
    await queue.close();
  } catch {
    // Redis/BullMQ unavailable — silently skip background enrichment
  }
}

// ─── Extracted procedure handlers ───────────────────────────────────────────

async function handleAccountCreate(ctx: Context, input: CreateAccountInput) {
  const typedCtx = getTenantContext(ctx);
  const accountService = getAccountService(ctx);

  // PG-183: apply tenant automation + required-field policy before the
  // domain service takes over.
  const [flags, requiredFields] = await Promise.all([
    loadAccountAutomation(typedCtx),
    loadRequiredAccountFields(typedCtx),
  ]);

  const websiteString = resolveWebsiteString(
    (input as { website?: { toValue?: () => string } | string | null | undefined }).website
  );

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

  // IFC-310: Duplicate-detection — best-effort, non-blocking.
  const duplicateService = ctx.services?.accountDuplicateDetection;
  if (duplicateService) {
    try {
      await duplicateService.checkForCreate(
        typedCtx,
        {
          name: hygieneInput.name,
          website: (hygieneInput as { website?: string | null }).website ?? null,
          phone: (hygieneInput as { phone?: string | null }).phone ?? null,
        },
        flags
      );
    } catch (error) {
      console.warn('[account.router] duplicate-detection on create failed, proceeding:', error);
    }
  }

  const result = await accountService.createAccount({
    ...hygieneInput,
    ownerId: typedCtx.tenant.userId,
    tenantId: typedCtx.tenant.tenantId,
  });

  if (result.isFailure) {
    const errorCode = result.error.code;
    if (errorCode === 'VALIDATION_ERROR') {
      throw new TRPCError({ code: 'CONFLICT', message: result.error.message });
    }
    throw new TRPCError({ code: 'BAD_REQUEST', message: result.error.message });
  }

  const createdWebsite = (hygieneInput as { website?: string | null }).website;
  if (duplicateService && flags.autoLinkContactsByDomain && createdWebsite) {
    await autoLinkContactsByDomain(
      duplicateService,
      typedCtx,
      result.value.id.value,
      createdWebsite
    );
  }

  // IFC-269 B-07: Audit logging
  getAuditLogger(ctx.prisma)
    .logAction('CREATE', 'account', result.value.id.value, typedCtx.tenant.tenantId, {
      actorId: typedCtx.tenant.userId,
      resourceName: result.value.name,
    })
    .catch((err) => console.error('[account.router] Audit log failed:', err));

  // IFC-312 audit fix F1/F2: wire AI_ENRICHMENT producer on account create.
  if (flags.aiEnrichment || flags.aiIndustryInference) {
    await enqueueAccountAIEnrichment(result.value.id.value, typedCtx.tenant.tenantId);
  }

  return mapAccountToResponse(result.value);
}

/** Throw the appropriate TRPCError for a failed account update result. */
function throwAccountUpdateError(
  errorCode: string,
  message: string,
  id: string,
  ctx: Context,
  typedCtx: ReturnType<typeof getTenantContext>
): never {
  if (errorCode === 'NOT_FOUND_ERROR') {
    getAuditLogger(ctx.prisma)
      .logPermissionDenied('account', id, 'account:update', typedCtx.tenant.tenantId, {
        actorId: typedCtx.tenant.userId,
      })
      .catch((err) => console.error('[account.router] Audit log failed:', err));
    throw new TRPCError({ code: 'NOT_FOUND', message });
  }
  if (errorCode === 'VALIDATION_ERROR') throw new TRPCError({ code: 'CONFLICT', message });
  if (errorCode === 'UNAUTHORIZED_ERROR') throw new TRPCError({ code: 'UNAUTHORIZED', message });
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message });
}

/**
 * IFC-270 B-10/11/12: map a failed single-field account command Result to the
 * right TRPCError. Distinct from throwAccountUpdateError (which maps
 * VALIDATION_ERROR→CONFLICT for the name-uniqueness path); here a not-found is a
 * 404 and a bad value (negative revenue / non-positive employees / invalid id)
 * is a 400.
 */
function throwAccountCommandError(errorCode: string, message: string): never {
  if (errorCode === 'NOT_FOUND_ERROR') throw new TRPCError({ code: 'NOT_FOUND', message });
  if (
    errorCode === 'INVALID_REVENUE' ||
    errorCode === 'INVALID_EMPLOYEE_COUNT' ||
    errorCode === 'VALIDATION_ERROR'
  ) {
    throw new TRPCError({ code: 'BAD_REQUEST', message });
  }
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message });
}

/**
 * IFC-270 B-10/11/12: shared post-success side-effects for the single-field
 * account command procedures — audit log (B-07 pattern) + flag-gated AI
 * enrichment, mirroring the create/update handlers.
 */
async function auditAndEnrichAccountUpdate(
  ctx: Context,
  typedCtx: ReturnType<typeof getTenantContext>,
  accountId: string,
  afterState: Record<string, unknown>
): Promise<void> {
  getAuditLogger(ctx.prisma)
    .logAction('UPDATE', 'account', accountId, typedCtx.tenant.tenantId, {
      actorId: typedCtx.tenant.userId,
      afterState,
    })
    .catch((err) => console.error('[account.router] Audit log failed:', err));

  // Best-effort: these run AFTER the mutation has already committed, so a
  // failure here (e.g. the automation-settings read rejecting) must NOT turn a
  // persisted update into an API error.
  try {
    const flags = await loadAccountAutomation(typedCtx);
    if (flags.aiEnrichment || flags.aiIndustryInference) {
      await enqueueAccountAIEnrichment(accountId, typedCtx.tenant.tenantId);
    }
  } catch (err) {
    console.warn('[account.router] post-update enrichment skipped (non-fatal):', err);
  }
}

/** Build the required-fields check payload for partial account updates. */
function buildUpdateRequiredFieldsPayload(
  data: Record<string, unknown>,
  websiteString: string | undefined
): Record<string, unknown> {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(data, key);
  return {
    ...(has('name') ? { name: data.name as string | undefined } : {}),
    ...(has('industry') ? { industry: data.industry as string | null | undefined } : {}),
    ...(has('website') ? { website: websiteString ?? null } : {}),
    ...(has('employees') ? { employees: data.employees as number | null | undefined } : {}),
    ...(has('revenue') ? { revenue: data.revenue as number | string | null | undefined } : {}),
  };
}

async function handleAccountUpdate(ctx: Context, input: UpdateAccountInput) {
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
    buildUpdateRequiredFieldsPayload(data as Record<string, unknown>, websiteString),
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

  // IFC-310: Duplicate-detection runtime — re-evaluate rules on update.
  const duplicateService = ctx.services?.accountDuplicateDetection;
  if (duplicateService) {
    try {
      await duplicateService.checkForUpdate(
        typedCtx,
        id,
        {
          name: (updateData as { name?: string | null }).name ?? null,
          website: (updateData as { website?: string | null }).website ?? null,
        },
        flags
      );
    } catch (error) {
      console.warn('[account.router] duplicate-detection on update failed, proceeding:', error);
    }
  }

  // IFC-270 B-08: revenue/employees/industry now flow through to the service
  // (previously silently dropped). parentAccountId is not part of updateAccountSchema
  // — hierarchy changes go through the dedicated setParent procedure.
  // IFC-269 B-05: Wrap in transaction to prevent TOCTOU
  const result = await accountService.updateAccountInfo(
    id,
    updateData,
    typedCtx.tenant.userId,
    typedCtx.tenant.tenantId
  );

  if (result.isFailure) {
    throwAccountUpdateError(result.error.code, result.error.message, id, ctx, typedCtx);
  }

  // IFC-269 B-07: Audit logging
  getAuditLogger(ctx.prisma)
    .logAction('UPDATE', 'account', id, typedCtx.tenant.tenantId, {
      actorId: typedCtx.tenant.userId,
    })
    .catch((err) => console.error('[account.router] Audit log failed:', err));

  // IFC-312: wire AI_ENRICHMENT producer on account update.
  if (flags.aiEnrichment || flags.aiIndustryInference) {
    await enqueueAccountAIEnrichment(id, typedCtx.tenant.tenantId);
  }

  return mapAccountToResponse(result.value);
}

/**
 * Per-account verdict for the NP-013 batched bulkReassign path. Extracted to
 * module scope so the mutation body stays within the sonar cognitive-complexity
 * budget; behaviour is identical to the previous inline loops.
 */
type BulkReassignVerdict =
  | { kind: 'OK'; previousOwnerId: string; accountName: string }
  | { kind: 'SKIPPED'; currentOwnerId: string }
  | { kind: 'NOT_FOUND' }
  | { kind: 'FORBIDDEN' };

/**
 * Compute the in-memory verdict for every deduped id and collect the ids that
 * are eligible for the single batched updateMany.
 */
function computeBulkReassignVerdicts(
  dedupedIds: string[],
  rowMap: Map<string, { id: string; ownerId: string; name: string }>,
  opts: { callerId: string; isAdmin: boolean; targetOwnerId: string }
): { verdictMap: Map<string, BulkReassignVerdict>; eligibleIds: string[] } {
  const verdictMap = new Map<string, BulkReassignVerdict>();
  const eligibleIds: string[] = [];

  for (const id of dedupedIds) {
    const row = rowMap.get(id);
    if (!row) {
      verdictMap.set(id, { kind: 'NOT_FOUND' });
      continue;
    }
    const isCurrentOwner = row.ownerId === opts.callerId;
    if (!opts.isAdmin && !isCurrentOwner) {
      verdictMap.set(id, { kind: 'FORBIDDEN' });
      continue;
    }
    if (row.ownerId === opts.targetOwnerId) {
      verdictMap.set(id, { kind: 'SKIPPED', currentOwnerId: row.ownerId });
      continue;
    }
    verdictMap.set(id, { kind: 'OK', previousOwnerId: row.ownerId, accountName: row.name });
    eligibleIds.push(id);
  }

  return { verdictMap, eligibleIds };
}

type BulkReassignSuccess = {
  id: string;
  previousOwnerId: string;
  newOwnerId: string;
  notified: boolean;
  skipped?: true;
};

/**
 * Build the order-preserving response from the precomputed verdicts. Iterates
 * the original input ids so duplicates and per-row failures keep their place;
 * the first OK occurrence of a duplicate id is the written one, later ones are
 * reported as SKIPPED.
 */
function buildBulkReassignResponse(
  inputIds: string[],
  verdictMap: Map<string, BulkReassignVerdict>,
  notifiedMap: Map<string, boolean>,
  targetOwnerId: string
): {
  successful: BulkReassignSuccess[];
  failed: Array<{ id: string; error: string; errorCode: 'NOT_FOUND' | 'FORBIDDEN' }>;
} {
  const writtenIds = new Set<string>();
  const successful: BulkReassignSuccess[] = [];
  const failed: Array<{ id: string; error: string; errorCode: 'NOT_FOUND' | 'FORBIDDEN' }> = [];

  for (const id of inputIds) {
    const verdict = verdictMap.get(id);

    if (!verdict || verdict.kind === 'NOT_FOUND') {
      failed.push({ id, error: 'Account not found', errorCode: 'NOT_FOUND' });
      continue;
    }
    if (verdict.kind === 'FORBIDDEN') {
      failed.push({
        id,
        error: 'Caller does not have permission to reassign this account.',
        errorCode: 'FORBIDDEN',
      });
      continue;
    }
    if (verdict.kind === 'SKIPPED') {
      successful.push({
        id,
        previousOwnerId: verdict.currentOwnerId,
        newOwnerId: verdict.currentOwnerId,
        notified: false,
        skipped: true,
      });
      continue;
    }
    // verdict.kind === 'OK'
    if (writtenIds.has(id)) {
      successful.push({
        id,
        previousOwnerId: verdict.previousOwnerId,
        newOwnerId: targetOwnerId,
        notified: false,
        skipped: true,
      });
      continue;
    }
    writtenIds.add(id);
    successful.push({
      id,
      previousOwnerId: verdict.previousOwnerId,
      newOwnerId: targetOwnerId,
      notified: notifiedMap.get(id) ?? false,
    });
  }

  return { successful, failed };
}

export const accountRouter = createTRPCRouter({
  /**
   * Create a new account
   */
  create: tenantProcedure
    .input(createAccountSchema)
    .mutation(({ ctx, input }) => handleAccountCreate(ctx, input)),

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

    // Fetch counts + owner relation + IFC-312 AI-generated scalars.
    // Defense-in-depth: include tenantId (F3 fix).
    const enriched = await typedCtx.prismaWithTenant.account.findFirst({
      where: { id: input.id, tenantId: typedCtx.tenant.tenantId },
      select: {
        _count: {
          select: { contacts: true, opportunities: true },
        },
        owner: {
          select: { id: true, name: true, email: true },
        },
        // IFC-312 audit fix F7: surface AI-generated provenance scalars so
        // AccountDetail.tsx can drop its (account as any) casts.
        score: true,
        scoreProvenance: true,
        scoredAt: true,
        scoreModelVersion: true,
        industryInferredAt: true,
        industryModelVersion: true,
        tags: true,
      },
    });

    return {
      ...mapAccountToResponse(result.value, enriched ?? undefined),
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
  update: tenantProcedure
    .input(updateAccountSchema)
    .mutation(({ ctx, input }) => handleAccountUpdate(ctx, input)),

  /**
   * IFC-270 B-10: Update account revenue (exposes Account.updateRevenue()).
   * Revenue >= 0 (the schema + domain reject negatives → BAD_REQUEST).
   */
  updateRevenue: tenantProcedure
    .input(updateAccountRevenueSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const accountService = getAccountService(ctx);

      const result = await accountService.updateRevenue(
        input.id,
        input.revenue,
        typedCtx.tenant.userId,
        typedCtx.tenant.tenantId
      );

      if (result.isFailure) throwAccountCommandError(result.error.code, result.error.message);

      await auditAndEnrichAccountUpdate(ctx, typedCtx, input.id, { revenue: input.revenue });
      return mapAccountToResponse(result.value);
    }),

  /**
   * IFC-270 B-11: Update account employee count (exposes
   * Account.updateEmployeeCount()). Count must be a positive integer.
   */
  updateEmployeeCount: tenantProcedure
    .input(updateAccountEmployeeCountSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const accountService = getAccountService(ctx);

      const result = await accountService.updateEmployeeCount(
        input.id,
        input.employees,
        typedCtx.tenant.userId,
        typedCtx.tenant.tenantId
      );

      if (result.isFailure) throwAccountCommandError(result.error.code, result.error.message);

      await auditAndEnrichAccountUpdate(ctx, typedCtx, input.id, { employees: input.employees });
      return mapAccountToResponse(result.value);
    }),

  /**
   * IFC-270 B-12: Categorize account industry (exposes
   * Account.categorizeIndustry()).
   */
  categorizeIndustry: tenantProcedure
    .input(updateAccountIndustrySchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const accountService = getAccountService(ctx);

      const result = await accountService.categorizeIndustry(
        input.id,
        input.industry,
        typedCtx.tenant.userId,
        typedCtx.tenant.tenantId
      );

      if (result.isFailure) throwAccountCommandError(result.error.code, result.error.message);

      await auditAndEnrichAccountUpdate(ctx, typedCtx, input.id, { industry: input.industry });
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
    // IFC-271 D-01: thread the acting user so the delete emits an AccountDeletedEvent
    const result = await accountService.deleteAccount(
      input.id,
      typedCtx.tenant.tenantId,
      typedCtx.tenant.userId
    );

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
      // IFC-271 B-06: tenant.userId is guaranteed non-null by tenantProcedure,
      // matching the audit-log call below — no unsafe non-null assertion.
      typedCtx.tenant.userId
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
   * Assign or reassign account owner (IFC-268).
   *
   * IFC-311: refactored to delegate to `performAccountReassign`. Legacy
   * response shape `{ success, id, ownerId, owner: { id, name, email } }` is
   * preserved for AccountDetail.tsx:142. The refactor also gives this
   * endpoint the previously-missing `notifyOnOwnerChange` wiring (it now
   * fires `notifyAccountReassignment` when the tenant flag is on).
   */
  assignOwner: tenantProcedure.input(assignOwnerSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const tenantId = typedCtx.tenant.tenantId;

    const flags = await loadAccountAutomation(typedCtx);
    const verdict = await performAccountReassign(ctx, input);

    if (verdict.kind === 'NOT_FOUND' || verdict.kind === 'TARGET_USER_NOT_FOUND') {
      logAccountReassignPermissionDenied(ctx, input.id, 'account:assignOwner');
      throw new TRPCError({
        code: 'NOT_FOUND',
        message:
          verdict.kind === 'TARGET_USER_NOT_FOUND' ? 'Target user not found' : 'Account not found',
      });
    }

    if (verdict.kind === 'FORBIDDEN') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Caller does not have permission to reassign this account.',
      });
    }

    // OK or SKIPPED — fetch target user once for the legacy response
    const targetUser = await typedCtx.prismaWithTenant.user.findFirst({
      where: { id: input.ownerId, tenantId },
      select: { id: true, name: true, email: true },
    });

    if (!targetUser) {
      // Defensive: should not happen since performAccountReassign already
      // verified, but the legacy response requires the user record.
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Target user not found' });
    }

    if (verdict.kind === 'OK') {
      await emitAccountReassignSideEffects(ctx, {
        id: input.id,
        accountName: verdict.accountName,
        previousOwnerId: verdict.previousOwnerId,
        newOwnerId: verdict.newOwnerId,
        flags,
      });
    } else if (verdict.kind === 'SKIPPED') {
      // Open Q2 (post-completion review): preserve pre-IFC-311 audit
      // behavior. Legacy `assignOwner` wrote to the DB even when the target
      // ownerId equalled the current ownerId (a no-op updateMany) and
      // emitted an audit entry. The new performAccountReassign skips that
      // write, so the audit log would be silent on self-reassign. We
      // explicitly log the no-op here so ops tooling that pages on missing
      // assignOwner audit rows keeps working. No notification — the helper
      // already short-circuits on equal owners. `reassign` / `bulkReassign`
      // intentionally do NOT emit this audit because the `skipped: true`
      // response field communicates the no-op to new callers.
      getAuditLogger(ctx.prisma)
        .logAction('UPDATE', 'account', input.id, tenantId, {
          actorId: typedCtx.tenant.userId,
          beforeState: { ownerId: verdict.currentOwnerId },
          afterState: { ownerId: verdict.currentOwnerId },
        })
        .catch((err) => console.error('[account.assignOwner] Audit log failed:', err));
    }

    return {
      success: true as const,
      id: input.id,
      ownerId: input.ownerId,
      owner: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
      },
    };
  }),

  /**
   * IFC-311: Reassign a single account's owner with notification wiring.
   * Honours the tenant `notifyOnOwnerChange` flag and emits
   * `account_reassigned` notifications to both old and new owner when on.
   * Idempotent: returns success without write or notification when the new
   * owner equals the current owner.
   */
  reassign: tenantProcedure.input(reassignAccountSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);

    const flags = await loadAccountAutomation(typedCtx);
    const verdict = await performAccountReassign(ctx, input);

    if (verdict.kind === 'NOT_FOUND' || verdict.kind === 'TARGET_USER_NOT_FOUND') {
      logAccountReassignPermissionDenied(ctx, input.id, 'account:reassign');
      throw new TRPCError({
        code: 'NOT_FOUND',
        message:
          verdict.kind === 'TARGET_USER_NOT_FOUND' ? 'Target user not found' : 'Account not found',
      });
    }

    if (verdict.kind === 'FORBIDDEN') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Caller does not have permission to reassign this account.',
      });
    }

    if (verdict.kind === 'SKIPPED') {
      return {
        id: input.id,
        previousOwnerId: verdict.currentOwnerId,
        newOwnerId: verdict.currentOwnerId,
        notified: false,
        skipped: true as const,
      };
    }

    const sideEffects = await emitAccountReassignSideEffects(ctx, {
      id: input.id,
      accountName: verdict.accountName,
      previousOwnerId: verdict.previousOwnerId,
      newOwnerId: verdict.newOwnerId,
      flags,
    });

    return {
      id: input.id,
      previousOwnerId: verdict.previousOwnerId,
      newOwnerId: verdict.newOwnerId,
      notified: sideEffects.notified,
    };
  }),

  /**
   * IFC-311: Reassign multiple accounts to a single new owner.
   * NP-013 batched path: ONE findMany for all ids (deduped), IN-MEMORY verdict
   * computation, ONE updateMany for eligible rows, Promise.allSettled for
   * side-effects. O(1) DB round-trips regardless of batch size.
   *
   * Per-row failures (NOT_FOUND, FORBIDDEN) are collected without
   * short-circuiting the batch, so callers cannot use the response to probe
   * authorisation row-by-row. Notification + audit log run per-row, post-tx.
   */
  bulkReassign: tenantProcedure
    .input(bulkReassignAccountsSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const tenantId = typedCtx.tenant.tenantId;

      // Pre-validate target user once (one query, not N). A lookup miss is a
      // NOT_FOUND, not an authz denial.
      const targetUser = await typedCtx.prismaWithTenant.user.findFirst({
        where: { id: input.ownerId, tenantId },
        select: { id: true },
      });
      if (!targetUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Target user not found' });
      }

      const flags = await loadAccountAutomation(typedCtx);

      // ── Batched read ──────────────────────────────────────────────────────
      // Dedupe ids before the IN query to keep it compact.
      const dedupedIds = [...new Set(input.ids)];

      const existingRows = await typedCtx.prismaWithTenant.account.findMany({
        where: { id: { in: dedupedIds }, tenantId },
        select: { id: true, ownerId: true, name: true },
      });
      // Build a Map keyed by id for O(1) lookup per original id.
      const rowMap = new Map(existingRows.map((r) => [r.id, r]));

      // ── In-memory verdict per deduped id ─────────────────────────────────
      const callerRole = ctx.user?.role ?? '';
      const isAdmin = REASSIGN_ADMIN_ROLES.has(callerRole);
      const callerId = typedCtx.tenant.userId;

      const { verdictMap, eligibleIds } = computeBulkReassignVerdicts(dedupedIds, rowMap, {
        callerId,
        isAdmin,
        targetOwnerId: input.ownerId,
      });

      // ── Batched write (single updateMany for all eligible rows) ───────────
      if (eligibleIds.length > 0) {
        await typedCtx.prismaWithTenant.account.updateMany({
          where: { id: { in: eligibleIds }, tenantId },
          data: { ownerId: input.ownerId },
        });
      }

      // ── Emit side-effects in parallel for OK rows (best-effort) ──────────
      const okRows = eligibleIds.map((id) => {
        const v = verdictMap.get(id) as {
          kind: 'OK';
          previousOwnerId: string;
          accountName: string;
        };
        return { id, previousOwnerId: v.previousOwnerId, accountName: v.accountName };
      });

      const sideEffectResults = await Promise.allSettled(
        okRows.map(({ id, previousOwnerId, accountName }) =>
          emitAccountReassignSideEffects(ctx, {
            id,
            accountName,
            previousOwnerId,
            newOwnerId: input.ownerId,
            flags,
          })
        )
      );
      // Map eligible id → notified result (default false on rejection)
      const notifiedMap = new Map<string, boolean>();
      for (let i = 0; i < okRows.length; i++) {
        const r = sideEffectResults[i];
        notifiedMap.set(okRows[i].id, r.status === 'fulfilled' ? r.value.notified : false);
      }

      // ── Build order-preserving response from the precomputed verdicts ────
      const { successful, failed } = buildBulkReassignResponse(
        input.ids,
        verdictMap,
        notifiedMap,
        input.ownerId
      );

      return { successful, failed, totalProcessed: input.ids.length };
    }),

  // ═════════════════════════════════════════════════════════════════════════
  // IFC-312 — AI chain procedures (accounts)
  // ═════════════════════════════════════════════════════════════════════════

  suggestTags: tenantProcedure
    .input(accountSuggestTagsInputSchema)
    .output(accountSuggestTagsOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const flags = await loadAccountAutomation(typedCtx);
      if (!flags.aiTagSuggestions) return [];

      const account = await ctx.prismaWithTenant.account.findUnique({
        where: { id: input.accountId },
      });
      if (!account) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
      }

      const syncStart = Date.now(); // IFC-312 audit fix F6: sync-breach visibility
      try {
        const { Queue, QueueEvents } = await loadBullMQ();
        const { QUEUE_NAMES } = await import('@intelliflow/platform/queues/types');
        const connection = {
          host: requiredProdEnv('REDIS_HOST', process.env.REDIS_HOST, 'localhost'),
          port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
          ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
          ...(process.env.REDIS_USERNAME ? { username: process.env.REDIS_USERNAME } : {}),
        };
        const queue = new Queue(QUEUE_NAMES.AI_TAG_SUGGESTION, { connection });
        const events = new QueueEvents(QUEUE_NAMES.AI_TAG_SUGGESTION, { connection });
        try {
          const otelCarrier: Record<string, string> = {};
          propagation.inject(otelContext.active(), otelCarrier);
          const job = await queue.add('suggest', {
            entityType: 'account',
            entityId: input.accountId,
            tenantId: typedCtx.tenant.tenantId,
            profileSnapshot: {
              name: account.name,
              description: account.description ?? undefined,
              industry: account.industry ?? undefined,
              website: account.website ?? undefined,
            },
            _otelCarrier: otelCarrier,
          });
          const result = (await job.waitUntilFinished(events, 5000)) as {
            suggestions?: Array<{ label: string; confidence: number; reason: string }>;
          };
          return result.suggestions ?? [];
        } finally {
          await events.close().catch(() => {});
          await queue.close().catch(() => {});
        }
      } catch (err) {
        // IFC-312 audit fix F6: sync-chain breach visibility.
        const durationMs = Date.now() - syncStart;
        const reason =
          err instanceof Error && /timed out|timeout/i.test(err.message) ? 'timeout' : 'error';
        console.warn(
          `[account.router.suggestTags] sync-chain breach (${reason}) ` +
            `accountId=${input.accountId} tenantId=${typedCtx.tenant.tenantId} ` +
            `durationMs=${durationMs}:`,
          err
        );
        return [];
      }
    }),

  generateInsight: tenantProcedure
    .input(accountGenerateInsightInputSchema)
    .output(accountGenerateInsightOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const flags = await loadAccountAutomation(typedCtx);
      if (!flags.aiInsightGeneration) return { enqueued: false };

      try {
        const { Queue } = await loadBullMQ();
        const { QUEUE_NAMES } = await import('@intelliflow/platform/queues/types');
        const queue = new Queue(QUEUE_NAMES.AI_ENTITY_INSIGHT, {
          connection: {
            host: requiredProdEnv('REDIS_HOST', process.env.REDIS_HOST, 'localhost'),
            port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
          },
        });
        const otelCarrier: Record<string, string> = {};
        propagation.inject(otelContext.active(), otelCarrier);
        await queue.add('insight', {
          entityType: 'account',
          entityId: input.accountId,
          tenantId: typedCtx.tenant.tenantId,
          _otelCarrier: otelCarrier,
        });
        await queue.close();
        return { enqueued: true };
      } catch {
        return { enqueued: false };
      }
    }),

  scoreAccount: tenantProcedure
    .input(accountScoreInputSchema)
    .output(accountScoreOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const flags = await loadAccountAutomation(typedCtx);
      if (!flags.aiAccountScoring) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'AI account scoring is disabled for this tenant',
        });
      }

      try {
        const { Queue } = await loadBullMQ();
        const { QUEUE_NAMES } = await import('@intelliflow/platform/queues/types');
        const queue = new Queue(QUEUE_NAMES.AI_ACCOUNT_SCORING, {
          connection: {
            host: requiredProdEnv('REDIS_HOST', process.env.REDIS_HOST, 'localhost'),
            port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
          },
        });
        const otelCarrier: Record<string, string> = {};
        propagation.inject(otelContext.active(), otelCarrier);
        await queue.add('score', {
          accountId: input.accountId,
          tenantId: typedCtx.tenant.tenantId,
          _otelCarrier: otelCarrier,
        });
        await queue.close();
        return { enqueued: true };
      } catch {
        return { enqueued: false };
      }
    }),

  /**
   * IFC-312 audit fix F3: addTags — merges new tags into Account.tags array
   * (dedup). Spec §4.3.4 assumed this existed; the first-ship missed it.
   */
  addTags: tenantProcedure
    .input(accountAddTagsInputSchema)
    .output(accountAddTagsOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.prismaWithTenant.account.findUnique({
        where: { id: input.accountId },
        select: { tags: true },
      });
      if (!current) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
      }
      const merged = Array.from(new Set<string>([...(current.tags ?? []), ...input.tags]));
      await ctx.prismaWithTenant.account.update({
        where: { id: input.accountId },
        data: { tags: merged },
      });
      return { tags: merged };
    }),

  getAiInsight: tenantProcedure
    .input(accountGetAiInsightInputSchema)
    .output(accountGetAiInsightOutputSchema)
    .query(async ({ ctx, input }) => {
      const insight = await ctx.prismaWithTenant.accountAIInsight.findUnique({
        where: { accountId: input.accountId },
      });
      if (!insight) return { insight: null };
      return {
        insight: {
          id: insight.id,
          accountId: insight.accountId,
          healthSummary: insight.healthSummary,
          nextBestAction: insight.nextBestAction,
          keySignals: insight.keySignals,
          churnRisk: insight.churnRisk,
          engagementScore: insight.engagementScore,
          sentimentTrend: insight.sentimentTrend,
          recommendations: insight.recommendations,
          modelVersion: insight.modelVersion,
          generatedAt: insight.generatedAt,
          source: insight.source,
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
