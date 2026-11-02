import type { RepositoryTransaction } from '@intelliflow/domain';

/**
 * Processing restriction port (PG-203, owner ruling Q18; spec sign-off 1).
 *
 * One ACTIVE restriction per person per firm. While active it stops AI scoring, embedding
 * and draft replies for that email; `blocksMarketing` marks an Art 21(3) objection.
 */

export interface RestrictionStatus {
  restricted: boolean;
  blocksMarketing: boolean;
  since: Date | null;
}

export const NOT_RESTRICTED: RestrictionStatus = {
  restricted: false,
  blocksMarketing: false,
  since: null,
};

export interface ActiveRestriction {
  id: string;
  tenantId: string;
  subjectEmail: string;
  blocksMarketing: boolean;
  dsarRequestIds: string[];
  createdAt: Date;
}

export interface ProcessingRestrictionPort {
  /**
   * The person's restriction. Given the caller's transaction, it first takes the person's
   * address lock (the one every restriction write takes) and reads inside that
   * transaction, so no restriction can commit between this check and the caller's write.
   */
  status(
    tenantId: string,
    subjectEmail: string,
    tx?: RepositoryTransaction
  ): Promise<RestrictionStatus>;

  /** Upsert into the one active row: OR `blocksMarketing`, append the request id. */
  restrict(input: {
    tenantId: string;
    subjectEmail: string;
    blocksMarketing: boolean;
    dsarRequestId: string;
    createdById: string | null;
  }): Promise<ActiveRestriction>;

  findActive(tenantId: string, restrictionId: string): Promise<ActiveRestriction | null>;

  /** The firm's active restrictions, newest first, for the admin page (lift by id). */
  listActive(tenantId: string): Promise<ActiveRestriction[]>;

  /** Lift the active row created by this request, if any. Returns the lifted row. */
  liftForRequest(input: {
    tenantId: string;
    dsarRequestId: string;
    liftedById: string;
    note: string;
  }): Promise<ActiveRestriction | null>;

  /**
   * Lift the row only if it still holds exactly the requests the admin reviewed: a request
   * merged in meanwhile (for example while the Art 18(3) notice was being sent) is never
   * lifted unseen (codex). Null when the row changed or is no longer active.
   */
  lift(input: {
    tenantId: string;
    restrictionId: string;
    expectedRequestIds: string[];
    liftedById: string;
    note: string;
  }): Promise<ActiveRestriction | null>;

  /**
   * A record's email changed: the restriction follows it. The new address gets the old
   * address's active restriction (merged into one already there). The old address stays
   * restricted, because another lead or contact of the firm may still use it, and
   * over-restricting is the safe direction.
   */
  followEmail(tenantId: string, fromEmail: string, toEmail: string): Promise<void>;
}

/** Default for services built without the port (tests, tools): nothing is ever restricted. */
export const ALLOW_ALL_RESTRICTIONS: Pick<ProcessingRestrictionPort, 'status' | 'followEmail'> = {
  status: async () => NOT_RESTRICTED,
  followEmail: async () => undefined,
};
