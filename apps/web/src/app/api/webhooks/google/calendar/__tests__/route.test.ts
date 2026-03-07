/**
 * Google Calendar Webhook Route Handler Tests (IFC-224)
 *
 * Tests for /api/webhooks/google/calendar POST endpoint.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Result, DomainError } from '@intelliflow/domain';

class TestDomainError extends DomainError {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

const mockParseWebhookPayload = vi.fn();
const mockProcessNotification = vi.fn();

vi.mock('../providers', () => ({
  getGoogleAdapter: vi.fn(() => ({
    parseWebhookPayload: mockParseWebhookPayload,
  })),
  getWebhookService: vi.fn(() => ({
    processNotification: mockProcessNotification,
  })),
}));

import { POST } from '../route';
import { resetRateLimiter } from '../../../rate-limiter';

function createGoogleRequest(
  headers: Record<string, string> = {},
  body: string = '',
): Request {
  const defaultHeaders: Record<string, string> = {
    'x-goog-channel-id': 'channel-123',
    'x-goog-resource-id': 'resource-456',
    'x-goog-resource-state': 'exists',
    ...headers,
  };

  return new Request('http://localhost:3000/api/webhooks/google/calendar', {
    method: 'POST',
    headers: defaultHeaders,
    body: body || undefined,
  });
}

describe('Google Calendar Webhook Route Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimiter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('valid exists notification triggers processNotification', async () => {
    mockParseWebhookPayload.mockReturnValue(
      Result.ok({
        provider: 'google',
        resourceId: 'resource-456',
        changeType: 'updated',
        channelId: 'channel-123',
        timestamp: new Date(),
      }),
    );
    mockProcessNotification.mockResolvedValue({ processed: true });

    const response = await POST(createGoogleRequest());

    expect(response.status).toBe(200);
    expect(mockProcessNotification).toHaveBeenCalled();
  });

  it('sync state returns 200 without calling processNotification', async () => {
    const response = await POST(
      createGoogleRequest({ 'x-goog-resource-state': 'sync' }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.verification).toBe(true);
    expect(mockProcessNotification).not.toHaveBeenCalled();
  });

  it('not_exists state triggers processNotification with deleted changeType', async () => {
    mockParseWebhookPayload.mockReturnValue(
      Result.ok({
        provider: 'google',
        resourceId: 'resource-456',
        changeType: 'deleted',
        channelId: 'channel-123',
        timestamp: new Date(),
      }),
    );
    mockProcessNotification.mockResolvedValue({ processed: true });

    const response = await POST(
      createGoogleRequest({ 'x-goog-resource-state': 'not_exists' }),
    );

    expect(response.status).toBe(200);
    expect(mockProcessNotification).toHaveBeenCalled();
  });

  it('missing x-goog-channel-id returns 200 (logged, not processed)', async () => {
    const headers: Record<string, string> = {
      'x-goog-resource-id': 'resource-456',
      'x-goog-resource-state': 'exists',
    };
    const freshReq = new Request('http://localhost:3000/api/webhooks/google/calendar', {
      method: 'POST',
      headers,
    });

    const response = await POST(freshReq);

    expect(response.status).toBe(200);
    expect(mockProcessNotification).not.toHaveBeenCalled();
  });

  it('missing x-goog-resource-id returns 200 (logged, not processed)', async () => {
    const headers: Record<string, string> = {
      'x-goog-channel-id': 'channel-123',
      'x-goog-resource-state': 'exists',
    };
    const req = new Request('http://localhost:3000/api/webhooks/google/calendar', {
      method: 'POST',
      headers,
    });

    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(mockProcessNotification).not.toHaveBeenCalled();
  });

  it('missing x-goog-resource-state returns 200 (logged, not processed)', async () => {
    const headers: Record<string, string> = {
      'x-goog-channel-id': 'channel-123',
      'x-goog-resource-id': 'resource-456',
    };
    const req = new Request('http://localhost:3000/api/webhooks/google/calendar', {
      method: 'POST',
      headers,
    });

    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(mockProcessNotification).not.toHaveBeenCalled();
  });

  it('parseWebhookPayload returns failure → 200 OK (logged, not processed)', async () => {
    mockParseWebhookPayload.mockReturnValue(
      Result.fail(new TestDomainError('Parse failed', 'PARSE_ERROR')),
    );

    const response = await POST(createGoogleRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(false);
  });

  it('processNotification throws → 200 OK (caught, logged)', async () => {
    mockParseWebhookPayload.mockReturnValue(
      Result.ok({
        provider: 'google',
        resourceId: 'resource-456',
        changeType: 'updated',
        channelId: 'channel-123',
        timestamp: new Date(),
      }),
    );
    mockProcessNotification.mockRejectedValue(new Error('Unexpected error'));

    const response = await POST(createGoogleRequest());

    expect(response.status).toBe(200);
  });

  it('response body includes { received: true } for valid notifications', async () => {
    mockParseWebhookPayload.mockReturnValue(
      Result.ok({
        provider: 'google',
        resourceId: 'resource-456',
        changeType: 'updated',
        channelId: 'channel-123',
        timestamp: new Date(),
      }),
    );
    mockProcessNotification.mockResolvedValue({ processed: true });

    const response = await POST(createGoogleRequest());
    const body = await response.json();

    expect(body.received).toBe(true);
  });

  it('response body includes verification flag for sync state', async () => {
    const response = await POST(
      createGoogleRequest({ 'x-goog-resource-state': 'sync' }),
    );
    const body = await response.json();

    expect(body.received).toBe(true);
    expect(body.verification).toBe(true);
  });

  it('rate limited after 200 requests per IP per minute', async () => {
    // Fire 201 requests — the 201st should be rate limited
    for (let i = 0; i < 200; i++) {
      const req = createGoogleRequest({ 'x-goog-resource-state': 'sync' });
      await POST(req);
    }
    const response = await POST(
      createGoogleRequest({ 'x-goog-resource-state': 'sync' }),
    );
    const body = await response.json();
    expect(body.error).toBe('rate_limited');
  });

  it('extracts IP from x-forwarded-for header for rate limiting', async () => {
    // Exhaust rate limit with a specific forwarded IP
    for (let i = 0; i < 200; i++) {
      const req = new Request('http://localhost:3000/api/webhooks/google/calendar', {
        method: 'POST',
        headers: {
          'x-goog-resource-state': 'sync',
          'x-forwarded-for': '1.2.3.4, 10.0.0.1',
        },
      });
      await POST(req);
    }
    // 201st from same IP chain → rate limited
    const req = new Request('http://localhost:3000/api/webhooks/google/calendar', {
      method: 'POST',
      headers: {
        'x-goog-resource-state': 'sync',
        'x-forwarded-for': '1.2.3.4, 10.0.0.1',
      },
    });
    const response = await POST(req);
    const body = await response.json();
    expect(body.error).toBe('rate_limited');
  });

  it('IP allowlist logs security event for non-listed IPs', async () => {
    vi.stubEnv('CALENDAR_WEBHOOK_ALLOWED_IPS', '10.0.0.1,10.0.0.2');
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const req = new Request('http://localhost:3000/api/webhooks/google/calendar', {
      method: 'POST',
      headers: {
        'x-goog-resource-state': 'sync',
        'x-real-ip': '192.168.1.1',
      },
    });
    await POST(req);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('ip_not_allowlisted'),
      expect.any(Object),
    );
    vi.unstubAllEnvs();
  });

  it('response Content-Type is application/json', async () => {
    mockParseWebhookPayload.mockReturnValue(
      Result.ok({
        provider: 'google',
        resourceId: 'resource-456',
        changeType: 'updated',
        channelId: 'channel-123',
        timestamp: new Date(),
      }),
    );
    mockProcessNotification.mockResolvedValue({ processed: true });

    const response = await POST(createGoogleRequest());

    expect(response.headers.get('content-type')).toContain('application/json');
  });
});
