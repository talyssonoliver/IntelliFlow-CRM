/**
 * Unit Tests for Rollback Service (IFC-149)
 *
 * Tests the rollback service functionality:
 * - Creating agent actions
 * - Approving/rejecting actions
 * - Rolling back approved actions
 * - Action history retrieval
 * - Metrics calculation
 *
 * @see IFC-149 - Action preview and rollback UI
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  rollbackService,
  createAction,
  approveAction,
  rejectAction,
  rollbackAction,
  getAction,
  getActionHistory,
  getPendingActions,
  getApprovalMetrics,
  getAuditLog,
  modifyAndApproveAction,
  expirePendingActions,
  getPendingActionCount,
  clearStore,
  type AgentAction,
  type ActionStatus,
} from './rollback-service';

describe('Rollback Service', () => {
  beforeEach(() => {
    // Clear store before each test
    clearStore();
  });

  describe('createAction', () => {
    it('should create a new pending action', async () => {
      const action = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: { score: 50 },
        proposedState: { score: 75 },
        description: 'Update lead score',
        aiReasoning: 'Lead showed high engagement',
        confidenceScore: 85,
        agentId: 'test-agent',
        agentName: 'Test Agent',
      });

      expect(action).toBeDefined();
      expect(action.id).toBeDefined();
      expect(action.status).toBe('pending');
      expect(action.entityId).toBe('lead-123');
      expect(action.createdAt).toBeInstanceOf(Date);
      expect(action.expiresAt).toBeInstanceOf(Date);
      expect(action.expiresAt.getTime()).toBeGreaterThan(action.createdAt.getTime());
    });

    it('should generate unique IDs for each action', async () => {
      const action1 = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-1',
        entityType: 'lead',
        entityName: 'Lead 1',
        previousState: {},
        proposedState: {},
        description: 'Action 1',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      const action2 = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-2',
        entityType: 'lead',
        entityName: 'Lead 2',
        previousState: {},
        proposedState: {},
        description: 'Action 2',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      expect(action1.id).not.toBe(action2.id);
    });
  });

  describe('getAction', () => {
    it('should retrieve an action by ID', async () => {
      const created = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: {},
        proposedState: {},
        description: 'Test action',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      const retrieved = await getAction(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return null for non-existent action', async () => {
      const action = await getAction('non-existent-id');
      expect(action).toBeNull();
    });
  });

  describe('approveAction', () => {
    it('should approve a pending action', async () => {
      const action = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: { score: 50 },
        proposedState: { score: 75 },
        description: 'Update lead score',
        aiReasoning: 'Test',
        confidenceScore: 85,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      const approved = await approveAction(action.id, 'user-123');

      expect(approved).toBeDefined();
      expect(approved?.status).toBe('approved');
      expect(approved?.reviewedAt).toBeInstanceOf(Date);
      expect(approved?.reviewedBy).toBe('user-123');
    });

    it('should return null when approving non-existent action', async () => {
      const result = await approveAction('non-existent', 'user-123');
      expect(result).toBeNull();
    });

    it('should not approve already approved action', async () => {
      const action = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: {},
        proposedState: {},
        description: 'Test',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      await approveAction(action.id, 'user-1');
      const secondApproval = await approveAction(action.id, 'user-2');

      expect(secondApproval).toBeNull();
    });

    it('should create audit log entry on approval', async () => {
      const action = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: { score: 50 },
        proposedState: { score: 75 },
        description: 'Test',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      await approveAction(action.id, 'user-123');
      const auditLog = await getAuditLog(action.id);

      expect(auditLog.length).toBe(1);
      expect(auditLog[0].operation).toBe('approve');
      expect(auditLog[0].userId).toBe('user-123');
    });

    it('should block approving expired actions and mark them expired', async () => {
      const action = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-expired',
        entityType: 'lead',
        entityName: 'Expired Lead',
        previousState: { score: 40 },
        proposedState: { score: 80 },
        description: 'Expired test',
        aiReasoning: 'Test',
        confidenceScore: 75,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      const stored = await getAction(action.id);
      if (stored) {
        stored.expiresAt = new Date(Date.now() - 1000);
      }

      const result = await approveAction(action.id, 'user-expire');
      expect(result).toBeNull();

      const expiredAction = await getAction(action.id);
      expect(expiredAction?.status).toBe('expired');

      const auditLog = await getAuditLog(action.id);
      expect(auditLog[0]?.operation).toBe('expire');
      expect(auditLog[0]?.userId).toBe('user-expire');
    });
  });

  describe('rejectAction', () => {
    it('should reject a pending action with feedback', async () => {
      const action = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: {},
        proposedState: {},
        description: 'Test',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      const rejected = await rejectAction(action.id, 'user-123', 'Not appropriate');

      expect(rejected).toBeDefined();
      expect(rejected?.status).toBe('rejected');
      expect(rejected?.feedback).toBe('Not appropriate');
      expect(rejected?.reviewedBy).toBe('user-123');
    });

    it('should create audit log entry on rejection', async () => {
      const action = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: {},
        proposedState: {},
        description: 'Test',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      await rejectAction(action.id, 'user-123', 'Rejection reason');
      const auditLog = await getAuditLog(action.id);

      expect(auditLog.length).toBe(1);
      expect(auditLog[0].operation).toBe('reject');
      expect(auditLog[0].metadata).toHaveProperty('feedback', 'Rejection reason');
    });
  });

  describe('rollbackAction', () => {
    it('should rollback an approved action', async () => {
      const action = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: { score: 50 },
        proposedState: { score: 75 },
        description: 'Test',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      await approveAction(action.id, 'user-1');
      const result = await rollbackAction(action.id, 'user-2', 'Need to revert');

      expect(result.success).toBe(true);
      expect(result.previousStatus).toBe('approved');
      expect(result.newStatus).toBe('rolled_back');
      expect(result.restoredState).toEqual({ score: 50 });
      expect(result.auditLogId).toBeDefined();
    });

    it('should fail to rollback non-existent action', async () => {
      const result = await rollbackAction('non-existent', 'user-1', 'Test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should fail to rollback pending action', async () => {
      const action = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: {},
        proposedState: {},
        description: 'Test',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      const result = await rollbackAction(action.id, 'user-1', 'Test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot rollback');
    });

    it('should fail to rollback rejected action', async () => {
      const action = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: {},
        proposedState: {},
        description: 'Test',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      await rejectAction(action.id, 'user-1', 'Rejected');
      const result = await rollbackAction(action.id, 'user-2', 'Test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot rollback');
    });

    it('should rollback a modified action', async () => {
      const action = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: { score: 50 },
        proposedState: { score: 75 },
        description: 'Test',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      await modifyAndApproveAction(
        action.id,
        'user-1',
        { score: 70 },
        'Adjusted score'
      );

      const result = await rollbackAction(
        action.id,
        'user-2',
        'Rollback modified'
      );

      expect(result.success).toBe(true);
      expect(result.previousStatus).toBe('modified');
      expect(result.newStatus).toBe('rolled_back');
    });

    it('should add rollback info to action', async () => {
      const action = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: { score: 50 },
        proposedState: { score: 75 },
        description: 'Test',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      await approveAction(action.id, 'user-1');
      await rollbackAction(action.id, 'user-2', 'Need to revert');

      const rolledBackAction = await getAction(action.id);

      expect(rolledBackAction?.rollbackInfo).toBeDefined();
      expect(rolledBackAction?.rollbackInfo?.rolledBackBy).toBe('user-2');
      expect(rolledBackAction?.rollbackInfo?.reason).toBe('Need to revert');
      expect(rolledBackAction?.rollbackInfo?.restoredState).toEqual({ score: 50 });
    });
  });

  describe('modifyAndApproveAction', () => {
    it('should modify and approve an action', async () => {
      const action = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: { score: 50 },
        proposedState: { score: 75 },
        description: 'Test',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      const modifiedState = { score: 70 };
      const result = await modifyAndApproveAction(
        action.id,
        'user-1',
        modifiedState,
        'Adjusted score'
      );

      expect(result).toBeDefined();
      expect(result?.status).toBe('modified');
      expect(result?.proposedState).toEqual(modifiedState);
      expect(result?.feedback).toBe('Adjusted score');
    });

    it('should create audit log for modification', async () => {
      const action = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: { score: 50 },
        proposedState: { score: 75 },
        description: 'Test',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      await modifyAndApproveAction(action.id, 'user-1', { score: 70 }, 'Adjusted');
      const auditLog = await getAuditLog(action.id);

      expect(auditLog.length).toBe(1);
      expect(auditLog[0].operation).toBe('modify');
      expect(auditLog[0].previousState).toEqual({ score: 75 });
      expect(auditLog[0].newState).toEqual({ score: 70 });
    });
  });

  describe('getPendingActions', () => {
    it('should return only pending non-expired actions', async () => {
      await createAction({
        actionType: 'lead_update',
        entityId: 'lead-1',
        entityType: 'lead',
        entityName: 'Lead 1',
        previousState: {},
        proposedState: {},
        description: 'Action 1',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      const action2 = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-2',
        entityType: 'lead',
        entityName: 'Lead 2',
        previousState: {},
        proposedState: {},
        description: 'Action 2',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      await approveAction(action2.id, 'user-1');

      const pending = await getPendingActions();

      expect(pending.length).toBe(1);
      expect(pending[0].entityId).toBe('lead-1');
    });

    it('should sort pending actions by creation time (newest first)', async () => {
      await createAction({
        actionType: 'lead_update',
        entityId: 'lead-1',
        entityType: 'lead',
        entityName: 'Lead 1',
        previousState: {},
        proposedState: {},
        description: 'First',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await createAction({
        actionType: 'lead_update',
        entityId: 'lead-2',
        entityType: 'lead',
        entityName: 'Lead 2',
        previousState: {},
        proposedState: {},
        description: 'Second',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      const pending = await getPendingActions();

      expect(pending[0].description).toBe('Second');
      expect(pending[1].description).toBe('First');
    });
  });

  describe('getActionHistory', () => {
    it('should return actions for a specific entity', async () => {
      await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: {},
        proposedState: {},
        description: 'Action 1',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: {},
        proposedState: {},
        description: 'Action 2',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      await createAction({
        actionType: 'lead_update',
        entityId: 'lead-other',
        entityType: 'lead',
        entityName: 'Other Lead',
        previousState: {},
        proposedState: {},
        description: 'Action 3',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      const history = await getActionHistory('lead-123');

      expect(history.totalActions).toBe(2);
      expect(history.entityId).toBe('lead-123');
      expect(history.actions.length).toBe(2);
    });

    it('should calculate correct counts by status', async () => {
      const action1 = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: {},
        proposedState: {},
        description: 'Action 1',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      const action2 = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: {},
        proposedState: {},
        description: 'Action 2',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      const action3 = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: {},
        proposedState: {},
        description: 'Action 3',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      await approveAction(action1.id, 'user-1');
      await rejectAction(action2.id, 'user-1', 'Rejected');

      // Approve and rollback action3
      await approveAction(action3.id, 'user-1');
      await rollbackAction(action3.id, 'user-2', 'Rollback');

      const history = await getActionHistory('lead-123');

      expect(history.approvedCount).toBe(1);
      expect(history.rejectedCount).toBe(1);
      expect(history.rolledBackCount).toBe(1);
    });
  });

  describe('getApprovalMetrics', () => {
    it('should calculate correct metrics', async () => {
      const action1 = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-1',
        entityType: 'lead',
        entityName: 'Lead 1',
        previousState: {},
        proposedState: {},
        description: 'Action 1',
        aiReasoning: 'Test',
        confidenceScore: 90,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      const action2 = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-2',
        entityType: 'lead',
        entityName: 'Lead 2',
        previousState: {},
        proposedState: {},
        description: 'Action 2',
        aiReasoning: 'Test',
        confidenceScore: 60,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      await approveAction(action1.id, 'user-1');
      await rejectAction(action2.id, 'user-1', 'Rejected');

      const metrics = await getApprovalMetrics();

      expect(metrics.totalActions).toBe(2);
      expect(metrics.approved).toBe(1);
      expect(metrics.rejected).toBe(1);
      expect(metrics.approvalRate).toBe(50);
      expect(metrics.avgConfidenceApproved).toBe(90);
      expect(metrics.avgConfidenceRejected).toBe(60);
    });

    it('should handle empty metrics', async () => {
      const metrics = await getApprovalMetrics();

      expect(metrics.totalActions).toBe(0);
      expect(metrics.approvalRate).toBe(0);
      expect(metrics.avgReviewTimeMs).toBe(0);
    });
  });

  describe('expirePendingActions', () => {
    it('should expire actions past their expiration date', async () => {
      // Create action with immediate expiration (for testing)
      const action = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: {},
        proposedState: {},
        description: 'Test',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      // Manually set expiration to past
      const storedAction = await getAction(action.id);
      if (storedAction) {
        storedAction.expiresAt = new Date(Date.now() - 1000);
      }

      const expiredCount = await expirePendingActions();

      expect(expiredCount).toBe(1);

      const expiredAction = await getAction(action.id);
      expect(expiredAction?.status).toBe('expired');
    });

    it('should create audit log for expired actions', async () => {
      const action = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: {},
        proposedState: {},
        description: 'Test',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      // Manually set expiration to past
      const storedAction = await getAction(action.id);
      if (storedAction) {
        storedAction.expiresAt = new Date(Date.now() - 1000);
      }

      await expirePendingActions();

      const auditLog = await getAuditLog(action.id);
      expect(auditLog.length).toBe(1);
      expect(auditLog[0].operation).toBe('expire');
      expect(auditLog[0].userId).toBe('system');
    });
  });

  describe('getPendingActionCount', () => {
    it('should return count of non-expired pending actions', async () => {
      await createAction({
        actionType: 'lead_update',
        entityId: 'lead-1',
        entityType: 'lead',
        entityName: 'Lead 1',
        previousState: {},
        proposedState: {},
        description: 'Pending 1',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      const expired = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-2',
        entityType: 'lead',
        entityName: 'Lead 2',
        previousState: {},
        proposedState: {},
        description: 'Pending 2',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      const stored = await getAction(expired.id);
      if (stored) {
        stored.expiresAt = new Date(Date.now() - 1000);
      }

      await expirePendingActions();

      const pendingCount = await getPendingActionCount();
      expect(pendingCount).toBe(1);
    });
  });

  describe('clearStore', () => {
    it('should clear all actions and audit logs', async () => {
      const action = await createAction({
        actionType: 'lead_update',
        entityId: 'lead-123',
        entityType: 'lead',
        entityName: 'Test Lead',
        previousState: {},
        proposedState: {},
        description: 'Test',
        aiReasoning: 'Test',
        confidenceScore: 80,
        agentId: 'agent-1',
        agentName: 'Agent 1',
      });

      await approveAction(action.id, 'user-1');

      clearStore();

      const retrieved = await getAction(action.id);
      const pending = await getPendingActions();
      const auditLog = await getAuditLog(action.id);

      expect(retrieved).toBeNull();
      expect(pending.length).toBe(0);
      expect(auditLog.length).toBe(0);
    });
  });
});
