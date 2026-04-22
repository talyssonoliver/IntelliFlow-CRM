/**
 * IFC-310 — Account Duplicate-Detection Service.
 *
 * Reads AccountDuplicateRule rows, consults AccountAutomationSetting toggles,
 * and orchestrates the flag / auto-link-by-domain action at account create +
 * update time. Accounts are NEVER auto-merged — auto-merge is explicitly
 * out-of-scope for the account side.
 *
 * Runtime wiring:
 *   - account.router.ts create path → checkForCreate
 *   - account.router.ts update path → checkForUpdate
 *   - post-create auto-link path    → linkContactsByDomain
 */

import type { Account, PrismaClient } from '@intelliflow/db';
import type { AccountAutomationFlags } from './account-automation';
import {
  type DuplicateMatch,
  type EvaluableRule,
  evaluateDuplicateRules,
} from '../../shared/duplicate-rule-evaluator';
import { createNotification } from '../notifications/notifications.router';

/**
 * Structural subtype of `TenantAwareContext` (see
 * apps/api/src/security/tenant-context.ts) — fields are a prefix so routers
 * pass their typed ctx directly without `as any`.
 */
export interface HasTenantContext {
  tenant: {
    tenantId: string;
    userId: string;
    tenantType?: 'user' | 'organization';
    role?: string;
    organizationId?: string;
    canAccessAllTenantData?: boolean;
    teamMemberIds?: string[];
  };
  prismaWithTenant: PrismaClient;
  prisma?: PrismaClient;
  services?: {
    notificationOrchestrator?: unknown;
    [key: string]: unknown;
  };
}

export type AccountDuplicateCheckResult =
  | { action: 'proceed'; matches: [] }
  | { action: 'flag'; matches: DuplicateMatch<Account>[] };

export interface AccountCheckInput {
  id?: string;
  name?: string | null;
  website?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  city?: string | null;
}

export interface AccountDuplicateDetectionService {
  checkForCreate(
    ctx: HasTenantContext,
    payload: AccountCheckInput,
    flags: AccountAutomationFlags,
  ): Promise<AccountDuplicateCheckResult>;

  checkForUpdate(
    ctx: HasTenantContext,
    accountId: string,
    payload: AccountCheckInput,
    flags: AccountAutomationFlags,
  ): Promise<AccountDuplicateCheckResult>;

  linkContactsByDomain(
    ctx: HasTenantContext,
    accountId: string,
    domain: string,
  ): Promise<string[]>;
}

export interface AccountDuplicateDetectionDeps {
  maxAutoLinkBatch?: number;
  now?: () => Date;
  /**
   * IFC-310 AC-010: when supplied, `linkContactsByDomain` delegates to the
   * application-layer AccountService so the transactional domain-link logic
   * lives at the correct architectural layer instead of in this apps/api
   * module. When absent (tests), falls back to calling prismaWithTenant
   * inside its own $transaction.
   */
  linkContactsByEmailDomain?: (
    accountId: string,
    domain: string,
    tenantId: string,
    maxBatch: number
  ) => Promise<
    { kind: 'linked'; ids: string[] } | { kind: 'overflow'; sampleIds: string[] }
  >;
}

const MAX_CANDIDATES = 200;

function rulesFromRows(
  rows: Array<{
    field: string;
    matchStrategy: string;
    threshold: number;
    isActive: boolean;
    sortOrder: number;
  }>,
): EvaluableRule[] {
  const validFields: EvaluableRule['field'][] = [
    'email',
    'phone',
    'name_company',
    'name',
    'website',
    'name_address',
  ];
  const validStrategies: EvaluableRule['matchStrategy'][] = [
    'exact',
    'normalized',
    'fuzzy',
  ];
  return rows
    .filter(
      (r) =>
        validFields.includes(r.field as EvaluableRule['field']) &&
        validStrategies.includes(
          r.matchStrategy as EvaluableRule['matchStrategy'],
        ),
    )
    .map((r) => ({
      field: r.field as EvaluableRule['field'],
      matchStrategy: r.matchStrategy as EvaluableRule['matchStrategy'],
      threshold: r.threshold,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
    }));
}

