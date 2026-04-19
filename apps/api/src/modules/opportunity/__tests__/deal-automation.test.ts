/**
 * deal-automation unit tests - PG-184
 *
 * Validates each category-1 toggle helper in isolation. No Prisma migration
 * required — the `loadDealAutomation` tests pass a minimal mock ctx.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  AUTOMATION_FACTORY_DEFAULTS,
  loadDealAutomation,
  capitalizeDealName,
  normalizeDealValue,
  assertCanDeleteDeal,
  assertCanCreateDealOrMerge,
  assertCanCreateTag,
  notifyDealReassignment,
  notifyDealStageChange,
  notifyHighValueStageMove,
  notifyDealDuplicate,
  type DealNotifier,
} from '../deal-automation';

const TENANT = { tenantId: 'tenant-1' };

function makeNotifier(): DealNotifier & { calls: ReturnType<typeof vi.fn> } {
  const calls = vi.fn().mockResolvedValue(undefined);
  return {
    calls,
    async send(input) {
      await calls(input);
    },
  };
}

function buildCtx(
  overrides: Partial<{
    findUnique: ReturnType<typeof vi.fn>;
    taskCount: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  }> = {}
) {
  return {
    tenant: TENANT,
    user: { role: 'MEMBER' },
    prismaWithTenant: {
      dealAutomationSetting: {
        findUnique: overrides.findUnique ?? vi.fn().mockResolvedValue(null),
      },
      task: {
        count: overrides.taskCount ?? vi.fn().mockResolvedValue(0),
      },
      opportunity: {
        findFirst: overrides.findFirst ?? vi.fn().mockResolvedValue(null),
      },
    },
  };
}

describe('loadDealAutomation', () => {
  it('returns factory defaults when no row exists', async () => {
    const ctx = buildCtx();
    const flags = await loadDealAutomation(ctx);
    expect(flags).toEqual(AUTOMATION_FACTORY_DEFAULTS);
  });

  it('returns row values when present', async () => {
    const row = {
      ...AUTOMATION_FACTORY_DEFAULTS,
      notifyOnOwnerChange: true,
      aiDealScoring: true,
      highValueThreshold: 100000,
    };
    const ctx = buildCtx({
      findUnique: vi.fn().mockResolvedValue(row),
    });
    const flags = await loadDealAutomation(ctx);
    expect(flags.notifyOnOwnerChange).toBe(true);
    expect(flags.aiDealScoring).toBe(true);
    expect(flags.highValueThreshold).toBe(100000);
  });

  it('converts Decimal-like highValueThreshold to number', async () => {
    const decimalLike = { toString: () => '75000.50' } as unknown as number;
    const ctx = buildCtx({
      findUnique: vi.fn().mockResolvedValue({
        ...AUTOMATION_FACTORY_DEFAULTS,
        highValueThreshold: decimalLike,
      }),
    });
    const flags = await loadDealAutomation(ctx);
    expect(flags.highValueThreshold).toBe(75000.5);
  });
});

describe('capitalizeDealName', () => {
  it('title-cases words when the toggle is on', () => {
    expect(capitalizeDealName('acme renewal Q1', { autoCapitalizeDealNames: true })).toBe(
      'Acme Renewal Q1'
    );
  });

  it('leaves the value unchanged when the toggle is off', () => {
    expect(capitalizeDealName('acme renewal', { autoCapitalizeDealNames: false })).toBe(
      'acme renewal'
    );
  });

  it('preserves apostrophes and hyphens between title-cased tokens', () => {
    // Matches the contact-automation mirror: each alpha segment between a
    // splitter (space, apostrophe, hyphen) is independently title-cased.
    expect(capitalizeDealName("acme's renewal", { autoCapitalizeDealNames: true })).toBe(
      "Acme'S Renewal"
    );
    expect(capitalizeDealName('jean-luc deal', { autoCapitalizeDealNames: true })).toBe(
      'Jean-Luc Deal'
    );
  });

  it('handles null/undefined input', () => {
    expect(capitalizeDealName(null, { autoCapitalizeDealNames: true })).toBeNull();
    expect(capitalizeDealName(undefined, { autoCapitalizeDealNames: true })).toBeUndefined();
  });
});

describe('normalizeDealValue', () => {
  it('rounds to 2 decimals when the toggle is on', () => {
    expect(normalizeDealValue(1234.5678, { normalizeCurrency: true })).toBe(1234.57);
  });

  it('leaves the value unchanged when the toggle is off', () => {
    expect(normalizeDealValue(1234.5678, { normalizeCurrency: false })).toBe(1234.5678);
  });

  it('normalizes a string input and returns a string with 2 decimals', () => {
    expect(normalizeDealValue('1234.5', { normalizeCurrency: true })).toBe('1234.50');
  });

  it('passes through non-numeric strings', () => {
    expect(normalizeDealValue('abc', { normalizeCurrency: true })).toBe('abc');
  });

  it('handles null', () => {
    expect(normalizeDealValue(null, { normalizeCurrency: true })).toBeNull();
  });
});

describe('assertCanDeleteDeal', () => {
  it('allows delete when the toggle is off', () => {
    expect(() =>
      assertCanDeleteDeal({ openTasks: 3 }, { preventDeleteWithOpenTasks: false })
    ).not.toThrow();
  });

  it('allows delete when the toggle is on but no open tasks', () => {
    expect(() =>
      assertCanDeleteDeal({ openTasks: 0 }, { preventDeleteWithOpenTasks: true })
    ).not.toThrow();
  });

  it('throws PRECONDITION_FAILED when the toggle is on AND there are open tasks', () => {
    try {
      assertCanDeleteDeal({ openTasks: 2 }, { preventDeleteWithOpenTasks: true });
      throw new Error('expected throw');
    } catch (err) {
      expect((err as { code?: string }).code).toBe('PRECONDITION_FAILED');
    }
  });
});

describe('assertCanCreateDealOrMerge', () => {
  it('returns CREATE when the toggle is off', async () => {
    const ctx = buildCtx();
    const decision = await assertCanCreateDealOrMerge(
      ctx,
      { name: 'Deal A', accountId: 'acct-1' },
      { autoMergeOnExactNameAccount: false }
    );
    expect(decision).toEqual({ action: 'CREATE', duplicateId: null });
  });

  it('returns CREATE when the toggle is on but no duplicate exists', async () => {
    const ctx = buildCtx({ findFirst: vi.fn().mockResolvedValue(null) });
    const decision = await assertCanCreateDealOrMerge(
      ctx,
      { name: 'Deal A', accountId: 'acct-1' },
      { autoMergeOnExactNameAccount: true }
    );
    expect(decision).toEqual({ action: 'CREATE', duplicateId: null });
  });

  it('returns MERGE when the toggle is on AND an exact duplicate exists', async () => {
    const ctx = buildCtx({
      findFirst: vi.fn().mockResolvedValue({
        id: 'opp-existing',
        name: 'Deal A',
        accountId: 'acct-1',
      }),
    });
    const decision = await assertCanCreateDealOrMerge(
      ctx,
      { name: 'Deal A', accountId: 'acct-1' },
      { autoMergeOnExactNameAccount: true }
    );
    expect(decision).toEqual({ action: 'MERGE', duplicateId: 'opp-existing' });
  });
});

describe('assertCanCreateTag', () => {
  it('allows when the toggle is off regardless of role', () => {
    expect(() =>
      assertCanCreateTag('MEMBER', { restrictTagCreationToAdmins: false })
    ).not.toThrow();
  });

  it('allows admins when the toggle is on', () => {
    expect(() => assertCanCreateTag('ADMIN', { restrictTagCreationToAdmins: true })).not.toThrow();
    expect(() => assertCanCreateTag('OWNER', { restrictTagCreationToAdmins: true })).not.toThrow();
  });

  it('throws FORBIDDEN for non-admins when the toggle is on', () => {
    try {
      assertCanCreateTag('MEMBER', { restrictTagCreationToAdmins: true });
      throw new Error('expected throw');
    } catch (err) {
      expect((err as { code?: string }).code).toBe('FORBIDDEN');
    }
  });

  it('throws FORBIDDEN when the caller has no role', () => {
    try {
      assertCanCreateTag(null, { restrictTagCreationToAdmins: true });
      throw new Error('expected throw');
    } catch (err) {
      expect((err as { code?: string }).code).toBe('FORBIDDEN');
    }
  });
});

describe('notification helpers', () => {
  const reassignment = {
    opportunityId: 'opp-1',
    previousOwnerId: 'u-old',
    newOwnerId: 'u-new',
    actorId: 'u-actor',
  };

  it('notifyDealReassignment does nothing when toggle is off', async () => {
    const n = makeNotifier();
    await notifyDealReassignment(n, reassignment, { notifyOnOwnerChange: false });
    expect(n.calls).not.toHaveBeenCalled();
  });

  it('notifyDealReassignment does nothing when owner did not actually change', async () => {
    const n = makeNotifier();
    await notifyDealReassignment(
      n,
      { ...reassignment, previousOwnerId: 'u-same', newOwnerId: 'u-same' },
      { notifyOnOwnerChange: true }
    );
    expect(n.calls).not.toHaveBeenCalled();
  });

  it('notifyDealReassignment emits deal_reassigned to both owners', async () => {
    const n = makeNotifier();
    await notifyDealReassignment(n, reassignment, { notifyOnOwnerChange: true });
    expect(n.calls).toHaveBeenCalledTimes(1);
    const payload = n.calls.mock.calls[0][0];
    expect(payload.type).toBe('deal_reassigned');
    expect(payload.toUserIds).toEqual(['u-old', 'u-new']);
  });

  it('notifyDealStageChange emits deal_stage_changed when toggle on and stage changed', async () => {
    const n = makeNotifier();
    await notifyDealStageChange(
      n,
      {
        opportunityId: 'opp-1',
        ownerId: 'u-owner',
        fromStage: 'PROSPECTING',
        toStage: 'QUALIFICATION',
        actorId: 'u-actor',
      },
      { notifyOnStageChange: true }
    );
    expect(n.calls).toHaveBeenCalledTimes(1);
    expect(n.calls.mock.calls[0][0].type).toBe('deal_stage_changed');
  });

  it('notifyHighValueStageMove emits when stage changed AND value >= threshold', async () => {
    const n = makeNotifier();
    await notifyHighValueStageMove(
      n,
      {
        opportunityId: 'opp-1',
        ownerId: 'u-owner',
        fromStage: 'PROPOSAL',
        toStage: 'NEGOTIATION',
        actorId: 'u-actor',
        value: 75000,
        threshold: 50000,
        toUserIds: ['lead-1', 'lead-2'],
      },
      { notifyOnHighValueStageMove: true, highValueThreshold: 50000 }
    );
    expect(n.calls).toHaveBeenCalledTimes(1);
    expect(n.calls.mock.calls[0][0].type).toBe('deal_high_value_moved');
    expect(n.calls.mock.calls[0][0].toUserIds).toEqual(['lead-1', 'lead-2']);
  });

  it('notifyHighValueStageMove skips when value below threshold', async () => {
    const n = makeNotifier();
    await notifyHighValueStageMove(
      n,
      {
        opportunityId: 'opp-1',
        ownerId: 'u-owner',
        fromStage: 'PROPOSAL',
        toStage: 'NEGOTIATION',
        actorId: 'u-actor',
        value: 20000,
        threshold: 50000,
        toUserIds: ['lead-1'],
      },
      { notifyOnHighValueStageMove: true, highValueThreshold: 50000 }
    );
    expect(n.calls).not.toHaveBeenCalled();
  });

  it('notifyDealDuplicate emits to the owner when toggle is on', async () => {
    const n = makeNotifier();
    await notifyDealDuplicate(
      n,
      {
        opportunityId: 'opp-new',
        duplicateOpportunityId: 'opp-existing',
        ownerId: 'u-owner',
        actorId: 'u-actor',
      },
      { notifyOnDuplicate: true }
    );
    expect(n.calls).toHaveBeenCalledTimes(1);
    expect(n.calls.mock.calls[0][0].type).toBe('deal_duplicate_suspected');
    expect(n.calls.mock.calls[0][0].toUserIds).toEqual(['u-owner']);
  });

  it('notifyDealDuplicate does nothing when toggle is off', async () => {
    const n = makeNotifier();
    await notifyDealDuplicate(
      n,
      {
        opportunityId: 'opp-new',
        duplicateOpportunityId: 'opp-existing',
        ownerId: 'u-owner',
        actorId: 'u-actor',
      },
      { notifyOnDuplicate: false }
    );
    expect(n.calls).not.toHaveBeenCalled();
  });
});
