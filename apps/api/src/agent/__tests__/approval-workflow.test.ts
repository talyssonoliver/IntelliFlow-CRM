/**
 * Approval Workflow Tests
 *
 * IFC-139: Tests for human approval flow
 *
 * Validates:
 * - Pending action creation
 * - Approval/rejection workflow
 * - Diff preview generation
 * - Rollback mechanism
 * - User approval latency <30s (via async operation)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { approvalWorkflowService, pendingActionsStore } from '../approval-workflow';
import { PendingAction, ApprovalDecision, AgentAuthContext } from '../types';

describe('Approval Workflow', () => {
  const testContext: AgentAuthContext = {
    userId: 'user-1',
    userRole: 'MANAGER',
    permissions: [],
    agentSessionId: 'session-1',
    allowedEntityTypes: ['CASE', 'APPOINTMENT', 'LEAD'],
    allowedActionTypes: ['SEARCH', 'CREATE', 'UPDATE'],
    maxActionsPerSession: 100,
    actionCount: 0,
  };

  const createTestPendingAction = (overrides: Partial<PendingAction> = {}): PendingAction => {
    const now = new Date();
    return {
      id: 'action-1',
      toolName: 'create_case',
      actionType: 'CREATE',
      entityType: 'CASE',
      input: { title: 'Test Case', clientId: 'client-1', priority: 'MEDIUM' },
      preview: {
        summary: 'Create new case: "Test Case"',
        changes: [
          { field: 'title', previousValue: null, newValue: 'Test Case', changeType: 'ADD' },
          { field: 'clientId', previousValue: null, newValue: 'client-1', changeType: 'ADD' },
        ],
        affectedEntities: [{ type: 'CASE', id: 'NEW', name: 'Test Case', action: 'CREATE' }],
        estimatedImpact: 'MEDIUM',
      },
      status: 'PENDING',
      createdAt: now,
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000), // 30 minutes
      createdBy: 'user-1',
      agentSessionId: 'session-1',
      ...overrides,
    };
  };

  beforeEach(async () => {
    // Clear stores before each test
    // Since we're using in-memory stores, we need to reset them
    vi.clearAllMocks();
  });

  describe('pendingActionsStore', () => {
    it('should add and retrieve a pending action', async () => {
      const action = createTestPendingAction({ id: 'store-test-1' });
      await pendingActionsStore.add(action);

      const retrieved = await pendingActionsStore.get('store-test-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('store-test-1');
      expect(retrieved?.status).toBe('PENDING');
    });

    it('should mark expired actions as EXPIRED on retrieval', async () => {
      const expiredAction = createTestPendingAction({
        id: 'expired-test-1',
        expiresAt: new Date(Date.now() - 1000), // Already expired
      });
      await pendingActionsStore.add(expiredAction);

      const retrieved = await pendingActionsStore.get('expired-test-1');
      expect(retrieved?.status).toBe('EXPIRED');
    });

    it('should find actions by user', async () => {
      const action1 = createTestPendingAction({
        id: 'user-action-1',
        createdBy: 'user-123',
      });
      const action2 = createTestPendingAction({
        id: 'user-action-2',
        createdBy: 'user-123',
      });
      const action3 = createTestPendingAction({
        id: 'other-action-1',
        createdBy: 'user-456',
      });

      await pendingActionsStore.add(action1);
      await pendingActionsStore.add(action2);
      await pendingActionsStore.add(action3);

      const userActions = await pendingActionsStore.findByUser('user-123');
      expect(userActions.length).toBe(2);
      expect(userActions.every((a) => a.createdBy === 'user-123')).toBe(true);
    });

    it('should find actions by session', async () => {
      const action = createTestPendingAction({
        id: 'session-action-1',
        agentSessionId: 'test-session-xyz',
      });
      await pendingActionsStore.add(action);

      const sessionActions = await pendingActionsStore.findBySession('test-session-xyz');
      expect(sessionActions.length).toBe(1);
      expect(sessionActions[0].id).toBe('session-action-1');
    });
  });

  describe('ApprovalWorkflowService', () => {
    describe('getPendingActions', () => {
      it('should return pending actions for a user', async () => {
        const action = createTestPendingAction({
          id: 'pending-test-1',
          createdBy: 'test-user',
        });
        await pendingActionsStore.add(action);

        const pending = await approvalWorkflowService.getPendingActions('test-user');
        const hasPendingAction = pending.some((a) => a.id === 'pending-test-1');
        expect(hasPendingAction).toBe(true);
      });
    });

    describe('approveAction', () => {
      it('should approve and execute a pending action', async () => {
        const action = createTestPendingAction({ id: 'approve-test-1' });
        await pendingActionsStore.add(action);

        const decision: ApprovalDecision = {
          actionId: 'approve-test-1',
          decision: 'APPROVE',
          decidedBy: 'manager-1',
          decidedAt: new Date(),
        };

        const executed = await approvalWorkflowService.approveAction(decision, testContext);

        expect(executed).toBeDefined();
        expect(executed.status).toBe('APPROVED');
        expect(executed.approval).toBeDefined();
        expect(executed.approval?.decision).toBe('APPROVE');
        expect(executed.executedAt).toBeDefined();
      });

      it('should reject approval for expired actions', async () => {
        const expiredAction = createTestPendingAction({
          id: 'expired-approve-test',
          expiresAt: new Date(Date.now() - 1000),
        });
        await pendingActionsStore.add(expiredAction);

        const decision: ApprovalDecision = {
          actionId: 'expired-approve-test',
          decision: 'APPROVE',
          decidedBy: 'manager-1',
          decidedAt: new Date(),
        };

        await expect(
          approvalWorkflowService.approveAction(decision, testContext)
        ).rejects.toThrow(/Action (has expired|is not pending: EXPIRED)/);
      });

      it('should allow modified input on approval', async () => {
        const action = createTestPendingAction({ id: 'modified-input-test' });
        await pendingActionsStore.add(action);

        const decision: ApprovalDecision = {
          actionId: 'modified-input-test',
          decision: 'APPROVE',
          decidedBy: 'manager-1',
          decidedAt: new Date(),
          modifiedInput: {
            title: 'Modified Case Title',
            clientId: 'client-1',
            priority: 'HIGH',
          },
        };

        const executed = await approvalWorkflowService.approveAction(decision, testContext);
        expect(executed.approval?.modifiedInput).toBeDefined();
      });
    });

    describe('rejectAction', () => {
      it('should reject a pending action', async () => {
        const action = createTestPendingAction({ id: 'reject-test-1' });
        await pendingActionsStore.add(action);

        const decision: ApprovalDecision = {
          actionId: 'reject-test-1',
          decision: 'REJECT',
          decidedBy: 'manager-1',
          decidedAt: new Date(),
          reason: 'Not appropriate at this time',
        };

        const rejected = await approvalWorkflowService.rejectAction(decision, testContext);

        expect(rejected.status).toBe('REJECTED');
      });

      it('should throw for non-existent action', async () => {
        const decision: ApprovalDecision = {
          actionId: 'non-existent',
          decision: 'REJECT',
          decidedBy: 'manager-1',
          decidedAt: new Date(),
        };

        await expect(
          approvalWorkflowService.rejectAction(decision, testContext)
        ).rejects.toThrow('Pending action not found');
      });
    });

    describe('getDiffPreview', () => {
      it('should return formatted diff preview', () => {
        const action = createTestPendingAction();

        const preview = approvalWorkflowService.getDiffPreview(action);

        expect(preview.summary).toBe('Create new case: "Test Case"');
        expect(preview.changes).toHaveLength(2);
        expect(preview.changes[0].field).toBe('title');
        expect(preview.changes[0].before).toBeNull();
        expect(preview.changes[0].after).toBe('Test Case');
        expect(preview.changes[0].type).toBe('ADD');
        expect(preview.impactLevel).toBe('MEDIUM');
      });

      it('should include warnings if present', () => {
        const action = createTestPendingAction({
          preview: {
            summary: 'Test action',
            changes: [],
            affectedEntities: [],
            warnings: ['This is a warning', 'Another warning'],
            estimatedImpact: 'HIGH',
          },
        });

        const preview = approvalWorkflowService.getDiffPreview(action);

        expect(preview.warnings).toHaveLength(2);
        expect(preview.warnings).toContain('This is a warning');
        expect(preview.impactLevel).toBe('HIGH');
      });
    });

    describe('rollbackAction', () => {
      it('should reject rollback with invalid token', async () => {
        const result = await approvalWorkflowService.rollbackAction(
          {
            actionId: 'some-action',
            rollbackToken: 'invalid-token',
            requestedBy: 'user-1',
            reason: 'Test rollback',
          },
          testContext
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid rollback token');
      });
    });

    describe('getActionStatistics', () => {
      it('should return statistics', async () => {
        const stats = await approvalWorkflowService.getActionStatistics('user-1');

        expect(stats).toBeDefined();
        expect(typeof stats.pending).toBe('number');
        expect(typeof stats.approved).toBe('number');
        expect(typeof stats.rejected).toBe('number');
        expect(typeof stats.expired).toBe('number');
        expect(typeof stats.rollbacksAvailable).toBe('number');
      });
    });
  });

  describe('User Approval Latency', () => {
    it('should allow approval within 30 second window', async () => {
      const action = createTestPendingAction({
        id: 'latency-test-1',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min expiry
      });
      await pendingActionsStore.add(action);

      // Simulate quick approval (well under 30s)
      const decision: ApprovalDecision = {
        actionId: 'latency-test-1',
        decision: 'APPROVE',
        decidedBy: 'manager-1',
        decidedAt: new Date(), // Immediate decision
      };

      const startTime = performance.now();
      const executed = await approvalWorkflowService.approveAction(decision, testContext);
      const endTime = performance.now();

      // Approval operation itself should be fast
      expect(endTime - startTime).toBeLessThan(1000); // Under 1 second
      expect(executed.status).toBe('APPROVED');
    });
  });
});
