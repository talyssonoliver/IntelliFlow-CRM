/**
 * Approval Workflow Supplementary Tests
 *
 * Tests for uncovered code paths in apps/api/src/agent/approval-workflow.ts
 *
 * IFC-139: Human approval flow for agent actions
 *
 * The existing approval-workflow.test.ts covers basic flows but misses:
 * - ExecutedActionsStore: add, get, findByRollbackToken, disableRollback
 * - RollbackStore: add, get
 * - ApprovalWorkflowService.rollbackAction with valid token + full flow
 * - ApprovalWorkflowService.rollbackAction when rollback window expires
 * - ApprovalWorkflowService.rollbackAction when tool has no rollback support
 * - ApprovalWorkflowService.rollbackAction when rollback function throws
 * - ApprovalWorkflowService.getPendingActionsForSession
 * - ApprovalWorkflowService.approveAction when action not found
 * - ApprovalWorkflowService.rejectAction when action is not PENDING
 * - ApprovalWorkflowService.getActionStatistics without userId
 * - PendingActionsStore.delete, findPending, expireOld
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const agentActionRows = vi.hoisted(() => [] as any[]);

function sortRows(rows: any[], orderBy?: Record<string, 'asc' | 'desc'>) {
  if (!orderBy) return rows;
  const [[field, direction]] = Object.entries(orderBy);
  return [...rows].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    let cmp: number;
    if (av > bv) cmp = 1;
    else if (av < bv) cmp = -1;
    else cmp = 0;
    return direction === 'desc' ? -cmp : cmp;
  });
}

// Resolve a nested JSON path (e.g. ['rollbackToken']) within a JSON column value.
function resolveJsonPath(value: any, path: string[]): any {
  let nested = value;
  for (const segment of path) {
    nested = nested == null ? undefined : nested[segment];
  }
  return nested;
}

// Match a single Prisma where condition against a row field. Supports the
// operator objects this fake DB needs: gt/lt/not and the JSON-path filter
// { path, equals } (mirrors how the real adapter matches
// proposedState->>"rollbackToken").
function matchesCondition(row: any, key: string, value: any): boolean {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if ('path' in value && 'equals' in value) {
      return resolveJsonPath(row[key], value.path as string[]) === value.equals;
    }
    if ('path' in value && 'lt' in value) {
      const nested = resolveJsonPath(row[key], value.path as string[]);
      return typeof nested === 'number' && nested < value.lt;
    }
    if ('gt' in value) return row[key] > value.gt;
    if ('lt' in value) return row[key] < value.lt;
    if ('not' in value) return row[key] !== value.not;
  }
  return row[key] === value;
}

function matchesWhere(row: any, where: Record<string, any> | undefined): boolean {
  if (!where) return true;

  return Object.entries(where).every(([key, value]) => {
    const clauses = value as Record<string, any>[];
    if (key === 'AND') return clauses.every((clause) => matchesWhere(row, clause));
    if (key === 'OR') return clauses.some((clause) => matchesWhere(row, clause));
    return matchesCondition(row, key, value);
  });
}

vi.mock('@intelliflow/db', () => ({
  prisma: {
    agentAction: {
      create: vi.fn(async ({ data }: { data: any }) => {
        const row = {
          createdAt: new Date(),
          reviewedAt: null,
          reviewedBy: null,
          feedback: null,
          rollbackReason: null,
          rolledBackAt: null,
          rolledBackBy: null,
          ...data,
        };
        agentActionRows.push(row);
        return row;
      }),
      findFirst: vi.fn(async ({ where }: { where?: Record<string, any> }) => {
        return agentActionRows.find((row) => matchesWhere(row, where)) ?? null;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return agentActionRows.find((row) => row.id === where.id) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const row = agentActionRows.find((item) => item.id === where.id);
        if (!row) {
          throw new Error(`AgentAction not found: ${where.id}`);
        }

        Object.assign(row, data);
        return row;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const index = agentActionRows.findIndex((row) => row.id === where.id);
        if (index === -1) {
          throw new Error(`AgentAction not found: ${where.id}`);
        }

        const [deleted] = agentActionRows.splice(index, 1);
        return deleted;
      }),
      deleteMany: vi.fn(async ({ where }: { where?: Record<string, any> }) => {
        const before = agentActionRows.length;
        for (let i = agentActionRows.length - 1; i >= 0; i--) {
          if (matchesWhere(agentActionRows[i], where)) agentActionRows.splice(i, 1);
        }
        return { count: before - agentActionRows.length };
      }),
      findMany: vi.fn(
        async ({
          where,
          orderBy,
        }: {
          where?: Record<string, any>;
          orderBy?: Record<string, 'asc' | 'desc'>;
        }) => {
          const filtered = agentActionRows.filter((row) => matchesWhere(row, where));
          return sortRows(filtered, orderBy);
        }
      ),
      updateMany: vi.fn(async ({ where, data }: { where?: Record<string, any>; data: any }) => {
        let count = 0;

        for (const row of agentActionRows) {
          if (matchesWhere(row, where)) {
            Object.assign(row, data);
            count++;
          }
        }

        return { count };
      }),
    },
  },
}));
import {
  ApprovalWorkflowService,
  actionStore,
  pendingActionsStore,
  executedActionsStore,
  rollbackStore,
} from '../approval-workflow';
import type { PendingAction, ApprovalDecision, ExecutedAction, AgentAuthContext } from '../types';

// Mock the tools module
vi.mock('../tools', () => ({
  getAgentTool: vi.fn(),
}));

// Mock the logger module
// PG-198: the real executor is covered in approved-action-executor.test.ts.
vi.mock('../approved-action-executor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../approved-action-executor')>()),
  // A plain function: this suite resets vi.fn() implementations between tests.
  executeApprovedAction: async () => ({
    status: 'SUCCEEDED',
    result: { entityType: 'CASE', entityId: 'case-1' },
  }),
}));

// #856: the real compensator is covered in approved-action-compensator.test.ts.
const compensateSpy = vi.hoisted(() => vi.fn());
vi.mock('../approved-action-compensator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../approved-action-compensator')>()),
  compensateApprovedAction: compensateSpy,
}));

const passthroughSchema = { safeParse: (value: unknown) => ({ success: true, data: value }) };

vi.mock('../logger', () => ({
  agentLogger: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

import { getAgentTool } from '../tools';

const testContext: AgentAuthContext = {
  userId: 'user-test',
  userRole: 'MANAGER',
  permissions: [],
  agentSessionId: 'session-test',
  allowedEntityTypes: ['CASE', 'APPOINTMENT', 'LEAD'],
  allowedActionTypes: ['SEARCH', 'CREATE', 'UPDATE', 'DELETE'],
  maxActionsPerSession: 100,
  actionCount: 0,
};

const createTestPendingAction = (overrides: Partial<PendingAction> = {}): PendingAction => {
  const now = new Date();
  return {
    id: 'action-supp-1',
    toolName: 'create_case',
    actionType: 'CREATE',
    entityType: 'CASE',
    input: { title: 'Test Case', clientId: 'client-1', priority: 'MEDIUM' },
    preview: {
      summary: 'Create new case: "Test Case"',
      changes: [{ field: 'title', previousValue: null, newValue: 'Test Case', changeType: 'ADD' }],
      affectedEntities: [{ type: 'CASE', id: 'NEW', name: 'Test Case', action: 'CREATE' }],
      estimatedImpact: 'MEDIUM',
    },
    status: 'PENDING',
    createdAt: now,
    expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
    createdBy: 'user-test',
    agentSessionId: 'session-test',
    ...overrides,
  };
};

const storeExecutedAction = async (action: ExecutedAction): Promise<void> => {
  await pendingActionsStore.add(
    createTestPendingAction({
      id: action.id,
      toolName: action.toolName,
      entityType: action.entityType,
      input: action.input,
      preview: action.preview,
      createdBy: action.createdBy,
      agentSessionId: action.agentSessionId,
    })
  );
  await executedActionsStore.add(action);
};

describe('Approval Workflow (supplementary)', () => {
  let service: ApprovalWorkflowService;

  beforeEach(() => {
    agentActionRows.length = 0;
    vi.clearAllMocks();
    service = new ApprovalWorkflowService();
  });

  describe('ExecutedActionsStore', () => {
    it('should add and retrieve an executed action', async () => {
      const action: ExecutedAction = {
        ...createTestPendingAction({ id: 'exec-1' }),
        executedAt: new Date(),
        rollbackAvailable: true,
        rollbackToken: 'token-1',
      };

      await storeExecutedAction(action);
      const retrieved = await executedActionsStore.get('exec-1');

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('exec-1');
      expect(retrieved!.rollbackAvailable).toBe(true);
    });

    it('should return undefined for non-existent executed action', async () => {
      const result = await executedActionsStore.get('non-existent-exec');
      expect(result).toBeUndefined();
    });

    it('should find an executed action by rollback token', async () => {
      const action: ExecutedAction = {
        ...createTestPendingAction({ id: 'exec-token-1' }),
        executedAt: new Date(),
        rollbackAvailable: true,
        rollbackToken: 'find-by-token-123',
      };

      await storeExecutedAction(action);
      const found = await executedActionsStore.findByRollbackToken('find-by-token-123');

      expect(found).toBeDefined();
      expect(found!.id).toBe('exec-token-1');
    });

    it('should not find by token when rollback is disabled', async () => {
      const action: ExecutedAction = {
        ...createTestPendingAction({ id: 'exec-disabled-1' }),
        executedAt: new Date(),
        rollbackAvailable: false,
        rollbackToken: 'disabled-token-123',
      };

      await storeExecutedAction(action);
      const found = await executedActionsStore.findByRollbackToken('disabled-token-123');
      expect(found).toBeUndefined();
    });

    it('should disable rollback for an action', async () => {
      const action: ExecutedAction = {
        ...createTestPendingAction({ id: 'exec-disable-1' }),
        executedAt: new Date(),
        rollbackAvailable: true,
        rollbackToken: 'disable-test-token',
      };

      await storeExecutedAction(action);
      await executedActionsStore.disableRollback('exec-disable-1');

      const updated = await executedActionsStore.get('exec-disable-1');
      expect(updated!.rollbackAvailable).toBe(false);
    });

    it('should do nothing when disabling rollback for non-existent action', async () => {
      // Should not throw
      await executedActionsStore.disableRollback('non-existent-disable');
    });
  });

  describe('RollbackStore', () => {
    it('should add and retrieve a rollback record', async () => {
      const record = {
        actionId: 'rollback-record-1',
        entityType: 'CASE' as const,
        entityId: 'case-1',
        previousState: { status: 'OPEN' },
        rolledBackBy: 'user-1',
        rolledBackAt: new Date(),
      };

      await pendingActionsStore.add(createTestPendingAction({ id: 'rollback-record-1' }));
      await rollbackStore.add(record);
      const retrieved = await rollbackStore.get('rollback-record-1');

      expect(retrieved).toBeDefined();
      expect(retrieved!.actionId).toBe('rollback-record-1');
      expect(retrieved!.previousState).toEqual({ status: 'OPEN' });
    });

    it('should return undefined for non-existent rollback record', async () => {
      const result = await rollbackStore.get('non-existent-rollback');
      expect(result).toBeUndefined();
    });
  });

  describe('PendingActionsStore extended', () => {
    it('should delete a pending action', async () => {
      const action = createTestPendingAction({ id: 'delete-test-1' });
      await pendingActionsStore.add(action);

      const deleted = await pendingActionsStore.delete('delete-test-1');
      expect(deleted).toBe(true);
    });

    it('should return false when deleting non-existent action', async () => {
      const deleted = await pendingActionsStore.delete('non-existent-delete');
      expect(deleted).toBe(false);
    });

    it('should find all pending actions', async () => {
      const action1 = createTestPendingAction({ id: 'pending-find-1', createdBy: 'user-a' });
      const action2 = createTestPendingAction({ id: 'pending-find-2', createdBy: 'user-b' });
      await pendingActionsStore.add(action1);
      await pendingActionsStore.add(action2);

      const pending = await pendingActionsStore.findPending();
      const ids = pending.map((a) => a.id);
      expect(ids).toContain('pending-find-1');
      expect(ids).toContain('pending-find-2');
    });

    it('should expire old pending actions', async () => {
      const expiredAction = createTestPendingAction({
        id: 'expire-test-1',
        expiresAt: new Date(Date.now() - 1000),
      });
      await pendingActionsStore.add(expiredAction);

      const expiredCount = await pendingActionsStore.expireOld();
      expect(expiredCount).toBeGreaterThanOrEqual(1);

      const retrieved = await pendingActionsStore.get('expire-test-1');
      expect(retrieved!.status).toBe('EXPIRED');
    });
  });

  describe('ApprovalWorkflowService.getPendingActionsForSession', () => {
    it('should return pending actions for a session', async () => {
      const action = createTestPendingAction({
        id: 'session-action-supp-1',
        agentSessionId: 'session-xyz',
      });
      await pendingActionsStore.add(action);

      const result = await service.getPendingActionsForSession('session-xyz');
      const ids = result.map((a) => a.id);
      expect(ids).toContain('session-action-supp-1');
    });
  });

  describe('ApprovalWorkflowService.getPendingAction', () => {
    it('should get a specific pending action by ID', async () => {
      const action = createTestPendingAction({ id: 'specific-action-1' });
      await pendingActionsStore.add(action);

      const result = await service.getPendingAction('specific-action-1');
      expect(result).toBeDefined();
      expect(result!.id).toBe('specific-action-1');
    });

    it('should return undefined for non-existent action', async () => {
      const result = await service.getPendingAction('does-not-exist');
      expect(result).toBeUndefined();
    });
  });

  describe('ApprovalWorkflowService.approveAction', () => {
    it('should throw when action not found', async () => {
      const decision: ApprovalDecision = {
        actionId: 'missing-action',
        decision: 'APPROVE',
        decidedBy: 'manager-1',
        decidedAt: new Date(),
      };

      await expect(service.approveAction(decision, testContext)).rejects.toThrow(
        'Pending action not found: missing-action'
      );
    });

    it('should throw when action is not in PENDING status', async () => {
      const action = createTestPendingAction({
        id: 'not-pending-approve',
        status: 'REJECTED',
      });
      await pendingActionsStore.add(action);

      const decision: ApprovalDecision = {
        actionId: 'not-pending-approve',
        decision: 'APPROVE',
        decidedBy: 'manager-1',
        decidedAt: new Date(),
      };

      await expect(service.approveAction(decision, testContext)).rejects.toThrow(
        'Action is not pending: REJECTED'
      );
    });

    it('offers a rollback token when the succeeded action can be undone (#856)', async () => {
      const action = createTestPendingAction({ id: 'rollback-check-action' });
      await pendingActionsStore.add(action);
      (getAgentTool as any).mockReturnValue({
        name: 'create_case',
        inputSchema: passthroughSchema,
      });

      const result = await service.approveAction(
        {
          actionId: 'rollback-check-action',
          decision: 'APPROVE',
          decidedBy: 'manager-1',
          decidedAt: new Date(),
        },
        testContext
      );

      expect(result.rollbackAvailable).toBe(true);
      expect(result.rollbackToken).toBeDefined();
      const found = await executedActionsStore.findByRollbackToken(result.rollbackToken!);
      expect(found?.id).toBe('rollback-check-action');
    });

    it('offers no rollback token for an action that cannot be undone (an update)', async () => {
      const action = createTestPendingAction({ id: 'no-rollback-action', toolName: 'update_case' });
      await pendingActionsStore.add(action);
      (getAgentTool as any).mockReturnValue({
        name: 'update_case',
        inputSchema: passthroughSchema,
      });

      const result = await service.approveAction(
        {
          actionId: 'no-rollback-action',
          decision: 'APPROVE',
          decidedBy: 'manager-1',
          decidedAt: new Date(),
        },
        testContext
      );

      expect(result.rollbackAvailable).toBe(false);
      expect(result.rollbackToken).toBeUndefined();
    });
  });

  describe('ApprovalWorkflowService.rejectAction', () => {
    it('should throw when action is not in PENDING status', async () => {
      const action = createTestPendingAction({
        id: 'not-pending-reject',
        status: 'APPROVED',
      });
      await pendingActionsStore.add(action);

      const decision: ApprovalDecision = {
        actionId: 'not-pending-reject',
        decision: 'REJECT',
        decidedBy: 'manager-1',
        decidedAt: new Date(),
      };

      await expect(service.rejectAction(decision, testContext)).rejects.toThrow(
        'Action is not pending: APPROVED'
      );
    });
  });

  describe('ApprovalWorkflowService.rollbackAction', () => {
    const requestCtx = { user: { userId: 'user-1', tenantId: 'tenant-1' } } as any;
    const caseResult = { entityType: 'CASE', entityId: 'case-created-1' };

    const storeRollbackable = async (
      id: string,
      overrides: Partial<ExecutedAction> = {}
    ): Promise<void> => {
      await storeExecutedAction({
        ...createTestPendingAction({ id, toolName: 'create_case' }),
        executedAt: new Date(),
        executionStatus: 'SUCCEEDED',
        executionResult: caseResult,
        rollbackAvailable: true,
        rollbackToken: `${id}-token`,
        ...overrides,
      });
    };

    const rollback = (id: string, context: AgentAuthContext = testContext, token?: string) =>
      service.rollbackAction(
        {
          actionId: id,
          rollbackToken: token ?? `${id}-token`,
          requestedBy: 'user-1',
          reason: 'Wrong client',
        },
        context,
        requestCtx
      );

    beforeEach(() => {
      compensateSpy.mockResolvedValue({
        success: true,
        restoredState: { cancelledCaseId: 'case-created-1' },
      });
    });

    it('cancels the created case through the compensator and records the rollback', async () => {
      await storeRollbackable('rb-ok');

      const result = await rollback('rb-ok');

      expect(result.success).toBe(true);
      expect(result.restoredState).toEqual({ cancelledCaseId: 'case-created-1' });
      expect(compensateSpy).toHaveBeenCalledWith('create_case', caseResult, requestCtx);
      const row = agentActionRows.find((r) => r.id === 'rb-ok');
      expect(row.status).toBe('ROLLED_BACK');
      expect(row.rolledBackBy).toBe('user-1');
      expect(row.rollbackReason).toBe('Wrong client');
      expect(row.proposedState.rollbackAvailable).toBe(false);
      expect(row.proposedState.rollbackRestoredState).toEqual({
        cancelledCaseId: 'case-created-1',
      });
    });

    it('cannot be used twice', async () => {
      await storeRollbackable('rb-twice');

      expect((await rollback('rb-twice')).success).toBe(true);
      const second = await rollback('rb-twice');

      expect(second.success).toBe(false);
      expect(second.error).toContain('Invalid rollback token');
      expect(compensateSpy).toHaveBeenCalledTimes(1);
    });

    it('runs the compensation once when two rollbacks race', async () => {
      await storeRollbackable('rb-race');

      const results = await Promise.all([rollback('rb-race'), rollback('rb-race')]);

      expect(results.filter((r) => r.success)).toHaveLength(1);
      expect(compensateSpy).toHaveBeenCalledTimes(1);
    });

    it('gives the claim back when the compensation fails, so it can be retried', async () => {
      await storeRollbackable('rb-fail');
      compensateSpy.mockResolvedValueOnce({
        success: false,
        error: 'Cannot transition from CLOSED to CANCELLED',
      });

      const result = await rollback('rb-fail');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot transition from CLOSED to CANCELLED');
      const row = agentActionRows.find((r) => r.id === 'rb-fail');
      expect(row.status).toBe('APPROVED');
      expect(row.proposedState.rollbackAvailable).toBe(true);
      expect(row.proposedState.rollbackClaimedAt).toBeNull();
      expect(row.proposedState.rollbackClaimId).toBeNull();
      expect((await rollback('rb-fail')).success).toBe(true);
    });

    it('does not find a token from another tenant', async () => {
      await storeRollbackable('rb-tenant');

      const result = await rollback('rb-tenant', { ...testContext, tenantId: 'other-tenant' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid rollback token');
      expect(compensateSpy).not.toHaveBeenCalled();
    });

    it('rejects a token that belongs to a different action', async () => {
      await storeRollbackable('rb-a');
      await storeRollbackable('rb-b');

      const result = await rollback('rb-a', testContext, 'rb-b-token');

      expect(result.success).toBe(false);
      expect(compensateSpy).not.toHaveBeenCalled();
    });

    it('should return error when rollback is no longer available', async () => {
      await storeRollbackable('rb-disabled');
      await executedActionsStore.disableRollback('rb-disabled');

      const result = await rollback('rb-disabled');

      expect(result.success).toBe(false);
      expect(compensateSpy).not.toHaveBeenCalled();
    });

    it('should return error when rollback window has expired', async () => {
      await storeRollbackable('rb-expired', {
        executedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      });

      const result = await rollback('rb-expired');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rollback window has expired');
      expect(compensateSpy).not.toHaveBeenCalled();
    });

    it('lets an interrupted claim be retaken once stale, even past the window', async () => {
      await storeRollbackable('rb-stale', {
        executedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      });
      const row = agentActionRows.find((r) => r.id === 'rb-stale');
      // The request that claimed it died between the claim and the compensation.
      row.proposedState = {
        ...row.proposedState,
        rollbackAvailable: false,
        rollbackClaimedAt: Date.now() - 10 * 60 * 1000,
      };

      const result = await rollback('rb-stale');

      expect(result.success).toBe(true);
      expect(compensateSpy).toHaveBeenCalledTimes(1);
      expect(row.status).toBe('ROLLED_BACK');
    });

    it('a superseded claim cannot release or record over the claim that replaced it', async () => {
      await storeRollbackable('rb-fence');
      const tenant = '00000000-0000-4000-8000-000000000001';
      const longAgo = Date.now() - 10 * 60 * 1000;

      // Worker A claims, then stalls past the stale threshold; worker B retakes the claim.
      const claimA = await actionStore.claimRollback('rb-fence', tenant, 'rb-fence-token', longAgo);
      const claimB = await actionStore.claimRollback('rb-fence', tenant, 'rb-fence-token');
      expect(claimA).toBeTruthy();
      expect(claimB).toBeTruthy();
      expect(claimB).not.toBe(claimA);

      // A wakes up and reports: neither its release nor its record touches B's claim.
      await actionStore.releaseRollback('rb-fence', tenant, claimA!);
      await actionStore.markRolledBack('rb-fence', tenant, claimA!, {
        rolledBackBy: 'worker-a',
        rolledBackAt: new Date(),
      });
      const row = agentActionRows.find((r) => r.id === 'rb-fence');
      expect(row.status).toBe('APPROVED');
      expect(row.proposedState.rollbackAvailable).toBe(false);
      expect(row.proposedState.rollbackClaimId).toBe(claimB);
      // So no third worker can claim while B holds it.
      expect(await actionStore.claimRollback('rb-fence', tenant, 'rb-fence-token')).toBeNull();

      await actionStore.markRolledBack('rb-fence', tenant, claimB!, {
        rolledBackBy: 'worker-b',
        rolledBackAt: new Date(),
      });
      expect(row.status).toBe('ROLLED_BACK');
      expect(row.rolledBackBy).toBe('worker-b');
    });

    it('does not let a fresh claim be taken by a second request', async () => {
      await storeRollbackable('rb-fresh');
      const row = agentActionRows.find((r) => r.id === 'rb-fresh');
      row.proposedState = {
        ...row.proposedState,
        rollbackAvailable: false,
        rollbackClaimedAt: Date.now() - 30 * 1000,
      };

      const result = await rollback('rb-fresh');

      expect(result.success).toBe(false);
      expect(compensateSpy).not.toHaveBeenCalled();
    });

    it('refuses an action with no compensation (an update)', async () => {
      await storeRollbackable('rb-update', {
        toolName: 'update_case',
        executionResult: { entityType: 'CASE', entityId: 'case-9' },
      });

      const result = await rollback('rb-update');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool does not support rollback');
      expect(compensateSpy).not.toHaveBeenCalled();
    });
  });

  describe('ApprovalWorkflowService.getDiffPreview', () => {
    it('should handle action with no warnings', () => {
      const action = createTestPendingAction({
        preview: {
          summary: 'Test',
          changes: [],
          affectedEntities: [],
          // no warnings, no estimatedImpact
        },
      });

      const preview = service.getDiffPreview(action);
      expect(preview.warnings).toEqual([]);
      expect(preview.impactLevel).toBe('MEDIUM'); // default
    });
  });

  describe('ApprovalWorkflowService.getActionStatistics', () => {
    it('should return statistics without userId filter', async () => {
      const action = createTestPendingAction({ id: 'stats-no-user-1', createdBy: 'any-user' });
      await pendingActionsStore.add(action);

      const stats = await service.getActionStatistics();
      expect(stats).toBeDefined();
      expect(typeof stats.pending).toBe('number');
    });

    it('should return statistics with userId filter', async () => {
      const action = createTestPendingAction({ id: 'stats-user-1', createdBy: 'stats-user' });
      await pendingActionsStore.add(action);

      const stats = await service.getActionStatistics('stats-user');
      expect(stats).toBeDefined();
      expect(typeof stats.pending).toBe('number');
    });
  });
});
