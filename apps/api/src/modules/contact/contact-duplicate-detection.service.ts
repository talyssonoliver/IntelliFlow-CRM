/**
 * IFC-310 — Contact Duplicate-Detection Service.
 *
 * Reads ContactDuplicateRule rows, consults ContactAutomationSetting toggles,
 * and orchestrates the flag/auto-merge action at contact create + update time.
 *
 * Runtime wiring:
 *   - contact.router.ts create path → checkForCreate
 *   - contact.router.ts update path → checkForUpdate
 *   - post-create auto-merge path   → applyAutoMerge
 */

import type { Contact, PrismaClient } from '@intelliflow/db';
import type { ContactAutomationFlags } from './contact-automation';
import {
  type DuplicateMatch,
  type EvaluableRule,
  evaluateDuplicateRules,
} from '../../shared/duplicate-rule-evaluator';
import { createNotification } from '../notifications/notifications.router';

/**
 * Structural subtype of `TenantAwareContext` (see
 * apps/api/src/security/tenant-context.ts). Kept as a local shape so the
 * detection service does not pull a hard dependency on the security module,
 * but fields are a prefix of `TenantAwareContext` so routers can pass their
 * typed ctx directly without `as any`.
 */
export interface HasTenantContext {
  tenant: {
    tenantId: string;
    userId: string;
    // Optional fields present on real TenantAwareContext — accepted but not
    // consumed by the detection service. Declaring them keeps the structural
    // match with TenantAwareContext strict.
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

export type ContactDuplicateAction = 'proceed' | 'flag' | 'auto-merge';

export type DuplicateCheckResult =
  | { action: 'proceed'; matches: [] }
  | { action: 'flag'; matches: DuplicateMatch<Contact>[] }
  | { action: 'auto-merge'; matches: DuplicateMatch<Contact>[]; primaryId: string };

export interface ContactCheckInput {
  id?: string;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
}

export interface ContactDuplicateDetectionService {
  checkForCreate(
    ctx: HasTenantContext,
    payload: ContactCheckInput,
    flags: ContactAutomationFlags
  ): Promise<DuplicateCheckResult>;

  checkForUpdate(
    ctx: HasTenantContext,
    contactId: string,
    payload: ContactCheckInput,
    flags: ContactAutomationFlags
  ): Promise<DuplicateCheckResult>;

  applyAutoMerge(
    ctx: HasTenantContext,
    primaryId: string,
    secondaryId: string,
    mergedBy: string
  ): Promise<{
    survivingContactId: string;
    mergedContactId: string;
    fieldsUpdated: string[];
    mergedAt: Date;
  }>;
}

interface FindSimilarContacts {
  (
    prisma: PrismaClient,
    tenantId: string,
    embedding: number[],
    options?: { limit?: number; threshold?: number }
  ): Promise<Array<{ id: string; similarity: number }>>;
}

interface GenerateEmbedding {
  (text: string): Promise<number[] | null>;
}

export interface ContactDuplicateDetectionDeps {
  findSimilarContacts?: FindSimilarContacts;
  generateEmbedding?: GenerateEmbedding;
  enqueueEmbeddingJob?: (payload: {
    contactId: string;
    tenantId: string;
    reason: 'create' | 'update' | 'merge';
  }) => Promise<void> | void;
  mergeContacts?: (
    ctx: HasTenantContext,
    primaryId: string,
    secondaryId: string,
    mergedBy: string
  ) => Promise<{
    survivingContactId: string;
    mergedContactId: string;
    fieldsUpdated: string[];
    mergedAt: Date;
  }>;
  now?: () => Date;
}

const MAX_CANDIDATES = 200;
const AI_SIMILARITY_LIMIT = 5;
const AI_SIMILARITY_THRESHOLD = 0.3;

function rulesFromRows(
  rows: Array<{
    field: string;
    matchStrategy: string;
    threshold: number;
    isActive: boolean;
    sortOrder: number;
  }>
): EvaluableRule[] {
  const validFields: EvaluableRule['field'][] = [
    'email',
    'phone',
    'name_company',
    'name',
    'website',
    'name_address',
  ];
  const validStrategies: EvaluableRule['matchStrategy'][] = ['exact', 'normalized', 'fuzzy'];
  return rows
    .filter(
      (r) =>
        validFields.includes(r.field as EvaluableRule['field']) &&
        validStrategies.includes(r.matchStrategy as EvaluableRule['matchStrategy'])
    )
    .map((r) => ({
      field: r.field as EvaluableRule['field'],
      matchStrategy: r.matchStrategy as EvaluableRule['matchStrategy'],
      threshold: r.threshold,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
    }));
}

function contactToEmbeddableText(
  c:
    | {
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
        company?: string | null;
      }
    | null
    | undefined
): string {
  if (!c) return '';
  return [c.firstName, c.lastName, c.email, c.company]
    .filter((v): v is string => Boolean(v && typeof v === 'string'))
    .join(' ')
    .trim();
}

async function fireAndForget<T>(promise: Promise<T> | T, label: string): Promise<void> {
  try {
    await Promise.resolve(promise);
  } catch (error) {
    console.warn(`[contact-duplicate-detection] ${label} failed (fire-and-forget):`, error);
  }
}

export function createContactDuplicateDetectionService(
  deps: ContactDuplicateDetectionDeps = {}
): ContactDuplicateDetectionService {
  const now = deps.now ?? (() => new Date());

  async function loadActiveRules(ctx: HasTenantContext): Promise<EvaluableRule[]> {
    const prismaWithTenant = ctx.prismaWithTenant as unknown as {
      contactDuplicateRule: {
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
    };
    const rows = await prismaWithTenant.contactDuplicateRule.findMany({
      where: { tenantId: ctx.tenant.tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return rulesFromRows(rows);
  }

  async function fetchCandidates(
    ctx: HasTenantContext,
    payload: ContactCheckInput,
    excludeId?: string
  ): Promise<Contact[]> {
    const prismaWithTenant = ctx.prismaWithTenant as unknown as {
      contact: {
        findMany: (args: { where: Record<string, unknown>; take: number }) => Promise<Contact[]>;
      };
    };
    const orClauses: Record<string, unknown>[] = [];
    if (payload.email) {
      orClauses.push({ email: { equals: payload.email, mode: 'insensitive' } });
      const at = payload.email.indexOf('@');
      if (at > 0) {
        orClauses.push({
          email: {
            endsWith: payload.email.slice(at).toLowerCase(),
            mode: 'insensitive',
          },
        });
      }
    }
    if (payload.phone) {
      orClauses.push({ phone: payload.phone });
    }
    if (payload.firstName && payload.lastName) {
      orClauses.push({
        AND: [
          { firstName: { equals: payload.firstName, mode: 'insensitive' } },
          { lastName: { equals: payload.lastName, mode: 'insensitive' } },
        ],
      });
    }
    if (orClauses.length === 0) return [];

    const where: Record<string, unknown> = {
      tenantId: ctx.tenant.tenantId,
      OR: orClauses,
    };
    if (excludeId) where.NOT = { id: excludeId };

    return prismaWithTenant.contact.findMany({ where, take: MAX_CANDIDATES });
  }

  async function runAiBranch(
    ctx: HasTenantContext,
    payload: ContactCheckInput,
    deterministicMatches: DuplicateMatch<Contact>[],
    flags: ContactAutomationFlags
  ): Promise<DuplicateMatch<Contact>[]> {
    if (!flags.aiDuplicateDetection) return deterministicMatches;
    if (!deps.findSimilarContacts || !deps.generateEmbedding) return deterministicMatches;

    try {
      const text = contactToEmbeddableText(payload);
      if (!text) return deterministicMatches;

      const embedding = await deps.generateEmbedding(text);
      if (!embedding || embedding.length === 0) return deterministicMatches;

      const similar = await deps.findSimilarContacts(
        ctx.prismaWithTenant,
        ctx.tenant.tenantId,
        embedding,
        { limit: AI_SIMILARITY_LIMIT, threshold: AI_SIMILARITY_THRESHOLD }
      );

      const seen = new Set(deterministicMatches.map((m) => m.candidate.id));
      const newCandidates = similar.filter((s) => !seen.has(s.id) && s.id !== payload.id);

      if (newCandidates.length === 0) return deterministicMatches;

      // Batch lookup: one findMany instead of N findFirst calls
      const rows = await (
        ctx.prismaWithTenant as unknown as {
          contact: {
            findMany: (args: { where: Record<string, unknown> }) => Promise<Contact[]>;
          };
        }
      ).contact.findMany({
        where: { id: { in: newCandidates.map((s) => s.id) }, tenantId: ctx.tenant.tenantId },
      });
      const rowById = new Map<string, Contact>(rows.map((r) => [r.id, r]));

      const fullCandidates = newCandidates.map((s) => {
        const row = rowById.get(s.id);
        return row ? { row, similarity: s.similarity } : null;
      });

      const aiMatches: DuplicateMatch<Contact>[] = fullCandidates
        .filter((c): c is { row: Contact; similarity: number } => Boolean(c))
        .map(({ row, similarity }) => ({
          candidate: row,
          ruleField: 'email' as const,
          matchStrategy: 'fuzzy' as const,
          score: Math.max(0, Math.min(100, Math.round((1 - similarity) * 100))),
        }));

      return [...deterministicMatches, ...aiMatches];
    } catch (error) {
      console.warn(
        '[contact-duplicate-detection] AI branch failed, degrading to deterministic-only:',
        error
      );
      return deterministicMatches;
    }
  }

  function decide(
    matches: DuplicateMatch<Contact>[],
    payload: ContactCheckInput,
    flags: ContactAutomationFlags
  ): DuplicateCheckResult {
    if (matches.length === 0) return { action: 'proceed', matches: [] };

    const exactEmailMatch = payload.email
      ? matches.find(
          (m) => m.ruleField === 'email' && m.matchStrategy !== 'fuzzy' && m.score === 100
        )
      : undefined;

    if (exactEmailMatch && flags.autoMergeOnExactEmail) {
      return {
        action: 'auto-merge',
        matches,
        primaryId: exactEmailMatch.candidate.id,
      };
    }

    if (flags.notifyOnDuplicate) {
      return { action: 'flag', matches };
    }

    return { action: 'proceed', matches: [] };
  }

  async function emitFlagNotification(
    ctx: HasTenantContext,
    matches: DuplicateMatch<Contact>[],
    action: 'flagged' | 'auto-merged'
  ): Promise<void> {
    if (!ctx.prisma && !ctx.prismaWithTenant) return;
    const prisma = ctx.prisma ?? ctx.prismaWithTenant;
    await fireAndForget(
      createNotification(
        prisma,
        {
          tenantId: ctx.tenant.tenantId,
          userId: ctx.tenant.userId,
          type: 'contact_duplicate_suspected',
          title:
            action === 'auto-merged'
              ? 'Duplicate contact auto-merged'
              : 'Possible duplicate contact detected',
          body:
            action === 'auto-merged'
              ? `Merged duplicate contact after exact-email match.`
              : `Review ${matches.length} suspected duplicate(s).`,
          priority: 'normal',
          entityType: 'contact',
          entityId: matches[0]?.candidate.id ?? null,
          metadata: {
            action,
            candidateIds: matches.map((m) => m.candidate.id),
          },
        } as any,
        ctx.services?.notificationOrchestrator
      ),
      'flag notification'
    );
  }

  async function enqueueEmbed(
    ctx: HasTenantContext,
    contactId: string,
    reason: 'create' | 'update' | 'merge'
  ): Promise<void> {
    if (!deps.enqueueEmbeddingJob) return;
    await fireAndForget(
      deps.enqueueEmbeddingJob({
        contactId,
        tenantId: ctx.tenant.tenantId,
        reason,
      }),
      'embedding enqueue'
    );
  }

  async function check(
    ctx: HasTenantContext,
    payload: ContactCheckInput,
    flags: ContactAutomationFlags,
    excludeId?: string
  ): Promise<DuplicateCheckResult> {
    const rules = await loadActiveRules(ctx);
    if (rules.length === 0) return { action: 'proceed', matches: [] };

    const existing = await fetchCandidates(ctx, payload, excludeId);
    if (existing.length === 0) return { action: 'proceed', matches: [] };

    const deterministic = evaluateDuplicateRules<Contact & { id: string }>(
      payload as Partial<Contact>,
      existing as unknown as Array<Contact & { id: string }>,
      rules
    );

    const fullMatches = await runAiBranch(
      ctx,
      payload,
      deterministic as DuplicateMatch<Contact>[],
      flags
    );

    const decision = decide(fullMatches, payload, flags);

    // AC-004: emit notification on flag branch. Mirror of the account service.
    // Auto-merge emits its notification separately inside applyAutoMerge after
    // the merge commits — do NOT double-emit here.
    if (decision.action === 'flag') {
      await emitFlagNotification(ctx, decision.matches, 'flagged');
    }

    return decision;
  }

  return {
    async checkForCreate(ctx, payload, flags) {
      return check(ctx, payload, flags, undefined);
    },

    async checkForUpdate(ctx, contactId, payload, flags) {
      return check(ctx, { ...payload, id: contactId }, flags, contactId);
    },

    async applyAutoMerge(ctx, primaryId, secondaryId, mergedBy) {
      const merger =
        deps.mergeContacts ??
        (async () => {
          // Fallback: call ContactService via container indirection.
          // The router is expected to wire a concrete merger that knows how to
          // call ContactService.mergeContacts — this path is only exercised in
          // tests without a merger spy.
          throw new Error(
            'ContactDuplicateDetectionService.applyAutoMerge requires a mergeContacts dep'
          );
        });

      const result = await merger(ctx, primaryId, secondaryId, mergedBy);

      const matchesForNotification: DuplicateMatch<Contact>[] = [
        {
          candidate: { id: primaryId } as unknown as Contact,
          ruleField: 'email',
          matchStrategy: 'exact',
          score: 100,
        },
      ];

      await emitFlagNotification(ctx, matchesForNotification, 'auto-merged');
      await enqueueEmbed(ctx, primaryId, 'merge');

      return {
        survivingContactId: result.survivingContactId,
        mergedContactId: result.mergedContactId,
        fieldsUpdated: result.fieldsUpdated,
        mergedAt: result.mergedAt ?? now(),
      };
    },
  };
}

export const contactDuplicateDetectionService = createContactDuplicateDetectionService();
