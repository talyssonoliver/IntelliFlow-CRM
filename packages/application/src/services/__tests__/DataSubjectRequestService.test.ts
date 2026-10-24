/**
 * PG-203 DSAR service (spec Addendum A, rounds 2-4, sign-off conditions 1-8).
 *
 * In-memory fakes stand in for the ports; the adapters' locking and transactions are proven
 * against a real database in tests/integration/dsar.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataSubjectRequestService, DSAR_SUBMIT_MESSAGE } from '../DataSubjectRequestService';
import type {
  DsarPatch,
  TransitionCondition,
  DsarRecord,
  DsarRepositoryPort,
  NewPublicDsar,
  NewStaffDsar,
  ReserveSubmissionResult,
  SubmitCaps,
} from '../../ports/repositories/DsarRepositoryPort';
import type { SubjectDataPort } from '../../ports/repositories/SubjectDataPort';
import type {
  ActiveRestriction,
  ProcessingRestrictionPort,
} from '../../ports/repositories/ProcessingRestrictionPort';
import type {
  DsarNotice,
  DsarNotificationPort,
  DsarTokenPort,
} from '../../ports/external/DsarNotificationPort';

const NOW = new Date('2026-10-22T10:00:00Z');
const HOUR = 3_600_000;
const FIRM = { tenantId: 'tenant-a', name: 'Smith Law', privacyUrl: null, handle: 'smith-law' };
const ADMIN = 'admin-1';

class FakeRepo implements DsarRepositoryPort {
  rows = new Map<string, DsarRecord>();
  reserveResult: 'CREATED' | 'COOLDOWN' | 'CAPPED' = 'CREATED';
  admins = 2;
  lastCaps?: SubmitCaps;
  private seq = 0;

  private make(
    fields: Partial<DsarRecord> & Pick<DsarRecord, 'tenantId' | 'type' | 'subjectEmail'>
  ): DsarRecord {
    this.seq += 1;
    const record: DsarRecord = {
      id: `req-${this.seq}`,
      status: 'PENDING_VERIFICATION',
      source: 'PUBLIC_FORM',
      details: null,
      objectionScope: null,
      identityMethod: null,
      receivedAt: NOW,
      verificationTokenHash: null,
      verificationExpiresAt: null,
      verifiedAt: null,
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
      ...fields,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async reserveSubmission(
    record: NewPublicDsar,
    caps: SubmitCaps
  ): Promise<ReserveSubmissionResult> {
    this.lastCaps = caps;
    if (this.reserveResult !== 'CREATED') return { outcome: this.reserveResult };
    return { outcome: 'CREATED', record: this.make({ ...record }) };
  }
  staffRestrictions: Array<NewStaffDsar['initialRestriction']> = [];
  async createStaff({ initialRestriction, ...record }: NewStaffDsar) {
    this.staffRestrictions.push(initialRestriction);
    return this.make({ ...record, source: 'STAFF', status: 'VERIFIED' });
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async findForTenant(tenantId: string, id: string) {
    const row = this.rows.get(id);
    return row && row.tenantId === tenantId ? row : null;
  }
  async list(tenantId: string) {
    return [...this.rows.values()].filter((r) => r.tenantId === tenantId);
  }
  async transition(
    tenantId: string,
    id: string,
    expected: DsarRecord['status'],
    patch: DsarPatch,
    condition?: TransitionCondition
  ) {
    const row = this.rows.get(id);
    if (!row || row.tenantId !== tenantId || row.status !== expected) return null;
    if (condition?.onlyIfNotExtended && row.extendedUntil) return null;
    // The status changes first (as the conditional UPDATE does); the restriction follows in
    // the same "transaction", and a failure rolls the status back.
    const next = { ...row, ...patch } as DsarRecord;
    this.rows.set(id, next);
    if (condition?.restrict) {
      try {
        await this.restrictionStore!.restrict({
          tenantId,
          subjectEmail: condition.restrict.subjectEmail,
          blocksMarketing: condition.restrict.blocksMarketing,
          dsarRequestId: id,
        });
      } catch (error) {
        this.rows.set(id, row);
        throw error;
      }
    }
    return next;
  }
  /** The fake restriction store, so a transition can write both "atomically". */
  restrictionStore: FakeRestrictions | null = null;
  async recordDownload(input: { id: string; tokenHash: string; maxDownloads: number; now: Date }) {
    this.beforeCount?.();
    this.beforeCount = null;
    const row = this.rows.get(input.id)!;
    if (row.exportTokenHash !== input.tokenHash) return false;
    if (!row.exportExpiresAt || row.exportExpiresAt <= input.now) return false;
    if (row.exportDownloads >= input.maxDownloads) return false;
    this.rows.set(input.id, { ...row, exportDownloads: row.exportDownloads + 1 });
    return true;
  }
  /** Runs once, between the service's token check and its download count. */
  beforeCount: (() => void) | null = null;
  async countAdmins() {
    return this.admins;
  }
  async findFirm(tenantId: string) {
    return tenantId === FIRM.tenantId ? FIRM : null;
  }
  seed(fields: Partial<DsarRecord> & Pick<DsarRecord, 'type'>) {
    return this.make({ tenantId: FIRM.tenantId, subjectEmail: 'ada@example.invalid', ...fields });
  }
}

