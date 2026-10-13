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
const mockApprovalGetInterruptedActions = vi.fn().mockResolvedValue([]);
const mockApprovalApproveAction = vi.fn();
const mockApprovalRejectAction = vi.fn();
const mockPendingActionsAdd = vi.fn().mockResolvedValue(undefined);
const mockAuthorizeToolExecution = vi.fn().mockResolvedValue({ authorized: true, reason: null });
const mockLoggerLog = vi.fn().mockResolvedValue(undefined);

// Mock the agent tools module
vi.mock('../../../agent/tools', () => ({
  ToolDisabledError: class ToolDisabledError extends Error {
    constructor(toolName: string, reason: string) {
      super(`Tool ${toolName} is disabled: ${reason}`);
      this.name = 'ToolDisabledError';
    }
  },
  isToolEnabledForTenant: vi.fn().mockResolvedValue(true),
  __invalidateCache: vi.fn(),
  agentToolRegistry: new Map(),
  getForTenant: vi.fn(async ({ name }: { name: string }) => mockGetAgentTool(name)),
  getToolsByActionType: vi.fn().mockReturnValue([]),
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
    getPendingActions: (userId: string, tenantId?: string) =>
      mockApprovalGetPendingActions(userId, tenantId),
    getPendingAction: (actionId: string) => mockApprovalGetPendingAction(actionId),
    getInterruptedActions: (userId: string, tenantId?: string) =>
      mockApprovalGetInterruptedActions(userId, tenantId),
    approveAction: (decision: unknown, context: unknown, requestCtx?: unknown) =>
      mockApprovalApproveAction(decision, context, requestCtx),
    rejectAction: (decision: unknown, context: unknown) =>
      mockApprovalRejectAction(decision, context),
  },
  pendingActionsStore: {
    add: (action: unknown) => mockPendingActionsAdd(action),
    get: vi.fn(),
    remove: vi.fn(),
  },
}));

// PG-198: hasPermission stays real unless a test overrides it for one call.
const hasPermissionOverride = vi.hoisted(() => ({ next: undefined as boolean | undefined }));
vi.mock('../../../lib/rbac', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/rbac')>();
  return {
    ...actual,
    hasPermission: async (...args: Parameters<typeof actual.hasPermission>) => {
      if (hasPermissionOverride.next !== undefined) return hasPermissionOverride.next;
      return actual.hasPermission(...args);
    },
  };
});

// PG-198: approval policies (the loader is covered by approval-policy-loader.test.ts)
const builtInRule = {
  timeoutMinutes: 30,
  minReviewerRole: 'USER',
  autoApproveEnabled: false,
  autoApproveMinConfidence: null,
  escalationEnabled: false,
  escalateAfterMinutes: null,
  escalationTargetUserId: null,
};
const mockLoadApprovalPolicy = vi.fn();
const mockResolveAgentToolExpiry = vi.fn();
vi.mock('../../../agent/approval-policy-loader', () => ({
  loadApprovalPolicy: (...args: unknown[]) => mockLoadApprovalPolicy(...args),
  resolveAgentToolExpiry: (...args: unknown[]) => mockResolveAgentToolExpiry(...args),
}));

function policy(rule: Record<string, unknown>) {
  return {
    rule: { ...builtInRule, ...rule },
    policyId: 'policy-1',
    policyName: 'Strict',
    source: 'ASSIGNMENT_EXACT',
  };
}

// Note: rbac hasPermission fast-paths for ADMIN role — approve action tests
// use createAgentTestContext with admin=true to bypass DB permission checks

