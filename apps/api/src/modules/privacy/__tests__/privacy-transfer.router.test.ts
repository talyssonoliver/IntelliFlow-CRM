/**
 * IFC-317 — Art 20(2) transfer procedures: `privacy.admin.{transfers,createTransfer,
 * markTransferSent,revokeTransfer}` and the public `privacy.downloadTransfer`.
 *
 * The service is a stub (its rules are in the application package and, against a real database,
 * in tests/integration/dsar-transfer.test.ts). These tests pin what the routers own: ADMIN only,
 * the context tenant always, the outcome-to-error mapping, the DTOs (never a token or hash),
 * the audit trail, and for the public route the rate limit, the one 404 for every dead link,
 * and an audit row that carries no address, token or IP.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { privacyAdminRouter, toTransferDto } from '../privacy-admin.router';
import { privacyPublicRouter } from '../privacy-public.router';
import { bookingSubmitLimiter } from '../../calendar/booking-abuse';
import {
  createAdminContext,
  createManagerContext,
  createPublicContext,
  TEST_UUIDS,
} from '../../../test/setup';

const auditLog = vi.fn();
vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction: auditLog }),
}));

const NOW = new Date('2026-11-28T10:00:00Z');
const REQUEST = 'clhrequest000000000';
const TRANSFER = 'clhtransfer00000000';
const TENANT = TEST_UUIDS.tenant;
const TOKEN = 'B'.repeat(43);

function view(overrides: Record<string, unknown> = {}) {
  return {
    id: TRANSFER,
    tenantId: TENANT,
    requestId: REQUEST,
    recipientName: 'Jones & Co',
    recipientEmail: 'privacy@jones.example.invalid',
    basis: 'Asked by email on 3 November',
    expiresAt: new Date('2026-12-05T10:00:00Z'),
    usedAt: null,
    revokedAt: null,
    createdById: TEST_UUIDS.admin1,
    createdAt: NOW,
    state: 'ACTIVE',
    events: [
      {
        id: 'ev1',
        transferId: TRANSFER,
        kind: 'CREATED',
        actorType: 'ADMIN',
        actorId: TEST_UUIDS.admin1,
        actorLabel: 'Ada Admin',
        via: null,
        occurredAt: NOW,
      },
    ],
    ...overrides,
  } as never;
}

const CREATE_INPUT = {
  id: REQUEST,
  recipientName: 'Jones & Co',
  recipientEmail: 'Privacy@Jones.example.invalid',
  basis: 'Asked by email on 3 November',
  confirmed: true as const,
};

let service: Record<string, ReturnType<typeof vi.fn>>;

function adminCaller() {
  return privacyAdminRouter.createCaller(
    createAdminContext({ services: { dsarTransfer: service } as never })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auditLog.mockResolvedValue('audit-1');
  service = {
    create: vi.fn().mockResolvedValue({
      outcome: 'OK',
      transfer: view(),
      delivered: true,
      manualLink: null,
    }),
    list: vi.fn().mockResolvedValue({ outcome: 'OK', transfers: [view()] }),
    markSent: vi.fn().mockResolvedValue({ outcome: 'OK', requestId: REQUEST }),
    revoke: vi.fn().mockResolvedValue({ outcome: 'OK', requestId: REQUEST }),
    download: vi.fn(),
  };
});

describe('admin transfer procedures: authorisation', () => {
  it('refuses a MANAGER before any service call', async () => {
    const caller = privacyAdminRouter.createCaller(
      createManagerContext({ services: { dsarTransfer: service } as never })
    );
    await expect(caller.createTransfer(CREATE_INPUT)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.transfers({ id: REQUEST })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.revokeTransfer({ id: TRANSFER })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(service.create).not.toHaveBeenCalled();
    expect(service.list).not.toHaveBeenCalled();
    expect(service.revoke).not.toHaveBeenCalled();
  });

  it('always acts on the context tenant and the admin as actor', async () => {
    const c = adminCaller();
    await c.createTransfer(CREATE_INPUT);
    await c.markTransferSent({ id: TRANSFER });
    await c.revokeTransfer({ id: TRANSFER });
    await c.transfers({ id: REQUEST });
    for (const fn of ['create', 'markSent', 'revoke', 'list']) {
      expect(service[fn]!.mock.calls.at(-1)![0]).toMatchObject({ tenantId: TENANT });
    }
    expect(service.create.mock.calls[0]![0]).toMatchObject({
      actorId: TEST_UUIDS.admin1,
      requestId: REQUEST,
      recipientEmail: 'privacy@jones.example.invalid',
    });
  });

  it('answers NOT_FOUND for another firm’s request or transfer', async () => {
    service.create.mockResolvedValue({ outcome: 'NOT_FOUND' });
    service.list.mockResolvedValue({ outcome: 'NOT_FOUND' });
    service.revoke.mockResolvedValue({ outcome: 'NOT_FOUND' });
    const c = adminCaller();
    await expect(c.createTransfer(CREATE_INPUT)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(c.transfers({ id: REQUEST })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(c.revokeTransfer({ id: TRANSFER })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(auditLog).not.toHaveBeenCalled();
  });
});

describe('createTransfer', () => {
  it('requires the confirmation that the person asked, and a recorded basis', async () => {
    const c = adminCaller();
    await expect(
      c.createTransfer({ ...CREATE_INPUT, confirmed: false as never })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(c.createTransfer({ ...CREATE_INPUT, basis: 'short' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(
      c.createTransfer({ ...CREATE_INPUT, recipientEmail: 'not-an-email' })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(service.create).not.toHaveBeenCalled();
  });

  it('returns the DTO with no link when the email path delivered it', async () => {
    const result = await adminCaller().createTransfer(CREATE_INPUT);
    expect(result).toMatchObject({ delivered: true, manualLink: null });
    expect(result.transfer).toMatchObject({
      id: TRANSFER,
      state: 'ACTIVE',
      recipientName: 'Jones & Co',
      awaitingSend: true,
    });
  });

  it('returns the link once, only when the email was not delivered', async () => {
    const link = `https://app.example.invalid/dsar/transfer#t=${TOKEN}`;
    service.create.mockResolvedValue({
      outcome: 'OK',
      transfer: view(),
      delivered: false,
      manualLink: link,
    });
    const result = await adminCaller().createTransfer(CREATE_INPUT);
    expect(result).toMatchObject({ delivered: false, manualLink: link });
  });

  it('still returns the link when the follow-up read fails: a manual link cannot be shown again', async () => {
    const link = `https://app.example.invalid/dsar/transfer#t=${TOKEN}`;
    service.create.mockResolvedValue({
      outcome: 'OK',
      transfer: view(),
      delivered: false,
      manualLink: link,
    });
    service.list.mockRejectedValue(new Error('read replica down'));
    const result = await adminCaller().createTransfer(CREATE_INPUT);
    expect(result).toMatchObject({ delivered: false, manualLink: link });
    expect(result.transfer).toMatchObject({ id: TRANSFER, state: 'ACTIVE', events: [] });
  });

  it('maps a request that cannot be transferred to a plain message', async () => {
    service.create.mockResolvedValue({ outcome: 'INVALID', field: 'transferNotAllowed' });
    await expect(adminCaller().createTransfer(CREATE_INPUT)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('confirmed portability request'),
    });
  });

  it('audits on the request with ids only: no recipient name, address, token or basis', async () => {
    await adminCaller().createTransfer(CREATE_INPUT);
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledWith('CREATE', 'dsar_request', REQUEST, TENANT, {
      actorId: TEST_UUIDS.admin1,
      metadata: { change: 'TRANSFER_CREATED', transferId: TRANSFER, delivered: true },
    });
    const written = JSON.stringify(auditLog.mock.calls);
    for (const secret of ['jones', 'Jones', 'asked by email', 'Asked by email']) {
      expect(written).not.toContain(secret);
    }
  });
});

describe('transfers, markTransferSent, revokeTransfer', () => {
  it('lists DTOs with every step and never a token or hash', async () => {
    const [dto] = await adminCaller().transfers({ id: REQUEST });
    expect(dto).toMatchObject({
      id: TRANSFER,
      state: 'ACTIVE',
      events: [{ kind: 'CREATED', actorLabel: 'Ada Admin', actorType: 'ADMIN' }],
    });
    expect(JSON.stringify(dto)).not.toMatch(/token/i);
  });

  it('flags an active link that nobody recorded sending, and clears the flag once sent', () => {
    expect(toTransferDto(view()).awaitingSend).toBe(true);
    const sent = view({
      events: [
        ...(view() as unknown as { events: unknown[] }).events,
        {
          kind: 'SENT',
          actorType: 'ADMIN',
          actorLabel: 'Ada Admin',
          via: 'EMAIL',
          occurredAt: NOW,
        },
      ],
    });
    expect(toTransferDto(sent).awaitingSend).toBe(false);
    expect(toTransferDto(view({ state: 'EXPIRED' })).awaitingSend).toBe(false);
  });

  it('audits a manual send and a revocation, and maps CONFLICT to the refresh message', async () => {
    const c = adminCaller();
    await c.markTransferSent({ id: TRANSFER });
    await c.revokeTransfer({ id: TRANSFER });
    expect(auditLog.mock.calls.map((call) => call[4].metadata.change)).toEqual([
      'TRANSFER_SENT_BY_ADMIN',
      'TRANSFER_REVOKED',
    ]);
    // Filed under the request (not the transfer id), with the transfer in the metadata.
    for (const call of auditLog.mock.calls) {
      expect(call[1]).toBe('dsar_request');
      expect(call[2]).toBe(REQUEST);
      expect(call[4].metadata.transferId).toBe(TRANSFER);
    }
    service.revoke.mockResolvedValue({ outcome: 'CONFLICT' });
    await expect(c.revokeTransfer({ id: TRANSFER })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'This request has changed. Refresh and try again.',
    });
  });
});

describe('public downloadTransfer', () => {
  let publicService: Record<string, ReturnType<typeof vi.fn>>;
  const exported = { generatedAt: NOW.toISOString(), data: {}, withheld: [] };

  function publicCaller() {
    return privacyPublicRouter.createCaller(
      createPublicContext({
        services: { dsarTransfer: publicService } as never,
        req: new Request('https://api.example.invalid/trpc', {
          headers: { 'x-real-ip': '203.0.113.50' },
        }) as never,
      }) as never
    );
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    bookingSubmitLimiter.reset();
    publicService = {
      download: vi.fn().mockResolvedValue({
        outcome: 'OK',
        export: exported,
        tenantId: TENANT,
        requestId: REQUEST,
        transferId: TRANSFER,
      }),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the export for a live token', async () => {
    await expect(publicCaller().downloadTransfer({ token: TOKEN })).resolves.toEqual(exported);
    expect(publicService.download).toHaveBeenCalledWith({ token: TOKEN, now: NOW });
  });

  it('answers one NOT_FOUND with one message for any dead link, and a malformed token the same', async () => {
    publicService.download.mockResolvedValue({ outcome: 'NOT_FOUND' });
    const first = await publicCaller()
      .downloadTransfer({ token: TOKEN })
      .catch((e: unknown) => e);
    bookingSubmitLimiter.reset();
    const second = await publicCaller()
      .downloadTransfer({ token: 'short' })
      .catch((e: unknown) => e);
    for (const error of [first, second]) {
      expect(error).toMatchObject({ code: 'NOT_FOUND', message: 'This link is not available.' });
    }
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('is rate limited per client before any work', async () => {
    await publicCaller().downloadTransfer({ token: TOKEN });
    await expect(publicCaller().downloadTransfer({ token: TOKEN })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
    expect(publicService.download).toHaveBeenCalledTimes(1);
  });

  it('rejects extra input: the token is the only thing the route takes', async () => {
    await expect(
      publicCaller().downloadTransfer({ token: TOKEN, tenantId: TENANT } as never)
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(publicService.download).not.toHaveBeenCalled();
  });

  it('audits the download on the request with the system as actor, and no address, token or IP', async () => {
    await publicCaller().downloadTransfer({ token: TOKEN });
    expect(auditLog).toHaveBeenCalledWith('EXPORT', 'dsar_request', REQUEST, TENANT, {
      actorType: 'SYSTEM',
      metadata: { change: 'EXPORT_DOWNLOADED_BY_RECIPIENT', transferId: TRANSFER },
    });
    const written = JSON.stringify(auditLog.mock.calls);
    for (const secret of [TOKEN, '203.0.113.50', 'example.invalid']) {
      expect(written).not.toContain(secret);
    }
  });

  it('still returns the export when the audit row fails, logging the error class only', async () => {
    auditLog.mockRejectedValue(new Error('audit store down for ada@example.invalid'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(publicCaller().downloadTransfer({ token: TOKEN })).resolves.toEqual(exported);
    expect(error).toHaveBeenCalledWith('[privacy] Transfer download audit row not written', {
      error: 'Error',
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain('ada@example.invalid');
    error.mockRestore();
  });

  it('turns a service failure into one fixed message with no cause', async () => {
    publicService.download.mockRejectedValue(new Error('connection to db.example.invalid reset'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(publicCaller().downloadTransfer({ token: TOKEN })).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Data requests are temporarily unavailable.',
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain('db.example.invalid');
    error.mockRestore();
  });
});
