import type { RepositoryTransaction } from '@intelliflow/domain';

/**
 * Conversion undo port (MVP-003): what undoing a lead-to-deal conversion needs from storage.
 *
 * A conversion creates a deal (with the lead as its source), may create a contact (linked to
 * the lead by Contact.leadId, which is unique) and may create or reuse an account. Undo removes
 * the deal, and the contact only when the conversion created it; the account stays, because a
 * later conversion of the same company reuses it by name.
 */

/** The deal a conversion created, as stored. */
export interface ConvertedDeal {
  opportunityId: string;
  tenantId: string;
  /** The lead the deal was converted from; null for a deal created directly. */
  sourceLeadId: string | null;
  stage: string;
  deleted: boolean;
  contactId: string | null;
  /**
   * True only when the deal's contact was created by the conversion itself: it points at the lead
   * AND was created together with the deal. A contact that merely points at the lead (linked to
   * it earlier or afterwards) or that existed before is never one, so undo never deletes it.
   */
  contactCreatedByConversion: boolean;
}

/** Why a conversion can no longer be undone: something has happened since. */
export type ConversionUndoBlocker =
  | 'STAGE_CHANGED'
  | 'DEAL_HAS_TASKS'
  | 'DEAL_HAS_ACTIVITY'
  | 'CONTACT_HAS_ACTIVITY'
  | 'CONTACT_HAS_OTHER_DEALS';

export interface ConversionUndoPort {
  /** The deal, scoped to the tenant, or null when it does not exist there. */
  findDeal(
    opportunityId: string,
    tenantId: string,
    tx?: RepositoryTransaction
  ): Promise<ConvertedDeal | null>;

  /**
   * What has happened to the deal (and the contact the conversion created) since the
   * conversion. Empty means it can be undone. Called again inside the undo transaction.
   */
  findBlockers(deal: ConvertedDeal, tx?: RepositoryTransaction): Promise<ConversionUndoBlocker[]>;

  /**
   * Locks the deal, and the contact the conversion created, for the rest of the transaction. A
   * record that points at a locked row (a file, product, note...) cannot be inserted until the
   * transaction ends, so what findBlockers sees next is what the delete removes: nothing is
   * deleted unseen with the cascade. Call it before findBlockers, inside the transaction.
   */
  lockRecords(deal: ConvertedDeal, tx: RepositoryTransaction): Promise<void>;

  /** Deletes the deal, and the contact when the conversion created it. */
  removeCreatedRecords(deal: ConvertedDeal, tx: RepositoryTransaction): Promise<void>;
}
