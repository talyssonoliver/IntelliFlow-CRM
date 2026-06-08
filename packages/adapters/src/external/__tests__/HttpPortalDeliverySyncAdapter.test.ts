import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  HttpPortalDeliverySyncAdapter,
  PortalSyncError,
  createHttpPortalDeliverySyncAdapter,
} from '../HttpPortalDeliverySyncAdapter';
import type { PortalTenantProvisionInput, PortalDeliveryPushInput } from '@intelliflow/application';

const config = { baseUrl: 'https://admin.leangency.com', secret: 'sek_test_123' };

const provisionInput: PortalTenantProvisionInput = {
  slug: 'acme',
  name: 'Acme Ltd',
  authorizedEmails: ['owner@acme.com', 'client@acme.com'],
  sourceLeadId: 'lead_1',
};

const pushInput: PortalDeliveryPushInput = {
  slug: 'acme',
  tier: 'core',
  phase: 'pending_onboarding',
  signedAt: '2026-06-01T00:00:00.000Z',
  crmDealId: 'opp_123',
  setupInstalments: [
    { n: 1, amountCents: 16700, currency: 'GBP', status: 'paid', paidAt: '2026-06-01T09:00:00Z' },
    { n: 2, amountCents: 16700, currency: 'GBP', status: 'due', dueAt: '2026-06-08T00:00:00Z' },
    { n: 3, amountCents: 16700, currency: 'GBP', status: 'due', dueAt: '2026-06-15T00:00:00Z' },
  ],
};

function mockFetchResponse(status: number, body = '') {
  return { status, text: () => Promise.resolve(body) } as unknown as Response;
}