// Mock the authorization module
vi.mock('../../../agent/authorization', () => ({
  agentAuthorizationService: {
    authorizeToolExecution: (tool: unknown, input: unknown, context: unknown) =>
      mockAuthorizeToolExecution(tool, input, context),
  },
  buildAuthContext: (userInfo: { userId: string; role: string }, sessionId: string) => ({
    userId: userInfo.userId,
    role: userInfo.role,
    agentSessionId: sessionId,
    tenantId: '344b1756-0000-4000-8000-344b17560000',
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
function createAgentTestContext(authenticated = true, admin = false): BaseContext {
  const role = admin ? 'ADMIN' : 'USER';
  return {
    prisma: {} as any,
    // AI_INTELLIGENCE entitlement gate (ADR-070) resolves `moduleAccess` from the container.
    container: {
      get: (name: string) =>
        name === 'moduleAccess' ? { isModuleEnabled: async () => true } : undefined,
    } as any,
    services: {} as any,
    security: {} as any,
    adapters: {} as any,
    user: authenticated
      ? {
          userId: TEST_UUIDS.user1,
          email: 'test@example.com',
          role,
          tenantId: TEST_UUIDS.tenant,
          emailVerified: true,
        }
      : undefined,
    tenant: {
      tenantId: TEST_UUIDS.tenant,
      tenantType: 'user' as const,
      userId: TEST_UUIDS.user1,
      role,
      canAccessAllTenantData: admin,
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
    mockApprovalGetInterruptedActions.mockResolvedValue([]);
    mockLoadApprovalPolicy.mockResolvedValue(policy({}));
    mockResolveAgentToolExpiry.mockImplementation(
      async () => new Date(Date.now() + 30 * 60 * 1000)
    );
    // Default: a SAME-tenant pending action so the tenant-ownership guard on
    // getPendingAction / approveAction / rejectAction passes. Individual tests
    // override this for the not-found and cross-tenant cases.
    mockApprovalGetPendingAction.mockResolvedValue({
      id: 'action_123',
      tenantId: TEST_UUIDS.tenant,
    });
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
      expect(result.requiringApproval.map((t) => t.name)).toContain('create_case');
      expect(result.requiringApproval.map((t) => t.name)).toContain('create_appointment');

      // Tools not requiring approval
      expect(result.noApproval.map((t) => t.name)).toContain('search_leads');
      expect(result.noApproval.map((t) => t.name)).toContain('search_contacts');
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
      const approvalResult = result as {
        requiresApproval: boolean;
        actionId: string;
        preview: unknown;
        expiresAt: Date;
      };
      expect(approvalResult.requiresApproval).toBe(true);
      expect(approvalResult.actionId).toBeDefined();
      expect(approvalResult.preview).toBeDefined();
      expect(approvalResult.expiresAt).toBeDefined();
      expect(mockPendingActionsAdd).toHaveBeenCalled();
      expect(mockTool.execute).not.toHaveBeenCalled();
    });

    it('stores the calling agent confidence with the pending action (PG-198 RF-2)', async () => {
      mockGetAgentTool.mockReturnValue({
        name: 'create_case',
        actionType: 'CREATE',
        entityTypes: ['CASE'],
        requiresApproval: true,
        generatePreview: vi
          .fn()
          .mockResolvedValue({ summary: 'x', changes: [], affectedEntities: [] }),
        execute: vi.fn(),
      });
      const caller = agentRouter.createCaller(createAgentTestContext());

      await caller.executeTool({ toolName: 'create_case', input: {}, confidence: 0.93 });
      expect(mockPendingActionsAdd.mock.calls[0]![0]).toMatchObject({ confidence: 0.93 });

      await expect(
        caller.executeTool({ toolName: 'create_case', input: {}, confidence: 1.2 })
      ).rejects.toThrow();
    });

    it('should throw NOT_FOUND for unknown tool', async () => {
      mockGetAgentTool.mockReturnValue(undefined);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      await expect(caller.executeTool({ toolName: 'unknown_tool', input: {} })).rejects.toThrow(
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

      await expect(caller.executeTool({ toolName: 'search_leads', input: {} })).rejects.toThrow(
        TRPCError
      );
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
      // PG-198 (RF-2): no confidence supplied -> null, never an impact-derived number.
      expect(result[0]).toMatchObject({
        confidence: null,
        estimatedImpact: null,
        escalatedAt: null,
        escalatedTo: null,
        executionStatus: null,
      });
    });

    it('exposes real confidence, impact and escalation, plus interrupted executions (PG-198)', async () => {
      const escalatedAt = new Date('2026-10-13T09:00:00Z');
      mockApprovalGetPendingActions.mockResolvedValue([
        {
          id: 'action_1',
          toolName: 'create_case',
          actionType: 'CREATE',
          entityType: 'CASE',
          preview: { summary: 'Create case', estimatedImpact: 'LOW' },
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          status: 'PENDING',
          confidence: 0.957,
          escalatedAt,
          escalatedTo: 'manager-1',
        },
      ]);
      mockApprovalGetInterruptedActions.mockResolvedValue([
        {
          id: 'action_2',
          toolName: 'update_case',
          actionType: 'UPDATE',
          entityType: 'CASE',
          preview: { summary: 'Update case' },
          createdAt: new Date(),
          expiresAt: new Date(),
          status: 'APPROVED',
          executionStatus: 'EXECUTING',
        },
      ]);

      const caller = agentRouter.createCaller(createAgentTestContext());
      const result = await caller.getPendingApprovals();

      expect(result[0]).toMatchObject({
        confidence: 95,
        estimatedImpact: 'LOW',
        escalatedAt,
        escalatedTo: 'manager-1',
      });
      expect(result[1]).toMatchObject({ id: 'action_2', executionStatus: 'EXECUTING' });
      expect(mockApprovalGetInterruptedActions).toHaveBeenCalledWith(
        TEST_UUIDS.user1,
        TEST_UUIDS.tenant
      );
    });

    it('should return empty array when no pending actions', async () => {
      mockApprovalGetPendingActions.mockResolvedValue([]);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);

      const result = await caller.getPendingApprovals();

      expect(result).toEqual([]);
    });

    it("scopes the list to the caller's tenant (no cross-tenant leak)", async () => {
      // Regression: actions are stamped with the caller's tenant at creation, so
      // the list/count must query by that same tenant — not the store default.
      mockApprovalGetPendingActions.mockResolvedValue([]);

      const ctx = createAgentTestContext();
      const caller = agentRouter.createCaller(ctx);
      await caller.getPendingApprovals();

      expect(mockApprovalGetPendingActions).toHaveBeenCalledWith(
        TEST_UUIDS.user1,
        TEST_UUIDS.tenant
      );
    });
  });

  // ============================================
  // Get Pending Action Tests
  // ============================================

  describe('getPendingAction', () => {
    it('should return specific pending action by ID', async () => {
      const mockAction = {
        id: 'action_123',
        tenantId: TEST_UUIDS.tenant,
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

      await expect(caller.getPendingAction({ actionId: 'non_existent' })).rejects.toThrow(
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
        status: 'APPROVED',
        executionStatus: 'SUCCEEDED',
        executedAt: new Date(),
        executionResult: { entityType: 'CASE', entityId: 'case_456' },
        executionError: undefined,
        rollbackAvailable: false,
        rollbackToken: undefined,
      };

      mockApprovalApproveAction.mockResolvedValue(mockExecutedAction);

      // ADMIN role required — hasPermission fast-paths for ADMIN
      const ctx = createAgentTestContext(true, true);
      const caller = agentRouter.createCaller(ctx);

      const result = await caller.approveAction({
        actionId: 'action_123',
        reason: 'Looks good',
      });

      expect(result.success).toBe(true);
      expect(result.executionStatus).toBe('SUCCEEDED');
      expect(result.actionId).toBe('action_123');
      expect(result.result).toEqual({ entityType: 'CASE', entityId: 'case_456' });
      expect(result.rollbackAvailable).toBe(false);
      expect(result.rollbackToken).toBeUndefined();
      // PG-198 (RF-1): the approver's request ctx is handed to the executor.
      expect(mockApprovalApproveAction.mock.calls[0]![2]).toMatchObject({
        user: expect.objectContaining({ tenantId: TEST_UUIDS.tenant }),
      });
    });

    it('reports a failed execution as unsuccessful with its error (PG-198)', async () => {
      mockApprovalApproveAction.mockResolvedValue({
        id: 'action_123',
        status: 'APPROVED',
        executionStatus: 'FAILED',
        executionError: 'Client not found',
        rollbackAvailable: false,
      });
      const caller = agentRouter.createCaller(createAgentTestContext(true, true));

      const result = await caller.approveAction({ actionId: 'action_123' });

      expect(result).toMatchObject({
        success: false,
        executionStatus: 'FAILED',
        error: 'Client not found',
      });
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

      // ADMIN role required — hasPermission fast-paths for ADMIN
      const ctx = createAgentTestContext(true, true);
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
        expect.any(Object),
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

      // ADMIN role required — hasPermission fast-paths for ADMIN
      const ctx = createAgentTestContext(true, true);
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

      // ADMIN role required — hasPermission fast-paths for ADMIN
      const ctx = createAgentTestContext(true, true);
      const caller = agentRouter.createCaller(ctx);

      const result = await caller.rejectAction({
        actionId: 'action_123',
        reason: 'Not needed',
      });

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('action_123');
      expect(result.status).toBe('REJECTED');
    });

    it('should throw FORBIDDEN for non-admin user without reject grant', async () => {
      // RBAC gate added in M5 sweep: agent:tool-approval / reject
      // Non-admin context — hasPermission slow path with no role grants returns false
      const ctx = createAgentTestContext(true, false); // USER role, not ADMIN
      // Inject permission-table stubs so hasPermission slow path returns false
      (ctx.prisma as any).userPermission = { findFirst: vi.fn().mockResolvedValue(null) };
      (ctx.prisma as any).userRoleAssignment = { findMany: vi.fn().mockResolvedValue([]) };

      const caller = agentRouter.createCaller(ctx);

      await expect(
        caller.rejectAction({ actionId: 'action_123', reason: 'Not needed' })
      ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
    });
  });

  // ============================================
  // Tenant Isolation Tests (by-actionId guard) — IFC QA #11
  // ============================================

  describe('tenant isolation (by-actionId guard)', () => {
    const OTHER_TENANT = '99999999-0000-4000-8000-000099999999';

    const crossTenantAction = {
      id: 'action_xt',
      tenantId: OTHER_TENANT,
      toolName: 'create_case',
      actionType: 'CREATE',
      entityType: 'Case',
      input: { subject: 'another tenant secret' },
      preview: { summary: 'Create case' },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      status: 'PENDING',
    };

    it('getPendingAction returns NOT_FOUND for a cross-tenant actionId (no content leak)', async () => {
      mockApprovalGetPendingAction.mockResolvedValue(crossTenantAction);
      const caller = agentRouter.createCaller(createAgentTestContext()); // tenant = TEST_UUIDS.tenant
      await expect(caller.getPendingAction({ actionId: 'action_xt' })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
    });

    it('approveAction returns NOT_FOUND for a cross-tenant actionId and never executes', async () => {
      mockApprovalGetPendingAction.mockResolvedValue(crossTenantAction);
      const caller = agentRouter.createCaller(createAgentTestContext(true, true)); // ADMIN, own tenant
      await expect(caller.approveAction({ actionId: 'action_xt' })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
      expect(mockApprovalApproveAction).not.toHaveBeenCalled();
    });

    it('rejectAction returns NOT_FOUND for a cross-tenant actionId and never rejects', async () => {
      mockApprovalGetPendingAction.mockResolvedValue(crossTenantAction);
      const caller = agentRouter.createCaller(createAgentTestContext(true, true));
      await expect(caller.rejectAction({ actionId: 'action_xt', reason: 'no' })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
      expect(mockApprovalRejectAction).not.toHaveBeenCalled();
    });

    it('same-tenant action remains readable', async () => {
      mockApprovalGetPendingAction.mockResolvedValue({
        ...crossTenantAction,
        id: 'action_ok',
        tenantId: TEST_UUIDS.tenant,
      });
      const caller = agentRouter.createCaller(createAgentTestContext());
      const result = await caller.getPendingAction({ actionId: 'action_ok' });
      expect(result.id).toBe('action_ok');
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

  // ============================================
  // PG-198: approval policy enforcement
  // ============================================

  describe('approval policies (PG-198)', () => {
    function approvalTool(overrides: Record<string, unknown> = {}) {
      return {
        name: 'create_case',
        actionType: 'CREATE',
        entityTypes: ['CASE'],
        requiresApproval: true,
        generatePreview: vi.fn().mockResolvedValue({
          summary: 'Create case',
          changes: [],
          affectedEntities: [],
          estimatedImpact: 'LOW',
        }),
        execute: vi.fn(),
        ...overrides,
      };
    }

    it('stamps the expiry from the tenant policy (AC-008)', async () => {
      const expiry = new Date('2030-01-01T00:05:00Z');
      mockResolveAgentToolExpiry.mockResolvedValue(expiry);
      mockGetAgentTool.mockReturnValue(approvalTool());

      const caller = agentRouter.createCaller(createAgentTestContext());
      const result = (await caller.executeTool({ toolName: 'create_case', input: {} })) as any;

      expect(mockResolveAgentToolExpiry).toHaveBeenCalledWith(
        expect.anything(),
        TEST_UUIDS.tenant,
        'create_case',
        'CREATE'
      );
      expect(result.expiresAt).toEqual(expiry);
      expect(mockPendingActionsAdd.mock.calls[0]![0].expiresAt).toEqual(expiry);
    });

    it('blocks approve and reject below the policy minimum role (AC-010)', async () => {
      mockLoadApprovalPolicy.mockResolvedValue(policy({ minReviewerRole: 'ADMIN' }));
      // The reviewer holds the approve/reject permission but is only a MANAGER.
      hasPermissionOverride.next = true;
      try {
        const ctx = createAgentTestContext(true, false);
        ctx.user!.role = 'MANAGER';
        const caller = agentRouter.createCaller(ctx);

        await expect(caller.approveAction({ actionId: 'action_123' })).rejects.toMatchObject({
          code: 'FORBIDDEN',
          message: 'This action needs a reviewer with the ADMIN role or above.',
        });
        await expect(
          caller.rejectAction({ actionId: 'action_123', reason: 'no' })
        ).rejects.toMatchObject({
          code: 'FORBIDDEN',
          message: 'This action needs a reviewer with the ADMIN role or above.',
        });
        expect(mockApprovalApproveAction).not.toHaveBeenCalled();
        expect(mockApprovalRejectAction).not.toHaveBeenCalled();
      } finally {
        hasPermissionOverride.next = undefined;
      }
    });

    it('reads the policy fresh for the reviewer check and lets a qualified reviewer through', async () => {
      mockLoadApprovalPolicy.mockResolvedValue(policy({ minReviewerRole: 'ADMIN' }));
      mockApprovalApproveAction.mockResolvedValue({
        id: 'action_123',
        executionStatus: 'SUCCEEDED',
        rollbackAvailable: false,
      });
      const caller = agentRouter.createCaller(createAgentTestContext(true, true));

      await expect(caller.approveAction({ actionId: 'action_123' })).resolves.toMatchObject({
        success: true,
      });
      const call = mockLoadApprovalPolicy.mock.calls[0]!;
      expect(call[1]).toBe(TEST_UUIDS.tenant);
      expect(call[2]).toBe('AGENT_TOOL');
      expect(call[5]).toEqual({ fresh: true });
    });

    it('fails closed when the policy cannot be read for a review decision', async () => {
      mockLoadApprovalPolicy.mockRejectedValue(new Error('db down'));
      const caller = agentRouter.createCaller(createAgentTestContext(true, true));
      await expect(caller.approveAction({ actionId: 'action_123' })).rejects.toThrow();
      expect(mockApprovalApproveAction).not.toHaveBeenCalled();
    });

    describe('auto-approval (AC-013)', () => {
      const enabled = { autoApproveEnabled: true, autoApproveMinConfidence: 90 };

      it('auto-approves an eligible action as the system actor and audit-logs the decision', async () => {
        mockLoadApprovalPolicy.mockResolvedValue(policy(enabled));
        mockGetAgentTool.mockReturnValue(approvalTool());
        mockApprovalApproveAction.mockResolvedValue({
          id: 'auto-1',
          executionStatus: 'SUCCEEDED',
          executionResult: { entityType: 'CASE', entityId: 'case-1' },
        });
        const caller = agentRouter.createCaller(createAgentTestContext(true, true));

        const result = (await caller.executeTool({
          toolName: 'create_case',
          input: {},
          confidence: 0.95,
        })) as any;

        expect(result).toMatchObject({
          requiresApproval: false,
          autoApproved: true,
          policyId: 'policy-1',
          executionStatus: 'SUCCEEDED',
        });
        const [decision, , requestCtx] = mockApprovalApproveAction.mock.calls[0]!;
        expect(decision).toMatchObject({
          decision: 'APPROVE',
          decidedBy: 'system:approval-policy',
          reason: expect.stringMatching(/Auto-approved by policy "Strict"/),
        });
        expect(requestCtx).toMatchObject({ user: expect.objectContaining({ role: 'ADMIN' }) });
        const audit = mockLoggerLog.mock.calls
          .map((c) => c[0])
          .find((entry: any) => entry.metadata?.autoApproval);
        expect(audit.metadata.autoApproval).toMatchObject({
          decision: 'APPROVED',
          policyId: 'policy-1',
          threshold: 90,
          confidence: 0.95,
          requester: TEST_UUIDS.user1,
        });
      });

      it.each([
        ['no confidence', {}, undefined],
        ['confidence equal to the threshold', {}, 0.9],
        ['HIGH impact', { estimatedImpact: 'HIGH' }, 0.99],
      ])('leaves the action pending with %s', async (_label, previewPatch, confidence) => {
        mockLoadApprovalPolicy.mockResolvedValue(policy(enabled));
        mockGetAgentTool.mockReturnValue(
          approvalTool({
            generatePreview: vi.fn().mockResolvedValue({
              summary: 'Create case',
              changes: [],
              affectedEntities: [],
              estimatedImpact: 'LOW',
              ...previewPatch,
            }),
          })
        );
        const caller = agentRouter.createCaller(createAgentTestContext(true, true));

        const result = (await caller.executeTool({
          toolName: 'create_case',
          input: {},
          confidence,
        })) as any;

        expect(result.requiresApproval).toBe(true);
        expect(mockApprovalApproveAction).not.toHaveBeenCalled();
        const audit = mockLoggerLog.mock.calls
          .map((c) => c[0])
          .find((entry: any) => entry.metadata?.autoApproval);
        expect(audit.metadata.autoApproval.decision).toBe('LEFT_FOR_REVIEW');
      });

      it('never auto-approves an email draft', async () => {
        mockLoadApprovalPolicy.mockResolvedValue(policy(enabled));
        mockGetAgentTool.mockReturnValue(
          approvalTool({ name: 'draft_message', actionType: 'DRAFT', entityTypes: ['MESSAGE'] })
        );
        const caller = agentRouter.createCaller(createAgentTestContext(true, true));

        const result = (await caller.executeTool({
          toolName: 'draft_message',
          input: { type: 'EMAIL' },
          confidence: 0.99,
        })) as any;

        expect(result.requiresApproval).toBe(true);
        expect(mockApprovalApproveAction).not.toHaveBeenCalled();
      });

      it('does not auto-approve for a requester below the policy minimum role (BR-6)', async () => {
        mockLoadApprovalPolicy.mockResolvedValue(
          policy({ ...enabled, minReviewerRole: 'MANAGER' })
        );
        mockGetAgentTool.mockReturnValue(approvalTool());
        hasPermissionOverride.next = true;
        try {
          const ctx = createAgentTestContext(true, false);
          ctx.user!.role = 'SALES_REP';
          const caller = agentRouter.createCaller(ctx);

          const result = (await caller.executeTool({
            toolName: 'create_case',
            input: {},
            confidence: 0.99,
          })) as any;

          expect(result.requiresApproval).toBe(true);
          expect(mockApprovalApproveAction).not.toHaveBeenCalled();
          const audit = mockLoggerLog.mock.calls
            .map((c) => c[0])
            .find((entry: any) => entry.metadata?.autoApproval);
          expect(audit.metadata.autoApproval.reason).toMatch(/below MANAGER/);
        } finally {
          hasPermissionOverride.next = undefined;
        }
      });

      it('skips auto-approval entirely when the policy is off', async () => {
        mockGetAgentTool.mockReturnValue(approvalTool());
        const caller = agentRouter.createCaller(createAgentTestContext(true, true));

        await caller.executeTool({ toolName: 'create_case', input: {}, confidence: 0.99 });

        expect(mockApprovalApproveAction).not.toHaveBeenCalled();
        expect(mockLoggerLog.mock.calls.some((c) => (c[0] as any).metadata?.autoApproval)).toBe(
          false
        );
      });

      it('fails closed: a policy read error leaves the action pending', async () => {
        mockLoadApprovalPolicy.mockRejectedValue(new Error('db down'));
        mockGetAgentTool.mockReturnValue(approvalTool());
        const caller = agentRouter.createCaller(createAgentTestContext(true, true));

        const result = (await caller.executeTool({
          toolName: 'create_case',
          input: {},
          confidence: 0.99,
        })) as any;

        expect(result.requiresApproval).toBe(true);
        expect(mockApprovalApproveAction).not.toHaveBeenCalled();
      });

      it('leaves the action pending when the approval is refused before the claim', async () => {
        mockLoadApprovalPolicy.mockResolvedValue(policy(enabled));
        mockGetAgentTool.mockReturnValue(approvalTool());
        mockApprovalApproveAction.mockRejectedValue(new Error('not valid for create_case'));
        const caller = agentRouter.createCaller(createAgentTestContext(true, true));

        const result = (await caller.executeTool({
          toolName: 'create_case',
          input: {},
          confidence: 0.99,
        })) as any;

        expect(result.requiresApproval).toBe(true);
      });
    });
  });
});
