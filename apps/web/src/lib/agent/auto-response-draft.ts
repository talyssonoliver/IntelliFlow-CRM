import type { AgentAction, ActionStatus } from '@/lib/agent';

/**
 * AI email drafts (auto-response) as approval actions: shared by the Agent Approvals hub and its
 * Preview Mode (owner 26/11: "Why the AI feature aren't showing them here?" - the preview read
 * only the agent tool actions, so a pending AI draft never appeared there).
 */

export interface AutoResponseDraftFromAPI {
  id: string;
  leadId: string;
  subject: string;
  body?: string;
  status: string;
  aiConfidence: number;
  triggerType: string;
  recipientEmail: string;
  createdAt: Date | string;
  expiresAt: Date | string;
  modelVersion?: string;
  statusHistory?: Array<{
    status: string;
    changedAt: Date | string;
    changedBy?: string;
    reason?: string;
  }>;
  approvalDecision?: {
    decision: string;
    decidedBy: string;
    decidedAt: Date | string;
    reason?: string;
    modifications?: { subject?: string; body?: string };
  } | null;
  escalation?: {
    escalatedBy: string;
    escalatedTo: string;
    reason: string;
    escalatedAt: Date | string;
    expiresAt: Date | string;
    resolvedBy?: string;
    resolvedAt?: Date | string;
    feedback?: string;
  } | null;
  escalationCount?: number;
  isExpired?: boolean;
  isPendingApproval?: boolean;
  canBeSent?: boolean;
}

/**
 * Map backend AutoResponseDraft to frontend AgentAction format
 */
export function mapDraftToAction(draft: AutoResponseDraftFromAPI): AgentAction {
  const createdAt =
    typeof draft.createdAt === 'string' ? new Date(draft.createdAt) : draft.createdAt;
  const expiresAt =
    typeof draft.expiresAt === 'string' ? new Date(draft.expiresAt) : draft.expiresAt;

  // Map backend status to frontend status
  const statusMap: Record<string, ActionStatus> = {
    DRAFT: 'pending',
    PENDING_APPROVAL: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    ESCALATED: 'escalated',
    SENT: 'approved',
    FAILED: 'rejected',
    INVALIDATED: 'expired',
  };

  return {
    id: draft.id,
    actionType: 'email_draft',
    entityId: draft.leadId,
    entityType: 'lead',
    entityName: `Lead ${draft.leadId.substring(0, 8)}...`,
    previousState: {},
    proposedState: {
      subject: draft.subject,
      body: draft.body || '',
      recipientEmail: draft.recipientEmail,
    },
    description: draft.subject,
    aiReasoning: `AI-generated response with ${Math.round(draft.aiConfidence * 100)}% confidence. Trigger: ${draft.triggerType}`,
    confidenceScore: Math.round(draft.aiConfidence * 100),
    status: statusMap[draft.status] || 'pending',
    agentId: draft.modelVersion || 'auto-response-agent',
    agentName: 'Auto-Response Agent',
    createdAt,
    expiresAt,
    reviewedAt: draft.approvalDecision?.decidedAt
      ? new Date(draft.approvalDecision.decidedAt as string)
      : undefined,
    reviewedBy: draft.approvalDecision?.decidedBy,
    feedback: draft.approvalDecision?.reason,
    escalation: draft.escalation
      ? {
          escalatedBy: draft.escalation.escalatedBy,
          escalatedTo: draft.escalation.escalatedTo,
          reason: draft.escalation.reason,
          escalatedAt: new Date(draft.escalation.escalatedAt as string),
          slaExpiresAt: new Date(draft.escalation.expiresAt as string),
        }
      : undefined,
  };
}
