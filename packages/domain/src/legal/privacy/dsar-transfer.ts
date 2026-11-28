/**
 * IFC-317 — direct transfer of a portability export to another controller (UK GDPR Art 20(2)).
 *
 * "Where technically feasible" the person may ask the firm to send their data straight to
 * another controller. The firm (controller) does it through an admin-approved transfer: an
 * administrator names the recipient, and the recipient gets a single-use link, valid for
 * `DSAR_TRANSFER_LIMITS.linkHours`, to the same export the person would get. Every step is
 * recorded as an event on the request. Pure rules shared by the validators, the service, the
 * adapters and the CHECKs of migration 20261128100000_dsar_transfers.
 */
import type { DsarRequestType, DsarStatus } from './dsar';

export const DSAR_TRANSFER_EVENT_KINDS = [
  'CREATED',
  'SENT',
  'DOWNLOADED',
  'EXPIRED',
  'REVOKED',
] as const;
export type DsarTransferEventKind = (typeof DSAR_TRANSFER_EVENT_KINDS)[number];

/** Who did it: an administrator, the recipient (by holding the link), or the system (expiry). */
export const DSAR_TRANSFER_ACTOR_TYPES = ['ADMIN', 'RECIPIENT', 'SYSTEM'] as const;
export type DsarTransferActorType = (typeof DSAR_TRANSFER_ACTOR_TYPES)[number];

/** How the link reached the recipient: the DSAR email path, or the admin by hand. */
export const DSAR_TRANSFER_DELIVERY_METHODS = ['EMAIL', 'MANUAL'] as const;
export type DsarTransferDeliveryMethod = (typeof DSAR_TRANSFER_DELIVERY_METHODS)[number];

export const DSAR_TRANSFER_LIMITS = {
  /** Seven days: long enough for a recipient to act, short enough to be a transfer, not a store. */
  linkHours: 168,
  recipientNameMax: 200,
  recipientEmailMax: 320,
  basisMin: 10,
  basisMax: 500,
} as const;

export type DsarTransferState = 'ACTIVE' | 'DOWNLOADED' | 'REVOKED' | 'EXPIRED';

interface TransferFields {
  usedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}

/** The one state a transfer is in. Used and revoked win over expiry: they happened first. */
export function dsarTransferState(transfer: TransferFields, now: Date): DsarTransferState {
  if (transfer.usedAt) return 'DOWNLOADED';
  if (transfer.revokedAt) return 'REVOKED';
  return transfer.expiresAt <= now ? 'EXPIRED' : 'ACTIVE';
}

/** A link that can still be used right now. */
export function dsarTransferIsLive(transfer: TransferFields, now: Date): boolean {
  return dsarTransferState(transfer, now) === 'ACTIVE';
}

/**
 * Art 20 covers portability requests only, and only once the person is verified: a pending
 * request has not proved who is asking, and a refused one has no right to act on.
 */
export function transferMayBeCreated(request: {
  type: DsarRequestType;
  status: DsarStatus;
}): boolean {
  return request.type === 'PORTABILITY' && ['VERIFIED', 'COMPLETED'].includes(request.status);
}
