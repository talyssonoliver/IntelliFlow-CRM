/**
 * PG-203 DSAR — public procedures (spec Addendum A; D-AC-01..05).
 *
 * The service is a stub here (its rules are covered in the application package); these
 * tests pin what the router owns: the per-IP limiter before any read, the single handle
 * read with one NOT_FOUND for every miss, the honeypot with zero database calls, the
 * generic answers, and fixed error messages that carry no cause.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { privacyPublicRouter } from '../privacy-public.router';
import { bookingLookupLimiter, bookingSubmitLimiter } from '../../calendar/booking-abuse';
import { prismaMock, createPublicContext } from '../../../test/setup';

const NOW = new Date('2026-10-22T10:00:00Z');
const TENANT = 'clhtenant0000000000';
const REQUEST_ID = 'clhrequest000000000';
const TOKEN = 'A'.repeat(43);
const MESSAGE =
  'Thank you. If this address can receive email, a confirmation link is on its way. Your request starts when you confirm it.';

const auditLog = vi.fn();
vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction: auditLog }),
}));

let service: Record<string, ReturnType<typeof vi.fn>>;
let ctx: ReturnType<typeof createPublicContext>;

function caller(overrides: Record<string, unknown> = {}) {
  return privacyPublicRouter.createCaller({ ...ctx, ...overrides } as never);
}

function firmRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TENANT,
    name: 'Smith Law',
    bookingHandle: 'smith-law',
    bookingPrivacyUrl: 'https://smith.example.invalid/privacy',
    ...overrides,
  };
}

const submitInput = {
  handle: 'smith-law',
  type: 'ACCESS' as const,
  email: 'Ada@Example.invalid',
  consent: true as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  bookingLookupLimiter.reset();
  bookingSubmitLimiter.reset();
  service = {
    submit: vi.fn().mockResolvedValue({ outcome: 'ACCEPTED', message: MESSAGE }),
    verify: vi.fn(),
    downloadExport: vi.fn(),
  };
  ctx = createPublicContext({
    services: { dsar: service } as never,
    req: new Request('https://api.example.invalid/trpc', {
      headers: { 'x-real-ip': '203.0.113.50' },
    }) as never,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getFirm', () => {
  it('returns the firm name and privacy notice for a public handle', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(firmRow() as never);
    await expect(caller().getFirm({ handle: 'Smith-Law' })).resolves.toEqual({
      firmName: 'Smith Law',
      privacyUrl: 'https://smith.example.invalid/privacy',
    });
    expect(prismaMock.tenant.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.tenant.findUnique.mock.calls[0]![0]).toMatchObject({
      where: { bookingHandle: 'smith-law' },
    });
  });

  it('answers one identical NOT_FOUND for an unknown handle', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(null);
    await expect(caller().getFirm({ handle: 'nobody' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'This page is not available.',
    });
  });

  it('throttles per IP before reading anything', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(firmRow() as never);
    await caller().getFirm({ handle: 'smith-law' });
    await expect(caller().getFirm({ handle: 'smith-law' })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
    expect(prismaMock.tenant.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('submit', () => {
  it('passes the firm, normalised email and hashed IP to the service and answers generically', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(firmRow() as never);
    await expect(caller().submit({ ...submitInput, details: '  ' })).resolves.toEqual({
      message: MESSAGE,
    });
    const call = service.submit.mock.calls[0]![0];
    expect(call).toMatchObject({
      firm: { tenantId: TENANT, name: 'Smith Law', handle: 'smith-law' },
      type: 'ACCESS',
      email: 'ada@example.invalid',
      details: null,
      objectionScope: null,
    });
    expect(call.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(call)).not.toContain('203.0.113.50');
  });

  it('gives a filled honeypot the same answer with no database or service call', async () => {
    await expect(caller().submit({ ...submitInput, __honeypot: 'x' })).resolves.toEqual({
      message: MESSAGE,
    });
    expect(prismaMock.tenant.findUnique).not.toHaveBeenCalled();
    expect(service.submit).not.toHaveBeenCalled();
  });

  it('answers the booking-identical TOO_MANY_REQUESTS on a cap', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(firmRow() as never);
    service.submit.mockResolvedValue({ outcome: 'TOO_MANY' });
    await expect(caller().submit(submitInput)).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests. Please try again later.',
    });
  });

  it('throttles per IP before the firm lookup', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(firmRow() as never);
    await caller().submit(submitInput);
    await expect(caller().submit(submitInput)).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
    expect(prismaMock.tenant.findUnique).toHaveBeenCalledTimes(1);
  });

  it('refuses an unknown handle with the same NOT_FOUND and never calls the service', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(firmRow({ bookingHandle: null }) as never);
    await expect(caller().submit(submitInput)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(service.submit).not.toHaveBeenCalled();
  });

  it('rejects inputs that try to name a tenant or skip consent', async () => {
    await expect(
      caller().submit({ ...submitInput, tenantId: TENANT } as never)
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      caller().submit({ ...submitInput, consent: false } as never)
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('fails closed with a fixed message when the service is not wired', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(firmRow() as never);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(caller({ services: {} }).submit(submitInput)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Data requests are temporarily unavailable.',
    });
    errors.mockRestore();
  });
});

describe('verify', () => {
  it('returns the type, due date and whether an export was emailed (never a token)', async () => {
    service.verify.mockResolvedValue({
      outcome: 'VERIFIED',
      type: 'ACCESS',
      dueDate: new Date('2026-11-22T10:00:00Z'),
      exportEmailed: true,
    });
    await expect(caller().verify({ requestId: REQUEST_ID, token: TOKEN })).resolves.toEqual({
      type: 'ACCESS',
      dueDate: '2026-11-22T10:00:00.000Z',
      exportEmailed: true,
    });
    expect(service.verify).toHaveBeenCalledWith({ requestId: REQUEST_ID, token: TOKEN, now: NOW });
  });

  it('answers one fixed message for any invalid link', async () => {
    service.verify.mockResolvedValue({ outcome: 'INVALID' });
    await expect(caller().verify({ requestId: REQUEST_ID, token: TOKEN })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'This link is invalid or has expired.',
    });
  });

  it('refuses a malformed token before calling the service', async () => {
    await expect(caller().verify({ requestId: REQUEST_ID, token: 'short' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(service.verify).not.toHaveBeenCalled();
  });
});

describe('downloadExport', () => {
  it('returns the export document', async () => {
    const exported = { generatedAt: NOW.toISOString(), data: {}, withheld: [] };
    service.downloadExport.mockResolvedValue({ outcome: 'OK', export: exported });
    await expect(caller().downloadExport({ requestId: REQUEST_ID, token: TOKEN })).resolves.toEqual(
      exported
    );
  });

  describe('audit of a successful download (compliance #6)', () => {
    const exported = { generatedAt: NOW.toISOString(), data: {}, withheld: [] };
    const find = () => prismaMock.dsarRequest.findUnique as unknown as ReturnType<typeof vi.fn>;

    beforeEach(() => {
      service.downloadExport.mockResolvedValue({ outcome: 'OK', export: exported });
      find().mockResolvedValue({ tenantId: TENANT });
      auditLog.mockResolvedValue('audit-1');
    });

    it('writes an EXPORT row for the request and firm, with no actor, address or IP', async () => {
      await expect(
        caller().downloadExport({ requestId: REQUEST_ID, token: TOKEN })
      ).resolves.toEqual(exported);
      expect(find()).toHaveBeenCalledWith({
        where: { id: REQUEST_ID },
        select: { tenantId: true },
      });
      expect(auditLog).toHaveBeenCalledTimes(1);
      expect(auditLog).toHaveBeenCalledWith('EXPORT', 'dsar_request', REQUEST_ID, TENANT, {
        actorType: 'SYSTEM',
        metadata: { change: 'EXPORT_DOWNLOADED_BY_SUBJECT' },
      });
      const written = JSON.stringify(auditLog.mock.calls);
      for (const secret of ['example.invalid', TOKEN, '203.0.113.50']) {
        expect(written).not.toContain(secret);
      }
    });

    it('writes nothing when the download is refused', async () => {
      service.downloadExport.mockResolvedValue({ outcome: 'INVALID' });
      await caller()
        .downloadExport({ requestId: REQUEST_ID, token: TOKEN })
        .catch(() => undefined);
      service.downloadExport.mockResolvedValue({ outcome: 'LIMIT' });
      await caller()
        .downloadExport({ requestId: REQUEST_ID, token: TOKEN })
        .catch(() => undefined);
      expect(auditLog).not.toHaveBeenCalled();
    });

    it('still returns the export when the audit row fails, logging the error class only', async () => {
      auditLog.mockRejectedValue(new Error('audit store down for ada@example.invalid'));
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await expect(
        caller().downloadExport({ requestId: REQUEST_ID, token: TOKEN })
      ).resolves.toEqual(exported);
      expect(error).toHaveBeenCalledWith('[privacy] Export download audit row not written', {
        error: 'Error',
      });
      expect(JSON.stringify(error.mock.calls)).not.toContain('ada@example.invalid');
      error.mockRestore();
    });

    it('still returns the export when the firm lookup fails', async () => {
      find().mockRejectedValue(new Error('connection reset'));
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await expect(
        caller().downloadExport({ requestId: REQUEST_ID, token: TOKEN })
      ).resolves.toEqual(exported);
      expect(auditLog).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith('[privacy] Export download audit row not written', {
        error: 'Error',
      });
      error.mockRestore();
    });
  });

  it('answers TOO_MANY_REQUESTS once the download cap is used', async () => {
    service.downloadExport.mockResolvedValue({ outcome: 'LIMIT' });
    await expect(
      caller().downloadExport({ requestId: REQUEST_ID, token: TOKEN })
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  it('answers the fixed invalid-link message otherwise', async () => {
    service.downloadExport.mockResolvedValue({ outcome: 'INVALID' });
    await expect(
      caller().downloadExport({ requestId: REQUEST_ID, token: TOKEN })
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'This link is invalid or has expired.',
    });
  });
});

describe('logging (D6 log-capture)', () => {
  it('never writes a request body, address or token to any logger', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined)
    );
    prismaMock.tenant.findUnique.mockResolvedValue(firmRow() as never);
    service.submit.mockRejectedValueOnce(new Error('database exploded'));
    await caller()
      .submit({ ...submitInput, details: 'My divorce case notes' })
      .catch(() => undefined);
    bookingSubmitLimiter.reset();
    service.verify.mockResolvedValue({ outcome: 'INVALID' });
    await caller()
      .verify({ requestId: REQUEST_ID, token: TOKEN })
      .catch(() => undefined);
    await caller({ services: {} })
      .downloadExport({ requestId: REQUEST_ID, token: TOKEN })
      .catch(() => undefined);
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    for (const secret of ['ada@example.invalid', 'divorce', TOKEN, '203.0.113.50']) {
      expect(logged).not.toContain(secret);
    }
    for (const s of spies) s.mockRestore();
  });
});

describe('unexpected failures (codex: no cause reaches the anonymous caller)', () => {
  const leak = 'relation "dsar_requests" does not exist: ada@example.invalid';
  const fixed = {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Data requests are temporarily unavailable.',
  };

  it.each([
    ['getFirm', () => caller().getFirm({ handle: submitInput.handle })],
    ['submit', () => caller().submit(submitInput)],
    ['verify', () => caller().verify({ requestId: REQUEST_ID, token: TOKEN })],
    ['downloadExport', () => caller().downloadExport({ requestId: REQUEST_ID, token: TOKEN })],
  ])('%s answers with a fixed message and logs only the error code', async (_name, call) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = Object.assign(new Error(leak), { code: 'P2010' });
    prismaMock.tenant.findUnique.mockRejectedValueOnce(failure);
    service.verify.mockRejectedValueOnce(failure);
    service.downloadExport.mockRejectedValueOnce(failure);

    const thrown = await call().catch((e: unknown) => e);

    expect(thrown).toMatchObject(fixed);
    expect(JSON.stringify(thrown)).not.toContain('ada@example.invalid');
    expect(JSON.stringify(error.mock.calls)).toBe(
      JSON.stringify([['[privacy] public request failed', { code: 'P2010' }]])
    );
    error.mockRestore();
  });
});
