/**
 * DSAR repository port (PG-203, spec Addendum A).
 *
 * Storage for data subject requests. Every method that the public flow calls before a tenant
 * is trusted takes the request id only; every admin method takes the caller's tenantId and
 * must scope by it. Atomic steps (count + insert under locks, single-use token clearing) are
 * one port call each so the adapter owns the transaction.
 */
import type {
  DsarIdentityMethod,
  DsarObjectionScope,
  DsarRequestType,
  DsarSource,
  DsarStatus,
} from '@intelliflow/domain';

export interface DsarRecord {
  id: string;
  tenantId: string;
  type: DsarRequestType;
  status: DsarStatus;
  source: DsarSource;
  subjectEmail: string;
  details: string | null;
  objectionScope: DsarObjectionScope | null;
  identityMethod: DsarIdentityMethod | null;
  receivedAt: Date;
  verificationTokenHash: string | null;
  verificationExpiresAt: Date | null;
  verifiedAt: Date | null;
  slaDeadline: Date | null;
  extendedUntil: Date | null;
  exportTokenHash: string | null;
  exportExpiresAt: Date | null;
  exportIssuedAt: Date | null;
  exportDownloads: number;
  createdById: string | null;
  resolvedById: string | null;
  resolutionNote: string | null;
  clockBreached: boolean;
  /** Staff-logged erasure: when the person's warning email was accepted (null: not yet). */
  erasureNoticeAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface NewPublicDsar {
  tenantId: string;
  type: DsarRequestType;
  subjectEmail: string;
  capEmailHash: string;
  details: string | null;
  objectionScope: DsarObjectionScope | null;
  ipHash: string | null;
  verificationTokenHash: string;
  verificationExpiresAt: Date;
}

export interface SubmitCaps {
  /** Same tenant + same email, last 24 h. */
  perTenantEmailPerDay: number;
  /** Same tenant + same IP hash, last hour (skipped when the IP is unknown). */
  perIpPerHour: number;
  /** Any tenant + same +tag-folded email hash, last 24 h. */
  globalEmailPerDay: number;
  /** A PENDING request of the same tenant, type and email younger than this sends no new email. */
  resendCooldownMinutes: number;
}

export type ReserveSubmissionResult =
  | { outcome: 'CREATED'; record: DsarRecord }
  | { outcome: 'COOLDOWN' }
  | { outcome: 'CAPPED' };

export interface NewStaffDsar {
  tenantId: string;
  type: DsarRequestType;
  subjectEmail: string;
  capEmailHash: string;
  details: string | null;
  objectionScope: DsarObjectionScope | null;
  identityMethod: DsarIdentityMethod;
  identityNote: string;
  receivedAt: Date;
  receivedOnReason: string | null;
  verifiedAt: Date;
  slaDeadline: Date;
  createdById: string;
  /**
   * A staff-logged RESTRICTION starts with its active restriction. The adapter writes the
   * request and the restriction in one transaction, so a verified request can never exist
   * without it (codex).
   */
  initialRestriction?: { blocksMarketing: boolean };
}

/** Fields a status change may set. Every update names the status it expects to replace. */
export interface DsarPatch {
  status?: DsarStatus;
  verificationTokenHash?: null;
  verificationExpiresAt?: null;
  verifiedAt?: Date;
  slaDeadline?: Date;
  extendedUntil?: Date;
  extensionReason?: string;
  exportTokenHash?: string | null;
  exportExpiresAt?: Date | null;
  exportIssuedAt?: Date;
  resolvedById?: string;
  resolutionNote?: string;
  noHoldConfirmedAt?: Date;
  marketingStopMethod?: string;
  clockBreached?: boolean;
  erasureNoticeAt?: Date;
  completedAt?: Date;
}

export interface TransitionCondition {
  onlyIfNotExtended?: true;
  restrict?: { subjectEmail: string; blocksMarketing: boolean; createdById: string | null };
}

export interface DsarRepositoryPort {
  /** Count the three caps and the cooldown, then insert, atomically (adapter locks). */
  reserveSubmission(
    record: NewPublicDsar,
    caps: SubmitCaps,
    now: Date
  ): Promise<ReserveSubmissionResult>;

  createStaff(record: NewStaffDsar): Promise<DsarRecord>;

  /** Public token flows: the request by id alone (the token proves the right to act on it). */
  findById(id: string): Promise<DsarRecord | null>;

  /** Admin flows: the request only when it belongs to the tenant. */
  findForTenant(tenantId: string, id: string): Promise<DsarRecord | null>;

  list(tenantId: string, status?: DsarStatus): Promise<DsarRecord[]>;

  /**
   * Apply `patch` only if the row is still in `expectedStatus` (single-use / no double run),
   * and, with `onlyIfNotExtended`, only while it has never been extended (one extension).
   * With `restrict`, the person's active restriction is written in the same transaction,
   * and only when the status change won: a caller that loses the race (or whose change
   * fails) writes no restriction at all (codex: verification and objection completion).
   * Returns the updated record, or null when another caller got there first.
   */
  transition(
    tenantId: string,
    id: string,
    expectedStatus: DsarStatus,
    patch: DsarPatch,
    condition?: TransitionCondition
  ): Promise<DsarRecord | null>;

  /**
   * Count one export download, in one conditional write, only while the request still
   * holds this token hash, is not rejected, the link has not expired and the cap is not
   * reached. False
   * otherwise: a revocation that lands after the token check still stops the download.
   */
  recordDownload(input: {
    id: string;
    tokenHash: string;
    maxDownloads: number;
    now: Date;
  }): Promise<boolean>;

  /** ADMIN users of the tenant (falls back to nothing; the caller decides the fallback). */
  countAdmins(tenantId: string): Promise<number>;

  /** The firm's public identity, for notices and links (handle null = no public booking page). */
  findFirm(tenantId: string): Promise<DsarFirm | null>;
}

export interface DsarFirm {
  tenantId: string;
  name: string;
  handle: string | null;
  privacyUrl: string | null;
}
