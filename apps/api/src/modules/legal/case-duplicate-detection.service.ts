/**
 * PG-190 — Case Duplicate-Detection Service.
 *
 * Reads CaseDuplicateRule rows, consults CaseAutomationSetting toggles,
 * and emits `case_duplicate_suspected` notifications at case create + update
 * time. Follows the same shape as ContactDuplicateDetectionService /
 * AccountDuplicateDetectionService so routers and tests share the pattern.
 *
 * Case-specific field evaluator:
 *   - 'title'      — string equality / normalized / fuzzy
 *   - 'client'     — clientId equality only (account FK, no fuzzy)
 *   - 'deadline'   — same calendar day equality
 *   - 'externalId' — string equality / normalized (no fuzzy — IDs are opaque)
 */

import type { Case, PrismaClient } from '@intelliflow/db';
import type { CaseAutomationFlags } from './case-automation';
import { createNotification } from '../notifications/notifications.router';

export type CaseDuplicateField = 'title' | 'client' | 'deadline' | 'externalId';
export type CaseDuplicateStrategy = 'exact' | 'normalized' | 'fuzzy';

export interface CaseEvaluableRule {
  field: CaseDuplicateField;
  matchStrategy: CaseDuplicateStrategy;
  collisionAction: string;
  isActive: boolean;
  sortOrder: number;
}

export interface CaseDuplicateMatch {
  candidate: Pick<Case, 'id' | 'title'>;
  ruleField: CaseDuplicateField;
  matchStrategy: CaseDuplicateStrategy;
  score: number;
  collisionAction: string;
}

export type CaseDuplicateAction = 'proceed' | 'flag' | 'block';

export type CaseDuplicateCheckResult =
  | { action: 'proceed'; matches: [] }
  | { action: 'flag'; matches: CaseDuplicateMatch[] }
  | { action: 'block'; matches: CaseDuplicateMatch[] };

export interface CaseCheckInput {
  id?: string;
  title?: string | null;
  clientId?: string | null;
  deadline?: Date | null;
  externalId?: string | null;
}

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

export interface CaseDuplicateDetectionService {
  checkForCreate(
    ctx: HasTenantContext,
    payload: CaseCheckInput,
    flags: CaseAutomationFlags,
  ): Promise<CaseDuplicateCheckResult>;

  checkForUpdate(
    ctx: HasTenantContext,
    caseId: string,
    payload: CaseCheckInput,
    flags: CaseAutomationFlags,
  ): Promise<CaseDuplicateCheckResult>;
}

export interface CaseDuplicateDetectionDeps {
  now?: () => Date;
}

// ─── Pure helpers (zero I/O) ────────────────────────────────────────────────

const FUZZY_FLOOR = 70;
const MAX_CANDIDATES = 100;

function trimLower(value: string): string {
  return value.trim().toLowerCase();
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const cols = b.length + 1;
  let prev = new Array<number>(cols);
  let curr = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[cols - 1];
}

function similarityPercent(a: string, b: string): number {
  if (!a && !b) return 0;
  if (a === b) return 100;
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 0;
  const dist = levenshtein(a, b);
  const pct = Math.round(((longest - dist) / longest) * 100);
  return Math.max(0, Math.min(100, pct));
}

function sameCalendarDay(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a || !b) return false;
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function scoreField(
  field: CaseDuplicateField,
  strategy: CaseDuplicateStrategy,
  input: CaseCheckInput,
  candidate: Pick<Case, 'title' | 'clientId' | 'deadline'>,
): number {
  switch (field) {
    case 'title': {
      const ip = input.title ?? '';
      const cp = candidate.title ?? '';
      if (!ip || !cp) return 0;
      if (strategy === 'exact') return trimLower(ip) === trimLower(cp) ? 100 : 0;
      if (strategy === 'normalized') return normalize(ip) === normalize(cp) ? 100 : 0;
      return similarityPercent(normalize(ip), normalize(cp));
    }
    case 'client': {
      if (!input.clientId || !candidate.clientId) return 0;
      return input.clientId === candidate.clientId ? 100 : 0;
    }
    case 'deadline': {
      return sameCalendarDay(input.deadline ?? null, candidate.deadline ?? null) ? 100 : 0;
    }
    case 'externalId': {
      // The Case model has no externalId column today; rules targeting this
      // field are accepted at the settings layer (validator enum) but cannot
      // match real rows. Score 0 so the rule is a no-op until a follow-up
      // task adds the column.
      return 0;
    }
    default:
      return 0;
  }
}

