/**
 * IFC-317 — Art 20(2) direct transfer service.
 *
 * In-memory fakes stand in for the ports. What the fakes cannot prove (the conditional UPDATE
 * that uses a link up, the hash being the only thing stored, tenant scoping in SQL, the event
 * rows) is proven against a real database in tests/integration/dsar-transfer.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import { DsarTransferService } from '../DsarTransferService';
import type { DsarExport } from '../DataSubjectRequestService';
import type { DsarRecord, DsarRepositoryPort } from '../../ports/repositories/DsarRepositoryPort';
import type {
  DsarTransferEventRecord,
  DsarTransferRecord,
  DsarTransferRepositoryPort,
  DsarTransferWithEvents,
  NewDsarTransfer,
  NewTransferEvent,
} from '../../ports/repositories/DsarTransferRepositoryPort';
import type { DsarNotice, DsarTokenPort } from '../../ports/external/DsarNotificationPort';

const NOW = new Date('2026-11-28T10:00:00Z');
const HOUR = 3_600_000;
const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';
const ADMIN = 'admin-1';
const APP = 'https://app.example.invalid';

const EXPORT: DsarExport = {
  generatedAt: NOW.toISOString(),
  processingInformation: {
    controller: { name: 'Smith Law', privacyUrl: null },
    purposes: [],
    categories: [],
    recipients: [],
    retention: '',
    source: '',
    rights: [],
    complaint: '',
    automatedDecisions: '',
  },
  data: { leads: [{ email: 'ada@example.invalid' }] },
  withheld: [],
};

function request(overrides: Partial<DsarRecord> = {}): DsarRecord {
  return {
    id: 'req-1',
    tenantId: TENANT,
    type: 'PORTABILITY',
    status: 'VERIFIED',
    source: 'PUBLIC_FORM',
    subjectEmail: 'ada@example.invalid',
    details: null,
    objectionScope: null,
    identityMethod: null,
    receivedAt: NOW,
    verificationTokenHash: null,
    verificationExpiresAt: null,
    verifiedAt: NOW,
    slaDeadline: null,
    extendedUntil: null,
    exportTokenHash: null,
    exportExpiresAt: null,
    exportIssuedAt: null,
    exportDownloads: 0,
    createdById: null,
    resolvedById: null,
    resolutionNote: null,
    clockBreached: false,
    erasureNoticeAt: null,
    completedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

class FakeRequests {
  rows = new Map<string, DsarRecord>();
  async findForTenant(tenantId: string, id: string) {
    const row = this.rows.get(id);
    return row && row.tenantId === tenantId ? row : null;
  }
  async findFirm(tenantId: string) {
    return { tenantId, name: 'Smith Law', handle: 'smith-law', privacyUrl: null };
  }
}

interface StoredTransfer extends DsarTransferRecord {
  tokenHash: string;
  events: DsarTransferEventRecord[];
}

class FakeTransfers implements DsarTransferRepositoryPort {
  rows: StoredTransfer[] = [];
  private seq = 0;

  private push(t: StoredTransfer, event: NewTransferEvent) {
    if (t.events.some((e) => e.kind === event.kind)) return false;
    this.seq += 1;
    t.events.push({
      id: `ev-${this.seq}`,
      transferId: t.id,
      kind: event.kind,
      actorType: event.actorType,
      actorId: event.actorId ?? null,
      actorLabel: event.actorId ? 'Ada Admin' : null,
      via: event.via ?? null,
      occurredAt: event.occurredAt,
    });
    return true;
  }

  async create(input: NewDsarTransfer) {
    this.seq += 1;
    const t: StoredTransfer = {
      id: `tr-${this.seq}`,
      tenantId: input.tenantId,
      requestId: input.requestId,
      recipientName: input.recipientName,
      recipientEmail: input.recipientEmail,
      basis: input.basis,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      revokedAt: null,
      createdById: input.createdById,
      createdAt: input.now,
      events: [],
    };
    this.rows.push(t);
    this.push(t, {
      kind: 'CREATED',
      actorType: 'ADMIN',
      actorId: input.createdById,
      occurredAt: input.now,
    });
    return this.strip(t);
  }
  private strip({ tokenHash: _h, events: _e, ...rest }: StoredTransfer): DsarTransferRecord {
    return rest;
  }
  async listForRequest(tenantId: string, requestId: string): Promise<DsarTransferWithEvents[]> {
    return this.rows
      .filter((t) => t.tenantId === tenantId && t.requestId === requestId)
      .map((t) => ({ ...this.strip(t), events: t.events }));
  }
  async findForTenant(tenantId: string, id: string) {
    const t = this.rows.find((r) => r.id === id && r.tenantId === tenantId);
    return t ? this.strip(t) : null;
  }
  async findByTokenHash(tokenHash: string) {
    const t = this.rows.find((r) => r.tokenHash === tokenHash);
    return t ? this.strip(t) : null;
  }
  /** Runs once, between the service's checks and the atomic claim. */
  beforeClaim: (() => void) | null = null;
  async claim(id: string, now: Date) {
    this.beforeClaim?.();
    this.beforeClaim = null;
    const t = this.rows.find((r) => r.id === id)!;
    if (t.usedAt || t.revokedAt || t.expiresAt <= now) return false;
    t.usedAt = now;
    this.push(t, { kind: 'DOWNLOADED', actorType: 'RECIPIENT', occurredAt: now });
    return true;
  }
  async revoke(tenantId: string, id: string, actorId: string, now: Date) {
    const t = this.rows.find((r) => r.id === id && r.tenantId === tenantId);
    if (!t || t.usedAt || t.revokedAt || t.expiresAt <= now) return false;
    t.revokedAt = now;
    this.push(t, { kind: 'REVOKED', actorType: 'ADMIN', actorId, occurredAt: now });
    return true;
  }
  async recordEvent(tenantId: string, transferId: string, event: NewTransferEvent) {
    const t = this.rows.find((r) => r.id === transferId && r.tenantId === tenantId);
    return t ? this.push(t, event) : false;
  }
  async recordExpiries(
    scope: { tenantId: string; requestId?: string; transferId?: string },
    now: Date
  ) {
    for (const t of this.rows) {
      if (t.tenantId !== scope.tenantId) continue;
      if (scope.requestId && t.requestId !== scope.requestId) continue;
      if (scope.transferId && t.id !== scope.transferId) continue;
      if (!t.usedAt && !t.revokedAt && t.expiresAt <= now) {
        this.push(t, { kind: 'EXPIRED', actorType: 'SYSTEM', occurredAt: t.expiresAt });
      }
    }
  }
}

