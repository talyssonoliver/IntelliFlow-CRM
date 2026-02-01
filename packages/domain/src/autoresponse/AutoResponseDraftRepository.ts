import { AutoResponseDraft, AutoResponseStatus, TriggerType } from './AutoResponseDraft';
import { AutoResponseDraftId } from './AutoResponseDraftId';

/**
 * Query options for finding auto-response drafts
 */
export interface AutoResponseDraftQuery {
  tenantId: string;
  leadId?: string;
  status?: AutoResponseStatus | AutoResponseStatus[];
  triggerType?: TriggerType;
  approverId?: string;
  expiredOnly?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Repository interface for AutoResponseDraft persistence
 * Implemented by infrastructure layer
 */
export interface AutoResponseDraftRepository {
  /**
   * Save a draft (create or update)
   */
  save(draft: AutoResponseDraft): Promise<void>;

  /**
   * Find by ID
   */
  findById(
    id: AutoResponseDraftId,
    tenantId: string
  ): Promise<AutoResponseDraft | null>;

  /**
   * Find by query
   */
  find(query: AutoResponseDraftQuery): Promise<AutoResponseDraft[]>;

  /**
   * Find pending drafts for a lead and trigger type
   * Used for duplicate detection (Invariant 3)
   */
  findActiveByLeadAndTrigger(
    leadId: string,
    triggerType: TriggerType,
    tenantId: string
  ): Promise<AutoResponseDraft | null>;

  /**
   * Find all pending approval drafts for an approver
   */
  findPendingForApprover(
    approverId: string,
    tenantId: string
  ): Promise<AutoResponseDraft[]>;

  /**
   * Find all pending drafts for a lead (for invalidation on status change)
   */
  findPendingByLeadId(
    leadId: string,
    tenantId: string
  ): Promise<AutoResponseDraft[]>;

  /**
   * Find expired drafts that need cleanup
   */
  findExpired(tenantId: string): Promise<AutoResponseDraft[]>;

  /**
   * Delete a draft (hard delete, use with caution)
   */
  delete(id: AutoResponseDraftId, tenantId: string): Promise<void>;

  /**
   * Count drafts by status
   */
  countByStatus(
    tenantId: string,
    status: AutoResponseStatus
  ): Promise<number>;
}
