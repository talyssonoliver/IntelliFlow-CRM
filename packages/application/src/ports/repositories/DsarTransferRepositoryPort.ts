/**
 * DSAR transfer repository port (IFC-317, UK GDPR Art 20(2)).
 *
 * Storage for admin-approved transfers of a portability export to another controller. Admin
 * methods take the caller's tenantId and scope by it. The public download finds its row by the
 * token's HMAC alone, so it never needs a tenant. Every step that must happen once (using the
 * link, revoking it, recording an event) is one port call, so the adapter owns the atomicity.
 */
import type {
  DsarTransferActorType,
  DsarTransferDeliveryMethod,
  DsarTransferEventKind,
} from '@intelliflow/domain';

export interface DsarTransferRecord {
  id: string;
  tenantId: string;
  requestId: string;
  recipientName: string;
  recipientEmail: string;
  basis: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  createdById: string | null;
  createdAt: Date;
}

export interface DsarTransferEventRecord {
  id: string;
  transferId: string;
  kind: DsarTransferEventKind;
  actorType: DsarTransferActorType;
  actorId: string | null;
  /** The administrator's name (or email), for the audit view; null for the recipient or system. */
  actorLabel: string | null;
  via: DsarTransferDeliveryMethod | null;
  occurredAt: Date;
}

export interface DsarTransferWithEvents extends DsarTransferRecord {
  events: DsarTransferEventRecord[];
}

export interface NewDsarTransfer {
  tenantId: string;
  requestId: string;
  recipientName: string;
  recipientEmail: string;
  basis: string;
  tokenHash: string;
  expiresAt: Date;
  createdById: string;
  now: Date;
}

export interface NewTransferEvent {
  kind: DsarTransferEventKind;
  actorType: DsarTransferActorType;
  actorId?: string | null;
  via?: DsarTransferDeliveryMethod;
  occurredAt: Date;
}

export interface DsarTransferRepositoryPort {
  /** The transfer and its CREATED event, in one transaction. */
  create(input: NewDsarTransfer): Promise<DsarTransferRecord>;

  /** A request's transfers with their events, oldest first. Scoped by tenant. */
  listForRequest(tenantId: string, requestId: string): Promise<DsarTransferWithEvents[]>;

  /** One transfer, only when it belongs to the tenant. */
  findForTenant(tenantId: string, id: string): Promise<DsarTransferRecord | null>;

  /** The public download: the transfer whose token has this HMAC, whatever its state. */
  findByTokenHash(tokenHash: string): Promise<DsarTransferRecord | null>;

  /**
   * Use the link, once: one conditional write that sets `usedAt` only while the transfer is
   * unused, not revoked and not expired, and writes the DOWNLOADED event in the same
   * transaction. False when another caller got there first or the link is no longer live.
   */
  claim(id: string, now: Date): Promise<boolean>;

  /**
   * Revoke, once: sets `revokedAt` only while unused, not revoked and not expired, with the
   * REVOKED event in the same transaction. Scoped by tenant. False when it was not live.
   */
  revoke(tenantId: string, id: string, actorId: string, now: Date): Promise<boolean>;

  /**
   * Record one event unless the transfer already has one of that kind (idempotent: a repeated
   * call is a no-op). Scoped by tenant. Returns true when a row was written.
   */
  recordEvent(tenantId: string, transferId: string, event: NewTransferEvent): Promise<boolean>;

  /**
   * Write an EXPIRED event, stamped with the expiry time, for every transfer of the request (or
   * of this one transfer) whose link ran out unused and unrevoked, and has none yet.
   */
  recordExpiries(
    scope: { tenantId: string; requestId?: string; transferId?: string },
    now: Date
  ): Promise<void>;
}
