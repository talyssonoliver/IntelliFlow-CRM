/**
 * Subject data port (PG-203, spec Addendum A).
 *
 * Reads and erases one person's CRM data inside one firm, matched by the exact normalised
 * email. The adapter owns the field allowlists, the row caps and the erasure transaction.
 */
import type { DsarWithheldCategory } from '@intelliflow/domain';

export interface FirmIdentity {
  tenantId: string;
  name: string;
  privacyUrl: string | null;
}

export interface SubjectExport {
  /** Allowlisted rows per category (profiles, activity types/dates, bookings, metadata). */
  data: Record<string, Array<Record<string, unknown>>>;
  /** Free-text categories not in the automatic export, with how many rows each holds. */
  withheld: Partial<Record<DsarWithheldCategory, number>>;
}

export interface ErasureOutcome {
  /** Rows anonymised or deleted, per category (no values). */
  counts: Record<string, number>;
  /** Rows the admin must handle by hand (communications, stored files...). */
  checklist: Record<string, number>;
}

export type ErasureResult =
  | { outcome: 'ERASED'; result: ErasureOutcome }
  /** The request was no longer VERIFIED when re-read under the row lock (double run). */
  | { outcome: 'NOT_PENDING' };

export interface SubjectDataPort {
  buildExport(tenantId: string, subjectEmail: string): Promise<SubjectExport>;

  /** Counts only, for the admin's erasure dialog checklist before confirming. */
  previewErasure(tenantId: string, subjectEmail: string): Promise<ErasureOutcome>;

  /**
   * One transaction: re-read the request FOR UPDATE and require VERIFIED; anonymise the core
   * CRM data; mark the request COMPLETED with the resolver and note. All or nothing.
   */
  erase(input: {
    tenantId: string;
    requestId: string;
    subjectEmail: string;
    resolvedById: string;
    note: string;
    now: Date;
    /** The answer came after the effective deadline (shown as "answered late"). */
    clockBreached: boolean;
  }): Promise<ErasureResult>;
}
