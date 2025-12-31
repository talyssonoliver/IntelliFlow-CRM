/**
 * Agent Authorization Tests
 *
 * IFC-139: Tests for authorization checks
 *
 * Validates:
 * - 100% tool actions authorized
 * - Zero unauthorized writes
 * - Role-based permissions
 * - Session action limits
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  agentAuthorizationService,
  buildAuthContext,
  authorizeAgentAction,
  resetSessionActionCount,
} from '../authorization';
import { searchLeadsTool } from '../tools/search';
import type { EntityType, AgentActionType } from '../types';
import { createCaseTool } from '../tools/create';
import { updateCaseTool } from '../tools/update';
import { draftMessageTool } from '../tools/draft-message';

describe('Agent Authorization', () => {
  const testSessionId = 'test-session-123';

  beforeEach(() => {
    resetSessionActionCount(testSessionId);
  });

  afterEach(() => {
    resetSessionActionCount(testSessionId);
  });

  describe('buildAuthContext', () => {
    it('should build context with ADMIN role permissions', () => {
      const user = { userId: 'user-1', role: 'ADMIN' };
      const context = buildAuthContext(user, testSessionId);

      expect(context.userId).toBe('user-1');
      expect(context.userRole).toBe('ADMIN');
      expect(context.allowedEntityTypes).toContain('LEAD');
      expect(context.allowedEntityTypes).toContain('CASE');
      expect(context.allowedEntityTypes).toContain('APPOINTMENT');
      expect(context.allowedActionTypes).toContain('SEARCH');
      expect(context.allowedActionTypes).toContain('CREATE');
      expect(context.allowedActionTypes).toContain('UPDATE');
      expect(context.allowedActionTypes).toContain('DELETE');
      expect(context.maxActionsPerSession).toBe(1000);
    });

    it('should build context with USER role permissions', () => {
      const user = { userId: 'user-2', role: 'USER' };
      const context = buildAuthContext(user, testSessionId);

      expect(context.userRole).toBe('USER');
      expect(context.allowedEntityTypes).toContain('LEAD');
      expect(context.allowedEntityTypes).toContain('CONTACT');
      expect(context.allowedEntityTypes).not.toContain('CASE');
      expect(context.allowedActionTypes).not.toContain('DELETE');
      expect(context.maxActionsPerSession).toBe(200);
    });

    it('should build context with READONLY role permissions', () => {
      const user = { userId: 'user-3', role: 'READONLY' };
      const context = buildAuthContext(user, testSessionId);

      expect(context.userRole).toBe('READONLY');
      expect(context.allowedActionTypes).toEqual(['SEARCH']);
      expect(context.maxActionsPerSession).toBe(100);
    });

    it('should allow custom permissions override', () => {
      const user = {
        userId: 'user-4',
        role: 'USER',
        customEntityTypes: ['LEAD'] as EntityType[],
        customActionTypes: ['SEARCH'] as AgentActionType[],
        customMaxActions: 50,
      };
      const context = buildAuthContext(user, testSessionId);

      expect(context.allowedEntityTypes).toEqual(['LEAD']);
      expect(context.allowedActionTypes).toEqual(['SEARCH']);
      expect(context.maxActionsPerSession).toBe(50);
    });
  });

  describe('authorizeToolExecution', () => {
    it('should authorize SEARCH action for USER role', async () => {
      const user = { userId: 'user-1', role: 'USER' };
      const context = buildAuthContext(user, testSessionId);
      const input = { query: 'test', limit: 20, offset: 0 };

      const result = await agentAuthorizationService.authorizeToolExecution(
        searchLeadsTool,
        input,
        context
      );

      expect(result.authorized).toBe(true);
    });

    it('should reject CREATE action for READONLY role', async () => {
      const user = { userId: 'user-2', role: 'READONLY' };
      const context = buildAuthContext(user, testSessionId);
      const input = {
        title: 'Test Case',
        clientId: 'client-1',
        priority: 'MEDIUM' as const,
      };

      const result = await agentAuthorizationService.authorizeToolExecution(
        createCaseTool,
        input,
        context
      );

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('not authorized to perform CREATE actions');
    });

    it('should reject UPDATE action for READONLY role', async () => {
      const user = { userId: 'user-3', role: 'READONLY' };
      const context = buildAuthContext(user, testSessionId);
      const input = { id: 'case-1', title: 'Updated Title' };

      const result = await agentAuthorizationService.authorizeToolExecution(
        updateCaseTool,
        input,
        context
      );

      expect(result.authorized).toBe(false);
    });

    it('should reject action when entity type not allowed', async () => {
      const user = {
        userId: 'user-4',
        role: 'USER',
        customEntityTypes: ['LEAD'] as EntityType[], // No CASE access
        customActionTypes: ['CREATE'] as AgentActionType[],
      };
      const context = buildAuthContext(user, testSessionId);
      const input = {
        title: 'Test Case',
        clientId: 'client-1',
        priority: 'MEDIUM' as const,
      };

      const result = await agentAuthorizationService.authorizeToolExecution(
        createCaseTool,
        input,
        context
      );

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('not authorized to access');
    });

    it('should enforce session action limits', async () => {
      const user = {
        userId: 'user-5',
        role: 'USER',
        customMaxActions: 2,
      };

      // Execute 2 actions to reach limit
      for (let i = 0; i < 2; i++) {
        const context = buildAuthContext(user, testSessionId);
        await agentAuthorizationService.authorizeToolExecution(
          searchLeadsTool,
          { query: 'test', limit: 10, offset: 0 },
          context
        );
      }

      // Third action should be rejected
      const context = buildAuthContext(user, testSessionId);
      const result = await agentAuthorizationService.authorizeToolExecution(
        searchLeadsTool,
        { query: 'test', limit: 10, offset: 0 },
        context
      );

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('Session action limit reached');
    });

    it('should increment action count on successful authorization', async () => {
      const user = { userId: 'user-6', role: 'ADMIN' };
      const context1 = buildAuthContext(user, testSessionId);

      expect(context1.actionCount).toBe(0);

      const result = await agentAuthorizationService.authorizeToolExecution(
        searchLeadsTool,
        { query: 'test', limit: 10, offset: 0 },
        context1
      );

      expect(result.authorized).toBe(true);
      expect(result.context?.actionCount).toBe(1);

      // Next context should show updated count
      const context2 = buildAuthContext(user, testSessionId);
      expect(context2.actionCount).toBe(1);
    });
  });

  describe('authorizeAgentAction', () => {
    it('should provide convenient authorization wrapper', async () => {
      const user = { userId: 'user-1', role: 'MANAGER' };
      const input = { query: 'test leads', limit: 20, offset: 0 };

      const result = await authorizeAgentAction(
        searchLeadsTool,
        input,
        user,
        testSessionId
      );

      expect(result.authorized).toBe(true);
      expect(result.context).toBeDefined();
    });
  });

  describe('canApproveActions', () => {
    it('should allow ADMIN to approve actions', () => {
      const user = { userId: 'user-1', role: 'ADMIN' };
      const context = buildAuthContext(user, testSessionId);

      expect(agentAuthorizationService.canApproveActions(context)).toBe(true);
    });

    it('should allow MANAGER to approve actions', () => {
      const user = { userId: 'user-2', role: 'MANAGER' };
      const context = buildAuthContext(user, testSessionId);

      expect(agentAuthorizationService.canApproveActions(context)).toBe(true);
    });

    it('should not allow USER to approve actions', () => {
      const user = { userId: 'user-3', role: 'USER' };
      const context = buildAuthContext(user, testSessionId);

      expect(agentAuthorizationService.canApproveActions(context)).toBe(false);
    });

    it('should not allow READONLY to approve actions', () => {
      const user = { userId: 'user-4', role: 'READONLY' };
      const context = buildAuthContext(user, testSessionId);

      expect(agentAuthorizationService.canApproveActions(context)).toBe(false);
    });
  });

  describe('canRollbackAction', () => {
    it('should allow ADMIN to rollback any action', () => {
      const user = { userId: 'admin-1', role: 'ADMIN' };
      const context = buildAuthContext(user, testSessionId);

      expect(agentAuthorizationService.canRollbackAction(context, 'other-user')).toBe(true);
    });

    it('should allow approver to rollback their own approved action', () => {
      const user = { userId: 'manager-1', role: 'MANAGER' };
      const context = buildAuthContext(user, testSessionId);

      expect(agentAuthorizationService.canRollbackAction(context, 'manager-1')).toBe(true);
    });

    it('should not allow user to rollback action approved by another user', () => {
      const user = { userId: 'user-1', role: 'USER' };
      const context = buildAuthContext(user, testSessionId);

      expect(agentAuthorizationService.canRollbackAction(context, 'manager-1')).toBe(false);
    });
  });

  describe('getAuthorizationSummary', () => {
    it('should return complete authorization summary', () => {
      const user = { userId: 'user-1', role: 'MANAGER' };
      const context = buildAuthContext(user, testSessionId);

      const summary = agentAuthorizationService.getAuthorizationSummary(context);

      expect(summary.role).toBe('MANAGER');
      expect(summary.allowedEntityTypes.length).toBeGreaterThan(0);
      expect(summary.allowedActionTypes.length).toBeGreaterThan(0);
      expect(summary.actionsRemaining).toBeGreaterThan(0);
      expect(summary.canApprove).toBe(true);
      expect(summary.canRollback).toBe(true);
    });
  });
});
