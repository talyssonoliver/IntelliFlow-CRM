/**
 * IFC-317 — direct transfer of a portability export to another controller (UK GDPR Art 20(2)).
 *
 * "Where technically feasible" the person may ask the firm to send their data straight to
 * another controller. The firm does it through an admin-approved transfer: an administrator of
 * the firm names the recipient (name and contact email) on a confirmed portability request, and
 * the recipient gets a single-use link, valid for seven days, to the same export the person
 * would download.
 *
 * Safety rules, owned here and proven against a real database in tests/integration:
 *   - the link is 32 random bytes; only its HMAC is stored, never the token;
 *   - the first successful download uses the link up, in one conditional write;
 *   - expiry is checked on the server, against the stored time;
 *   - an unknown, used, revoked or expired token all answer the same: NOT_FOUND;
 *   - every step is an event on the request (created, sent, downloaded, expired, revoked);
 *   - the link is built from the token the service just issued, so nothing but the token is in it.
 *
 * Delivery uses the existing DSAR email path. When that fails the raw link is returned once to the
 * administrator, who sends it and records that they did (`markSent`); the service never keeps it.
 */
import {
  DSAR_TRANSFER_LIMITS,
  dsarTransferIsLive,
  dsarTransferState,
  transferMayBeCreated,
  type DsarTransferState,
} from '@intelliflow/domain';
import type { DsarRecord, DsarRepositoryPort } from '../ports/repositories/DsarRepositoryPort';
import type {
  DsarTransferEventRecord,
  DsarTransferRecord,
  DsarTransferRepositoryPort,
} from '../ports/repositories/DsarTransferRepositoryPort';
import type { DsarNotificationPort, DsarTokenPort } from '../ports/external/DsarNotificationPort';
import type { DsarExport } from './DataSubjectRequestService';

const MS_PER_HOUR = 3_600_000;

type NotFound = { outcome: 'NOT_FOUND' };
type Conflict = { outcome: 'CONFLICT' };
type Invalid = { outcome: 'INVALID'; field: string };

export interface DsarTransferServiceDeps {
  requests: DsarRepositoryPort;
  transfers: DsarTransferRepositoryPort;
  /** The export exactly as the person's own link would give it. */
  exports: { exportForRecord(record: DsarRecord, now: Date): Promise<DsarExport> };
  notifications: DsarNotificationPort;
  tokens: DsarTokenPort;
  /** Public origin of the web app; read when a link is built, so a missing setting fails that request. */
  appUrl: () => string;
}

export interface DsarTransferView extends DsarTransferRecord {
  state: DsarTransferState;
  events: DsarTransferEventRecord[];
}

export type CreateTransferResult =
  | {
      outcome: 'OK';
      transfer: DsarTransferRecord;
      /** The link reached the recipient by email. */
      delivered: boolean;
      /** Set only when it did not: the administrator sends it and says so with `markSent`. */
      manualLink: string | null;
    }
  | NotFound
  | Invalid;

export class DsarTransferService {
  constructor(private readonly deps: DsarTransferServiceDeps) {}

  // ─── Admin (callers enforce ADMIN of `tenantId`) ───────────────────────────────

  async create(input: {
    tenantId: string;
    requestId: string;
    actorId: string;
    recipientName: string;
    recipientEmail: string;
    basis: string;
    now: Date;
  }): Promise<CreateTransferResult> {
    const request = await this.deps.requests.findForTenant(input.tenantId, input.requestId);
    if (!request) return { outcome: 'NOT_FOUND' };
    if (!transferMayBeCreated(request)) return { outcome: 'INVALID', field: 'transferNotAllowed' };

    const firm = await this.deps.requests.findFirm(input.tenantId);
    const { token, hash } = this.deps.tokens.issue();
    // Built before anything is stored: a missing app URL must not leave a link nobody can send.
    const link = `${this.deps.appUrl()}/dsar/transfer#t=${token}`;
    const expiresAt = new Date(input.now.getTime() + DSAR_TRANSFER_LIMITS.linkHours * MS_PER_HOUR);

    const transfer = await this.deps.transfers.create({
      tenantId: input.tenantId,
      requestId: input.requestId,
      recipientName: input.recipientName,
      recipientEmail: input.recipientEmail,
      basis: input.basis,
      tokenHash: hash,
      expiresAt,
      createdById: input.actorId,
      now: input.now,
    });

    const delivered = await this.deps.notifications
      .send({
        kind: 'TRANSFER_LINK',
        to: transfer.recipientEmail,
        firmName: firm?.name ?? 'the firm',
        link,
        expiresAt,
      })
      .catch(() => false);
    if (delivered) {
      await this.deps.transfers
        .recordEvent(input.tenantId, transfer.id, {
          kind: 'SENT',
          actorType: 'ADMIN',
          actorId: input.actorId,
          via: 'EMAIL',
          occurredAt: input.now,
        })
        // The email has gone: a failed note must not undo the result the admin needs.
        .catch(() => false);
    }
    return { outcome: 'OK', transfer, delivered, manualLink: delivered ? null : link };
  }