describe('HttpPortalDeliverySyncAdapter', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('provisionTenant', () => {
    it('succeeds on 201 Created', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(201, '{"tenantId":"t_1"}'));
      const adapter = new HttpPortalDeliverySyncAdapter(config);
      const result = await adapter.provisionTenant(provisionInput);
      expect(result.isSuccess).toBe(true);
    });

    it('treats 409 slug_conflict as success (idempotent)', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(409, '{"error":"slug_conflict"}'));
      const adapter = new HttpPortalDeliverySyncAdapter(config);
      const result = await adapter.provisionTenant(provisionInput);
      expect(result.isSuccess).toBe(true);
    });

    it('fails on a 500 with a PortalSyncError carrying the status + body snippet', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(500, 'boom'));
      const adapter = new HttpPortalDeliverySyncAdapter(config);
      const result = await adapter.provisionTenant(provisionInput);
      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(PortalSyncError);
      expect((result.error as PortalSyncError).code).toBe('PORTAL_SYNC_ERROR');
      expect(result.error.message).toContain('HTTP 500');
      expect(result.error.message).toContain('boom');
    });

    it('POSTs to /api/internal/tenants with Bearer auth and a JSON body', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(201));
      const adapter = new HttpPortalDeliverySyncAdapter(config);
      await adapter.provisionTenant(provisionInput);

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://admin.leangency.com/api/internal/tenants');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer sek_test_123');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(init.body)).toEqual(provisionInput);
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('returns a PortalSyncError when fetch rejects with a network error', async () => {
      fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));
      const adapter = new HttpPortalDeliverySyncAdapter(config);
      const result = await adapter.provisionTenant(provisionInput);
      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(PortalSyncError);
      expect(result.error.message).toBe('ECONNREFUSED');
    });
  });

  describe('pushDelivery', () => {
    it('succeeds on 200 OK', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(200, '{"ok":true}'));
      const adapter = new HttpPortalDeliverySyncAdapter(config);
      const result = await adapter.pushDelivery(pushInput);
      expect(result.isSuccess).toBe(true);
    });

    it('fails on 404 tenant_not_found (push raced ahead of provisioning)', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(404, '{"error":"tenant_not_found"}'));
      const adapter = new HttpPortalDeliverySyncAdapter(config);
      const result = await adapter.pushDelivery(pushInput);
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('HTTP 404');
      expect(result.error.message).toContain('tenant_not_found');
    });

    it('fails on a 422 validation error', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(422, '{"error":"bad tier"}'));
      const adapter = new HttpPortalDeliverySyncAdapter(config);
      const result = await adapter.pushDelivery(pushInput);
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('HTTP 422');
    });

    it('POSTs to /api/internal/delivery with the full instalment set', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(200));
      const adapter = new HttpPortalDeliverySyncAdapter(config);
      await adapter.pushDelivery(pushInput);

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://admin.leangency.com/api/internal/delivery');
      expect(JSON.parse(init.body).setupInstalments).toHaveLength(3);
    });

    it('returns a PortalSyncError for a non-Error rejection', async () => {
      fetchSpy.mockRejectedValue('socket hang up');
      const adapter = new HttpPortalDeliverySyncAdapter(config);
      const result = await adapter.pushDelivery(pushInput);
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Unknown error');
    });

    it('maps an AbortError to a timeout message', async () => {
      const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
      fetchSpy.mockRejectedValue(abortErr);
      const adapter = new HttpPortalDeliverySyncAdapter({ ...config, timeoutMs: 5000 });
      const result = await adapter.pushDelivery(pushInput);
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Request to /api/internal/delivery timed out after 5000ms');
    });

    it('truncates an oversized response body to a snippet', async () => {
      const long = 'x'.repeat(500);
      fetchSpy.mockResolvedValue(mockFetchResponse(500, long));
      const adapter = new HttpPortalDeliverySyncAdapter(config);
      const result = await adapter.pushDelivery(pushInput);
      expect(result.error.message).toContain('…');
      expect(result.error.message.length).toBeLessThan(300);
    });
  });

  describe('config handling', () => {
    it('trims trailing slashes from the base URL', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(200));
      const adapter = new HttpPortalDeliverySyncAdapter({
        ...config,
        baseUrl: 'https://admin.leangency.com///',
      });
      await adapter.pushDelivery(pushInput);
      expect(fetchSpy.mock.calls[0][0]).toBe('https://admin.leangency.com/api/internal/delivery');
    });
  });

  describe('createHttpPortalDeliverySyncAdapter (factory)', () => {
    const original = {
      url: process.env.LEANGENCY_PORTAL_INTERNAL_URL,
      secret: process.env.PORTAL_INTERNAL_SECRET,
    };

    afterEach(() => {
      if (original.url === undefined) delete process.env.LEANGENCY_PORTAL_INTERNAL_URL;
      else process.env.LEANGENCY_PORTAL_INTERNAL_URL = original.url;
      if (original.secret === undefined) delete process.env.PORTAL_INTERNAL_SECRET;
      else process.env.PORTAL_INTERNAL_SECRET = original.secret;
    });

    it('builds an adapter from env vars', () => {
      process.env.LEANGENCY_PORTAL_INTERNAL_URL = 'https://admin.leangency.com';
      process.env.PORTAL_INTERNAL_SECRET = 'sek_env';
      expect(createHttpPortalDeliverySyncAdapter()).toBeInstanceOf(HttpPortalDeliverySyncAdapter);
    });

    it('throws when LEANGENCY_PORTAL_INTERNAL_URL is missing', () => {
      delete process.env.LEANGENCY_PORTAL_INTERNAL_URL;
      process.env.PORTAL_INTERNAL_SECRET = 'sek_env';
      expect(() => createHttpPortalDeliverySyncAdapter()).toThrow(
        'LEANGENCY_PORTAL_INTERNAL_URL is not set'
      );
    });

    it('throws when PORTAL_INTERNAL_SECRET is missing', () => {
      process.env.LEANGENCY_PORTAL_INTERNAL_URL = 'https://admin.leangency.com';
      delete process.env.PORTAL_INTERNAL_SECRET;
      expect(() => createHttpPortalDeliverySyncAdapter()).toThrow(
        'PORTAL_INTERNAL_SECRET is not set'
      );
    });
  });
});