function rulesFromRows(
  rows: Array<{
    field: string;
    matchStrategy: string;
    collisionAction: string;
    isActive: boolean;
    sortOrder: number;
  }>,
): CaseEvaluableRule[] {
  const validFields: CaseDuplicateField[] = ['title', 'client', 'deadline', 'externalId'];
  const validStrategies: CaseDuplicateStrategy[] = ['exact', 'normalized', 'fuzzy'];
  return rows
    .filter(
      (r) =>
        validFields.includes(r.field as CaseDuplicateField) &&
        validStrategies.includes(r.matchStrategy as CaseDuplicateStrategy),
    )
    .map((r) => ({
      field: r.field as CaseDuplicateField,
      matchStrategy: r.matchStrategy as CaseDuplicateStrategy,
      collisionAction: r.collisionAction,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
    }));
}

export function evaluateCaseDuplicateRules(
  input: CaseCheckInput,
  existing: readonly Pick<Case, 'id' | 'title' | 'clientId' | 'deadline'>[],
  rules: readonly CaseEvaluableRule[],
): CaseDuplicateMatch[] {
  if (!Array.isArray(rules) || rules.length === 0) return [];
  if (!Array.isArray(existing) || existing.length === 0) return [];

  const active = rules.filter((r) => r && r.isActive);
  if (active.length === 0) return [];

  const sorted = [...active].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const seen = new Map<string, CaseDuplicateMatch>();

  for (const rule of sorted) {
    const floor = rule.matchStrategy === 'fuzzy' ? FUZZY_FLOOR : 100;
    for (const candidate of existing) {
      if (!candidate || !candidate.id) continue;
      if (input.id && input.id === candidate.id) continue;

      const score = scoreField(rule.field, rule.matchStrategy, input, candidate);
      if (score < floor) continue;

      const match: CaseDuplicateMatch = {
        candidate: { id: candidate.id, title: candidate.title },
        ruleField: rule.field,
        matchStrategy: rule.matchStrategy,
        score,
        collisionAction: rule.collisionAction,
      };
      const existingMatch = seen.get(candidate.id);
      if (!existingMatch || existingMatch.score < score) {
        seen.set(candidate.id, match);
      }
    }
  }

  const matches = Array.from(seen.values());
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.ruleField.localeCompare(b.ruleField);
  });
  return matches;
}

// ─── Service ────────────────────────────────────────────────────────────────

async function fireAndForget<T>(promise: Promise<T> | T, label: string): Promise<void> {
  try {
    await Promise.resolve(promise);
  } catch (error) {
    console.warn(`[case-duplicate-detection] ${label} failed (fire-and-forget):`, error);
  }
}