  /** The admin sent a link that the email path could not (or chose not to) deliver. */
  async markSent(input: {
    tenantId: string;
    id: string;
    actorId: string;
    now: Date;
  }): Promise<{ outcome: 'OK'; requestId: string } | NotFound | Conflict> {
    const transfer = await this.deps.transfers.findForTenant(input.tenantId, input.id);
    if (!transfer) return { outcome: 'NOT_FOUND' };
    if (!dsarTransferIsLive(transfer, input.now)) return { outcome: 'CONFLICT' };
    // A link whose request was refused afterwards is dead (download refuses it), so it cannot be
    // recorded as sent either.
    const request = await this.deps.requests.findForTenant(input.tenantId, transfer.requestId);
    if (!request || !transferMayBeCreated(request)) return { outcome: 'CONFLICT' };
    const written = await this.deps.transfers.recordEvent(input.tenantId, input.id, {
      kind: 'SENT',
      actorType: 'ADMIN',
      actorId: input.actorId,
      via: 'MANUAL',
      occurredAt: input.now,
    });
    return written ? { outcome: 'OK', requestId: transfer.requestId } : { outcome: 'CONFLICT' };
  }

  async revoke(input: {
    tenantId: string;
    id: string;
    actorId: string;
    now: Date;
  }): Promise<{ outcome: 'OK'; requestId: string } | NotFound | Conflict> {
    const transfer = await this.deps.transfers.findForTenant(input.tenantId, input.id);
    if (!transfer) return { outcome: 'NOT_FOUND' };
    const revoked = await this.deps.transfers.revoke(
      input.tenantId,
      input.id,
      input.actorId,
      input.now
    );
    return revoked ? { outcome: 'OK', requestId: transfer.requestId } : { outcome: 'CONFLICT' };
  }

  /** The request's transfers and every step of each. Expiries are written as they are noticed. */
  async list(input: {
    tenantId: string;
    requestId: string;
    now: Date;
  }): Promise<{ outcome: 'OK'; transfers: DsarTransferView[] } | NotFound> {
    const request = await this.deps.requests.findForTenant(input.tenantId, input.requestId);
    if (!request) return { outcome: 'NOT_FOUND' };
    await this.deps.transfers.recordExpiries(
      { tenantId: input.tenantId, requestId: input.requestId },
      input.now
    );
    const rows = await this.deps.transfers.listForRequest(input.tenantId, input.requestId);
    return {
      outcome: 'OK',
      transfers: rows.map((row) => ({ ...row, state: dsarTransferState(row, input.now) })),
    };
  }

  // ─── Public: the other controller holding the link ──────────────────────────────

  /**
   * One answer for every way the link can be wrong: unknown, used, revoked, expired, or its
   * request no longer one that may be transferred. The export is built before the link is used
   * up (a build that fails must not burn it); the use itself is the atomic check, so two
   * simultaneous downloads yield one export.
   */
  async download(input: {
    token: string;
    now: Date;
  }): Promise<
    | { outcome: 'OK'; export: DsarExport; tenantId: string; requestId: string; transferId: string }
    | NotFound
  > {
    const transfer = await this.deps.transfers.findByTokenHash(this.deps.tokens.hash(input.token));
    if (!transfer) return { outcome: 'NOT_FOUND' };
    if (!dsarTransferIsLive(transfer, input.now)) {
      if (dsarTransferState(transfer, input.now) === 'EXPIRED') {
        await this.deps.transfers
          .recordExpiries({ tenantId: transfer.tenantId, transferId: transfer.id }, input.now)
          .catch(() => undefined);
      }
      return { outcome: 'NOT_FOUND' };
    }
    const request = await this.deps.requests.findForTenant(transfer.tenantId, transfer.requestId);
    if (!request || !transferMayBeCreated(request)) return { outcome: 'NOT_FOUND' };

    const built = await this.deps.exports.exportForRecord(request, input.now);
    if (!(await this.deps.transfers.claim(transfer.id, input.now))) return { outcome: 'NOT_FOUND' };
    return {
      outcome: 'OK',
      export: built,
      tenantId: transfer.tenantId,
      requestId: transfer.requestId,
      transferId: transfer.id,
    };
  }
}