/** Real HMAC behaviour, so the service must look the row up by hash and never store the token. */
const tokens: DsarTokenPort = {
  issue() {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token) };
  },
  hash: (token: string) => createHmac('sha256', 'test-key').update(token).digest('hex'),
  matches: () => false,
  capEmailHash: () => '0'.repeat(64),
};

let requests: FakeRequests;
let transfers: FakeTransfers;
let notices: DsarNotice[];
let emailAccepted: boolean;
let exportForRecord: ReturnType<typeof vi.fn>;
let service: DsarTransferService;

const CREATE = {
  tenantId: TENANT,
  requestId: 'req-1',
  actorId: ADMIN,
  recipientName: 'Jones & Co',
  recipientEmail: 'privacy@jones.example.invalid',
  basis: 'Asked by email on 3 November',
  now: NOW,
};

/** The raw token of the link in the one notice or manual link the create call produced. */
function tokenOf(link: string): string {
  return link.split('#t=')[1]!;
}

beforeEach(() => {
  requests = new FakeRequests();
  requests.rows.set('req-1', request());
  transfers = new FakeTransfers();
  notices = [];
  emailAccepted = true;
  exportForRecord = vi.fn().mockResolvedValue(EXPORT);
  service = new DsarTransferService({
    requests: requests as unknown as DsarRepositoryPort,
    transfers,
    exports: { exportForRecord },
    notifications: {
      send: async (notice: DsarNotice) => {
        notices.push(notice);
        return emailAccepted;
      },
    },
    tokens,
    appUrl: () => APP,
  });
});

async function created() {
  const result = await service.create(CREATE);
  if (result.outcome !== 'OK') throw new Error('create failed');
  const link = (notices[0] as Extract<DsarNotice, { kind: 'TRANSFER_LINK' }>).link;
  return { result, link, token: tokenOf(link) };
}

