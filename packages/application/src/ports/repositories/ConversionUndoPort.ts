import type { RepositoryTransaction } from '@intelliflow/domain';

/**
 * Conversion undo port (MVP-003): what undoing a lead-to-deal conversion needs from storage.
 *
 * A conversion creates a deal (with the lead as its source), may create a contact or link an
 * existing one, and may create or reuse an account. It records the contact it created on the deal
 * (Opportunity.createdContactId). Undo removes the deal, and the contact only when it is that
 * recorded one; the account stays, because a later conversion of the same company reuses it.
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
   * True only when the conversion recorded this contact as the one it created
   * (Opportunity.createdContactId equals the deal's contact). A linked existing contact, or a deal
   * that predates that record, is never one, so undo never deletes it.
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
