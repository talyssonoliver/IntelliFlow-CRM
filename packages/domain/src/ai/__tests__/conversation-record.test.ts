/**
 * Conversation Record Domain Tests (IFC-148)
 *
 * Validates:
 * - All const arrays contain expected enum values
 * - Types derived from const arrays are correct
 * - Data interfaces accept valid shapes
 * - Repository interface contract is defined
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import {
  CONVERSATION_STATUSES,
  CONVERSATION_CHANNELS,
  MESSAGE_ROLES,
  TOOL_TYPES,
  TOOL_CALL_STATUSES,
  APPROVAL_STATUSES,
  type ConversationStatus,
  type ConversationChannel,
  type MessageRole,
  type ToolType,
  type ToolCallStatus,
  type ApprovalStatus,
  type ConversationRecordData,
  type MessageRecordData,
  type MessageRecordWithConversation,
  type ToolCallRecordData,
  type ConversationRecordRepository,
} from '../conversation-record';

// =============================================================================
// Const Array Completeness Tests
// =============================================================================

describe('CONVERSATION_STATUSES', () => {
  it('should contain all expected statuses', () => {
    expect(CONVERSATION_STATUSES).toEqual(['ACTIVE', 'PAUSED', 'ENDED', 'ARCHIVED', 'DELETED']);
  });

  it('should be a const tuple (readonly at type level)', () => {
    // `as const` provides compile-time readonly — verify the array is not accidentally mutated
    const original = [...CONVERSATION_STATUSES];
    expect(CONVERSATION_STATUSES).toEqual(original);
  });

  it('should have 5 values', () => {
    expect(CONVERSATION_STATUSES).toHaveLength(5);
  });
});

describe('CONVERSATION_CHANNELS', () => {
  it('should contain all expected channels', () => {
    expect(CONVERSATION_CHANNELS).toEqual([
      'WEB_CHAT',
      'MOBILE_APP',
      'API',
      'SLACK',
      'TEAMS',
      'EMAIL',
      'VOICE',
    ]);
  });

  it('should have 7 values', () => {
    expect(CONVERSATION_CHANNELS).toHaveLength(7);
  });
});

describe('MESSAGE_ROLES', () => {
  it('should contain all expected roles', () => {
    expect(MESSAGE_ROLES).toEqual(['USER', 'ASSISTANT', 'SYSTEM', 'TOOL']);
  });

  it('should have 4 values', () => {
    expect(MESSAGE_ROLES).toHaveLength(4);
  });
});

describe('TOOL_TYPES', () => {
  it('should contain all expected tool types', () => {
    expect(TOOL_TYPES).toEqual([
      'SEARCH',
      'READ',
      'CREATE',
      'UPDATE',
      'DELETE',
      'EXECUTE',
      'INTEGRATION',
    ]);
  });

  it('should have 7 values', () => {
    expect(TOOL_TYPES).toHaveLength(7);
  });
});

describe('TOOL_CALL_STATUSES', () => {
  it('should contain all expected statuses', () => {
    expect(TOOL_CALL_STATUSES).toEqual([
      'PENDING',
      'RUNNING',
      'SUCCESS',
      'FAILED',
      'CANCELLED',
      'TIMEOUT',
    ]);
  });

  it('should have 6 values', () => {
    expect(TOOL_CALL_STATUSES).toHaveLength(6);
  });
});

describe('APPROVAL_STATUSES', () => {
  it('should contain all expected statuses', () => {
    expect(APPROVAL_STATUSES).toEqual(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']);
  });

  it('should have 4 values', () => {
    expect(APPROVAL_STATUSES).toHaveLength(4);
  });
});

// =============================================================================
// Type Derivation Tests (compile-time + runtime assertions)
// =============================================================================

describe('Type derivations', () => {
  it('ConversationStatus should accept valid values', () => {
    const status: ConversationStatus = 'ACTIVE';
    expect(CONVERSATION_STATUSES).toContain(status);
  });

  it('ConversationChannel should accept valid values', () => {
    const channel: ConversationChannel = 'WEB_CHAT';
    expect(CONVERSATION_CHANNELS).toContain(channel);
  });

  it('MessageRole should accept valid values', () => {
    const role: MessageRole = 'ASSISTANT';
    expect(MESSAGE_ROLES).toContain(role);
  });

  it('ToolType should accept valid values', () => {
    const type: ToolType = 'SEARCH';
    expect(TOOL_TYPES).toContain(type);
  });

  it('ToolCallStatus should accept valid values', () => {
    const status: ToolCallStatus = 'SUCCESS';
    expect(TOOL_CALL_STATUSES).toContain(status);
  });

  it('ApprovalStatus should accept valid values', () => {
    const status: ApprovalStatus = 'APPROVED';
    expect(APPROVAL_STATUSES).toContain(status);
  });
});

// =============================================================================
// Data Interface Shape Tests
// =============================================================================

describe('ConversationRecordData', () => {
  const validConversation: ConversationRecordData = {
    id: 'conv-001',
    sessionId: 'session-abc',
    tenantId: 'tenant-123',
    userId: 'user-456',
    title: 'Test Conversation',
    summary: 'A test conversation summary',
    contextName: 'Support Ticket #42',
    contextType: 'ticket',
    contextId: 'ticket-42',
    agentId: 'agent-001',
    agentName: 'Support Bot',
    agentModel: 'gpt-4',
    userName: 'John Doe',
    userAgent: 'Mozilla/5.0',
    channel: 'WEB_CHAT',
    messageCount: 10,
    toolCallCount: 3,
    tokenCountInput: 500,
    tokenCountOutput: 800,
    status: 'ACTIVE',
    startedAt: new Date('2026-01-15T10:00:00Z'),
    endedAt: null,
    lastMessageAt: new Date('2026-01-15T10:05:00Z'),
    endReason: null,
    userRating: null,
    feedbackText: null,
    wasEscalated: false,
    escalatedTo: null,
    escalatedAt: null,
    ipAddress: '192.168.1.1',
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-01-15T10:05:00Z'),
  };

  it('should accept a valid conversation record', () => {
    expect(validConversation.id).toBe('conv-001');
    expect(validConversation.sessionId).toBe('session-abc');
    expect(validConversation.tenantId).toBe('tenant-123');
    expect(validConversation.userId).toBe('user-456');
    expect(validConversation.status).toBe('ACTIVE');
    expect(validConversation.wasEscalated).toBe(false);
    expect(validConversation.messageCount).toBe(10);
  });

  it('should support nullable fields', () => {
    const minimal: ConversationRecordData = {
      ...validConversation,
      title: null,
      summary: null,
      contextName: null,
      contextType: null,
      contextId: null,
      agentId: null,
      agentName: null,
      agentModel: null,
      userName: null,
      userAgent: null,
      tokenCountInput: null,
      tokenCountOutput: null,
      endedAt: null,
      lastMessageAt: null,
      endReason: null,
      userRating: null,
      feedbackText: null,
      escalatedTo: null,
      escalatedAt: null,
      ipAddress: null,
    };
    expect(minimal.title).toBeNull();
    expect(minimal.agentName).toBeNull();
    expect(minimal.tokenCountInput).toBeNull();
  });

  it('should support escalation fields', () => {
    const escalated: ConversationRecordData = {
      ...validConversation,
      wasEscalated: true,
      escalatedTo: 'human-agent-001',
      escalatedAt: new Date('2026-01-15T10:10:00Z'),
      endReason: 'escalated',
      status: 'ENDED',
      endedAt: new Date('2026-01-15T10:10:00Z'),
    };
    expect(escalated.wasEscalated).toBe(true);
    expect(escalated.escalatedTo).toBe('human-agent-001');
  });

  it('should support rating and feedback', () => {
    const rated: ConversationRecordData = {
      ...validConversation,
      userRating: 4,
      feedbackText: 'Very helpful!',
      status: 'ENDED',
      endedAt: new Date(),
    };
    expect(rated.userRating).toBe(4);
    expect(rated.feedbackText).toBe('Very helpful!');
  });
});

describe('MessageRecordData', () => {
  const validMessage: MessageRecordData = {
    id: 'msg-001',
    conversationId: 'conv-001',
    tenantId: 'tenant-123',
    role: 'ASSISTANT',
    content: 'Hello! How can I help you?',
    contentType: 'text',
    metadata: null,
    attachments: null,
    modelUsed: 'gpt-4',
    finishReason: 'stop',
    tokenCount: 15,
    promptTokens: 50,
    completionTokens: 15,
    confidence: 0.95,
    createdAt: new Date('2026-01-15T10:01:00Z'),
  };

  it('should accept a valid message record', () => {
    expect(validMessage.id).toBe('msg-001');
    expect(validMessage.role).toBe('ASSISTANT');
    expect(validMessage.confidence).toBe(0.95);
  });

  it('should support user messages without model fields', () => {
    const userMsg: MessageRecordData = {
      ...validMessage,
      role: 'USER',
      content: 'I need help with my order',
      modelUsed: null,
      finishReason: null,
      promptTokens: null,
      completionTokens: null,
      confidence: null,
    };
    expect(userMsg.role).toBe('USER');
    expect(userMsg.modelUsed).toBeNull();
  });
});

describe('MessageRecordWithConversation', () => {
  it('should extend MessageRecordData with conversation relation', () => {
    const msgWithConv: MessageRecordWithConversation = {
      id: 'msg-001',
      conversationId: 'conv-001',
      tenantId: 'tenant-123',
      role: 'ASSISTANT',
      content: 'Hello!',
      contentType: 'text',
      metadata: null,
      attachments: null,
      modelUsed: null,
      finishReason: null,
      tokenCount: null,
      promptTokens: null,
      completionTokens: null,
      confidence: null,
      createdAt: new Date(),
      conversation: {
        id: 'conv-001',
        sessionId: 'session-abc',
        tenantId: 'tenant-123',
        userId: 'user-456',
        title: 'Test',
        summary: null,
        contextName: null,
        contextType: null,
        contextId: null,
        agentId: null,
        agentName: null,
        agentModel: null,
        userName: null,
        userAgent: null,
        channel: 'WEB_CHAT',
        messageCount: 1,
        toolCallCount: 0,
        tokenCountInput: null,
        tokenCountOutput: null,
        status: 'ACTIVE',
        startedAt: new Date(),
        endedAt: null,
        lastMessageAt: null,
        endReason: null,
        userRating: null,
        feedbackText: null,
        wasEscalated: false,
        escalatedTo: null,
        escalatedAt: null,
        ipAddress: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
    expect(msgWithConv.conversation.userId).toBe('user-456');
    expect(msgWithConv.conversation.title).toBe('Test');
  });
});

describe('ToolCallRecordData', () => {
  const validToolCall: ToolCallRecordData = {
    id: 'tool-001',
    conversationId: 'conv-001',
    messageId: 'msg-002',
    tenantId: 'tenant-123',
    toolName: 'searchContacts',
    toolType: 'SEARCH',
    toolVersion: '1.0.0',
    toolInput: { query: 'John' },
    toolOutput: { results: [] },
    inputParameters: { query: 'John' },
    outputResult: { results: [] },
    status: 'SUCCESS',
    duration: 150,
    durationMs: 150,
    startedAt: new Date('2026-01-15T10:02:00Z'),
    completedAt: new Date('2026-01-15T10:02:00.150Z'),
    requiresApproval: false,
    isReversible: false,
    approvalStatus: null,
    approvedBy: null,
    approvedAt: null,
    rejectionReason: null,
    errorMessage: null,
    errorCode: null,
    affectedEntityType: null,
    affectedEntityId: null,
    affectedEntity: null,
    changeDescription: null,
    rollbackData: null,
    createdAt: new Date('2026-01-15T10:02:00Z'),
  };

  it('should accept a valid tool call record', () => {
    expect(validToolCall.toolName).toBe('searchContacts');
    expect(validToolCall.status).toBe('SUCCESS');
    expect(validToolCall.durationMs).toBe(150);
  });

  it('should support approval workflow', () => {
    const pendingApproval: ToolCallRecordData = {
      ...validToolCall,
      status: 'PENDING',
      requiresApproval: true,
      approvalStatus: 'PENDING',
      toolOutput: null,
      outputResult: null,
      completedAt: null,
      duration: null,
      durationMs: null,
    };
    expect(pendingApproval.requiresApproval).toBe(true);
    expect(pendingApproval.approvalStatus).toBe('PENDING');
  });

  it('should support reversible operations with rollback data', () => {
    const reversible: ToolCallRecordData = {
      ...validToolCall,
      toolName: 'updateContact',
      toolType: 'UPDATE',
      isReversible: true,
      affectedEntityType: 'Contact',
      affectedEntityId: 'contact-123',
      affectedEntity: 'Contact:contact-123',
      changeDescription: 'Updated email address',
      rollbackData: { previousEmail: 'old@example.com' },
    };
    expect(reversible.isReversible).toBe(true);
    expect(reversible.rollbackData).toEqual({ previousEmail: 'old@example.com' });
    expect(reversible.affectedEntity).toBe('Contact:contact-123');
  });

  it('should support error states', () => {
    const failed: ToolCallRecordData = {
      ...validToolCall,
      status: 'FAILED',
      errorMessage: 'Connection timeout',
      errorCode: 'TIMEOUT_ERROR',
      toolOutput: null,
      outputResult: null,
    };
    expect(failed.status).toBe('FAILED');
    expect(failed.errorMessage).toBe('Connection timeout');
    expect(failed.errorCode).toBe('TIMEOUT_ERROR');
  });
});

// =============================================================================
// Repository Interface Contract Test
// =============================================================================

describe('ConversationRecordRepository', () => {
  it('should define all required methods', () => {
    // Type-level check: if this compiles, the interface is correctly defined
    const mockRepo: ConversationRecordRepository = {
      findById: async (_id: string) => null,
      findBySessionId: async (_sessionId: string) => null,
      findByTenant: async (_tenantId: string, _options?: { limit?: number; offset?: number }) => [],
      save: async (_conversation: ConversationRecordData) => {},
      updateStatus: async (_id: string, _status: ConversationStatus) => {},
    };

    expect(mockRepo.findById).toBeDefined();
    expect(mockRepo.findBySessionId).toBeDefined();
    expect(mockRepo.findByTenant).toBeDefined();
    expect(mockRepo.save).toBeDefined();
    expect(mockRepo.updateStatus).toBeDefined();
  });
});