export function createCaseDuplicateDetectionService(
  _deps: CaseDuplicateDetectionDeps = {},
): CaseDuplicateDetectionService {
  async function loadActiveRules(ctx: HasTenantContext): Promise<CaseEvaluableRule[]> {
    const prismaWithTenant = ctx.prismaWithTenant as unknown as {
      caseDuplicateRule: {
        findMany: (args: {
          where: { tenantId: string; isActive: boolean };
          orderBy: { sortOrder: 'asc' };
        }) => Promise<
          Array<{
            field: string;
            matchStrategy: string;
            collisionAction: string;
            isActive: boolean;
            sortOrder: number;
          }>
        >;
      };
    };
    const rows = await prismaWithTenant.caseDuplicateRule.findMany({
      where: { tenantId: ctx.tenant.tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return rulesFromRows(rows);
  }

  async function fetchCandidates(
    ctx: HasTenantContext,
    payload: CaseCheckInput,
    excludeId?: string,
  ): Promise<Array<Pick<Case, 'id' | 'title' | 'clientId' | 'deadline'>>> {
    const prismaWithTenant = ctx.prismaWithTenant as unknown as {
      case: {
        findMany: (args: {
          where: Record<string, unknown>;
          take: number;
          select: Record<string, boolean>;
        }) => Promise<Array<Pick<Case, 'id' | 'title' | 'clientId' | 'deadline'>>>;
      };
    };
    const orClauses: Record<string, unknown>[] = [];
    if (payload.title) {
      orClauses.push({ title: { equals: payload.title, mode: 'insensitive' } });
    }
    if (payload.clientId) {
      orClauses.push({ clientId: payload.clientId });
    }
    if (payload.deadline instanceof Date && !Number.isNaN(payload.deadline.getTime())) {
      const start = new Date(
        Date.UTC(
          payload.deadline.getUTCFullYear(),
          payload.deadline.getUTCMonth(),
          payload.deadline.getUTCDate(),
          0,
          0,
          0,
        ),
      );
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      orClauses.push({ deadline: { gte: start, lt: end } });
    }
    if (orClauses.length === 0) return [];

    const where: Record<string, unknown> = {
      tenantId: ctx.tenant.tenantId,
      OR: orClauses,
    };
    if (excludeId) where.NOT = { id: excludeId };

    return prismaWithTenant.case.findMany({
      where,
      take: MAX_CANDIDATES,
      select: { id: true, title: true, clientId: true, deadline: true },
    });
  }

  function decide(
    matches: CaseDuplicateMatch[],
    flags: CaseAutomationFlags,
  ): CaseDuplicateCheckResult {
    if (matches.length === 0) return { action: 'proceed', matches: [] };

    const blocking = matches.find((m) => m.collisionAction === 'block');
    if (blocking) {
      return { action: 'block', matches };
    }

    if (flags.notifyOnDuplicate) {
      return { action: 'flag', matches };
    }

    return { action: 'proceed', matches: [] };
  }

  async function emitFlagNotification(
    ctx: HasTenantContext,
    matches: CaseDuplicateMatch[],
  ): Promise<void> {
    if (!ctx.prisma && !ctx.prismaWithTenant) return;
    const prisma = ctx.prisma ?? ctx.prismaWithTenant;
    await fireAndForget(
      createNotification(
        prisma as unknown as PrismaClient,
        {
          tenantId: ctx.tenant.tenantId,
          userId: ctx.tenant.userId,
          type: 'case_duplicate_suspected',
          title: 'Possible duplicate case detected',
          body: `Review ${matches.length} suspected duplicate case${matches.length === 1 ? '' : 's'} before proceeding.`,
          priority: 'normal',
          entityType: 'case',
          entityId: matches[0]?.candidate.id ?? null,
          metadata: {
            candidateIds: matches.map((m) => m.candidate.id),
            ruleFields: matches.map((m) => m.ruleField),
          },
        } as never,
        ctx.services?.notificationOrchestrator,
      ),
      'flag notification',
    );
  }

  async function check(
    ctx: HasTenantContext,
    payload: CaseCheckInput,
    flags: CaseAutomationFlags,
    excludeId?: string,
  ): Promise<CaseDuplicateCheckResult> {
    const rules = await loadActiveRules(ctx);
    if (rules.length === 0) return { action: 'proceed', matches: [] };

    const existing = await fetchCandidates(ctx, payload, excludeId);
    if (existing.length === 0) return { action: 'proceed', matches: [] };

    const matches = evaluateCaseDuplicateRules(
      payload,
      existing as Array<Pick<Case, 'id' | 'title' | 'clientId' | 'deadline'>>,
      rules,
    );

    const decision = decide(matches, flags);
    if (decision.action === 'flag') {
      await emitFlagNotification(ctx, decision.matches);
    }
    return decision;
  }

  return {
    async checkForCreate(ctx, payload, flags) {
      return check(ctx, payload, flags, undefined);
    },
    async checkForUpdate(ctx, caseId, payload, flags) {
      return check(ctx, { ...payload, id: caseId }, flags, caseId);
    },
  };
}

export const caseDuplicateDetectionService = createCaseDuplicateDetectionService();