class FakeRestrictions implements ProcessingRestrictionPort {
  rows: ActiveRestriction[] = [];
  lifted: string[] = [];
  async status(tenantId: string, email: string) {
    const row = this.rows.find((r) => r.tenantId === tenantId && r.subjectEmail === email);
    return row
      ? { restricted: true, blocksMarketing: row.blocksMarketing, since: row.createdAt }
      : { restricted: false, blocksMarketing: false, since: null };
  }
  async restrict(input: {
    tenantId: string;
    subjectEmail: string;
    blocksMarketing: boolean;
    dsarRequestId: string;
  }) {
    const existing = this.rows.find(
      (r) => r.tenantId === input.tenantId && r.subjectEmail === input.subjectEmail
    );
    if (existing) {
      existing.blocksMarketing = existing.blocksMarketing || input.blocksMarketing;
      existing.dsarRequestIds.push(input.dsarRequestId);
      return existing;
    }
    const row: ActiveRestriction = {
      id: `r-${this.rows.length + 1}`,
      tenantId: input.tenantId,
      subjectEmail: input.subjectEmail,
      blocksMarketing: input.blocksMarketing,
      dsarRequestIds: [input.dsarRequestId],
      createdAt: NOW,
    };
    this.rows.push(row);
    return row;
  }
  async findActive(tenantId: string, id: string) {
    return this.rows.find((r) => r.tenantId === tenantId && r.id === id) ?? null;
  }
  async listActive(tenantId: string) {
    return this.rows.filter((r) => r.tenantId === tenantId);
  }
  async liftForRequest(input: { tenantId: string; dsarRequestId: string }) {
    const row = this.rows.find(
      (r) => r.tenantId === input.tenantId && r.dsarRequestIds.includes(input.dsarRequestId)
    );
    if (!row) return null;
    this.rows = this.rows.filter((r) => r !== row);
    this.lifted.push(row.id);
    return row;
  }
  async lift(input: { tenantId: string; restrictionId: string; expectedRequestIds: string[] }) {
    const row = await this.findActive(input.tenantId, input.restrictionId);
    if (!row || row.dsarRequestIds.join() !== input.expectedRequestIds.join()) return null;
    this.rows = this.rows.filter((r) => r !== row);
    this.lifted.push(row.id);
    return row;
  }
  async followEmail() {}
}

let repo: FakeRepo;
let restrictions: FakeRestrictions;
let notices: DsarNotice[];
let notifications: DsarNotificationPort;
/** Notice kinds the email provider refuses in this test (everything else is accepted). */
let refusedKinds: Set<DsarNotice['kind']>;
let subjectData: SubjectDataPort & {
  buildExport: ReturnType<typeof vi.fn>;
  erase: ReturnType<typeof vi.fn>;
  previewErasure: ReturnType<typeof vi.fn>;
};
let service: DataSubjectRequestService;
let issued = 0;

const tokens: DsarTokenPort = {
  issue: () => {
    issued += 1;
    return { token: `token-${issued}`, hash: `hash-${issued}` };
  },
  matches: (token, stored) => stored !== null && stored === token.replace('token-', 'hash-'),
  capEmailHash: (email) => `cap:${email.replace(/\+[^@]*/, '')}`,
};

beforeEach(() => {
  issued = 0;
  repo = new FakeRepo();
  restrictions = new FakeRestrictions();
  repo.restrictionStore = restrictions;
  notices = [];
  refusedKinds = new Set();
  notifications = {
    send: async (notice) => {
      notices.push(notice);
      return !refusedKinds.has(notice.kind);
    },
  };
  subjectData = {
    buildExport: vi.fn().mockResolvedValue({ data: { leads: [] }, withheld: {} }),
    erase: vi.fn().mockResolvedValue({
      outcome: 'ERASED',
      result: { counts: { leads: 1 }, checklist: { emailRecords: 2 } },
    }),
    previewErasure: vi.fn().mockResolvedValue({ counts: {}, checklist: {} }),
  };
  service = new DataSubjectRequestService({
    repo,
    subjectData,
    restrictions,
    notifications,
    tokens,
    appUrl: () => 'https://app.example.invalid',
  });
});

const submit = (overrides: Record<string, unknown> = {}) =>
  service.submit({
    firm: FIRM,
    type: 'ERASURE',
    email: 'ada@example.invalid',
    details: null,
    objectionScope: null,
    ipHash: 'ip-1',
    now: NOW,
    ...overrides,
  });