export function extractDomainFromWebsite(
  website: string | null | undefined,
): string | null {
  if (!website) return null;
  const normalized = website
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '');
  if (!normalized) return null;
  const host = normalized.split(/[/?#]/)[0];
  if (!host) return null;
  if (!host.includes('.')) return null;
  return host;
}

async function fireAndForget<T>(
  promise: Promise<T> | T,
  label: string,
): Promise<void> {
  try {
    await Promise.resolve(promise);
  } catch (error) {
    console.warn(`[account-duplicate-detection] ${label} failed (fire-and-forget):`, error);
  }
}

export function createAccountDuplicateDetectionService(
  deps: AccountDuplicateDetectionDeps = {},
): AccountDuplicateDetectionService {
  const maxBatch = deps.maxAutoLinkBatch ?? 500;

  async function loadActiveRules(
    ctx: HasTenantContext,
  ): Promise<EvaluableRule[]> {
    const rows = await (ctx.prismaWithTenant as unknown as {
      accountDuplicateRule: {
        findMany: (args: {
          where: { tenantId: string; isActive: boolean };
          orderBy: { sortOrder: 'asc' };
        }) => Promise<
          Array<{
            field: string;
            matchStrategy: string;
            threshold: number;
            isActive: boolean;
            sortOrder: number;
          }>
        >;
      };
    }).accountDuplicateRule.findMany({
      where: { tenantId: ctx.tenant.tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return rulesFromRows(rows);
  }

  async function fetchCandidates(
    ctx: HasTenantContext,
    payload: AccountCheckInput,
    excludeId?: string,
  ): Promise<Account[]> {
    const orClauses: Record<string, unknown>[] = [];
    if (payload.name) {
      orClauses.push({ name: { equals: payload.name, mode: 'insensitive' } });
    }
    if (payload.website) {
      orClauses.push({ website: { contains: payload.website, mode: 'insensitive' } });
    }
    if (payload.phone) {
      orClauses.push({ phone: payload.phone });
    }
    if (orClauses.length === 0) return [];

    const where: Record<string, unknown> = {
      tenantId: ctx.tenant.tenantId,
      OR: orClauses,
    };
    if (excludeId) where.NOT = { id: excludeId };

    return (ctx.prismaWithTenant as unknown as {
      account: {
        findMany: (args: {
          where: Record<string, unknown>;
          take: number;
        }) => Promise<Account[]>;
      };
    }).account.findMany({ where, take: MAX_CANDIDATES });
  }

  async function emitFlagNotification(
    ctx: HasTenantContext,
    matches: DuplicateMatch<Account>[],
  ): Promise<void> {
    if (!ctx.prisma && !ctx.prismaWithTenant) return;
    const prisma = ctx.prisma ?? ctx.prismaWithTenant;
    await fireAndForget(
      createNotification(
        prisma,
        {
          tenantId: ctx.tenant.tenantId,
          userId: ctx.tenant.userId,
          type: 'account_duplicate_suspected',
          title: 'Possible duplicate account detected',
          body: `Review ${matches.length} suspected duplicate account(s).`,
          priority: 'normal',
          entityType: 'account',
          entityId: matches[0]?.candidate.id ?? null,
          metadata: {
            action: 'flagged',
            candidateIds: matches.map((m) => m.candidate.id),
          },
        } as any,
        ctx.services?.notificationOrchestrator,
      ),
      'flag notification',
    );
  }

  async function check(
    ctx: HasTenantContext,
    payload: AccountCheckInput,
    flags: AccountAutomationFlags,
    excludeId?: string,
  ): Promise<AccountDuplicateCheckResult> {
    const rules = await loadActiveRules(ctx);
    if (rules.length === 0) return { action: 'proceed', matches: [] };

    const existing = await fetchCandidates(ctx, payload, excludeId);
    if (existing.length === 0) return { action: 'proceed', matches: [] };

    const matches = evaluateDuplicateRules<Account & { id: string }>(
      payload as Partial<Account>,
      existing as unknown as Array<Account & { id: string }>,
      rules,
    ) as DuplicateMatch<Account>[];

    if (matches.length === 0) return { action: 'proceed', matches: [] };

    if (flags.notifyOnDuplicate) {
      await emitFlagNotification(ctx, matches);
      return { action: 'flag', matches };
    }

    return { action: 'proceed', matches: [] };
  }

  return {
    async checkForCreate(ctx, payload, flags) {
      return check(ctx, payload, flags, undefined);
    },

    async checkForUpdate(ctx, accountId, payload, flags) {
      return check(ctx, { ...payload, id: accountId }, flags, accountId);
    },

    async linkContactsByDomain(ctx, accountId, domain) {
      const normalizedDomain = domain.trim().toLowerCase().replace(/^www\./, '');
      if (!normalizedDomain || !normalizedDomain.includes('.')) return [];

      // IFC-310 AC-010: prefer the application-layer AccountService when
      // wired (production path via container). The service delegates to
      // ContactRepository.linkContactsToAccountByEmailDomain which performs
      // the atomic $transaction at the adapter layer.
      if (deps.linkContactsByEmailDomain) {
        const result = await deps.linkContactsByEmailDomain(
          accountId,
          normalizedDomain,
          ctx.tenant.tenantId,
          maxBatch
        );
        if (result.kind === 'overflow') {
          await emitFlagNotification(
            ctx,
            result.sampleIds.map((id) => ({
              candidate: { id } as unknown as Account,
              ruleField: 'website',
              matchStrategy: 'normalized',
              score: 100,
            }))
          );
          return [];
        }
        return result.ids;
      }

      // Test-only fallback: inline $transaction using prismaWithTenant.
      const prismaWithTenant = ctx.prismaWithTenant as unknown as {
        $transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
      };

      // AC-010: findMany + updateMany must run inside a single $transaction so
      // a concurrent writer cannot interleave a contact claim between the read
      // and the write. The tenant guard is re-applied on both statements.
      const result = await prismaWithTenant.$transaction(async (tx) => {
        const txAny = tx as unknown as {
          contact: {
            findMany: (args: {
              where: Record<string, unknown>;
              select: { id: true };
              take: number;
            }) => Promise<Array<{ id: string }>>;
            updateMany: (args: {
              where: Record<string, unknown>;
              data: { accountId: string };
            }) => Promise<{ count: number }>;
          };
        };

        const candidates = await txAny.contact.findMany({
          where: {
            tenantId: ctx.tenant.tenantId,
            accountId: null,
            email: { endsWith: `@${normalizedDomain}`, mode: 'insensitive' },
          },
          select: { id: true },
          take: maxBatch + 1,
        });

        if (candidates.length > maxBatch) {
          return { overflow: true, ids: [] as string[], overflowIds: candidates.slice(0, 5).map((c) => c.id) };
        }

        if (candidates.length === 0) {
          return { overflow: false, ids: [] as string[] };
        }

        const ids = candidates.map((c) => c.id);
        await txAny.contact.updateMany({
          where: { id: { in: ids }, tenantId: ctx.tenant.tenantId },
          data: { accountId },
        });
        return { overflow: false, ids };
      });

      if (result.overflow) {
        // R9: too many matches — flag for human review (outside the tx to
        // keep the tx short and to keep fire-and-forget semantics on the
        // notification emit).
        await emitFlagNotification(
          ctx,
          (result as { overflowIds: string[] }).overflowIds.map((id) => ({
            candidate: { id } as unknown as Account,
            ruleField: 'website',
            matchStrategy: 'normalized',
            score: 100,
          })),
        );
        return [];
      }

      return result.ids;
    },
  };
}

export const accountDuplicateDetectionService =
  createAccountDuplicateDetectionService();
