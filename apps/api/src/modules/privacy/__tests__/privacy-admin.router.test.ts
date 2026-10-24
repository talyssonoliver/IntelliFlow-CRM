/**
 * PG-203 DSAR — admin procedures and the restriction banner read (spec Addendum A,
 * sign-off 3; D-AC-05/06/08).
 *
 * The service is a stub: these tests pin authorisation (ADMIN only, the context tenant
 * always), the outcome-to-error mapping, the DTOs, and the audit trail (awaited for an
 * erasure, counts only, never the requester's address).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  privacyAdminRouter,
  restrictionForProcedure,
  toDsarRequestDto,
} from '../privacy-admin.router';
import { createTRPCRouter } from '../../../trpc';
import {
  prismaMock,
  createAdminContext,
  createManagerContext,
  createTestContext,
  TEST_UUIDS,
} from '../../../test/setup';

const auditLog = vi.fn();
vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction: auditLog }),
}));

const NOW = new Date('2026-10-22T10:00:00Z');
const ID = 'clhrequest000000000';
const TENANT = TEST_UUIDS.tenant;
const ADMIN = TEST_UUIDS.admin1;

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    tenantId: TENANT,
    type: 'ERASURE',
    status: 'VERIFIED',
    source: 'PUBLIC_FORM',
    subjectEmail: 'ada@example.invalid',
    details: null,
    objectionScope: null,
    identityMethod: null,
    receivedAt: new Date('2026-10-01T09:00:00Z'),
    verificationTokenHash: null,
    verificationExpiresAt: null,
    verifiedAt: new Date('2026-10-01T09:00:00Z'),
    slaDeadline: new Date('2026-11-01T09:00:00Z'),
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
    createdAt: new Date('2026-10-01T09:00:00Z'),
    ...overrides,
  } as never;
}

let service: Record<string, ReturnType<typeof vi.fn>>;

function adminCaller() {
  return privacyAdminRouter.createCaller(
    createAdminContext({ services: { dsar: service } as never })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auditLog.mockResolvedValue('audit-1');
  prismaMock.tenant.findUnique.mockResolvedValue({ name: 'Smith Law' } as never);
  service = {
    list: vi.fn().mockResolvedValue([]),
    listRestrictions: vi.fn().mockResolvedValue([]),
    logRequest: vi.fn(),
    extend: vi.fn().mockResolvedValue({ outcome: 'OK' }),
    previewErasure: vi.fn(),
    complete: vi.fn(),
    completeAccess: vi.fn().mockResolvedValue({ outcome: 'OK' }),
    reject: vi.fn().mockResolvedValue({ outcome: 'OK', restrictionKept: false }),
    cancelErasure: vi.fn().mockResolvedValue({ outcome: 'OK' }),
    liftRestriction: vi.fn().mockResolvedValue({ outcome: 'OK' }),
    revokeExport: vi.fn().mockResolvedValue({ outcome: 'OK' }),
    exportData: vi.fn(),
    restrictionStatus: vi.fn(),
  };
});

describe('authorisation', () => {
  it('refuses a MANAGER (ADMIN only) before any service call', async () => {
    const caller = privacyAdminRouter.createCaller(
      createManagerContext({ services: { dsar: service } as never })
    );
    await expect(caller.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(service.list).not.toHaveBeenCalled();
  });

  it('refuses an ordinary user', async () => {
    const caller = privacyAdminRouter.createCaller(
      createTestContext({ services: { dsar: service } as never })
    );
    await expect(caller.reject({ id: ID, reason: 'Not personal data' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('always acts on the context tenant; another firm’s id is NOT_FOUND', async () => {
    service.reject.mockResolvedValue({ outcome: 'NOT_FOUND' });
    await expect(
      adminCaller().reject({ id: ID, reason: 'Not personal data we hold' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Request not found' });
    expect(service.reject.mock.calls[0]![0]).toMatchObject({ tenantId: TENANT, actorId: ADMIN });
    expect(auditLog).not.toHaveBeenCalled();
  });
});

describe('list', () => {
  it('maps records to DTOs, overdue first, then the nearest deadline', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    service.list.mockResolvedValue([
      record({ id: 'clhlater0000000000', slaDeadline: new Date('2026-11-20T00:00:00Z') }),
      record({ id: 'clhdone00000000000', status: 'COMPLETED', completedAt: NOW }),
      record({ id: 'clhlate00000000000', slaDeadline: new Date('2026-10-20T00:00:00Z') }),
      record({ id: 'clhsoon00000000000', slaDeadline: new Date('2026-10-25T00:00:00Z') }),
    ]);
    const rows = await adminCaller().list({ status: 'VERIFIED' });
    expect(rows.map((r) => r.id)).toEqual([
      'clhlate00000000000',
      'clhsoon00000000000',
      'clhlater0000000000',
      'clhdone00000000000',
    ]);
    expect(rows[0]).toMatchObject({ overdue: true, receivedOn: '2026-10-01' });
    expect(rows[3]!.overdue).toBe(false);
    expect(service.list).toHaveBeenCalledWith(TENANT, 'VERIFIED');
    vi.useRealTimers();
  });

  it('reports a download link as active only while its token is live', () => {
    const now = new Date('2026-10-22T10:00:00Z');
    const live = {
      exportTokenHash: 'a'.repeat(64),
      exportExpiresAt: new Date('2026-10-23T00:00:00Z'),
    };
    expect(toDsarRequestDto(record(live), now).exportLinkActive).toBe(true);
    expect(
      toDsarRequestDto(record({ ...live, exportExpiresAt: new Date('2026-10-21T00:00:00Z') }), now)
        .exportLinkActive
    ).toBe(false);
    expect(toDsarRequestDto(record(), now).exportLinkActive).toBe(false);
  });

  it('uses an extension as the effective deadline', () => {
    const dto = toDsarRequestDto(
      record({ extendedUntil: new Date('2026-12-01T09:00:00Z') }),
      new Date('2026-11-15T00:00:00Z')
    );
    expect(dto).toMatchObject({
      effectiveDeadline: '2026-12-01T09:00:00.000Z',
      overdue: false,
    });
  });
});

describe('restrictions', () => {
  it('lists active restrictions with a request count, not the request ids', async () => {
    service.listRestrictions.mockResolvedValue([
      {
        id: 'clhrestrict0000000',
        tenantId: TENANT,
        subjectEmail: 'ada@example.invalid',
        blocksMarketing: true,
        dsarRequestIds: ['a', 'b'],
        createdAt: NOW,
      },
    ]);
    await expect(adminCaller().restrictions()).resolves.toEqual([
      {
        id: 'clhrestrict0000000',
        subjectEmail: 'ada@example.invalid',
        blocksMarketing: true,
        requestCount: 2,
        since: NOW.toISOString(),
      },
    ]);
  });

  it('lifts within the tenant and audits it; a foreign id is NOT_FOUND', async () => {
    await adminCaller().liftRestriction({
      restrictionId: 'clhrestrict0000000',
      note: 'Accuracy confirmed with the client',
    });
    expect(service.liftRestriction.mock.calls[0]![0]).toMatchObject({ tenantId: TENANT });
    expect(auditLog).toHaveBeenCalledWith(
      'UPDATE',
      'dsar_request',
      'clhrestrict0000000',
      TENANT,
      expect.objectContaining({ metadata: { change: 'RESTRICTION_LIFTED' } })
    );
    service.liftRestriction.mockResolvedValue({ outcome: 'NOT_FOUND' });
    await expect(
      adminCaller().liftRestriction({ restrictionId: 'clhrestrict0000000', note: 'Lift it please' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Restriction not found' });
  });
});

describe('logRequest', () => {
  const input = {
    type: 'ERASURE' as const,
    email: 'Ada@Example.invalid',
    receivedOn: '2026-10-22',
    identityMethod: 'IN_PERSON_ID' as const,
    identityNote: 'Passport checked at the front desk',
  };

  it('passes the firm name and actor, and audits without the address', async () => {
    service.logRequest.mockResolvedValue({ outcome: 'OK', record: record({ source: 'STAFF' }) });
    const dto = await adminCaller().logRequest(input);
    expect(dto.id).toBe(ID);
    expect(service.logRequest.mock.calls[0]![0]).toMatchObject({
      tenantId: TENANT,
      actorId: ADMIN,
      firm: { name: 'Smith Law' },
      email: 'ada@example.invalid',
      details: null,
    });
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('ada@example.invalid');
  });

  it('maps an invalid received date to its fixed message', async () => {
    service.logRequest.mockResolvedValue({ outcome: 'INVALID', field: 'receivedOn' });
    await expect(adminCaller().logRequest(input)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'The received date must be today or within the last 30 days.',
    });
  });
});

describe('complete', () => {
  it('awaits the erasure audit row, with counts and no erased values', async () => {
    const erasure = { counts: { leads: 1 }, checklist: { tickets: 2 } };
    service.complete.mockResolvedValue({ outcome: 'OK', erasure });
    let auditDone = false;
    auditLog.mockImplementation(async () => {
      await Promise.resolve();
      auditDone = true;
      return 'audit-1';
    });
    const result = await adminCaller().complete({
      id: ID,
      note: 'No hold applies',
      noHoldConfirmed: true,
    });
    expect(auditDone).toBe(true);
    expect(result).toEqual({ erasure });
    expect(auditLog).toHaveBeenCalledWith(
      'DELETE',
      'dsar_request',
      ID,
      TENANT,
      expect.objectContaining({
        actorId: ADMIN,
        metadata: {
          change: 'ERASED',
          noHoldConfirmed: true,
          counts: { leads: 1 },
          checklist: { tickets: 2 },
        },
      })
    );
  });

  it('retries a failed erasure audit row once', async () => {
    const erasure = { counts: { leads: 1 }, checklist: { tickets: 2 } };
    service.complete.mockResolvedValue({ outcome: 'OK', erasure });
    auditLog.mockRejectedValueOnce(new Error('audit store down')).mockResolvedValue('audit-1');
    await expect(
      adminCaller().complete({ id: ID, note: 'No hold applies', noHoldConfirmed: true })
    ).resolves.toEqual({ erasure });
    expect(auditLog).toHaveBeenCalledTimes(2);
  });

  it('still returns the committed erasure and its checklist when the audit row cannot be written (codex)', async () => {
    // The erasure has already committed: throwing would lose the admin's cleanup checklist,
    // and a retry is a CONFLICT. The counts go to the error log instead (no personal data).
    const erasure = { counts: { leads: 1 }, checklist: { tickets: 2 } };
    service.complete.mockResolvedValue({ outcome: 'OK', erasure });
    auditLog.mockRejectedValue(new Error('audit store down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      adminCaller().complete({ id: ID, note: 'No hold applies', noHoldConfirmed: true })
    ).resolves.toEqual({ erasure });
    expect(auditLog).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith('[privacy] Erasure audit row not written', {
      requestId: ID,
      tenantId: TENANT,
      counts: { leads: 1 },
      checklist: { tickets: 2 },
      error: 'Error',
    });
    error.mockRestore();
  });

  it('completes other types and records whether marketing was stopped', async () => {
    service.complete.mockResolvedValue({ outcome: 'OK' });
    await expect(
      adminCaller().complete({
        id: ID,
        note: 'Done',
        marketingStoppedConfirmed: true,
        marketingStopMethod: 'Removed from the newsletter list',
      })
    ).resolves.toEqual({ erasure: null });
    expect(auditLog.mock.calls[0]![4]).toMatchObject({
      metadata: { change: 'COMPLETED', marketingStopped: true },
    });
  });

  it.each([
    [{ outcome: 'INVALID', field: 'noHoldConfirmed' }, 'BAD_REQUEST', /legal hold/],
    [
      { outcome: 'REFUSED', reason: 'SECOND_ADMIN_REQUIRED' },
      'PRECONDITION_FAILED',
      /Another administrator/,
    ],
    [{ outcome: 'REFUSED', reason: 'WAIT_24H' }, 'PRECONDITION_FAILED', /24 hours/],
    [
      { outcome: 'REFUSED', reason: 'ERASURE_NOTICE_NOT_SENT' },
      'PRECONDITION_FAILED',
      /emailed about this erasure/,
    ],
    [{ outcome: 'CONFLICT' }, 'CONFLICT', /Refresh/],
  ])('maps %o to %s', async (outcome, code, message) => {
    service.complete.mockResolvedValue(outcome);
    await expect(adminCaller().complete({ id: ID, note: 'Erase' })).rejects.toMatchObject({
      code,
      message: expect.stringMatching(message),
    });
  });
});

describe('the remaining admin actions', () => {
  it('extend, completeAccess, cancelErasure and revokeExport call the service for the tenant and audit', async () => {
    const c = adminCaller();
    await c.extend({ id: ID, months: 2, reason: 'Many records to review' });
    await c.completeAccess({
      id: ID,
      note: 'Supplementary disclosure sent',
      withheld: [{ category: 'NOTES', count: 2, reason: 'Legal professional privilege' }],
    });
    await c.cancelErasure({ id: ID, reason: 'The client withdrew it' });
    await c.revokeExport({ id: ID });
    for (const fn of ['extend', 'completeAccess', 'cancelErasure', 'revokeExport']) {
      expect(service[fn]!.mock.calls[0]![0]).toMatchObject({ tenantId: TENANT, id: ID });
    }
    expect(auditLog.mock.calls.map((call) => call[4].metadata.change)).toEqual([
      'EXTENDED',
      'COMPLETED',
      'ERASURE_CANCELLED',
      'EXPORT_REVOKED',
    ]);
    // Withheld reasons are free text: only categories and counts reach the audit row.
    expect(auditLog.mock.calls[1]![4].metadata.withheld).toEqual([{ category: 'NOTES', count: 2 }]);
  });

  it('tells the admin when a rejected restriction stays because the notice failed', async () => {
    service.reject.mockResolvedValue({ outcome: 'OK', restrictionKept: true });
    await expect(
      adminCaller().reject({ id: ID, reason: 'The data is accurate as recorded' })
    ).resolves.toEqual({ ok: true, restrictionKept: true });
    expect(auditLog.mock.calls[0]![4]).toMatchObject({
      metadata: { change: 'REJECTED', restrictionKept: true },
    });
  });

  it('refuses to lift a restriction the person could not be told about', async () => {
    service.liftRestriction.mockResolvedValue({ outcome: 'REFUSED', reason: 'NOTICE_NOT_SENT' });
    await expect(
      adminCaller().liftRestriction({ restrictionId: ID, note: 'Accuracy confirmed now' })
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringMatching(/must be told before a restriction is lifted/),
    });
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('maps a refused extension to its message', async () => {
    service.extend.mockResolvedValue({ outcome: 'REFUSED', reason: 'EXTENSION_NOT_ALLOWED' });
    await expect(
      adminCaller().extend({ id: ID, months: 1, reason: 'Need more time please' })
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', message: /extended once/ });
  });

  it('previews an erasure and exports staff-handled access requests', async () => {
    service.previewErasure.mockResolvedValue({
      outcome: 'OK',
      preview: { counts: { leads: 1 }, checklist: {} },
    });
    await expect(adminCaller().previewErasure({ id: ID })).resolves.toEqual({
      counts: { leads: 1 },
      checklist: {},
    });
    const exported = { generatedAt: NOW.toISOString(), data: {}, withheld: [] };
    service.exportData.mockResolvedValue({ outcome: 'OK', export: exported });
    await expect(adminCaller().exportData({ id: ID })).resolves.toEqual(exported);
    expect(auditLog).toHaveBeenCalledWith('EXPORT', 'dsar_request', ID, TENANT, expect.anything());
    service.exportData.mockResolvedValue({ outcome: 'INVALID', field: 'type' });
    await expect(adminCaller().exportData({ id: ID })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'This action does not apply to this type of request.',
    });
  });

  it('logs a failed non-erasure audit write without failing the action', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    auditLog.mockRejectedValue(new Error('audit store down'));
    await expect(adminCaller().revokeExport({ id: ID })).resolves.toEqual({ ok: true });
    await vi.waitFor(() =>
      expect(errors).toHaveBeenCalledWith('[privacy] Audit log failed', {
        action: 'UPDATE',
        error: 'Error',
      })
    );
    errors.mockRestore();
  });
});

describe('restrictionFor (banner, any tenant member)', () => {
  const router = createTRPCRouter({ restrictionFor: restrictionForProcedure });

  it('resolves the email from the record and returns booleans and a date only', async () => {
    prismaMock.lead.findFirst.mockResolvedValue({ email: 'ada@example.invalid' } as never);
    service.restrictionStatus.mockResolvedValue({
      restricted: true,
      blocksMarketing: true,
      since: NOW,
    });
    const caller = router.createCaller(createTestContext({ services: { dsar: service } as never }));
    const result = await caller.restrictionFor({ entity: 'lead', id: ID });
    expect(result).toEqual({ restricted: true, blocksMarketing: true, since: NOW.toISOString() });
    expect(Object.keys(result).sort()).toEqual(['blocksMarketing', 'restricted', 'since']);
    expect(prismaMock.lead.findFirst.mock.calls[0]![0]).toMatchObject({
      where: { id: ID, tenantId: TENANT },
    });
    expect(service.restrictionStatus).toHaveBeenCalledWith(TENANT, 'ada@example.invalid');
  });

  it('answers NOT_FOUND for a contact outside the tenant', async () => {
    prismaMock.contact.findFirst.mockResolvedValue(null);
    const caller = router.createCaller(createTestContext({ services: { dsar: service } as never }));
    await expect(caller.restrictionFor({ entity: 'contact', id: ID })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Contact not found',
    });
    expect(service.restrictionStatus).not.toHaveBeenCalled();
  });

  it('reports an unrestricted person with no date', async () => {
    prismaMock.contact.findFirst.mockResolvedValue({ email: 'bob@example.invalid' } as never);
    service.restrictionStatus.mockResolvedValue({
      restricted: false,
      blocksMarketing: false,
      since: null,
    });
    const caller = router.createCaller(createTestContext({ services: { dsar: service } as never }));
    await expect(caller.restrictionFor({ entity: 'contact', id: ID })).resolves.toEqual({
      restricted: false,
      blocksMarketing: false,
      since: null,
    });
  });
});
