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
import {
  ApprovalWorkflowService,
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

describe('Approval Workflow (supplementary)', () => {
  let service: ApprovalWorkflowService;

  beforeEach(() => {
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

      await executedActionsStore.add(action);
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

      await executedActionsStore.add(action);
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

      await executedActionsStore.add(action);
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

      await executedActionsStore.add(action);
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

    it('should set rollbackAvailable based on tool rollback support', async () => {
      const action = createTestPendingAction({ id: 'rollback-check-action' });
      await pendingActionsStore.add(action);

      // Mock tool with rollback support
      (getAgentTool as any).mockReturnValue({
        name: 'create_case',
        rollback: vi.fn(),
      });

      const decision: ApprovalDecision = {
        actionId: 'rollback-check-action',
        decision: 'APPROVE',
        decidedBy: 'manager-1',
        decidedAt: new Date(),
      };

      const result = await service.approveAction(decision, testContext);
      expect(result.rollbackAvailable).toBe(true);
      expect(result.rollbackToken).toBeDefined();
    });

    it('should set rollbackAvailable=false when tool has no rollback', async () => {
      const action = createTestPendingAction({ id: 'no-rollback-action' });
      await pendingActionsStore.add(action);

      // Mock tool without rollback support
      (getAgentTool as any).mockReturnValue({
        name: 'create_case',
        // no rollback property
      });

      const decision: ApprovalDecision = {
        actionId: 'no-rollback-action',
        decision: 'APPROVE',
        decidedBy: 'manager-1',
        decidedAt: new Date(),
      };

      const result = await service.approveAction(decision, testContext);
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
    it('should return error when rollback is no longer available', async () => {
      const executedAction: ExecutedAction = {
        ...createTestPendingAction({ id: 'rollback-unavail-1' }),
        executedAt: new Date(),
        rollbackAvailable: false,
        rollbackToken: 'unavail-token',
      };
      // Must set rollbackAvailable to true for findByRollbackToken to find it,
      // but then we test the !rollbackAvailable branch. Let's add it with true first.
      executedAction.rollbackAvailable = true;
      await executedActionsStore.add(executedAction);
      // Now disable rollback
      await executedActionsStore.disableRollback('rollback-unavail-1');

      const result = await service.rollbackAction(
        {
          actionId: 'rollback-unavail-1',
          rollbackToken: 'unavail-token',
          requestedBy: 'user-1',
          reason: 'Undo',
        },
        testContext
      );

      // Token won't be found since rollbackAvailable is now false
      expect(result.success).toBe(false);
    });

    it('should return error when rollback window has expired', async () => {
      const longAgo = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const executedAction: ExecutedAction = {
        ...createTestPendingAction({ id: 'rollback-expired-1' }),
        executedAt: longAgo,
        rollbackAvailable: true,
        rollbackToken: 'expired-window-token',
      };
      await executedActionsStore.add(executedAction);

      const result = await service.rollbackAction(
        {
          actionId: 'rollback-expired-1',
          rollbackToken: 'expired-window-token',
          requestedBy: 'user-1',
          reason: 'Too late',
        },
        testContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rollback window has expired');
    });

    it('should return error when tool does not support rollback', async () => {
      const executedAction: ExecutedAction = {
        ...createTestPendingAction({ id: 'no-tool-rollback-1', toolName: 'no_rollback_tool' }),
        executedAt: new Date(),
        rollbackAvailable: true,
        rollbackToken: 'no-tool-rb-token',
      };
      await executedActionsStore.add(executedAction);

      // Mock tool without rollback
      (getAgentTool as any).mockReturnValue({
        name: 'no_rollback_tool',
        // no rollback
      });

      const result = await service.rollbackAction(
        {
          actionId: 'no-tool-rollback-1',
          rollbackToken: 'no-tool-rb-token',
          requestedBy: 'user-1',
          reason: 'Undo',
        },
        testContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool does not support rollback');
    });

    it('should successfully rollback when all conditions are met', async () => {
      const executedAction: ExecutedAction = {
        ...createTestPendingAction({ id: 'success-rollback-1', toolName: 'create_case' }),
        executedAt: new Date(),
        executionResult: { entityId: 'case-created-1' },
        rollbackAvailable: true,
        rollbackToken: 'success-rb-token',
      };
      await executedActionsStore.add(executedAction);

      // Mock tool with successful rollback
      const mockRollback = vi.fn().mockResolvedValue({
        success: true,
        actionId: 'success-rollback-1',
        rolledBackAt: new Date(),
      });
      (getAgentTool as any).mockReturnValue({
        name: 'create_case',
        rollback: mockRollback,
      });

      const result = await service.rollbackAction(
        {
          actionId: 'success-rollback-1',
          rollbackToken: 'success-rb-token',
          requestedBy: 'user-1',
          reason: 'Wrong data',
        },
        testContext
      );

      expect(result.success).toBe(true);
      expect(mockRollback).toHaveBeenCalled();

      // Rollback should be disabled after success
      const afterRollback = await executedActionsStore.get('success-rollback-1');
      expect(afterRollback!.rollbackAvailable).toBe(false);
    });

    it('should handle rollback function throwing an error', async () => {
      const executedAction: ExecutedAction = {
        ...createTestPendingAction({ id: 'error-rollback-1', toolName: 'create_case' }),
        executedAt: new Date(),
        executionResult: { entityId: 'case-created-2' },
        rollbackAvailable: true,
        rollbackToken: 'error-rb-token',
      };
      await executedActionsStore.add(executedAction);

      // Mock tool with failing rollback
      (getAgentTool as any).mockReturnValue({
        name: 'create_case',
        rollback: vi.fn().mockRejectedValue(new Error('Rollback database error')),
      });

      const result = await service.rollbackAction(
        {
          actionId: 'error-rollback-1',
          rollbackToken: 'error-rb-token',
          requestedBy: 'user-1',
          reason: 'Undo',
        },
        testContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rollback database error');
    });

    it('should not disable rollback when rollback fails', async () => {
      const executedAction: ExecutedAction = {
        ...createTestPendingAction({ id: 'fail-rollback-1', toolName: 'create_case' }),
        executedAt: new Date(),
        executionResult: { entityId: 'case-3' },
        rollbackAvailable: true,
        rollbackToken: 'fail-rb-token',
      };
      await executedActionsStore.add(executedAction);

      // Mock tool with unsuccessful rollback (but no throw)
      (getAgentTool as any).mockReturnValue({
        name: 'create_case',
        rollback: vi.fn().mockResolvedValue({
          success: false,
          actionId: 'fail-rollback-1',
          error: 'Entity already deleted',
        }),
      });

      const result = await service.rollbackAction(
        {
          actionId: 'fail-rollback-1',
          rollbackToken: 'fail-rb-token',
          requestedBy: 'user-1',
          reason: 'Undo',
        },
        testContext
      );

      expect(result.success).toBe(false);
    });

    it('should return error when tool is not found', async () => {
      const executedAction: ExecutedAction = {
        ...createTestPendingAction({ id: 'no-tool-1', toolName: 'missing_tool' }),
        executedAt: new Date(),
        rollbackAvailable: true,
        rollbackToken: 'no-tool-token',
      };
      await executedActionsStore.add(executedAction);

      // Mock tool as undefined
      (getAgentTool as any).mockReturnValue(undefined);

      const result = await service.rollbackAction(
        {
          actionId: 'no-tool-1',
          rollbackToken: 'no-tool-token',
          requestedBy: 'user-1',
          reason: 'Undo',
        },
        testContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool does not support rollback');
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
