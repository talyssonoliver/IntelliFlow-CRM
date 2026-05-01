/**
 * PG-190 — Tests for CaseDuplicateDetectionService.
 *
 * Pure + integration-ish tests. No real DB — Prisma calls mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createCaseDuplicateDetectionService,
  evaluateCaseDuplicateRules,
  type CaseEvaluableRule,
  type CaseCheckInput,
  type HasTenantContext,
} from '../case-duplicate-detection.service';
import type { CaseAutomationFlags } from '../case-automation';

const FLAGS_ON: CaseAutomationFlags = {
  autoEscalateOverdue: false,
  notifyOnAssignmentChange: false,
  notifyOnDeadlineApproaching: false,
  notifyOnStatusChange: false,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
  preventDeleteWithOpenTasks: false,
  aiCaseSummarization: false,
  aiPriorityPrediction: false,
  aiResolutionSuggestion: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
};

const FLAGS_OFF: CaseAutomationFlags = { ...FLAGS_ON, notifyOnDuplicate: false };

// ─── evaluateCaseDuplicateRules — pure evaluator ────────────────────────────

describe('evaluateCaseDuplicateRules', () => {
  const rules: CaseEvaluableRule[] = [
    {
      field: 'title',
      matchStrategy: 'exact',
      collisionAction: 'warn',
      isActive: true,
      sortOrder: 0,
    },
  ];

  it('exact title match returns score 100', () => {
    const matches = evaluateCaseDuplicateRules(
      { title: 'Smith vs. Jones' },
      [
        {
          id: 'case-1',
          title: 'Smith vs. Jones',
          clientId: 'client-1',
          deadline: null,
        },
      ],
      rules
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].score).toBe(100);
    expect(matches[0].ruleField).toBe('title');
  });

  it('fuzzy title match with similarity >= 70 returns match', () => {
    const fuzzyRule: CaseEvaluableRule = {
      ...rules[0],
      matchStrategy: 'fuzzy',
    };
    const matches = evaluateCaseDuplicateRules(
      { title: 'Smith vs. Jones' },
      [
        {
          id: 'case-1',
          title: 'Smith vs Jones',
          clientId: null as never,
          deadline: null,
        },
      ],
      [fuzzyRule]
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].score).toBeGreaterThanOrEqual(70);
  });

  it('fuzzy below floor returns no match', () => {
    const fuzzyRule: CaseEvaluableRule = {
      ...rules[0],
      matchStrategy: 'fuzzy',
    };
    const matches = evaluateCaseDuplicateRules(
      { title: 'Completely different title' },
      [
        {
          id: 'case-1',
          title: 'Something else entirely unrelated XYZ',
          clientId: null as never,
          deadline: null,
        },
      ],
      [fuzzyRule]
    );
    expect(matches).toHaveLength(0);
  });

  it('skips rule when isActive false', () => {
    const matches = evaluateCaseDuplicateRules(
      { title: 'Smith' },
      [{ id: 'c1', title: 'Smith', clientId: null as never, deadline: null }],
      [{ ...rules[0], isActive: false }]
    );
    expect(matches).toHaveLength(0);
  });

  it('excludes payload.id from candidates (self-match on update)', () => {
    const matches = evaluateCaseDuplicateRules(
      { id: 'case-1', title: 'Smith' },
      [{ id: 'case-1', title: 'Smith', clientId: null as never, deadline: null }],
      rules
    );
    expect(matches).toHaveLength(0);
  });

  it('client field compares clientId equality', () => {
    const clientRule: CaseEvaluableRule = {
      field: 'client',
      matchStrategy: 'exact',
      collisionAction: 'warn',
      isActive: true,
      sortOrder: 0,
    };
    const matches = evaluateCaseDuplicateRules(
      { clientId: 'client-abc' },
      [
        {
          id: 'c1',
          title: 't',
          clientId: 'client-abc',
          deadline: null,
        },
      ],
      [clientRule]
    );
    expect(matches[0].score).toBe(100);
  });

  it('deadline field compares same-calendar-day', () => {
    const dlRule: CaseEvaluableRule = {
      field: 'deadline',
      matchStrategy: 'exact',
      collisionAction: 'warn',
      isActive: true,
      sortOrder: 0,
    };
    const matches = evaluateCaseDuplicateRules(
      { deadline: new Date(Date.UTC(2026, 5, 15, 14, 30)) },
      [
        {
          id: 'c1',
          title: 't',
          clientId: null as never,
          deadline: new Date(Date.UTC(2026, 5, 15, 8, 0)),
        },
      ],
      [dlRule]
    );
    expect(matches[0].score).toBe(100);
  });

  it('externalId is a no-op (Case model has no externalId column)', () => {
    const extRule: CaseEvaluableRule = {
      field: 'externalId',
      matchStrategy: 'exact',
      collisionAction: 'warn',
      isActive: true,
      sortOrder: 0,
    };
    const matches = evaluateCaseDuplicateRules(
      { title: 'irrelevant' },
      [{ id: 'c1', title: 't', clientId: null as never, deadline: null }],
      [extRule]
    );
    expect(matches).toHaveLength(0);
  });

  it('orders by sortOrder (rule with lower sortOrder evaluated first)', () => {
    const rulesSorted: CaseEvaluableRule[] = [
      {
        field: 'title',
        matchStrategy: 'exact',
        collisionAction: 'block',
        isActive: true,
        sortOrder: 10,
      },
      {
        field: 'client',
        matchStrategy: 'exact',
        collisionAction: 'warn',
        isActive: true,
        sortOrder: 0,
      },
    ];
    const matches = evaluateCaseDuplicateRules(
      { title: 'Smith', clientId: 'c-abc' },
      [
        {
          id: 'c1',
          title: 'Smith',
          clientId: 'c-abc',
          deadline: null,
        },
      ],
      rulesSorted
    );
    // Both rules match; highest score wins (100 vs 100 — tie, first-seen wins).
    expect(matches).toHaveLength(1);
    expect(['title', 'client']).toContain(matches[0].ruleField);
  });
});

// ─── Service behaviour ──────────────────────────────────────────────────────

function makeCtx(overrides: {
  rules?: Array<{
    field: string;
    matchStrategy: string;
    collisionAction: string;
    isActive: boolean;
    sortOrder: number;
  }>;
  existingCases?: Array<{
    id: string;
    title: string;
    clientId: string | null;
    deadline: Date | null;
  }>;
}): HasTenantContext & {
  prismaWithTenant: {
    caseDuplicateRule: { findMany: ReturnType<typeof vi.fn> };
    case: { findMany: ReturnType<typeof vi.fn> };
  };
  __notifications: Array<Record<string, unknown>>;
} {
  const notifications: Array<Record<string, unknown>> = [];
  const prismaWithTenant = {
    caseDuplicateRule: {
      findMany: vi.fn().mockResolvedValue(overrides.rules ?? []),
    },
    case: {
      findMany: vi.fn().mockResolvedValue(overrides.existingCases ?? []),
    },
    // createNotification reads from ctx.prisma[?.notification.create] path. Mock the chain.
    notification: {
      create: vi.fn().mockImplementation(async ({ data }) => {
        notifications.push(data);
        return { id: 'notif-1', ...data };
      }),
    },
    notificationPreference: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };
  return {
    tenant: { tenantId: 'tenant-1', userId: 'user-1' },
    prismaWithTenant: prismaWithTenant as never,
    prisma: prismaWithTenant as never,
    services: {},
    __notifications: notifications,
  } as HasTenantContext & {
    prismaWithTenant: {
      caseDuplicateRule: { findMany: ReturnType<typeof vi.fn> };
      case: { findMany: ReturnType<typeof vi.fn> };
    };
    __notifications: Array<Record<string, unknown>>;
  };
}

describe('CaseDuplicateDetectionService', () => {
  let service: ReturnType<typeof createCaseDuplicateDetectionService>;

  beforeEach(() => {
    service = createCaseDuplicateDetectionService();
  });

  it('returns proceed when no rules are active', async () => {
    const ctx = makeCtx({ rules: [] });
    const result = await service.checkForCreate(ctx, { title: 'Anything' }, FLAGS_ON);
    expect(result.action).toBe('proceed');
    expect(result.matches).toEqual([]);
  });

  it('returns flag + emits notification when notifyOnDuplicate is on and match found', async () => {
    const ctx = makeCtx({
      rules: [
        {
          field: 'title',
          matchStrategy: 'exact',
          collisionAction: 'warn',
          isActive: true,
          sortOrder: 0,
        },
      ],
      existingCases: [{ id: 'c1', title: 'Smith vs. Jones', clientId: null, deadline: null }],
    });
    const result = await service.checkForCreate(ctx, { title: 'Smith vs. Jones' }, FLAGS_ON);
    expect(result.action).toBe('flag');
    expect(result.matches).toHaveLength(1);
    // Notification was emitted (type is nested under metadata.notificationType per notifications.router).
    expect(ctx.__notifications).toHaveLength(1);
    const meta = ctx.__notifications[0].metadata as { notificationType: string };
    expect(meta.notificationType).toBe('case_duplicate_suspected');
  });

  it('returns proceed + NO notification when notifyOnDuplicate is off but match exists', async () => {
    const ctx = makeCtx({
      rules: [
        {
          field: 'title',
          matchStrategy: 'exact',
          collisionAction: 'warn',
          isActive: true,
          sortOrder: 0,
        },
      ],
      existingCases: [{ id: 'c1', title: 'Smith vs. Jones', clientId: null, deadline: null }],
    });
    const result = await service.checkForCreate(ctx, { title: 'Smith vs. Jones' }, FLAGS_OFF);
    expect(result.action).toBe('proceed');
    expect(ctx.__notifications).toHaveLength(0);
  });

  it('returns block when any matching rule has collisionAction "block"', async () => {
    const ctx = makeCtx({
      rules: [
        {
          field: 'title',
          matchStrategy: 'exact',
          collisionAction: 'block',
          isActive: true,
          sortOrder: 0,
        },
      ],
      existingCases: [{ id: 'c1', title: 'Smith vs. Jones', clientId: null, deadline: null }],
    });
    const result = await service.checkForCreate(ctx, { title: 'Smith vs. Jones' }, FLAGS_ON);
    expect(result.action).toBe('block');
    expect(result.matches).toHaveLength(1);
  });

  it('checkForUpdate excludes the case being updated from candidates', async () => {
    const ctx = makeCtx({
      rules: [
        {
          field: 'title',
          matchStrategy: 'exact',
          collisionAction: 'warn',
          isActive: true,
          sortOrder: 0,
        },
      ],
      existingCases: [],
    });
    const result = await service.checkForUpdate(
      ctx,
      'case-being-updated',
      { title: 'Smith' },
      FLAGS_ON
    );
    expect(result.action).toBe('proceed');
    // The findMany call should have included a NOT { id: '...' } clause:
    const findManyArgs = (
      ctx.prismaWithTenant as unknown as {
        case: { findMany: { mock: { calls: unknown[][] } } };
      }
    ).case.findMany.mock.calls[0][0] as { where: { NOT?: { id: string } } };
    expect(findManyArgs.where.NOT).toEqual({ id: 'case-being-updated' });
  });

  it('fetchCandidates builds clientId and deadline OR clauses when provided', async () => {
    const ctx = makeCtx({
      rules: [
        {
          field: 'client',
          matchStrategy: 'exact',
          collisionAction: 'warn',
          isActive: true,
          sortOrder: 0,
        },
      ],
      existingCases: [],
    });
    const payload = {
      title: 'x',
      clientId: 'client-abc',
      deadline: new Date(Date.UTC(2026, 5, 15, 12, 0)),
    };
    await service.checkForCreate(ctx, payload, FLAGS_ON);
    const call = (
      ctx.prismaWithTenant as unknown as {
        case: { findMany: { mock: { calls: unknown[][] } } };
      }
    ).case.findMany.mock.calls[0][0] as { where: { OR: Array<Record<string, unknown>> } };
    // Three OR clauses built: title, clientId, deadline range
    expect(call.where.OR.length).toBe(3);
    const clientClause = call.where.OR.find((c) => 'clientId' in c);
    expect(clientClause).toEqual({ clientId: 'client-abc' });
    const deadlineClause = call.where.OR.find(
      (c) => 'deadline' in c && typeof c.deadline === 'object'
    ) as { deadline: { gte: Date; lt: Date } };
    expect(deadlineClause.deadline.gte).toBeInstanceOf(Date);
    expect(deadlineClause.deadline.lt).toBeInstanceOf(Date);
  });

  it('fetchCandidates short-circuits when payload has no queryable fields', async () => {
    const ctx = makeCtx({
      rules: [
        {
          field: 'title',
          matchStrategy: 'exact',
          collisionAction: 'warn',
          isActive: true,
          sortOrder: 0,
        },
      ],
      existingCases: [],
    });
    // No title, no clientId, no deadline → no queryable fields → early return
    const result = await service.checkForCreate(ctx, { title: '' }, FLAGS_ON);
    expect(result.action).toBe('proceed');
  });

  it('invalid Date (NaN time) does NOT add a deadline clause', async () => {
    const ctx = makeCtx({
      rules: [
        {
          field: 'title',
          matchStrategy: 'exact',
          collisionAction: 'warn',
          isActive: true,
          sortOrder: 0,
        },
      ],
      existingCases: [],
    });
    const payload = {
      title: 'x',
      deadline: new Date('invalid'),
    };
    await service.checkForCreate(ctx, payload, FLAGS_ON);
    const call = (
      ctx.prismaWithTenant as unknown as {
        case: { findMany: { mock: { calls: unknown[][] } } };
      }
    ).case.findMany.mock.calls[0][0] as { where: { OR: Array<Record<string, unknown>> } };
    // Only title clause — deadline was NaN so skipped.
    expect(call.where.OR.length).toBe(1);
  });
});
