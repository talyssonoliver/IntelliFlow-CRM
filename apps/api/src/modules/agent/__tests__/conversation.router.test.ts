/**
 * Conversation Router Tests (IFC-148)
 *
 * Comprehensive tests for AI conversation record management:
 * - CRUD operations (create, getById, getBySessionId, search)
 * - Message management (addMessage)
 * - Tool call workflow (recordToolCall, updateToolCall, approveToolCall)
 * - Escalation (escalate, endConversation)
 * - Access control and tenant isolation
 * - Privacy controls and GDPR compliance
 * - Admin operations (analytics, archiveOld)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { conversationRouter } from '../conversation.router';
import {
  prismaMock,
  createTestContext,
} from '../../../test/setup';

// Test UUIDs for consistent testing
const TEST_CONVERSATION_ID = 'conv-test-123';
const TEST_SESSION_ID = 'session-test-456';
const TEST_MESSAGE_ID = 'msg-test-789';
const TEST_TOOL_CALL_ID = 'tool-test-012';
const TEST_TENANT_ID = 'test-tenant-id';
const TEST_USER_ID = 'test-user-id';
const TEST_OTHER_TENANT_ID = 'other-tenant-id';

// Mock conversation record with proper enum types
const mockConversation = {
  id: TEST_CONVERSATION_ID,
  tenantId: TEST_TENANT_ID,
  sessionId: TEST_SESSION_ID,
  userId: TEST_USER_ID,
  userName: 'Test User',
  agentId: 'agent-001',
  agentName: 'Support Agent',
  agentModel: 'gpt-4',
  title: 'Test Conversation',
  summary: null,
  contextType: 'ticket',
  contextId: 'ticket-123',
  contextName: 'Support Ticket #123',
  channel: 'WEB_CHAT' as const,
  status: 'ACTIVE' as const,
  messageCount: 0,
  toolCallCount: 0,
  tokenCountInput: 0,
  tokenCountOutput: 0,
  estimatedCost: null,
  userRating: null,
  feedbackText: null,
  wasEscalated: false,
  escalatedTo: null,
  escalatedAt: null,
  endReason: null,
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0',
  traceId: 'trace-123',
  retentionExpiresAt: null,
  startedAt: new Date(),
  lastMessageAt: null,
  endedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  embedding: null,
  messages: [] as any[],
  toolCalls: [] as any[],
};

// Mock message record with proper enum types
const mockMessage = {
  id: TEST_MESSAGE_ID,
  conversationId: TEST_CONVERSATION_ID,
  role: 'USER' as const,
  content: 'Hello, I need help',
  contentType: 'text',
  metadata: null,
  modelUsed: null,
  finishReason: null,
  tokenCount: 10,
  promptTokens: null,
  completionTokens: null,
  confidence: null,
  isEdited: false,
  editedContent: null,
  editedAt: null,
  editedBy: null,
  attachments: null,
  embedding: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  toolCalls: [] as any[],
};

// Mock tool call record with proper enum types
const mockToolCall = {
  id: TEST_TOOL_CALL_ID,
  conversationId: TEST_CONVERSATION_ID,
  messageId: null,
  toolName: 'searchLeads',
  toolType: 'SEARCH' as const,
  toolVersion: '1.0',
  toolInput: { query: 'test' },
  toolOutput: null,
  inputParameters: { query: 'test' },
  outputResult: null,
  status: 'PENDING' as const,
  duration: null,
  durationMs: null,
  errorMessage: null,
  errorCode: null,
  requiresApproval: true,
  isReversible: false,
  approvalStatus: 'PENDING' as const,
  approvedBy: null,
  approvedAt: null,
  rejectionReason: null,
  affectedEntity: null,
  affectedEntityType: null,
  affectedEntityId: null,
  changeDescription: null,
  rollbackData: null,
  wasRolledBack: false,
  rolledBackAt: null,
  rolledBackBy: null,
  startedAt: new Date(),
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Conversation Router', () => {
  const ctx = createTestContext();
  const caller = conversationRouter.createCaller(ctx);

  beforeEach(() => {
    // Reset mocks and set default responses
    vi.clearAllMocks();

    // Default mock for conversationRecord
    prismaMock.conversationRecord.findMany.mockResolvedValue([]);
    prismaMock.conversationRecord.count.mockResolvedValue(0);
    prismaMock.conversationRecord.findFirst.mockResolvedValue(null);
    prismaMock.conversationRecord.findUnique.mockResolvedValue(null);
  });

  // ============================================
  // CREATE TESTS
  // ============================================
  describe('create', () => {
    it('should create a new conversation with minimal input', async () => {
      prismaMock.conversationRecord.create.mockResolvedValue(mockConversation);

      const result = await caller.create({});

      expect(result.id).toBe(TEST_CONVERSATION_ID);
      expect(result.tenantId).toBe(TEST_TENANT_ID);
      expect(result.status).toBe('ACTIVE');
      expect(prismaMock.conversationRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            status: 'ACTIVE',
          }),
        })
      );
    });

    it('should create a conversation with full context', async () => {
      const input = {
        sessionId: 'custom-session',
        title: 'Support Request',
        agentId: 'agent-001',
        agentName: 'Support Bot',
        agentModel: 'gpt-4-turbo',
        contextType: 'ticket',
        contextId: 'ticket-456',
        contextName: 'Billing Issue',
        channel: 'SLACK' as const,
      };

      prismaMock.conversationRecord.create.mockResolvedValue({
        ...mockConversation,
        ...input,
      });

      const result = await caller.create(input);

      expect(result.sessionId).toBe(input.sessionId);
      expect(result.title).toBe(input.title);
      expect(result.channel).toBe('SLACK');
      expect(result.contextType).toBe('ticket');
    });

    it('should auto-generate sessionId if not provided', async () => {
      prismaMock.conversationRecord.create.mockResolvedValue(mockConversation);

      await caller.create({});

      expect(prismaMock.conversationRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: expect.stringMatching(/^conv_\d+_[a-z0-9]+$/),
          }),
        })
      );
    });
  });

  // ============================================
  // GET BY ID TESTS
  // ============================================
  describe('getById', () => {
    it('should return conversation with messages and tool calls', async () => {
      const conversationWithDetails = {
        ...mockConversation,
        messages: [mockMessage],
        toolCalls: [mockToolCall],
      };

      prismaMock.conversationRecord.findFirst.mockResolvedValue(conversationWithDetails);

      const result = await caller.getById({ id: TEST_CONVERSATION_ID });

      expect(result.id).toBe(TEST_CONVERSATION_ID);
      expect(result.messages).toHaveLength(1);
      expect(result.toolCalls).toHaveLength(1);
    });

    it('should throw NOT_FOUND for non-existent conversation', async () => {
      prismaMock.conversationRecord.findFirst.mockResolvedValue(null);

      await expect(
        caller.getById({ id: 'non-existent' })
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.getById({ id: 'non-existent' })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('should enforce tenant isolation', async () => {
      prismaMock.conversationRecord.findFirst.mockResolvedValue(mockConversation);

      await caller.getById({ id: TEST_CONVERSATION_ID });

      expect(prismaMock.conversationRecord.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TEST_TENANT_ID,
          }),
        })
      );
    });

    it('should exclude deleted conversations', async () => {
      prismaMock.conversationRecord.findFirst.mockResolvedValue(mockConversation);

      await caller.getById({ id: TEST_CONVERSATION_ID });

      expect(prismaMock.conversationRecord.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { not: 'DELETED' },
          }),
        })
      );
    });
  });

  // ============================================
  // GET BY SESSION ID TESTS
  // ============================================
  describe('getBySessionId', () => {
    it('should return conversation by session ID', async () => {
      prismaMock.conversationRecord.findFirst.mockResolvedValue(mockConversation);

      const result = await caller.getBySessionId({ sessionId: TEST_SESSION_ID });

      expect(result?.id).toBe(TEST_CONVERSATION_ID);
      expect(result?.sessionId).toBe(TEST_SESSION_ID);
    });

    it('should return null for non-existent session', async () => {
      prismaMock.conversationRecord.findFirst.mockResolvedValue(null);

      const result = await caller.getBySessionId({ sessionId: 'non-existent' });

      expect(result).toBeNull();
    });
  });

  // ============================================
  // SEARCH TESTS
  // ============================================
  describe('search', () => {
    it('should return paginated results', async () => {
      const conversations = [mockConversation];
      prismaMock.conversationRecord.findMany.mockResolvedValue(conversations);
      prismaMock.conversationRecord.count.mockResolvedValue(10);

      const result = await caller.search({ limit: 20, offset: 0 });

      expect(result.conversations).toHaveLength(1);
      expect(result.total).toBe(10);
      expect(result.hasMore).toBe(true);
    });

    it('should filter by status', async () => {
      prismaMock.conversationRecord.findMany.mockResolvedValue([]);
      prismaMock.conversationRecord.count.mockResolvedValue(0);

      await caller.search({ status: 'ACTIVE' });

      expect(prismaMock.conversationRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
          }),
        })
      );
    });

    it('should filter by context type and ID', async () => {
      prismaMock.conversationRecord.findMany.mockResolvedValue([]);
      prismaMock.conversationRecord.count.mockResolvedValue(0);

      await caller.search({
        contextType: 'ticket',
        contextId: 'ticket-123',
      });

      expect(prismaMock.conversationRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            contextType: 'ticket',
            contextId: 'ticket-123',
          }),
        })
      );
    });

    it('should filter by date range', async () => {
      prismaMock.conversationRecord.findMany.mockResolvedValue([]);
      prismaMock.conversationRecord.count.mockResolvedValue(0);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      await caller.search({ startDate, endDate });

      expect(prismaMock.conversationRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startedAt: {
              gte: startDate,
              lte: endDate,
            },
          }),
        })
      );
    });

    it('should search by text query', async () => {
      prismaMock.conversationRecord.findMany.mockResolvedValue([]);
      prismaMock.conversationRecord.count.mockResolvedValue(0);

      await caller.search({ searchQuery: 'billing issue' });

      expect(prismaMock.conversationRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { title: { contains: 'billing issue', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });

    it('should enforce tenant isolation in search', async () => {
      prismaMock.conversationRecord.findMany.mockResolvedValue([]);
      prismaMock.conversationRecord.count.mockResolvedValue(0);

      await caller.search({});

      expect(prismaMock.conversationRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TEST_TENANT_ID,
          }),
        })
      );
    });
  });

  // ============================================
  // ADD MESSAGE TESTS
  // ============================================
  describe('addMessage', () => {
    it('should add a user message', async () => {
      prismaMock.conversationRecord.findFirst.mockResolvedValue(mockConversation);
      prismaMock.messageRecord.create.mockResolvedValue(mockMessage);
      prismaMock.conversationRecord.update.mockResolvedValue({
        ...mockConversation,
        messageCount: 1,
      });
      prismaMock.$transaction.mockImplementation(async (fn) => {
        if (typeof fn === 'function') {
          return fn(prismaMock);
        }
        return fn;
      });

      const result = await caller.addMessage({
        conversationId: TEST_CONVERSATION_ID,
        role: 'USER',
        content: 'Hello, I need help',
      });

      expect(result.id).toBe(TEST_MESSAGE_ID);
      expect(result.role).toBe('USER');
    });

    it('should throw NOT_FOUND for inactive conversation', async () => {
      prismaMock.conversationRecord.findFirst.mockResolvedValue(null);

      await expect(
        caller.addMessage({
          conversationId: TEST_CONVERSATION_ID,
          role: 'USER',
          content: 'Test',
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should update conversation metrics after adding message', async () => {
      prismaMock.conversationRecord.findFirst.mockResolvedValue(mockConversation);
      prismaMock.messageRecord.create.mockResolvedValue(mockMessage);
      prismaMock.conversationRecord.update.mockResolvedValue({
        ...mockConversation,
        messageCount: 1,
      });
      prismaMock.$transaction.mockImplementation(async (fn) => {
        if (typeof fn === 'function') {
          return fn(prismaMock);
        }
        return fn;
      });

      await caller.addMessage({
        conversationId: TEST_CONVERSATION_ID,
        role: 'ASSISTANT',
        content: 'Hello!',
        tokenCount: 5,
        promptTokens: 10,
        completionTokens: 5,
      });

      // Verify transaction was called
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });
  });

  // ============================================
  // TOOL CALL TESTS
  // ============================================
  describe('recordToolCall', () => {
    it('should record a tool call', async () => {
      prismaMock.conversationRecord.findFirst.mockResolvedValue(mockConversation);
      prismaMock.toolCallRecord.create.mockResolvedValue(mockToolCall);
      prismaMock.conversationRecord.update.mockResolvedValue({
        ...mockConversation,
        toolCallCount: 1,
      });
      prismaMock.$transaction.mockImplementation(async (fn) => {
        if (typeof fn === 'function') {
          return fn(prismaMock);
        }
        return fn;
      });

      const result = await caller.recordToolCall({
        conversationId: TEST_CONVERSATION_ID,
        toolName: 'searchLeads',
        toolType: 'SEARCH',
        inputParameters: { query: 'test' },
        requiresApproval: true,
      });

      expect(result.id).toBe(TEST_TOOL_CALL_ID);
      expect(result.status).toBe('PENDING');
      expect(result.requiresApproval).toBe(true);
    });

    it('should set status to RUNNING if no approval required', async () => {
      prismaMock.conversationRecord.findFirst.mockResolvedValue(mockConversation);
      prismaMock.toolCallRecord.create.mockResolvedValue({
        ...mockToolCall,
        requiresApproval: false,
        approvalStatus: null,
        status: 'RUNNING',
      });
      prismaMock.conversationRecord.update.mockResolvedValue({
        ...mockConversation,
        toolCallCount: 1,
      });
      prismaMock.$transaction.mockImplementation(async (fn) => {
        if (typeof fn === 'function') {
          return fn(prismaMock);
        }
        return fn;
      });

      const result = await caller.recordToolCall({
        conversationId: TEST_CONVERSATION_ID,
        toolName: 'readDocument',
        toolType: 'READ',
        inputParameters: { docId: '123' },
        requiresApproval: false,
      });

      expect(result.status).toBe('RUNNING');
    });
  });

  describe('updateToolCall', () => {
    it('should update tool call status', async () => {
      prismaMock.toolCallRecord.findFirst.mockResolvedValue({
        ...mockToolCall,
        conversation: mockConversation,
      } as any);
      prismaMock.toolCallRecord.update.mockResolvedValue({
        ...mockToolCall,
        status: 'SUCCESS' as const,
        outputResult: { results: [] },
        durationMs: 150,
      });

      const result = await caller.updateToolCall({
        id: TEST_TOOL_CALL_ID,
        status: 'SUCCESS',
        outputResult: { results: [] },
        durationMs: 150,
      });

      expect(result.status).toBe('SUCCESS');
      expect(result.durationMs).toBe(150);
    });

    it('should throw NOT_FOUND for non-existent tool call', async () => {
      prismaMock.toolCallRecord.findFirst.mockResolvedValue(null);

      await expect(
        caller.updateToolCall({
          id: 'non-existent',
          status: 'SUCCESS',
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('approveToolCall', () => {
    it('should approve a pending tool call', async () => {
      prismaMock.toolCallRecord.findFirst.mockResolvedValue({
        ...mockToolCall,
        conversation: mockConversation,
      } as any);
      prismaMock.toolCallRecord.update.mockResolvedValue({
        ...mockToolCall,
        approvalStatus: 'APPROVED' as const,
        status: 'RUNNING' as const,
        approvedBy: TEST_USER_ID,
        approvedAt: new Date(),
      });

      const result = await caller.approveToolCall({
        id: TEST_TOOL_CALL_ID,
        approved: true,
      });

      expect(result.approvalStatus).toBe('APPROVED');
      expect(result.status).toBe('RUNNING');
    });

    it('should reject a pending tool call with reason', async () => {
      prismaMock.toolCallRecord.findFirst.mockResolvedValue({
        ...mockToolCall,
        conversation: mockConversation,
      } as any);
      prismaMock.toolCallRecord.update.mockResolvedValue({
        ...mockToolCall,
        approvalStatus: 'REJECTED' as const,
        status: 'CANCELLED' as const,
        rejectionReason: 'Action not authorized',
      });

      const result = await caller.approveToolCall({
        id: TEST_TOOL_CALL_ID,
        approved: false,
        reason: 'Action not authorized',
      });

      expect(result.approvalStatus).toBe('REJECTED');
      expect(result.status).toBe('CANCELLED');
    });

    it('should throw NOT_FOUND for non-pending tool call', async () => {
      prismaMock.toolCallRecord.findFirst.mockResolvedValue(null);

      await expect(
        caller.approveToolCall({
          id: TEST_TOOL_CALL_ID,
          approved: true,
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================
  // END CONVERSATION TESTS
  // ============================================
  describe('endConversation', () => {
    it('should end an active conversation', async () => {
      prismaMock.conversationRecord.findFirst.mockResolvedValue(mockConversation);
      prismaMock.conversationRecord.update.mockResolvedValue({
        ...mockConversation,
        status: 'ENDED',
        endedAt: new Date(),
        endReason: 'user_ended',
      });

      const result = await caller.endConversation({
        id: TEST_CONVERSATION_ID,
      });

      expect(result.status).toBe('ENDED');
      expect(result.endedAt).toBeDefined();
    });

    it('should accept user rating and feedback', async () => {
      prismaMock.conversationRecord.findFirst.mockResolvedValue(mockConversation);
      prismaMock.conversationRecord.update.mockResolvedValue({
        ...mockConversation,
        status: 'ENDED',
        userRating: 5,
        feedbackText: 'Great help!',
      });

      const result = await caller.endConversation({
        id: TEST_CONVERSATION_ID,
        userRating: 5,
        feedbackText: 'Great help!',
      });

      expect(result.userRating).toBe(5);
      expect(result.feedbackText).toBe('Great help!');
    });

    it('should throw NOT_FOUND for inactive conversation', async () => {
      prismaMock.conversationRecord.findFirst.mockResolvedValue(null);

      await expect(
        caller.endConversation({ id: TEST_CONVERSATION_ID })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================
  // ESCALATION TESTS
  // ============================================
  describe('escalate', () => {
    it('should escalate conversation to human support', async () => {
      prismaMock.conversationRecord.findFirst.mockResolvedValue(mockConversation);
      prismaMock.conversationRecord.update.mockResolvedValue({
        ...mockConversation,
        wasEscalated: true,
        escalatedTo: 'support-team',
        escalatedAt: new Date(),
      });

      const result = await caller.escalate({
        id: TEST_CONVERSATION_ID,
        escalateTo: 'support-team',
        reason: 'Complex issue',
      });

      expect(result.wasEscalated).toBe(true);
      expect(result.escalatedTo).toBe('support-team');
    });
  });

  // ============================================
  // PENDING APPROVALS TESTS
  // ============================================
  describe('getPendingApprovals', () => {
    it('should return pending tool calls', async () => {
      prismaMock.toolCallRecord.findMany.mockResolvedValue([
        {
          ...mockToolCall,
          conversation: mockConversation,
        } as any,
      ]);

      const result = await caller.getPendingApprovals({ limit: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].requiresApproval).toBe(true);
      expect(result[0].approvalStatus).toBe('PENDING');
    });

    it('should enforce tenant isolation', async () => {
      prismaMock.toolCallRecord.findMany.mockResolvedValue([]);

      await caller.getPendingApprovals({});

      expect(prismaMock.toolCallRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            conversation: {
              tenantId: TEST_TENANT_ID,
            },
          }),
        })
      );
    });
  });

  // ============================================
  // ADMIN OPERATIONS TESTS
  // ============================================
  describe('getAnalytics (admin)', () => {
    it('should return conversation analytics', async () => {
      // Create admin context
      const adminCtx = createTestContext({
        user: {
          userId: TEST_USER_ID,
          email: 'admin@example.com',
          role: 'ADMIN',
          tenantId: TEST_TENANT_ID,
        },
      });
      const adminCaller = conversationRouter.createCaller(adminCtx);

      prismaMock.conversationRecord.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(10)  // active
        .mockResolvedValueOnce(5);  // escalated

      (prismaMock.conversationRecord.aggregate as any)
        .mockResolvedValueOnce({ _avg: { messageCount: 15 } })
        .mockResolvedValueOnce({ _avg: { userRating: 4.5 } });

      (prismaMock.toolCallRecord.groupBy as any).mockResolvedValue([
        { toolType: 'SEARCH', _count: 50 },
        { toolType: 'CREATE', _count: 20 },
      ]);

      const result = await adminCaller.getAnalytics({});

      expect(result.totalConversations).toBe(100);
      expect(result.activeConversations).toBe(10);
      expect(result.escalatedConversations).toBe(5);
      expect(result.avgMessagesPerConversation).toBe(15);
    });
  });

  describe('archiveOld (admin)', () => {
    it('should archive old ended conversations', async () => {
      const adminCtx = createTestContext({
        user: {
          userId: TEST_USER_ID,
          email: 'admin@example.com',
          role: 'ADMIN',
          tenantId: TEST_TENANT_ID,
        },
      });
      const adminCaller = conversationRouter.createCaller(adminCtx);

      prismaMock.conversationRecord.updateMany.mockResolvedValue({ count: 25 });

      const result = await adminCaller.archiveOld({ olderThanDays: 90 });

      expect(result.archivedCount).toBe(25);
    });
  });

  // ============================================
  // PRIVACY & ACCESS CONTROL TESTS
  // ============================================
  describe('Privacy Controls', () => {
    it('should capture IP address and user agent on create', async () => {
      const ctxWithHeaders = createTestContext({
        req: {
          headers: {
            get: (name: string) => {
              if (name === 'x-forwarded-for') return '10.0.0.1';
              if (name === 'user-agent') return 'TestAgent/1.0';
              return null;
            },
          },
        } as any,
      });
      const callerWithHeaders = conversationRouter.createCaller(ctxWithHeaders);

      prismaMock.conversationRecord.create.mockResolvedValue({
        ...mockConversation,
        ipAddress: '10.0.0.1',
        userAgent: 'TestAgent/1.0',
      });

      const result = await callerWithHeaders.create({});

      expect(prismaMock.conversationRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ipAddress: '10.0.0.1',
            userAgent: 'TestAgent/1.0',
          }),
        })
      );
    });

    it('should not return conversations from other tenants', async () => {
      // Mock returns empty because tenant filter excludes other tenant's data
      prismaMock.conversationRecord.findFirst.mockResolvedValue(null);

      await expect(
        caller.getById({ id: TEST_CONVERSATION_ID })
      ).rejects.toThrow(TRPCError);

      // Verify tenant filter was applied
      expect(prismaMock.conversationRecord.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TEST_TENANT_ID,
          }),
        })
      );
    });

    it('should filter search results by tenant', async () => {
      prismaMock.conversationRecord.findMany.mockResolvedValue([]);
      prismaMock.conversationRecord.count.mockResolvedValue(0);

      await caller.search({});

      expect(prismaMock.conversationRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TEST_TENANT_ID,
          }),
        })
      );
    });
  });

  // ============================================
  // RETENTION TESTS
  // ============================================
  describe('Data Retention', () => {
    it('should exclude deleted conversations from getById', async () => {
      prismaMock.conversationRecord.findFirst.mockResolvedValue(mockConversation);

      await caller.getById({ id: TEST_CONVERSATION_ID });

      expect(prismaMock.conversationRecord.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { not: 'DELETED' },
          }),
        })
      );
    });

    it('should exclude deleted conversations from search by default', async () => {
      prismaMock.conversationRecord.findMany.mockResolvedValue([]);
      prismaMock.conversationRecord.count.mockResolvedValue(0);

      await caller.search({});

      expect(prismaMock.conversationRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { not: 'DELETED' },
          }),
        })
      );
    });
  });
});
