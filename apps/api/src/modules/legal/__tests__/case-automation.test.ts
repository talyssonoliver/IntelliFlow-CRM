/**
 * PG-190 — Unit tests for case-automation helper functions.
 */

import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  assertCanCreateTag,
  assertCanDeleteCase,
  loadCaseAutomation,
  type CaseAutomationFlags,
} from '../case-automation';

const FLAGS_ON: CaseAutomationFlags = {
  autoEscalateOverdue: false,
  notifyOnAssignmentChange: false,
  notifyOnDeadlineApproaching: false,
  notifyOnStatusChange: false,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: true,
  preventDeleteWithOpenTasks: true,
  aiCaseSummarization: false,
  aiPriorityPrediction: false,
  aiResolutionSuggestion: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
};

describe('assertCanDeleteCase', () => {
  it('no-ops when preventDeleteWithOpenTasks is false', () => {
    expect(() =>
      assertCanDeleteCase({ openTaskCount: 5 }, { preventDeleteWithOpenTasks: false })
    ).not.toThrow();
  });

  it('no-ops when openTaskCount is zero', () => {
    expect(() =>
      assertCanDeleteCase({ openTaskCount: 0 }, { preventDeleteWithOpenTasks: true })
    ).not.toThrow();
  });

  it('throws PRECONDITION_FAILED when flag is on and openTaskCount >= 1', () => {
    let err: unknown;
    try {
      assertCanDeleteCase({ openTaskCount: 3 }, { preventDeleteWithOpenTasks: true });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe('PRECONDITION_FAILED');
    expect((err as TRPCError).message).toMatch(/3 open tasks/i);
  });

  it('uses singular "task" when count is exactly 1', () => {
    let err: TRPCError | undefined;
    try {
      assertCanDeleteCase({ openTaskCount: 1 }, { preventDeleteWithOpenTasks: true });
    } catch (e) {
      err = e as TRPCError;
    }
    expect(err?.message).toMatch(/1 open task[^s]/i);
  });
});

describe('assertCanCreateTag', () => {
  it('no-ops when restrictTagCreationToAdmins is false', () => {
    expect(() =>
      assertCanCreateTag({ user: { role: 'USER' } }, { restrictTagCreationToAdmins: false })
    ).not.toThrow();
  });

  it('allows ADMIN role when flag is on', () => {
    expect(() =>
      assertCanCreateTag({ user: { role: 'ADMIN' } }, { restrictTagCreationToAdmins: true })
    ).not.toThrow();
  });

  it('allows OWNER role when flag is on', () => {
    expect(() =>
      assertCanCreateTag({ user: { role: 'OWNER' } }, { restrictTagCreationToAdmins: true })
    ).not.toThrow();
  });

  it('throws FORBIDDEN for non-admin role when flag is on', () => {
    let err: TRPCError | undefined;
    try {
      assertCanCreateTag({ user: { role: 'USER' } }, { restrictTagCreationToAdmins: true });
    } catch (e) {
      err = e as TRPCError;
    }
    expect(err?.code).toBe('FORBIDDEN');
  });

  it('throws FORBIDDEN when role is null/undefined', () => {
    let err: TRPCError | undefined;
    try {
      assertCanCreateTag({ user: null }, { restrictTagCreationToAdmins: true });
    } catch (e) {
      err = e as TRPCError;
    }
    expect(err?.code).toBe('FORBIDDEN');
  });
});

describe('loadCaseAutomation', () => {
  it('returns factory defaults when no row exists', async () => {
    const ctx = {
      tenant: { tenantId: 't1' },
      prismaWithTenant: {
        caseAutomationSetting: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      },
    } as never;
    const flags = await loadCaseAutomation(ctx);
    expect(flags.preventDeleteWithOpenTasks).toBe(true); // factory default
    expect(flags.autoEscalateOverdue).toBe(false);
  });

  it('hydrates CaseAutomationFlags from the stored row', async () => {
    const row = { ...FLAGS_ON };
    const ctx = {
      tenant: { tenantId: 't1' },
      prismaWithTenant: {
        caseAutomationSetting: {
          findUnique: vi.fn().mockResolvedValue(row),
        },
      },
    } as never;
    const flags = await loadCaseAutomation(ctx);
    expect(flags).toMatchObject({
      restrictTagCreationToAdmins: true,
      preventDeleteWithOpenTasks: true,
      notifyOnDuplicate: true,
    });
  });
});
