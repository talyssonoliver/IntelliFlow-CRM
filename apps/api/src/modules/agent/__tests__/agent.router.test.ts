/**
 * Agent Router Tests
 *
 * @implements IFC-139: AI Agent Tools & Approval Workflow
 *
 * Tests for agent endpoints including:
 * - Tool discovery and listing
 * - Tool execution with approval workflow
 * - Approval management (approve/reject)
 * - Pending action management
 *
 * KPIs:
 * - 100% tool actions authorized
 * - Zero unauthorized writes
 * - User approval latency <30s
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// Define mock data inline to avoid hoisting issues
const mockToolsRequiringApproval = [
  {
    name: 'create_case',
    description: 'Create a new support case',
    actionType: 'CREATE',
    entityTypes: ['Case'],
    requiresApproval: true,
  },
  {
    name: 'create_appointment',
    description: 'Create a new appointment',
    actionType: 'CREATE',
    entityTypes: ['Appointment'],
    requiresApproval: true,
  },
  {
    name: 'update_case',
    description: 'Update an existing case',
    actionType: 'UPDATE',
    entityTypes: ['Case'],
    requiresApproval: true,
  },
];

const mockToolsNotRequiringApproval = [
  {
    name: 'search_leads',
    description: 'Search leads in the CRM',
    actionType: 'SEARCH',
    entityTypes: ['Lead'],
    requiresApproval: false,
  },
  {
    name: 'search_contacts',
    description: 'Search contacts in the CRM',
    actionType: 'SEARCH',
    entityTypes: ['Contact'],
    requiresApproval: false,
  },
];

// Create mock functions that can be configured per test
const mockGetAgentTool = vi.fn();
const mockApprovalGetPendingActions = vi.fn().mockResolvedValue([]);
const mockApprovalGetPendingAction = vi.fn();
const mockApprovalApproveAction = vi.fn();
const mockApprovalRejectAction = vi.fn();
const mockPendingActionsAdd = vi.fn().mockResolvedValue(undefined);
const mockAuthorizeToolExecution = vi.fn().mockResolvedValue({ authorized: true, reason: null });
const mockLoggerLog = vi.fn().mockResolvedValue(undefined);

// Mock the agent tools module
vi.mock('../../../agent/tools', () => ({
  getAvailableToolNames: () => [
    'search_leads',
    'search_contacts',
    'search_opportunities',
    'search_crm',
    'create_case',
    'create_appointment',
    'update_case',
    'update_appointment',
    'draft_message',
  ],
  getAgentTool: (name: string) => mockGetAgentTool(name),
  getToolsRequiringApproval: () => mockToolsRequiringApproval,
  getToolsNotRequiringApproval: () => mockToolsNotRequiringApproval,
  toolMetadata: {
    categories: {
      search: {
        name: 'Search',
        description: 'Read-only search operations',
        requiresApproval: false,
        tools: ['search_leads', 'search_contacts'],
      },
      create: {
        name: 'Create',
        description: 'Create new entities',
        requiresApproval: true,
        tools: ['create_case', 'create_appointment'],
      },
    },
  },
}));

// Mock the approval workflow module
vi.mock('../../../agent/approval-workflow', () => ({
  approvalWorkflowService: {
    getPendingActions: (userId: string) => mockApprovalGetPendingActions(userId),
    getPendingAction: (actionId: string) => mockApprovalGetPendingAction(actionId),
    approveAction: (decision: unknown, context: unknown) => mockApprovalApproveAction(decision, context),
    rejectAction: (decision: unknown, context: unknown) => mockApprovalRejectAction(decision, context),
  },
  pendingActionsStore: {
    add: (action: unknown) => mockPendingActionsAdd(action),
    get: vi.fn(),
    remove: vi.fn(),
  },
}));

// Mock the authorization module
vi.mock('../../../agent/authorization', () => ({
  agentAuthorizationService: {
    authorizeToolExecution: (tool: unknown, input: unknown, context: unknown) => mockAuthorizeToolExecution(tool, input, context),
  },
  buildAuthContext: (userInfo: { userId: string; role: string }, sessionId: string) => ({
    userId: userInfo.userId,
    role: userInfo.role,
    agentSessionId: sessionId,
    tenantId: 'test-tenant-id',
    permissions: ['read', 'write'],
    actionCount: 0,
    sessionStartedAt: new Date(),
  }),
}));

// Mock the logger module
vi.mock('../../../agent/logger', () => ({
  agentLogger: {
    log: (entry: unknown) => mockLoggerLog(entry),
  },
}));

// Import after mocks are defined
import { agentRouter } from '../agent.router';
import type { BaseContext } from '../../../context';

// Test UUID constants
const TEST_UUIDS = {
  user1: '12345678-0000-4000-8000-000012345678',
  tenant: '87654321-0000-4000-8000-000087654321',
};

// Create test context helper (standalone, not using setup.ts)
function createAgentTestContext(authenticated = true): BaseContext {
  return {
    prisma: {} as any,
    container: {} as any,
    services: {} as any,
    security: {} as any,
    adapters: {} as any,
    user: authenticated ? {
      userId: TEST_UUIDS.user1,
      email: 'test@example.com',
      role: 'USER',
      tenantId: TEST_UUIDS.tenant,
    } : undefined,
    tenant: {
      tenantId: TEST_UUIDS.tenant,
      tenantType: 'user' as const,
      userId: TEST_UUIDS.user1,
      role: 'USER',
      canAccessAllTenantData: false,
    },
    prismaWithTenant: {} as any,
    req: undefined,
    res: undefined,
  };
}

describe('agentRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock behavior
    mockAuthorizeToolExecution.mockResolvedValue({ authorized: true, reason: null });
    mockApprovalGetPendingActions.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================
  // List Tools Tests
  // ============================================

  describe('listTools', () => {
    it('should return all available tools', async () => {
      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      const result = await caller.listTools();

      expect(result.all).toContain('search_leads');
      expect(result.all).toContain('create_case');
      expect(result.requiringApproval).toHaveLength(3);
      expect(result.noApproval).toHaveLength(2);
      expect(result.metadata).toBeDefined();
    });

    it('should group tools by approval requirement', async () => {
      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      const result = await caller.listTools();

      // Tools requiring approval
      expect(result.requiringApproval.map(t => t.name)).toContain('create_case');
      expect(result.requiringApproval.map(t => t.name)).toContain('create_appointment');

      // Tools not requiring approval
      expect(result.noApproval.map(t => t.name)).toContain('search_leads');
      expect(result.noApproval.map(t => t.name)).toContain('search_contacts');
    });

    it('should include tool metadata', async () => {
      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      const result = await caller.listTools();

      expect(result.metadata.categories).toBeDefined();
      expect(result.metadata.categories.search).toBeDefined();
      expect(result.metadata.categories.create).toBeDefined();
    });
  });

  // ============================================
  // Get Tool Tests
  // ============================================

  describe('getTool', () => {
    it('should return tool details for valid tool name', async () => {
      const mockTool = {
        name: 'search_leads',
        description: 'Search leads in the CRM',
        actionType: 'SEARCH',
        entityTypes: ['Lead'],
        requiresApproval: false,
      };

      mockGetAgentTool.mockReturnValue(mockTool);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      const result = await caller.getTool({ toolName: 'search_leads' });

      expect(result.name).toBe('search_leads');
      expect(result.description).toBe('Search leads in the CRM');
      expect(result.actionType).toBe('SEARCH');
      expect(result.requiresApproval).toBe(false);
    });

    it('should throw NOT_FOUND for non-existent tool', async () => {
      mockGetAgentTool.mockReturnValue(undefined);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      await expect(caller.getTool({ toolName: 'non_existent_tool' })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('non_existent_tool'),
        })
      );
    });
  });

  // ============================================
  // Execute Tool Tests
  // ============================================

  describe('executeTool', () => {
    it('should execute tool immediately when no approval required', async () => {
      const mockExecute = vi.fn().mockResolvedValue({
        success: true,
        data: [{ id: 'lead_1', name: 'Test Lead' }],
      });

      const mockTool = {
        name: 'search_leads',
        description: 'Search leads',
        actionType: 'SEARCH',
        entityTypes: ['Lead'],
        requiresApproval: false,
        execute: mockExecute,
      };

      mockGetAgentTool.mockReturnValue(mockTool);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      const result = await caller.executeTool({
        toolName: 'search_leads',
        input: { query: 'test' },
      });

      // Type guard for tool result (no approval required)
      expect('success' in result).toBe(true);
      if ('success' in result) {
        expect(result.success).toBe(true);
        expect(result.data).toEqual([{ id: 'lead_1', name: 'Test Lead' }]);
      }
      expect(mockExecute).toHaveBeenCalled();
      expect(mockLoggerLog).toHaveBeenCalled();
    });

    it('should create pending action when approval required', async () => {
      const mockGeneratePreview = vi.fn().mockResolvedValue({
        summary: 'Create new case: Test Issue',
        changes: [{ field: 'subject', newValue: 'Test Issue' }],
      });

      const mockTool = {
        name: 'create_case',
        description: 'Create a support case',
        actionType: 'CREATE',
        entityTypes: ['Case'],
        requiresApproval: true,
        generatePreview: mockGeneratePreview,
        execute: vi.fn(),
      };

      mockGetAgentTool.mockReturnValue(mockTool);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      const result = await caller.executeTool({
        toolName: 'create_case',
        input: { subject: 'Test Issue' },
      });

      // Type guard for approval required result
      expect('requiresApproval' in result).toBe(true);
      // Cast to expected type after guard check
      const approvalResult = result as { requiresApproval: boolean; actionId: string; preview: unknown; expiresAt: Date };
      expect(approvalResult.requiresApproval).toBe(true);
      expect(approvalResult.actionId).toBeDefined();
      expect(approvalResult.preview).toBeDefined();
      expect(approvalResult.expiresAt).toBeDefined();
      expect(mockPendingActionsAdd).toHaveBeenCalled();
      expect(mockTool.execute).not.toHaveBeenCalled();
    });

    it('should throw NOT_FOUND for unknown tool', async () => {
      mockGetAgentTool.mockReturnValue(undefined);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      await expect(
        caller.executeTool({ toolName: 'unknown_tool', input: {} })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('unknown_tool'),
        })
      );
    });

    it('should throw FORBIDDEN when action not authorized', async () => {
      const mockTool = {
        name: 'create_case',
        description: 'Create a support case',
        actionType: 'CREATE',
        entityTypes: ['Case'],
        requiresApproval: true,
      };

      mockGetAgentTool.mockReturnValue(mockTool);
      mockAuthorizeToolExecution.mockResolvedValue({
        authorized: false,
        reason: 'Insufficient permissions for this action',
      });

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      await expect(
        caller.executeTool({ toolName: 'create_case', input: { subject: 'Test' } })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
        })
      );
    });

    it('should throw UNAUTHORIZED when user not authenticated', async () => {
      const ctx = createAgentTestContext(false);
      const caller = agentRouter.createCaller(ctx);

      await expect(
        caller.executeTool({ toolName: 'search_leads', input: {} })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================
  // Get Pending Approvals Tests
  // ============================================

  describe('getPendingApprovals', () => {
    it('should return pending actions for authenticated user', async () => {
      const mockPendingActions = [
        {
          id: 'action_1',
          toolName: 'create_case',
          actionType: 'CREATE',
          entityType: 'Case',
          preview: { summary: 'Create case' },
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          status: 'PENDING',
        },
        {
          id: 'action_2',
          toolName: 'update_case',
          actionType: 'UPDATE',
          entityType: 'Case',
          preview: { summary: 'Update case' },
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          status: 'PENDING',
        },
      ];

      mockApprovalGetPendingActions.mockResolvedValue(mockPendingActions);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      const result = await caller.getPendingApprovals();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('action_1');
      expect(result[0].toolName).toBe('create_case');
      expect(result[1].id).toBe('action_2');
    });

    it('should return empty array when no pending actions', async () => {
      mockApprovalGetPendingActions.mockResolvedValue([]);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      const result = await caller.getPendingApprovals();

      expect(result).toEqual([]);
    });
  });

  // ============================================
  // Get Pending Action Tests
  // ============================================

  describe('getPendingAction', () => {
    it('should return specific pending action by ID', async () => {
      const mockAction = {
        id: 'action_123',
        toolName: 'create_case',
        actionType: 'CREATE',
        entityType: 'Case',
        input: { subject: 'Test Case' },
        preview: { summary: 'Create new case' },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        status: 'PENDING',
        metadata: { priority: 'high' },
      };

      mockApprovalGetPendingAction.mockResolvedValue(mockAction);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      const result = await caller.getPendingAction({ actionId: 'action_123' });

      expect(result.id).toBe('action_123');
      expect(result.toolName).toBe('create_case');
      expect(result.input).toEqual({ subject: 'Test Case' });
    });

    it('should throw NOT_FOUND for non-existent action', async () => {
      mockApprovalGetPendingAction.mockResolvedValue(null);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      await expect(
        caller.getPendingAction({ actionId: 'non_existent' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('non_existent'),
        })
      );
    });
  });

  // ============================================
  // Approve Action Tests
  // ============================================

  describe('approveAction', () => {
    it('should approve and execute pending action', async () => {
      const mockExecutedAction = {
        id: 'action_123',
        status: 'EXECUTED',
        executedAt: new Date(),
        executionResult: { caseId: 'case_456' },
        executionError: null,
        rollbackAvailable: true,
        rollbackToken: 'rollback_xyz',
      };

      mockApprovalApproveAction.mockResolvedValue(mockExecutedAction);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      const result = await caller.approveAction({
        actionId: 'action_123',
        reason: 'Looks good',
      });

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('action_123');
      expect(result.result).toEqual({ caseId: 'case_456' });
      expect(result.rollbackAvailable).toBe(true);
      expect(result.rollbackToken).toBe('rollback_xyz');
    });

    it('should support modified input during approval', async () => {
      const mockExecutedAction = {
        id: 'action_123',
        status: 'EXECUTED',
        executedAt: new Date(),
        executionResult: { caseId: 'case_456' },
        executionError: null,
        rollbackAvailable: true,
        rollbackToken: null,
      };

      mockApprovalApproveAction.mockResolvedValue(mockExecutedAction);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      await caller.approveAction({
        actionId: 'action_123',
        modifiedInput: { subject: 'Modified Subject' },
      });

      expect(mockApprovalApproveAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionId: 'action_123',
          decision: 'APPROVE',
          modifiedInput: { subject: 'Modified Subject' },
        }),
        expect.any(Object)
      );
    });

    it('should return error when execution fails', async () => {
      const mockExecutedAction = {
        id: 'action_123',
        status: 'FAILED',
        executedAt: new Date(),
        executionResult: null,
        executionError: 'Database connection failed',
        rollbackAvailable: false,
        rollbackToken: null,
      };

      mockApprovalApproveAction.mockResolvedValue(mockExecutedAction);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      const result = await caller.approveAction({ actionId: 'action_123' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
    });
  });

  // ============================================
  // Reject Action Tests
  // ============================================

  describe('rejectAction', () => {
    it('should reject pending action with reason', async () => {
      const mockRejectedAction = {
        id: 'action_123',
        status: 'REJECTED',
        rejectedBy: TEST_UUIDS.user1,
        rejectedAt: new Date(),
      };

      mockApprovalRejectAction.mockResolvedValue(mockRejectedAction);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      const result = await caller.rejectAction({
        actionId: 'action_123',
        reason: 'Not needed',
      });

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('action_123');
      expect(result.status).toBe('REJECTED');
    });
  });

  // ============================================
  // Get Pending Count Tests
  // ============================================

  describe('getPendingCount', () => {
    it('should return count of pending actions', async () => {
      mockApprovalGetPendingActions.mockResolvedValue([
        { id: 'action_1' },
        { id: 'action_2' },
        { id: 'action_3' },
      ]);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      const result = await caller.getPendingCount();

      expect(result.count).toBe(3);
      expect(result.userId).toBe(TEST_UUIDS.user1);
    });

    it('should return zero when no pending actions', async () => {
      mockApprovalGetPendingActions.mockResolvedValue([]);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      const result = await caller.getPendingCount();

      expect(result.count).toBe(0);
    });
  });

  // ============================================
  // Authorization Tests
  // ============================================

  describe('authorization', () => {
    it('should verify tool execution authorization', async () => {
      const mockTool = {
        name: 'search_leads',
        description: 'Search leads',
        actionType: 'SEARCH',
        entityTypes: ['Lead'],
        requiresApproval: false,
        execute: vi.fn().mockResolvedValue({ success: true, data: [] }),
      };

      mockGetAgentTool.mockReturnValue(mockTool);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      await caller.executeTool({ toolName: 'search_leads', input: {} });

      expect(mockAuthorizeToolExecution).toHaveBeenCalledWith(
        mockTool,
        {},
        expect.objectContaining({
          userId: TEST_UUIDS.user1,
        })
      );
    });

    it('should log all tool executions', async () => {
      const mockTool = {
        name: 'search_leads',
        description: 'Search leads',
        actionType: 'SEARCH',
        entityTypes: ['Lead'],
        requiresApproval: false,
        execute: vi.fn().mockResolvedValue({ success: true, data: [] }),
      };

      mockGetAgentTool.mockReturnValue(mockTool);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      await caller.executeTool({ toolName: 'search_leads', input: { query: 'test' } });

      expect(mockLoggerLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: TEST_UUIDS.user1,
          toolName: 'search_leads',
          actionType: 'SEARCH',
          success: true,
          approvalRequired: false,
        })
      );
    });
  });
});
