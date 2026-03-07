/**
 * Microsoft Calendar Webhook Route Handler Tests (IFC-224)
 *
 * Tests for /api/webhooks/microsoft/calendar POST endpoint.
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
  getMicrosoftAdapter: vi.fn(() => ({
    parseWebhookPayload: mockParseWebhookPayload,
  })),
  getWebhookService: vi.fn(() => ({
    processNotification: mockProcessNotification,
  })),
}));

import { POST } from '../route';
import { resetRateLimiter } from '../../../rate-limiter';

function createMicrosoftRequest(
  body: object | null = null,
  queryParams: string = '',
): Request {
  const url = `http://localhost:3000/api/webhooks/microsoft/calendar${queryParams}`;
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== null) {
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

function createNotificationBody(overrides: Record<string, unknown> = {}) {
  return {
    value: [
      {
        subscriptionId: 'sub-123',
        clientState: 'test-secret',
        changeType: 'updated',
        resource: 'me/events/event-123',
        resourceData: {
          '@odata.type': '#Microsoft.Graph.Event',
          id: 'event-123',
        },
        ...overrides,
      },
    ],
  };
}

describe('Microsoft Calendar Webhook Route Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MSGRAPH_CLIENT_STATE_SECRET', 'test-secret');
    resetRateLimiter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('validationToken query param → 200 OK, text/plain, echoes token', async () => {
    const response = await POST(
      createMicrosoftRequest(null, '?validationToken=abc123-def'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    const text = await response.text();
    expect(text).toBe('abc123-def');
  });

  it('validationToken with special characters → sanitized/validated', async () => {
    const response = await POST(
      createMicrosoftRequest(null, '?validationToken=<script>alert(1)</script>'),
    );

    // Should reject invalid token format
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(false);
  });

  it('valid notification body → 200/202 OK, triggers processNotification', async () => {
    const notifBody = createNotificationBody();
    mockParseWebhookPayload.mockReturnValue(
      Result.ok({
        provider: 'microsoft',
        resourceId: 'event-123',
        changeType: 'updated',
        channelId: 'sub-123',
        timestamp: new Date(),
      }),
    );
    mockProcessNotification.mockResolvedValue({ processed: true });

    const response = await POST(createMicrosoftRequest(notifBody));

    expect([200, 202]).toContain(response.status);
    expect(mockProcessNotification).toHaveBeenCalled();
  });

  it('clientState matches stored secret → processed', async () => {
    mockParseWebhookPayload.mockReturnValue(
      Result.ok({
        provider: 'microsoft',
        resourceId: 'event-123',
        changeType: 'updated',
        channelId: 'sub-123',
        timestamp: new Date(),
      }),
    );
    mockProcessNotification.mockResolvedValue({ processed: true });

    const response = await POST(
      createMicrosoftRequest(createNotificationBody({ clientState: 'test-secret' })),
    );

    expect([200, 202]).toContain(response.status);
    expect(mockProcessNotification).toHaveBeenCalled();
  });

  it('clientState mismatch → 202, notification skipped, security event logged', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await POST(
      createMicrosoftRequest(createNotificationBody({ clientState: 'wrong-secret' })),
    );

    expect([200, 202]).toContain(response.status);
    expect(mockProcessNotification).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('security'),
      expect.any(Object),
    );
  });

  it('missing clientState → 202, notification skipped, logged as rejection', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await POST(
      createMicrosoftRequest(createNotificationBody({ clientState: undefined })),
    );

    expect([200, 202]).toContain(response.status);
    expect(mockProcessNotification).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('empty value array → 200 OK (no items to process)', async () => {
    const response = await POST(createMicrosoftRequest({ value: [] }));

    expect(response.status).toBe(200);
    expect(mockProcessNotification).not.toHaveBeenCalled();
  });

  it('batch: multiple items in value[] → all items processed', async () => {
    const body = {
      value: [
        {
          subscriptionId: 'sub-1',
          clientState: 'test-secret',
          changeType: 'updated',
          resource: 'me/events/event-1',
          resourceData: { '@odata.type': '#Microsoft.Graph.Event', id: 'event-1' },
        },
        {
          subscriptionId: 'sub-2',
          clientState: 'test-secret',
          changeType: 'created',
          resource: 'me/events/event-2',
          resourceData: { '@odata.type': '#Microsoft.Graph.Event', id: 'event-2' },
        },
      ],
    };
    mockParseWebhookPayload.mockReturnValue(
      Result.ok({
        provider: 'microsoft',
        resourceId: 'event-1',
        changeType: 'updated',
        channelId: 'sub-1',
        timestamp: new Date(),
      }),
    );
    mockProcessNotification.mockResolvedValue({ processed: true });

    const response = await POST(createMicrosoftRequest(body));

    expect([200, 202]).toContain(response.status);
    expect(mockParseWebhookPayload).toHaveBeenCalledTimes(2);
    expect(mockProcessNotification).toHaveBeenCalledTimes(2);
  });

  it('parseWebhookPayload returns failure → 202 (logged, notification skipped)', async () => {
    mockParseWebhookPayload.mockReturnValue(
      Result.fail(new TestDomainError('Parse failed', 'PARSE_ERROR')),
    );

    const response = await POST(
      createMicrosoftRequest(createNotificationBody()),
    );

    expect([200, 202]).toContain(response.status);
    expect(mockProcessNotification).not.toHaveBeenCalled();
  });

  it('processNotification throws → 202 (caught, logged)', async () => {
    mockParseWebhookPayload.mockReturnValue(
      Result.ok({
        provider: 'microsoft',
        resourceId: 'event-123',
        changeType: 'updated',
        channelId: 'sub-123',
        timestamp: new Date(),
      }),
    );
    mockProcessNotification.mockRejectedValue(new Error('Unexpected'));

    const response = await POST(
      createMicrosoftRequest(createNotificationBody()),
    );

    expect([200, 202]).toContain(response.status);
  });

  it('created changeType → triggers processNotification', async () => {
    const body = createNotificationBody({ changeType: 'created' });
    mockParseWebhookPayload.mockReturnValue(
      Result.ok({
        provider: 'microsoft',
        resourceId: 'event-123',
        changeType: 'created',
        channelId: 'sub-123',
        timestamp: new Date(),
      }),
    );
    mockProcessNotification.mockResolvedValue({ processed: true });

    const response = await POST(createMicrosoftRequest(body));

    expect([200, 202]).toContain(response.status);
    expect(mockProcessNotification).toHaveBeenCalled();
  });

  it('response body includes { received: true } for valid notifications', async () => {
    mockParseWebhookPayload.mockReturnValue(
      Result.ok({
        provider: 'microsoft',
        resourceId: 'event-123',
        changeType: 'updated',
        channelId: 'sub-123',
        timestamp: new Date(),
      }),
    );
    mockProcessNotification.mockResolvedValue({ processed: true });

    const response = await POST(
      createMicrosoftRequest(createNotificationBody()),
    );
    const responseBody = await response.json();

    expect(responseBody.received).toBe(true);
  });

  it('rate limited after 200 requests per IP per minute', async () => {
    for (let i = 0; i < 200; i++) {
      await POST(createMicrosoftRequest(null, '?validationToken=test'));
    }
    const response = await POST(createMicrosoftRequest(null, '?validationToken=test'));
    const body = await response.json();
    expect(body.error).toBe('rate_limited');
  });

  it('body > 1 MB → rejected before parsing', async () => {
    // Send body that exceeds 1MB when stringified
    const padding = 'x'.repeat(1024 * 1024 + 100);
    const req = new Request('http://localhost:3000/api/webhooks/microsoft/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: [{ data: padding }] }),
    });

    const response = await POST(req);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(false);
    expect(body.error).toContain('payload_too_large');
  });
});