describe('create', () => {
  it('stores only the hash of the token and a seven-day expiry', async () => {
    const { token } = await created();
    const row = transfers.rows[0]!;
    expect(row.tokenHash).toBe(tokens.hash(token));
    expect(JSON.stringify(transfers.rows)).not.toContain(token);
    expect(row.expiresAt.getTime()).toBe(NOW.getTime() + 168 * HOUR);
  });

  it('emails the link to the recipient only: no person, request id or tenant in it', async () => {
    const { link } = await created();
    expect(notices).toHaveLength(1);
    const notice = notices[0]!;
    expect(notice).toMatchObject({
      kind: 'TRANSFER_LINK',
      to: 'privacy@jones.example.invalid',
      firmName: 'Smith Law',
    });
    expect(link).toMatch(new RegExp(`^${APP}/dsar/transfer#t=[A-Za-z0-9_-]{43}$`));
    for (const leak of ['req-1', TENANT, 'ada@example.invalid', 'smith-law']) {
      expect(link).not.toContain(leak);
    }
  });

  it('records CREATED then SENT (by email) with the approving admin', async () => {
    const { result } = await created();
    expect(result).toMatchObject({ delivered: true, manualLink: null });
    const events = transfers.rows[0]!.events;
    expect(events.map((e) => [e.kind, e.actorType, e.actorId, e.via])).toEqual([
      ['CREATED', 'ADMIN', ADMIN, null],
      ['SENT', 'ADMIN', ADMIN, 'EMAIL'],
    ]);
  });

  it('hands the admin the link, once, when the email is not accepted, and records no SENT', async () => {
    emailAccepted = false;
    const { result, link } = await created();
    expect(result).toMatchObject({ delivered: false, manualLink: link });
    expect(transfers.rows[0]!.events.map((e) => e.kind)).toEqual(['CREATED']);
  });

  it('treats a throwing email path as not delivered', async () => {
    const throwing = new DsarTransferService({
      requests: requests as unknown as DsarRepositoryPort,
      transfers,
      exports: { exportForRecord },
      notifications: {
        send: async () => {
          throw new Error('provider down');
        },
      },
      tokens,
      appUrl: () => APP,
    });
    const result = await throwing.create(CREATE);
    expect(result).toMatchObject({ outcome: 'OK', delivered: false });
  });

  it('refuses anything but a verified or completed portability request', async () => {
    for (const [overrides, label] of [
      [{ status: 'PENDING_VERIFICATION' as const }, 'unverified'],
      [{ status: 'REJECTED' as const }, 'rejected'],
      [{ type: 'ACCESS' as const }, 'access'],
      [{ type: 'ERASURE' as const }, 'erasure'],
    ] as const) {
      requests.rows.set('req-1', request(overrides));
      expect(await service.create(CREATE), label).toEqual({
        outcome: 'INVALID',
        field: 'transferNotAllowed',
      });
    }
    expect(transfers.rows).toHaveLength(0);
    expect(notices).toHaveLength(0);
  });

  it('allows a completed portability request', async () => {
    requests.rows.set('req-1', request({ status: 'COMPLETED' }));
    expect((await service.create(CREATE)).outcome).toBe('OK');
  });

  it('is NOT_FOUND for another firm’s request, creating nothing', async () => {
    expect(await service.create({ ...CREATE, tenantId: OTHER_TENANT })).toEqual({
      outcome: 'NOT_FOUND',
    });
    expect(transfers.rows).toHaveLength(0);
  });

  it('stores nothing when the app URL cannot be built', async () => {
    const broken = new DsarTransferService({
      requests: requests as unknown as DsarRepositoryPort,
      transfers,
      exports: { exportForRecord },
      notifications: { send: async () => true },
      tokens,
      appUrl: () => {
        throw new Error('APP_URL is required');
      },
    });
    await expect(broken.create(CREATE)).rejects.toThrow('APP_URL');
    expect(transfers.rows).toHaveLength(0);
  });
});

