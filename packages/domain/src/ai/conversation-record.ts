/**
 * Conversation Record Domain Constants - Single Source of Truth
 *
 * Canonical enum values for conversation records (chat transcripts,
 * tool calls, actions per case). All validator schemas derive from these.
 *
 * Task: IFC-148 - Conversation Record Entity
 */

// =============================================================================
// Conversation Statuses
// =============================================================================

export const CONVERSATION_STATUSES = [
  'ACTIVE',
  'PAUSED',
  'ENDED',
  'ARCHIVED',
  'DELETED',
] as const;

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

// =============================================================================
// Conversation Channels
// =============================================================================

export const CONVERSATION_CHANNELS = [
  'WEB_CHAT',
  'MOBILE_APP',
  'API',
  'SLACK',
  'TEAMS',
  'EMAIL',
  'VOICE',
] as const;

export type ConversationChannel = (typeof CONVERSATION_CHANNELS)[number];

// =============================================================================
// Message Roles
// =============================================================================

export const MESSAGE_ROLES = ['USER', 'ASSISTANT', 'SYSTEM', 'TOOL'] as const;

export type MessageRole = (typeof MESSAGE_ROLES)[number];

// =============================================================================
// Tool Types
// =============================================================================

export const TOOL_TYPES = [
  'SEARCH',
  'READ',
  'CREATE',
  'UPDATE',
  'DELETE',
  'EXECUTE',
  'INTEGRATION',
] as const;

export type ToolType = (typeof TOOL_TYPES)[number];

// =============================================================================
// Tool Call Statuses
// =============================================================================

export const TOOL_CALL_STATUSES = [
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
  'TIMEOUT',
] as const;

export type ToolCallStatus = (typeof TOOL_CALL_STATUSES)[number];

// =============================================================================
// Approval Statuses
// =============================================================================

export const APPROVAL_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

// =============================================================================
// Conversation Repository Interface
// =============================================================================

export interface ConversationRecordRepository {
  findById(id: string): Promise<ConversationRecordData | null>;
  findBySessionId(sessionId: string): Promise<ConversationRecordData | null>;
  findByTenant(tenantId: string, options?: { limit?: number; offset?: number }): Promise<ConversationRecordData[]>;
  save(conversation: ConversationRecordData): Promise<void>;
  updateStatus(id: string, status: ConversationStatus): Promise<void>;
}

// =============================================================================
// Data Interfaces — aligned with Prisma ConversationRecord model
// =============================================================================

export interface ConversationRecordData {
  id: string;
  sessionId: string;
  tenantId: string;
  userId: string;
  title: string | null;
  summary: string | null;
  contextName: string | null;
  contextType: string | null;
  contextId: string | null;
  agentId: string | null;
  agentName: string | null;
  agentModel: string | null;
  userName: string | null;
  userAgent: string | null;
  channel: string;
  messageCount: number;
  toolCallCount: number;
  tokenCountInput: number | null;
  tokenCountOutput: number | null;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  lastMessageAt: Date | null;
  endReason: string | null;
  userRating: number | null;
  feedbackText: string | null;
  wasEscalated: boolean;
  escalatedTo: string | null;
  escalatedAt: Date | null;
  ipAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// MessageRecord Data — aligned with Prisma MessageRecord model
// =============================================================================

export interface MessageRecordData {
  id: string;
  conversationId: string;
  tenantId: string | null;
  role: string;
  content: string;
  contentType: string;
  metadata: unknown | null;
  attachments: unknown | null;
  modelUsed: string | null;
  finishReason: string | null;
  tokenCount: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  confidence: number | null;
  createdAt: Date;
}

/**
 * MessageRecord with its parent conversation included.
 * Matches the shape returned by Prisma `include: { conversation: true }`.
 */
export interface MessageRecordWithConversation extends MessageRecordData {
  conversation: ConversationRecordData;
}

// =============================================================================
// ToolCallRecord Data — aligned with Prisma ToolCallRecord model
// =============================================================================

export interface ToolCallRecordData {
  id: string;
  conversationId: string;
  messageId: string | null;
  tenantId: string | null;
  toolName: string;
  toolType: string | null;
  toolVersion: string | null;
  toolInput: unknown | null;
  toolOutput: unknown | null;
  inputParameters: unknown | null;
  outputResult: unknown | null;
  status: string;
  duration: number | null;
  durationMs: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  requiresApproval: boolean;
  isReversible: boolean;
  approvalStatus: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectionReason: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  affectedEntityType: string | null;
  affectedEntityId: string | null;
  affectedEntity: string | null;
  changeDescription: string | null;
  rollbackData: unknown | null;
  createdAt: Date;
}