describe('submit (D-AC-02)', () => {
  it('stores a pending request and emails a fragment link; the response never varies', async () => {
    const result = await submit();
    expect(result).toEqual({ outcome: 'ACCEPTED', message: DSAR_SUBMIT_MESSAGE });
    const row = [...repo.rows.values()][0];
    expect(row).toMatchObject({ status: 'PENDING_VERIFICATION', verificationTokenHash: 'hash-1' });
    expect(row.verificationExpiresAt!.getTime() - NOW.getTime()).toBe(24 * HOUR);
    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(notices[0]).toMatchObject({ kind: 'VERIFY_LINK', to: 'ada@example.invalid' });
    const link = (notices[0] as { link: string }).link;
    expect(link).toBe(`https://app.example.invalid/dsar/smith-law/verify#r=${row.id}.token-1`);
    expect(new URL(link).search).toBe('');
  });

  it('passes the spec caps to the atomic reservation, skipping the IP cap when the IP is unknown', async () => {
    await submit({ ipHash: null });
    expect(repo.lastCaps).toEqual({
      perTenantEmailPerDay: 3,
      perIpPerHour: 10,
      globalEmailPerDay: 3,
      resendCooldownMinutes: 60,
    });
    const row = [...repo.rows.values()][0];
    expect(row).toBeDefined();
  });

  it('a cooldown hit answers the same and sends nothing; a cap hit is TOO_MANY', async () => {
    repo.reserveResult = 'COOLDOWN';
    expect(await submit()).toEqual({ outcome: 'ACCEPTED', message: DSAR_SUBMIT_MESSAGE });
    repo.reserveResult = 'CAPPED';
    expect(await submit()).toEqual({ outcome: 'TOO_MANY' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(notices).toHaveLength(0);
  });
});

describe('verify (D-AC-03/04/05)', () => {
  it('is single-use: the hash is cleared and a second verify fails generically', async () => {
    await submit({ type: 'RECTIFICATION' });
    const id = [...repo.rows.keys()][0];
    const first = await service.verify({ requestId: id, token: 'token-1', now: NOW });
    expect(first).toMatchObject({
      outcome: 'VERIFIED',
      type: 'RECTIFICATION',
      exportEmailed: false,
    });
    expect(repo.rows.get(id)).toMatchObject({ status: 'VERIFIED', verificationTokenHash: null });
    expect(await service.verify({ requestId: id, token: 'token-1', now: NOW })).toEqual({
      outcome: 'INVALID',
    });
  });

  it('starts a one-calendar-month clock and tells the person and the admins (no PII to admins)', async () => {
    await submit({ type: 'RECTIFICATION' });
    const id = [...repo.rows.keys()][0];
    notices.length = 0;
    await service.verify({ requestId: id, token: 'token-1', now: NOW });
    expect(repo.rows.get(id)!.slaDeadline!.toISOString()).toBe('2026-11-22T10:00:00.000Z');
    expect(notices.map((n) => n.kind).sort()).toEqual(['ADMIN_NEW_REQUEST', 'VERIFIED']);
    const admin = notices.find((n) => n.kind === 'ADMIN_NEW_REQUEST')!;
    expect(JSON.stringify(admin)).not.toContain('ada@example.invalid');
  });

  it('rejects an unknown id, a wrong token and an expired link with the same answer', async () => {
    await submit();
    const id = [...repo.rows.keys()][0];
    expect(await service.verify({ requestId: 'nope', token: 'token-1', now: NOW })).toEqual({
      outcome: 'INVALID',
    });
    expect(await service.verify({ requestId: id, token: 'token-9', now: NOW })).toEqual({
      outcome: 'INVALID',
    });
    expect(
      await service.verify({
        requestId: id,
        token: 'token-1',
        now: new Date(NOW.getTime() + 25 * HOUR),
      })
    ).toEqual({ outcome: 'INVALID' });
  });

  it('a RESTRICTION starts restricting at verification (security R3)', async () => {
    await submit({ type: 'RESTRICTION' });
    const id = [...repo.rows.keys()][0];
    await service.verify({ requestId: id, token: 'token-1', now: NOW });
    expect(restrictions.rows).toHaveLength(1);
    expect(restrictions.rows[0]).toMatchObject({ blocksMarketing: false, dsarRequestIds: [id] });
  });

  it('a losing simultaneous verification writes no restriction at all (codex)', async () => {
    await submit({ type: 'RESTRICTION' });
    const id = [...repo.rows.keys()][0];
    const restrict = vi.spyOn(restrictions, 'restrict');
    const results = await Promise.all([
      service.verify({ requestId: id, token: 'token-1', now: NOW }),
      service.verify({ requestId: id, token: 'token-1', now: NOW }),
    ]);
    expect(results.map((r) => r.outcome).sort()).toEqual(['INVALID', 'VERIFIED']);
    expect(restrict).toHaveBeenCalledTimes(1);
    restrict.mockRestore();
  });

  it('a failed restriction write leaves the link usable, so a retry applies both (codex)', async () => {
    await submit({ type: 'RESTRICTION' });
    const id = [...repo.rows.keys()][0];
    const restrict = vi.spyOn(restrictions, 'restrict').mockRejectedValueOnce(new Error('db down'));
    await expect(service.verify({ requestId: id, token: 'token-1', now: NOW })).rejects.toThrow(
      'db down'
    );
    expect(repo.rows.get(id)).toMatchObject({
      status: 'PENDING_VERIFICATION',
      verificationTokenHash: 'hash-1',
    });
    restrict.mockRestore();
    expect((await service.verify({ requestId: id, token: 'token-1', now: NOW })).outcome).toBe(
      'VERIFIED'
    );
    expect(restrictions.rows).toHaveLength(1);
  });

  it('ACCESS with withheld categories issues the export but stays VERIFIED (compliance R3)', async () => {
    subjectData.buildExport.mockResolvedValue({ data: {}, withheld: { NOTES: 2 } });
    await submit({ type: 'ACCESS' });
    const id = [...repo.rows.keys()][0];
    const result = await service.verify({ requestId: id, token: 'token-1', now: NOW });
    expect(result).toMatchObject({ outcome: 'VERIFIED', exportEmailed: true });
    expect(repo.rows.get(id)).toMatchObject({ status: 'VERIFIED', exportIssuedAt: NOW });
    expect(repo.rows.get(id)!.exportExpiresAt!.getTime() - NOW.getTime()).toBe(72 * HOUR);
    const exportNotice = notices.find((n) => n.kind === 'EXPORT_LINK') as {
      link: string;
      withheld: boolean;
    };
    expect(exportNotice.withheld).toBe(true);
    expect(exportNotice.link).toBe(
      `https://app.example.invalid/dsar/smith-law/export#r=${id}.token-2`
    );
  });

  it('ACCESS with nothing withheld completes at verification', async () => {
    await submit({ type: 'PORTABILITY' });
    const id = [...repo.rows.keys()][0];
    await service.verify({ requestId: id, token: 'token-1', now: NOW });
    expect(repo.rows.get(id)).toMatchObject({ status: 'COMPLETED', completedAt: NOW });
  });

  it('never completes an access request whose export email was refused (codex)', async () => {
    await submit({ type: 'PORTABILITY' });
    const id = [...repo.rows.keys()][0];
    refusedKinds.add('EXPORT_LINK');
    const result = await service.verify({ requestId: id, token: 'token-1', now: NOW });
    expect(result).toMatchObject({ outcome: 'VERIFIED', exportEmailed: false });
    // Open for the admin (exportData + completeAccess); the unsent token no longer works.
    expect(repo.rows.get(id)).toMatchObject({
      status: 'VERIFIED',
      exportTokenHash: null,
      exportExpiresAt: null,
      completedAt: null,
    });
    expect(repo.rows.get(id)!.exportIssuedAt ?? null).toBeNull();
    expect(
      (await service.downloadExport({ requestId: id, token: 'token-2', now: NOW })).outcome
    ).toBe('INVALID');
  });
});

describe('downloadExport (D-AC-04)', () => {
  async function issuedExport() {
    await submit({ type: 'ACCESS' });
    const id = [...repo.rows.keys()][0];
    await service.verify({ requestId: id, token: 'token-1', now: NOW });
    return id;
  }

  it('returns the live export with processing information', async () => {
    const id = await issuedExport();
    const result = await service.downloadExport({ requestId: id, token: 'token-2', now: NOW });
    expect(result.outcome).toBe('OK');
    if (result.outcome !== 'OK') return;
    expect(result.export.processingInformation.controller).toEqual({
      name: 'Smith Law',
      privacyUrl: null,
    });
    expect(result.export.processingInformation.complaint).toMatch(/Information Commissioner/);
    expect(subjectData.buildExport).toHaveBeenLastCalledWith('tenant-a', 'ada@example.invalid');
  });

  it('expires after 72 hours, caps downloads at 5 and refuses a wrong token', async () => {
    const id = await issuedExport();
    expect(
      await service.downloadExport({
        requestId: id,
        token: 'token-2',
        now: new Date(NOW.getTime() + 73 * HOUR),
      })
    ).toEqual({ outcome: 'INVALID' });
    expect(await service.downloadExport({ requestId: id, token: 'token-1', now: NOW })).toEqual({
      outcome: 'INVALID',
    });
    for (let i = 0; i < 5; i++) {
      expect(
        (await service.downloadExport({ requestId: id, token: 'token-2', now: NOW })).outcome
      ).toBe('OK');
    }
    expect(await service.downloadExport({ requestId: id, token: 'token-2', now: NOW })).toEqual({
      outcome: 'LIMIT',
    });
  });

  it('refuses a download revoked between the token check and the count (codex)', async () => {
    const id = await issuedExport();
    repo.beforeCount = () => {
      service.revokeExport({ tenantId: 'tenant-a', id, actorId: ADMIN }).catch(() => undefined);
      const row = repo.rows.get(id)!;
      repo.rows.set(id, { ...row, exportTokenHash: null, exportExpiresAt: null });
    };
    const builtBefore = subjectData.buildExport.mock.calls.length;
    expect(await service.downloadExport({ requestId: id, token: 'token-2', now: NOW })).toEqual({
      outcome: 'INVALID',
    });
    expect(subjectData.buildExport.mock.calls.length).toBe(builtBefore); // no data built
  });

  it('a rejected request takes its emailed export link with it (codex HIGH)', async () => {
    const id = await issuedExport();
    // An access request with withheld data stays VERIFIED after its link was emailed.
    repo.rows.set(id, { ...repo.rows.get(id)!, status: 'VERIFIED' });
    const rejected = await service.reject({
      tenantId: 'tenant-a',
      id,
      actorId: ADMIN,
      reason: 'Manifestly unfounded after review',
      now: NOW,
    });
    expect(rejected.outcome).toBe('OK');
    expect(repo.rows.get(id)).toMatchObject({ exportTokenHash: null, exportExpiresAt: null });
    expect(await service.downloadExport({ requestId: id, token: 'token-2', now: NOW })).toEqual({
      outcome: 'INVALID',
    });
  });

  it('refuses a rejected request even while it still holds a live link', async () => {
    const id = await issuedExport();
    repo.rows.set(id, { ...repo.rows.get(id)!, status: 'REJECTED' });
    expect(await service.downloadExport({ requestId: id, token: 'token-2', now: NOW })).toEqual({
      outcome: 'INVALID',
    });
  });

  it('a revoked export link stops working', async () => {
    const id = await issuedExport();
    await service.revokeExport({ tenantId: 'tenant-a', id, actorId: ADMIN });
    expect(await service.downloadExport({ requestId: id, token: 'token-2', now: NOW })).toEqual({
      outcome: 'INVALID',
    });
  });
});

describe('staff requests (compliance R3; security S5)', () => {
  const log = (overrides: Record<string, unknown> = {}) =>
    service.logRequest({
      tenantId: 'tenant-a',
      actorId: ADMIN,
      firm: FIRM,
      type: 'ERASURE',
      email: 'ada@example.invalid',
      details: null,
      objectionScope: null,
      receivedOn: '2026-10-22',
      receivedOnReason: null,
      identityMethod: 'SIGNED_LETTER',
      identityNote: 'Signed letter matched the address on file',
      now: NOW,
      ...overrides,
    });

  it('starts VERIFIED, runs the clock from the received date and notifies the person', async () => {
    const result = await log({
      receivedOn: '2026-10-20',
      receivedOnReason: 'Letter arrived Monday',
    });
    expect(result.outcome).toBe('OK');
    const row = [...repo.rows.values()][0];
    expect(row.status).toBe('VERIFIED');
    expect(row.slaDeadline!.toISOString()).toBe('2026-11-20T00:00:00.000Z');
    expect(notices.some((n) => n.kind === 'ERASURE_LOGGED')).toBe(true);
  });

  it('needs a reason when backdated, and refuses future dates and more than 30 days back', async () => {
    expect((await log({ receivedOn: '2026-10-20' })).outcome).toBe('INVALID');
    expect((await log({ receivedOn: '2026-10-23' })).outcome).toBe('INVALID');
    expect((await log({ receivedOn: '2026-09-20', receivedOnReason: 'Old letter' })).outcome).toBe(
      'INVALID'
    );
  });

  it('a staff RESTRICTION is created with its restriction in one write (codex)', async () => {
    const result = await service.logRequest({
      tenantId: 'tenant-a',
      actorId: ADMIN,
      firm: { name: 'Smith Law' },
      type: 'RESTRICTION',
      email: 'ada@example.invalid',
      details: null,
      objectionScope: null,
      receivedOn: '2026-10-22',
      receivedOnReason: null,
      identityMethod: 'IN_PERSON_ID',
      identityNote: 'Passport checked at the front desk',
      now: NOW,
    });
    expect(result.outcome).toBe('OK');
    expect(repo.staffRestrictions).toEqual([{ blocksMarketing: false }]);
    // No separate, second write that could fail on its own.
    expect(restrictions.rows).toHaveLength(0);
  });

  it('an erasure needs a second admin, or a 24-hour pause when the firm has one admin', async () => {
    await log();
    const id = [...repo.rows.keys()][0];
    const sameAdmin = await service.complete({
      tenantId: 'tenant-a',
      id,
      actorId: ADMIN,
      note: 'Erased',
      noHoldConfirmed: true,
      now: NOW,
    });
    expect(sameAdmin).toEqual({ outcome: 'REFUSED', reason: 'SECOND_ADMIN_REQUIRED' });
    repo.admins = 1;
    const early = await service.complete({
      tenantId: 'tenant-a',
      id,
      actorId: ADMIN,
      note: 'Erased',
      noHoldConfirmed: true,
      now: new Date(NOW.getTime() + HOUR),
    });
    expect(early).toEqual({ outcome: 'REFUSED', reason: 'WAIT_24H' });
  });

  it('records the erasure warning, and refuses to erase until a warning was accepted (codex)', async () => {
    refusedKinds.add('ERASURE_LOGGED');
    await log();
    const id = [...repo.rows.keys()][0];
    expect(repo.rows.get(id)!.erasureNoticeAt).toBeNull();
    const blocked = await service.complete({
      tenantId: 'tenant-a',
      id,
      actorId: 'admin-2',
      note: 'Erased',
      noHoldConfirmed: true,
      now: NOW,
    });
    expect(blocked).toEqual({ outcome: 'REFUSED', reason: 'ERASURE_NOTICE_NOT_SENT' });
    expect(subjectData.erase).not.toHaveBeenCalled();
    // The email works again: the warning is sent now, and a second admin may proceed.
    refusedKinds.delete('ERASURE_LOGGED');
    const done = await service.complete({
      tenantId: 'tenant-a',
      id,
      actorId: 'admin-2',
      note: 'Erased',
      noHoldConfirmed: true,
      now: NOW,
    });
    expect(done.outcome).toBe('OK');
    expect(repo.rows.get(id)!.erasureNoticeAt).toEqual(NOW);
  });

  it('a single admin waits 24 hours from the warning, not from logging (codex)', async () => {
    refusedKinds.add('ERASURE_LOGGED');
    await log();
    const id = [...repo.rows.keys()][0];
    repo.admins = 1;
    refusedKinds.delete('ERASURE_LOGGED');
    const later = new Date(NOW.getTime() + 30 * HOUR);
    // 30 h after logging, but the warning only goes out now: the pause starts now.
    expect(
      await service.complete({
        tenantId: 'tenant-a',
        id,
        actorId: ADMIN,
        note: 'Erased',
        noHoldConfirmed: true,
        now: later,
      })
    ).toEqual({ outcome: 'REFUSED', reason: 'WAIT_24H' });
    expect(repo.rows.get(id)!.erasureNoticeAt).toEqual(later);
  });

  it('an erasure can be cancelled, with an audit note and an email to the person', async () => {
    await log();
    const id = [...repo.rows.keys()][0];
    notices.length = 0;
    const result = await service.cancelErasure({
      tenantId: 'tenant-a',
      id,
      actorId: 'admin-2',
      reason: 'Logged by mistake',
    });
    expect(result.outcome).toBe('OK');
    expect(repo.rows.get(id)).toMatchObject({
      status: 'REJECTED',
      resolutionNote: 'Cancelled: Logged by mistake',
    });
    expect(notices.map((n) => n.kind)).toEqual(['ERASURE_CANCELLED']);
    expect(repo.rows.get(id)!.clockBreached).toBe(false);
  });

  it('records a cancellation after the deadline as late (codex)', async () => {
    await log();
    const id = [...repo.rows.keys()][0];
    const afterDeadline = new Date(repo.rows.get(id)!.slaDeadline!.getTime() + 86_400_000);
    await service.cancelErasure({
      tenantId: 'tenant-a',
      id,
      actorId: 'admin-2',
      reason: 'Logged by mistake',
      now: afterDeadline,
    });
    expect(repo.rows.get(id)).toMatchObject({
      status: 'REJECTED',
      clockBreached: true,
      completedAt: afterDeadline,
    });
  });
});

describe('complete (D-AC-06/08)', () => {
  async function verified(type: string, objectionScope: string | null = null) {
    await submit({ type, objectionScope });
    const id = [...repo.rows.keys()][0];
    await service.verify({ requestId: id, token: 'token-1', now: NOW });
    notices.length = 0;
    return id;
  }

  it('an erasure answered after the deadline is recorded as late (codex)', async () => {
    const id = await verified('ERASURE');
    await service.complete({
      tenantId: 'tenant-a',
      id,
      actorId: 'admin-2',
      note: 'Erased',
      noHoldConfirmed: true,
      now: new Date('2026-12-01T00:00:00Z'),
    });
    expect(subjectData.erase).toHaveBeenCalledWith(
      expect.objectContaining({ clockBreached: true })
    );
  });

  it('an erasure requires the no-hold confirmation and erases in one adapter call', async () => {
    const id = await verified('ERASURE');
    expect(
      await service.complete({
        tenantId: 'tenant-a',
        id,
        actorId: 'admin-2',
        note: 'Erased',
        now: NOW,
      })
    ).toEqual({ outcome: 'INVALID', field: 'noHoldConfirmed' });
    const done = await service.complete({
      tenantId: 'tenant-a',
      id,
      actorId: 'admin-2',
      note: 'Erased',
      noHoldConfirmed: true,
      now: NOW,
    });
    expect(done).toEqual({
      outcome: 'OK',
      erasure: { counts: { leads: 1 }, checklist: { emailRecords: 2 } },
    });
    expect(subjectData.erase).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        requestId: id,
        subjectEmail: 'ada@example.invalid',
      })
    );
    expect(notices.map((n) => n.kind)).toEqual(['COMPLETED']);
  });

  it('a committed verification is reported even when the firm lookup or export issue fails (codex)', async () => {
    await submit({ type: 'ACCESS' });
    const id = [...repo.rows.keys()][0];
    const findFirm = vi.spyOn(repo, 'findFirm').mockRejectedValue(new Error('db down'));
    await expect(
      service.verify({ requestId: id, token: 'token-1', now: NOW })
    ).resolves.toMatchObject({
      outcome: 'VERIFIED',
      exportEmailed: false,
    });
    expect(repo.rows.get(id)!.status).toBe('VERIFIED');
    findFirm.mockRestore();

    await submit({ type: 'ACCESS', email: 'bob@example.invalid' });
    const second = [...repo.rows.keys()][1]!;
    subjectData.buildExport.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.verify({ requestId: second, token: 'token-2', now: NOW })
    ).resolves.toMatchObject({ outcome: 'VERIFIED', exportEmailed: false });
  });

  it('returns the committed erasure even when the firm lookup for the email fails (codex)', async () => {
    const id = await verified('ERASURE');
    const findFirm = vi.spyOn(repo, 'findFirm').mockRejectedValue(new Error('db down'));
    await expect(
      service.complete({
        tenantId: 'tenant-a',
        id,
        actorId: 'admin-2',
        note: 'Erased',
        noHoldConfirmed: true,
        now: NOW,
      })
    ).resolves.toEqual({
      outcome: 'OK',
      erasure: { counts: { leads: 1 }, checklist: { emailRecords: 2 } },
    });
    expect(notices.map((n) => n.kind)).toEqual(['COMPLETED']);
    findFirm.mockRestore();
  });

  it('a double-run erasure is a CONFLICT (the adapter re-reads the request under the lock)', async () => {
    const id = await verified('ERASURE');
    subjectData.erase.mockResolvedValueOnce({ outcome: 'NOT_PENDING' });
    expect(
      await service.complete({
        tenantId: 'tenant-a',
        id,
        actorId: 'admin-2',
        note: 'Erased',
        noHoldConfirmed: true,
        now: NOW,
      })
    ).toEqual({ outcome: 'CONFLICT' });
  });

  it('a MARKETING objection restricts with blocksMarketing and needs the stop method (Art 21(3))', async () => {
    const id = await verified('OBJECTION', 'MARKETING');
    expect(
      await service.complete({
        tenantId: 'tenant-a',
        id,
        actorId: ADMIN,
        note: 'Recorded',
        now: NOW,
      })
    ).toEqual({ outcome: 'INVALID', field: 'marketingStopMethod' });
    const done = await service.complete({
      tenantId: 'tenant-a',
      id,
      actorId: ADMIN,
      note: 'Recorded',
      marketingStoppedConfirmed: true,
      marketingStopMethod: 'Removed from the newsletter list',
      now: NOW,
    });
    expect(done.outcome).toBe('OK');
    expect(restrictions.rows[0]).toMatchObject({ blocksMarketing: true });
    expect(repo.rows.get(id)).toMatchObject({
      marketingStopMethod: 'Removed from the newsletter list',
    });
    expect(notices[0]).toMatchObject({ kind: 'COMPLETED', marketingStopped: true });
  });

  it('a RESTRICTION followed by an OBJECTION on the same person keeps one merged restriction', async () => {
    const restrictionId = await verified('RESTRICTION');
    repo.rows.clear();
    issued = 0;
    const objectionId = await verified('OBJECTION', 'MARKETING');
    await service.complete({
      tenantId: 'tenant-a',
      id: objectionId,
      actorId: ADMIN,
      note: 'Recorded',
      marketingStoppedConfirmed: true,
      marketingStopMethod: 'Removed from the newsletter list',
      now: NOW,
    });
    expect(restrictions.rows).toHaveLength(1);
    expect(restrictions.rows[0]).toMatchObject({ blocksMarketing: true });
    expect(restrictions.rows[0].dsarRequestIds).toEqual([restrictionId, objectionId]);
  });

  it('a rejection that wins first leaves no objection restriction behind (codex)', async () => {
    const id = await verified('OBJECTION', 'OTHER');
    // The admin reads the request, then another admin rejects it before completion writes.
    const real = repo.findForTenant.bind(repo);
    vi.spyOn(repo, 'findForTenant').mockImplementationOnce(async (t, i) => {
      const snapshot = await real(t, i);
      await service.reject({
        tenantId: 'tenant-a',
        id,
        actorId: 'admin-2',
        reason: 'Compelling legitimate grounds apply',
        now: NOW,
      });
      return snapshot;
    });
    const result = await service.complete({
      tenantId: 'tenant-a',
      id,
      actorId: ADMIN,
      note: 'Objection upheld',
      now: NOW,
    });
    expect(result).toEqual({ outcome: 'CONFLICT' });
    expect(restrictions.rows).toHaveLength(0);
  });

  it('rejecting a RESTRICTION tells the person before lifting it (Art 18(3))', async () => {
    const id = await verified('RESTRICTION');
    const result = await service.reject({
      tenantId: 'tenant-a',
      id,
      actorId: ADMIN,
      reason: 'The data is accurate as recorded',
      now: NOW,
    });
    expect(result).toEqual({ outcome: 'OK', restrictionKept: false });
    expect(notices.map((n) => n.kind)).toEqual(['RESTRICTION_LIFTING', 'REJECTED']);
    expect(restrictions.rows).toHaveLength(0);
  });

  it('keeps the restriction when the lifting notice could not be sent (codex)', async () => {
    const id = await verified('RESTRICTION');
    refusedKinds.add('RESTRICTION_LIFTING');
    const result = await service.reject({
      tenantId: 'tenant-a',
      id,
      actorId: ADMIN,
      reason: 'The data is accurate as recorded',
      now: NOW,
    });
    expect(result).toEqual({ outcome: 'OK', restrictionKept: true });
    expect(restrictions.rows).toHaveLength(1);
    expect(repo.rows.get(id)).toMatchObject({ status: 'REJECTED' });
  });

  it('rejecting a request another admin already completed lifts nothing (codex)', async () => {
    const id = await verified('RESTRICTION');
    await service.complete({
      tenantId: 'tenant-a',
      id,
      actorId: 'admin-2',
      note: 'Kept',
      now: NOW,
    });
    notices.length = 0;
    const result = await service.reject({
      tenantId: 'tenant-a',
      id,
      actorId: ADMIN,
      reason: 'The data is accurate as recorded',
      now: NOW,
    });
    expect(result).toEqual({ outcome: 'CONFLICT' });
    expect(restrictions.rows).toHaveLength(1);
    expect(notices).toHaveLength(0);
  });

  it('a late rejection is allowed but flagged as a breached clock', async () => {
    const id = await verified('RECTIFICATION');
    await service.reject({
      tenantId: 'tenant-a',
      id,
      actorId: ADMIN,
      reason: 'Not personal data we hold',
      now: new Date('2026-12-01T00:00:00Z'),
    });
    expect(repo.rows.get(id)).toMatchObject({ status: 'REJECTED', clockBreached: true });
    expect(notices.find((n) => n.kind === 'REJECTED')).toMatchObject({ late: true });
  });

  it('completeAccess records what was withheld and closes the request', async () => {
    subjectData.buildExport.mockResolvedValue({ data: {}, withheld: { NOTES: 2 } });
    const id = await verified('ACCESS');
    const result = await service.completeAccess({
      tenantId: 'tenant-a',
      id,
      actorId: ADMIN,
      note: 'Supplementary disclosure sent',
      withheld: [{ category: 'NOTES', count: 2, reason: 'Legal professional privilege' }],
      now: NOW,
    });
    expect(result.outcome).toBe('OK');
    expect(repo.rows.get(id)).toMatchObject({ status: 'COMPLETED' });
    expect(repo.rows.get(id)!.resolutionNote).toContain('NOTES: 2 (Legal professional privilege)');
    // The person is told what was withheld and why (codex: Art 12(4), 15(4)).
    await vi.waitFor(() =>
      expect(notices.find((n) => n.kind === 'COMPLETED')).toMatchObject({
        type: 'ACCESS',
        withheld: [{ category: 'NOTES', count: 2, reason: 'Legal professional privilege' }],
      })
    );
    // A copy downloaded afterwards points to those reasons, not to a review still to come.
    const row = repo.rows.get(id)!;
    repo.rows.set(id, {
      ...row,
      exportTokenHash: 'hash-x',
      exportExpiresAt: new Date(NOW.getTime() + 86_400_000),
    });
    const download = await service.downloadExport({ requestId: id, token: 'token-x', now: NOW });
    expect(download.outcome).toBe('OK');
    if (download.outcome !== 'OK') return;
    expect(download.export.withheld[0]!.note).toContain('reasons were sent to you by email');
  });

  it('refuses an access completion whose stored note would exceed 2000 characters (codex)', async () => {
    subjectData.buildExport.mockResolvedValue({ data: {}, withheld: { NOTES: 2 } });
    const id = await verified('ACCESS');
    const result = await service.completeAccess({
      tenantId: 'tenant-a',
      id,
      actorId: ADMIN,
      note: 'x'.repeat(2000),
      withheld: [{ category: 'NOTES', count: 2, reason: 'Legal professional privilege' }],
      now: NOW,
    });
    expect(result).toEqual({ outcome: 'INVALID', field: 'resolutionNoteLength' });
    expect(repo.rows.get(id)).toMatchObject({ status: 'VERIFIED' });
  });

  it('extends once, by one or two months, before the original deadline, and tells the person', async () => {
    const id = await verified('RECTIFICATION');
    const ok = await service.extend({
      tenantId: 'tenant-a',
      id,
      actorId: ADMIN,
      months: 2,
      reason: 'Many records to review',
      now: NOW,
    });
    expect(ok.outcome).toBe('OK');
    expect(repo.rows.get(id)!.extendedUntil!.toISOString()).toBe('2027-01-22T10:00:00.000Z');
    expect(notices.some((n) => n.kind === 'EXTENDED')).toBe(true);
    expect(
      (
        await service.extend({
          tenantId: 'tenant-a',
          id,
          actorId: ADMIN,
          months: 1,
          reason: 'Again please',
          now: NOW,
        })
      ).outcome
    ).toBe('REFUSED');
  });

  it('lists the firm’s active restrictions and lifts one only after telling the person', async () => {
    await verified('RESTRICTION');
    const [row] = await service.listRestrictions('tenant-a');
    expect(row).toBeDefined();
    expect(await service.listRestrictions('tenant-b')).toEqual([]);
    expect(
      await service.liftRestriction({
        tenantId: 'tenant-b',
        restrictionId: row!.id,
        actorId: 'admin-2',
        note: 'Not ours to lift',
      })
    ).toEqual({ outcome: 'NOT_FOUND' });
    notices.length = 0;
    const result = await service.liftRestriction({
      tenantId: 'tenant-a',
      restrictionId: row!.id,
      actorId: ADMIN,
      note: 'Accuracy confirmed with the client',
    });
    expect(result).toEqual({ outcome: 'OK' });
    expect(notices.map((n) => n.kind)).toEqual(['RESTRICTION_LIFTING']);
    expect(restrictions.lifted).toEqual([row!.id]);
  });

  it('does not lift a restriction another request joined while the notice was sent (codex)', async () => {
    await verified('RESTRICTION');
    const [row] = await service.listRestrictions('tenant-a');
    const realSend = notifications.send;
    notifications.send = async (notice) => {
      // Another request merges into the same row during the email (a new stored value).
      restrictions.rows = restrictions.rows.map((r) =>
        r.id === row!.id
          ? { ...r, dsarRequestIds: [...r.dsarRequestIds, 'request-merged-meanwhile'] }
          : r
      );
      return realSend(notice);
    };
    const result = await service.liftRestriction({
      tenantId: 'tenant-a',
      restrictionId: row!.id,
      actorId: ADMIN,
      note: 'Accuracy confirmed with the client',
    });
    notifications.send = realSend;
    expect(result).toEqual({ outcome: 'CONFLICT' });
    expect(restrictions.lifted).toEqual([]);
  });

  it('refuses to lift a restriction when the person could not be told first (codex)', async () => {
    await verified('RESTRICTION');
    const [row] = await service.listRestrictions('tenant-a');
    refusedKinds.add('RESTRICTION_LIFTING');
    expect(
      await service.liftRestriction({
        tenantId: 'tenant-a',
        restrictionId: row!.id,
        actorId: ADMIN,
        note: 'Accuracy confirmed with the client',
      })
    ).toEqual({ outcome: 'REFUSED', reason: 'NOTICE_NOT_SENT' });
    expect(restrictions.lifted).toEqual([]);
  });

  it('previews an erasure by request, within the firm, for erasure requests only', async () => {
    const id = await verified('ERASURE');
    subjectData.previewErasure.mockResolvedValue({ counts: { leads: 1 }, checklist: {} });
    expect(await service.previewErasure({ tenantId: 'tenant-a', id })).toEqual({
      outcome: 'OK',
      preview: { counts: { leads: 1 }, checklist: {} },
    });
    expect(await service.previewErasure({ tenantId: 'tenant-b', id })).toEqual({
      outcome: 'NOT_FOUND',
    });
  });

  it('refuses an erasure preview for any other request type', async () => {
    const id = await verified('RECTIFICATION');
    expect(await service.previewErasure({ tenantId: 'tenant-a', id })).toEqual({
      outcome: 'INVALID',
      field: 'type',
    });
  });

  it('lets only one of two simultaneous extensions through (codex)', async () => {
    const id = await verified('RECTIFICATION');
    const extend = (months: number) =>
      service.extend({
        tenantId: 'tenant-a',
        id,
        actorId: ADMIN,
        months,
        reason: 'Many records to review',
        now: NOW,
      });
    // Both read the record before either writes (the fake repo is synchronous per call).
    const results = await Promise.all([extend(1), extend(2)]);
    expect(results.map((r) => r.outcome).sort()).toEqual(['CONFLICT', 'OK']);
    expect(notices.filter((n) => n.kind === 'EXTENDED')).toHaveLength(1);
  });

  it('never acts on another tenant’s request', async () => {
    const id = await verified('ERASURE');
    expect(
      await service.complete({
        tenantId: 'tenant-b',
        id,
        actorId: 'admin-2',
        note: 'Erased',
        noHoldConfirmed: true,
        now: NOW,
      })
    ).toEqual({ outcome: 'NOT_FOUND' });
    expect(subjectData.erase).not.toHaveBeenCalled();
  });
});
