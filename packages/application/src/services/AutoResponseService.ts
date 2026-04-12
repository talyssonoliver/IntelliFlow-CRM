import {
  Result,
  DomainError,
  AutoResponseDraft,
  AutoResponseDraftId,
  AutoResponseDraftRepository,
  AutoResponseDraftQuery,
  ResponseContent,
  TriggerType,
  AutoResponseStatus,
} from '@intelliflow/domain';
import { EventBusPort } from '../ports/external';
import { PersistenceError, NotFoundError, ValidationError } from '../errors';

/**
 * Result of creating an auto-response draft
 */
export interface CreateAutoResponseResult {
  draftId: string;
  status: AutoResponseStatus;
  expiresAt: Date;
  aiConfidence: number;
}

/**
 * Result of listing auto-response drafts
 */
export interface ListAutoResponseResult {
  drafts: AutoResponseDraftSummary[];
  total: number;
}

/**
 * Summary of an auto-response draft for listing
 */
export interface AutoResponseDraftSummary {
  id: string;
  leadId: string;
  subject: string;
  status: AutoResponseStatus;
  aiConfidence: number;
  triggerType: TriggerType;
  createdAt: Date;
  expiresAt: Date;
  recipientEmail: string;
}

/**
 * Full auto-response draft details
 */
export interface AutoResponseDraftDetails extends AutoResponseDraftSummary {
  body: string;
  modelVersion: string;
  statusHistory: Array<{
    status: AutoResponseStatus;
    changedAt: Date;
    changedBy?: string;
    reason?: string;
  }>;
  approvalDecision?: {
    decision: 'APPROVED' | 'REJECTED';
    decidedBy: string;
    decidedAt: Date;
    reason?: string;
    modifications?: { subject?: string; body?: string };
  };
  escalation?: {
    reason: string;
    escalatedTo: string;
    escalatedBy: string;
    escalatedAt: Date;
    expiresAt: Date;
    resolvedAt?: Date;
    resolvedBy?: string;
    resolutionFeedback?: string;
  };
  escalationCount: number;
}

/**
 * Props for creating an auto-response draft
 */
export interface CreateAutoResponseProps {
  tenantId: string;
  leadId: string;
  leadTenantId: string;
  leadStatus: string;
  triggerType: TriggerType;
  subject: string;
  body: string;
  aiConfidence: number;
  modelVersion: string;
  recipientEmail: string;
  expiryHours?: number;
}

/**
 * Props for approval with optional modifications
 */
export interface ApproveAutoResponseProps {
  draftId: string;
  tenantId: string;
  approvedBy: string;
  reason?: string;
  modifications?: {
    subject?: string;
    body?: string;
  };
}

/**
 * AutoResponse Application Service
 *
 * IFC-029: Orchestrates the auto-response workflow including:
 * - Draft creation with AI confidence scoring
 * - Human approval workflow (mandatory)
 * - Escalation to managers
 * - Send tracking
 */
export class AutoResponseService {
  constructor(
    private readonly draftRepository: AutoResponseDraftRepository,
    private readonly eventBus: EventBusPort
  ) {}

  /**
   * Create a new auto-response draft
   */
  async create(
    props: CreateAutoResponseProps
  ): Promise<Result<CreateAutoResponseResult, DomainError>> {
    // Check for existing active draft for this lead and trigger type
    const existingDraft = await this.draftRepository.findActiveByLeadAndTrigger(
      props.leadId,
      props.triggerType,
      props.tenantId
    );

    if (existingDraft) {
      return Result.fail(
        new ValidationError(
          `Active draft already exists for lead ${props.leadId} with trigger ${props.triggerType}`
        )
      );
    }

    // Create response content
    let content: ResponseContent;
    try {
      content = ResponseContent.create({
        subject: props.subject,
        body: props.body,
      });
    } catch (error) {
      return Result.fail(
        new ValidationError(error instanceof Error ? error.message : 'Invalid response content')
      );
    }

    // Create draft
    const createResult = AutoResponseDraft.create({
      tenantId: props.tenantId,
      leadId: props.leadId,
      leadTenantId: props.leadTenantId,
      leadStatus: props.leadStatus,
      triggerType: props.triggerType,
      content,
      aiConfidence: props.aiConfidence,
      modelVersion: props.modelVersion,
      recipientEmail: props.recipientEmail,
      expiryHours: props.expiryHours,
    });

    if (createResult.isFailure) {
      return Result.fail(createResult.error);
    }

    const draft = createResult.value;

    // Persist
    try {
      await this.draftRepository.save(draft);
    } catch {
      return Result.fail(new PersistenceError('Failed to save auto-response draft'));
    }

    // Publish events
    await this.publishEvents(draft);

    return Result.ok({
      draftId: draft.id.toString(),
      status: draft.status,
      expiresAt: draft.expiresAt,
      aiConfidence: draft.aiConfidence,
    });
  }