describe('download', () => {
  it('returns the export once, marks the link used and records DOWNLOADED', async () => {
    const { token } = await created();
    const result = await service.download({ token, now: new Date(NOW.getTime() + HOUR) });
    expect(result).toMatchObject({
      outcome: 'OK',
      export: EXPORT,
      tenantId: TENANT,
      requestId: 'req-1',
    });
    expect(exportForRecord).toHaveBeenCalledWith(requests.rows.get('req-1'), expect.any(Date));
    expect(transfers.rows[0]!.usedAt).not.toBeNull();
    expect(transfers.rows[0]!.events.map((e) => e.kind)).toEqual(['CREATED', 'SENT', 'DOWNLOADED']);
  });

  it('is single-use: the second download is NOT_FOUND', async () => {
    const { token } = await created();
    expect((await service.download({ token, now: NOW })).outcome).toBe('OK');
    expect(await service.download({ token, now: NOW })).toEqual({ outcome: 'NOT_FOUND' });
  });

  it('gives one export to two simultaneous downloads', async () => {
    const { token } = await created();
    const [a, b] = await Promise.all([
      service.download({ token, now: NOW }),
      service.download({ token, now: NOW }),
    ]);
    expect([a.outcome, b.outcome].sort()).toEqual(['NOT_FOUND', 'OK']);
  });

  it('loses the race cleanly: the atomic claim decides, not the earlier checks', async () => {
    const { token } = await created();
    transfers.beforeClaim = () => {
      transfers.rows[0]!.usedAt = NOW; // another caller got there first
    };
    expect(await service.download({ token, now: NOW })).toEqual({ outcome: 'NOT_FOUND' });
  });

  it('refuses at and after expiry, and records EXPIRED once, stamped with the expiry time', async () => {
    const { token } = await created();
    const expiry = new Date(NOW.getTime() + 168 * HOUR);
    expect(await service.download({ token, now: expiry })).toEqual({ outcome: 'NOT_FOUND' });
    expect(await service.download({ token, now: new Date(expiry.getTime() + HOUR) })).toEqual({
      outcome: 'NOT_FOUND',
    });
    const expired = transfers.rows[0]!.events.filter((e) => e.kind === 'EXPIRED');
    expect(expired).toHaveLength(1);
    expect(expired[0]).toMatchObject({ actorType: 'SYSTEM', occurredAt: expiry });
    expect(exportForRecord).not.toHaveBeenCalled();
  });

  it('works just before expiry', async () => {
    const { token } = await created();
    const before = new Date(NOW.getTime() + 168 * HOUR - 1);
    expect((await service.download({ token, now: before })).outcome).toBe('OK');
  });

  it('answers NOT_FOUND for an unknown or malformed token, without building anything', async () => {
    await created();
    for (const token of ['x', 'A'.repeat(43), '']) {
      expect(await service.download({ token, now: NOW })).toEqual({ outcome: 'NOT_FOUND' });
    }
    expect(exportForRecord).not.toHaveBeenCalled();
  });

  it('answers NOT_FOUND for a revoked link', async () => {
    const { token, result } = await created();
    await service.revoke({ tenantId: TENANT, id: result.transfer.id, actorId: ADMIN, now: NOW });
    expect(await service.download({ token, now: NOW })).toEqual({ outcome: 'NOT_FOUND' });
  });

  it('gives every dead link the identical answer (unknown, used, expired, revoked)', async () => {
    const a = await created();
    notices.length = 0;
    const b = await created();
    notices.length = 0;
    const c = await created();
    await service.download({ token: a.token, now: NOW });
    await service.revoke({ tenantId: TENANT, id: b.result.transfer.id, actorId: ADMIN, now: NOW });
    const late = new Date(NOW.getTime() + 200 * HOUR);
    const answers = [
      await service.download({ token: a.token, now: NOW }),
      await service.download({ token: b.token, now: NOW }),
      await service.download({ token: c.token, now: late }),
      await service.download({ token: 'nope', now: NOW }),
    ];
    for (const answer of answers) expect(answer).toStrictEqual({ outcome: 'NOT_FOUND' });
  });

  it('refuses when the request was rejected after the link was made, and keeps the link unused', async () => {
    const { token } = await created();
    requests.rows.set('req-1', request({ status: 'REJECTED' }));
    expect(await service.download({ token, now: NOW })).toEqual({ outcome: 'NOT_FOUND' });
    expect(transfers.rows[0]!.usedAt).toBeNull();
  });

  it('does not use the link up when the export cannot be built', async () => {
    const { token } = await created();
    exportForRecord.mockRejectedValueOnce(new Error('database down'));
    await expect(service.download({ token, now: NOW })).rejects.toThrow('database down');
    expect(transfers.rows[0]!.usedAt).toBeNull();
    expect((await service.download({ token, now: NOW })).outcome).toBe('OK');
  });
});