  /**
   * Get a draft by ID
   */
  async getById(
    draftId: string,
    tenantId: string
  ): Promise<Result<AutoResponseDraftDetails, DomainError>> {
    const id = AutoResponseDraftId.fromString(draftId);
    const draft = await this.draftRepository.findById(id, tenantId);

    if (!draft) {
      return Result.fail(new NotFoundError(`Draft not found: ${draftId}`));
    }

    return Result.ok(this.toDetails(draft));
  }

  /**
   * List drafts with filtering
   */
  async list(
    tenantId: string,
    options: {
      leadId?: string;
      status?: AutoResponseStatus | AutoResponseStatus[];
      triggerType?: TriggerType;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<ListAutoResponseResult> {
    const query: AutoResponseDraftQuery = {
      tenantId,
      leadId: options.leadId,
      status: options.status,
      triggerType: options.triggerType,
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
    };

    const drafts = await this.draftRepository.find(query);

    return {
      drafts: drafts.map((d) => this.toSummary(d)),
      total: drafts.length,
    };
  }

  /**
   * Submit a draft for human approval
   */
  async submitForApproval(
    draftId: string,
    tenantId: string,
    approverId: string
  ): Promise<Result<void, DomainError>> {
    const id = AutoResponseDraftId.fromString(draftId);
    const draft = await this.draftRepository.findById(id, tenantId);

    if (!draft) {
      return Result.fail(new NotFoundError(`Draft not found: ${draftId}`));
    }

    const submitResult = draft.submitForApproval(approverId);
    if (submitResult.isFailure) {
      return Result.fail(submitResult.error);
    }

    try {
      await this.draftRepository.save(draft);
    } catch {
      return Result.fail(new PersistenceError('Failed to save draft'));
    }

    await this.publishEvents(draft);

    return Result.ok(undefined);
  }

  /**
   * Approve a draft with optional modifications
   */
  async approve(props: ApproveAutoResponseProps): Promise<Result<void, DomainError>> {
    const id = AutoResponseDraftId.fromString(props.draftId);
    const draft = await this.draftRepository.findById(id, props.tenantId);

    if (!draft) {
      return Result.fail(new NotFoundError(`Draft not found: ${props.draftId}`));
    }

    const approveResult = draft.approve(props.approvedBy, props.modifications, props.reason);

    if (approveResult.isFailure) {
      return Result.fail(approveResult.error);
    }

    try {
      await this.draftRepository.save(draft);
    } catch {
      return Result.fail(new PersistenceError('Failed to save draft'));
    }

    await this.publishEvents(draft);

    return Result.ok(undefined);
  }

  /**
   * Reject a draft
   */
  async reject(
    draftId: string,
    tenantId: string,
    rejectedBy: string,
    reason: string
  ): Promise<Result<void, DomainError>> {
    const id = AutoResponseDraftId.fromString(draftId);
    const draft = await this.draftRepository.findById(id, tenantId);

    if (!draft) {
      return Result.fail(new NotFoundError(`Draft not found: ${draftId}`));
    }

    const rejectResult = draft.reject(rejectedBy, reason);
    if (rejectResult.isFailure) {
      return Result.fail(rejectResult.error);
    }

    try {
      await this.draftRepository.save(draft);
    } catch {
      return Result.fail(new PersistenceError('Failed to save draft'));
    }

    await this.publishEvents(draft);

    return Result.ok(undefined);
  }

  /**
   * Escalate a draft to a manager
   */
  async escalate(
    draftId: string,
    tenantId: string,
    escalatedBy: string,
    escalatedTo: string,
    reason: string,
    escalationExpiryHours?: number
  ): Promise<Result<void, DomainError>> {
    const id = AutoResponseDraftId.fromString(draftId);
    const draft = await this.draftRepository.findById(id, tenantId);

    if (!draft) {
      return Result.fail(new NotFoundError(`Draft not found: ${draftId}`));
    }

    const escalateResult = draft.escalate(escalatedBy, escalatedTo, reason, escalationExpiryHours);

    if (escalateResult.isFailure) {
      return Result.fail(escalateResult.error);
    }

    try {
      await this.draftRepository.save(draft);
    } catch {
      return Result.fail(new PersistenceError('Failed to save draft'));
    }

    await this.publishEvents(draft);

    return Result.ok(undefined);
  }

  /**
   * Resolve an escalation
   */
  async resolveEscalation(
    draftId: string,
    tenantId: string,
    resolvedBy: string,
    feedback?: string
  ): Promise<Result<void, DomainError>> {
    const id = AutoResponseDraftId.fromString(draftId);
    const draft = await this.draftRepository.findById(id, tenantId);

    if (!draft) {
      return Result.fail(new NotFoundError(`Draft not found: ${draftId}`));
    }

    const resolveResult = draft.resolveEscalation(resolvedBy, feedback);
    if (resolveResult.isFailure) {
      return Result.fail(resolveResult.error);
    }

    try {
      await this.draftRepository.save(draft);
    } catch {
      return Result.fail(new PersistenceError('Failed to save draft'));
    }

    await this.publishEvents(draft);

    return Result.ok(undefined);
  }

  /**
   * Mark a draft as sent
   */
  async markSent(
    draftId: string,
    tenantId: string,
    notificationId: string
  ): Promise<Result<void, DomainError>> {
    const id = AutoResponseDraftId.fromString(draftId);
    const draft = await this.draftRepository.findById(id, tenantId);

    if (!draft) {
      return Result.fail(new NotFoundError(`Draft not found: ${draftId}`));
    }

    const sentResult = draft.markSent(notificationId);
    if (sentResult.isFailure) {
      return Result.fail(sentResult.error);
    }

    try {
      await this.draftRepository.save(draft);
    } catch {
      return Result.fail(new PersistenceError('Failed to save draft'));
    }

    await this.publishEvents(draft);

    return Result.ok(undefined);
  }

  /**
   * Mark a draft send as failed
   */
  async markFailed(
    draftId: string,
    tenantId: string,
    error: string
  ): Promise<Result<void, DomainError>> {
    const id = AutoResponseDraftId.fromString(draftId);
    const draft = await this.draftRepository.findById(id, tenantId);

    if (!draft) {
      return Result.fail(new NotFoundError(`Draft not found: ${draftId}`));
    }

    const failResult = draft.markSendFailed(error);
    if (failResult.isFailure) {
      return Result.fail(failResult.error);
    }

    try {
      await this.draftRepository.save(draft);
    } catch {
      return Result.fail(new PersistenceError('Failed to save draft'));
    }

    await this.publishEvents(draft);

    return Result.ok(undefined);
  }

  /**
   * Get pending drafts for an approver
   */
  async getPendingForApprover(
    approverId: string,
    tenantId: string
  ): Promise<AutoResponseDraftSummary[]> {
    const drafts = await this.draftRepository.findPendingForApprover(approverId, tenantId);
    return drafts.map((d) => this.toSummary(d));
  }

  /**
   * Invalidate all pending drafts for a lead (e.g., when lead status changes)
   */
  async invalidatePendingByLead(leadId: string, tenantId: string, reason: string): Promise<number> {
    const drafts = await this.draftRepository.findPendingByLeadId(leadId, tenantId);
    let count = 0;

    for (const draft of drafts) {
      draft.invalidate(reason);
      try {
        await this.draftRepository.save(draft);
        await this.publishEvents(draft);
        count++;
      } catch {
        // Log error but continue with other drafts
      }
    }

    return count;
  }

  /**
   * Process expired drafts (for scheduled job)
   */
  async processExpiredDrafts(tenantId: string): Promise<number> {
    const drafts = await this.draftRepository.findExpired(tenantId);
    let count = 0;

    for (const draft of drafts) {
      if (draft.checkExpiry()) {
        try {
          await this.draftRepository.save(draft);
          await this.publishEvents(draft);
          count++;
        } catch {
          // Log error but continue with other drafts
        }
      }
    }

    return count;
  }

  /**
   * Get draft statistics by status
   */
  async getStatsByStatus(tenantId: string): Promise<Record<AutoResponseStatus, number>> {
    const statuses: AutoResponseStatus[] = [
      'DRAFT',
      'PENDING_APPROVAL',
      'APPROVED',
      'REJECTED',
      'ESCALATED',
      'SENT',
      'FAILED',
      'INVALIDATED',
    ];

    const stats: Record<string, number> = {};
    for (const status of statuses) {
      stats[status] = await this.draftRepository.countByStatus(tenantId, status);
    }

    return stats as Record<AutoResponseStatus, number>;
  }

  /**
   * Convert draft to summary for listing
   */
  private toSummary(draft: AutoResponseDraft): AutoResponseDraftSummary {
    return {
      id: draft.id.toString(),
      leadId: draft.leadId,
      subject: draft.content.subject,
      status: draft.status,
      aiConfidence: draft.aiConfidence,
      triggerType: draft.triggerType,
      createdAt: draft.createdAt,
      expiresAt: draft.expiresAt,
      recipientEmail: draft.recipientEmail,
    };
  }

  /**
   * Convert draft to full details
   */
  private toDetails(draft: AutoResponseDraft): AutoResponseDraftDetails {
    return {
      ...this.toSummary(draft),
      body: draft.content.body,
      modelVersion: draft.modelVersion,
      statusHistory: draft.statusHistory.map((h) => ({
        status: h.status,
        changedAt: h.changedAt,
        changedBy: h.changedBy,
        reason: h.reason,
      })),
      approvalDecision: draft.approvalDecision as AutoResponseDraftDetails['approvalDecision'],
      escalation: draft.escalation as AutoResponseDraftDetails['escalation'],
      escalationCount: draft.escalationCount,
    };
  }

  /**
   * Publish domain events
   */
  private async publishEvents(draft: AutoResponseDraft): Promise<void> {
    const events = draft.getDomainEvents();
    if (events.length > 0) {
      try {
        await this.eventBus.publishAll(events);
      } catch (error) {
        console.error('Failed to publish auto-response domain events:', error);
      }
    }
    draft.clearDomainEvents();
  }
}