describe('revoke and markSent', () => {
  it('revokes a live link once and records REVOKED with the admin', async () => {
    const { result } = await created();
    const input = { tenantId: TENANT, id: result.transfer.id, actorId: ADMIN, now: NOW };
    expect(await service.revoke(input)).toEqual({ outcome: 'OK' });
    expect(await service.revoke(input)).toEqual({ outcome: 'CONFLICT' });
    expect(transfers.rows[0]!.events.at(-1)).toMatchObject({ kind: 'REVOKED', actorId: ADMIN });
  });

  it('cannot revoke a used link', async () => {
    const { result, token } = await created();
    await service.download({ token, now: NOW });
    expect(
      await service.revoke({ tenantId: TENANT, id: result.transfer.id, actorId: ADMIN, now: NOW })
    ).toEqual({ outcome: 'CONFLICT' });
  });

  it('scopes both by tenant: another firm’s admin gets NOT_FOUND', async () => {
    const { result } = await created();
    const foreign = { tenantId: OTHER_TENANT, id: result.transfer.id, actorId: 'x', now: NOW };
    expect(await service.revoke(foreign)).toEqual({ outcome: 'NOT_FOUND' });
    expect(await service.markSent(foreign)).toEqual({ outcome: 'NOT_FOUND' });
    expect(transfers.rows[0]!.revokedAt).toBeNull();
  });

  it('records a manual send once, only while the link is live', async () => {
    emailAccepted = false;
    const { result } = await created();
    const input = { tenantId: TENANT, id: result.transfer.id, actorId: ADMIN, now: NOW };
    expect(await service.markSent(input)).toEqual({ outcome: 'OK' });
    expect(transfers.rows[0]!.events.at(-1)).toMatchObject({ kind: 'SENT', via: 'MANUAL' });
    expect(await service.markSent(input)).toEqual({ outcome: 'CONFLICT' });
  });

  it('refuses to record a send for an expired link', async () => {
    emailAccepted = false;
    const { result } = await created();
    const late = new Date(NOW.getTime() + 169 * HOUR);
    expect(
      await service.markSent({
        tenantId: TENANT,
        id: result.transfer.id,
        actorId: ADMIN,
        now: late,
      })
    ).toEqual({ outcome: 'CONFLICT' });
  });
});

describe('list', () => {
  it('shows each transfer with its state and steps, writing expiries as they are noticed', async () => {
    const { result } = await created();
    const late = new Date(NOW.getTime() + 170 * HOUR);
    const listed = await service.list({ tenantId: TENANT, requestId: 'req-1', now: late });
    if (listed.outcome !== 'OK') throw new Error('list failed');
    expect(listed.transfers).toHaveLength(1);
    expect(listed.transfers[0]).toMatchObject({ id: result.transfer.id, state: 'EXPIRED' });
    expect(listed.transfers[0]!.events.map((e) => e.kind)).toEqual(['CREATED', 'SENT', 'EXPIRED']);
    // Listing again adds nothing.
    await service.list({ tenantId: TENANT, requestId: 'req-1', now: late });
    expect(transfers.rows[0]!.events.filter((e) => e.kind === 'EXPIRED')).toHaveLength(1);
  });

  it('never exposes the token or its hash', async () => {
    const { token } = await created();
    const listed = await service.list({ tenantId: TENANT, requestId: 'req-1', now: NOW });
    const text = JSON.stringify(listed);
    expect(text).not.toContain(token);
    expect(text).not.toContain(tokens.hash(token));
  });

  it('is NOT_FOUND for another firm’s request', async () => {
    await created();
    expect(await service.list({ tenantId: OTHER_TENANT, requestId: 'req-1', now: NOW })).toEqual({
      outcome: 'NOT_FOUND',
    });
  });
});
