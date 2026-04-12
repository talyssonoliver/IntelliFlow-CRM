/**
 * E2E Test: Inbound Email Webhook
 *
 * Tests the email.webhook tRPC endpoint at the HTTP level.
 * This is a publicProcedure — no auth required.
 *
 * @task IFC-144 - Email Integration E2E
 */
import { test, expect } from '@playwright/test';

const API_BASE = process.env.E2E_API_URL || 'http://localhost:3001';

/**
 * Helper to call tRPC mutation via HTTP POST.
 * tRPC v11 batch format: POST /trpc/<procedure> with JSON body.
 */
async function callWebhook(request: any, payload: Record<string, unknown>) {
  return request.post(`${API_BASE}/trpc/email.webhook`, {
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify(payload),
  });
}

test.describe('Inbound Email Webhook (email.webhook)', () => {
  test('POST valid SendGrid inbound payload returns 200 + success', async ({ request }) => {
    const response = await callWebhook(request, {
      from: 'sender@example.com',
      to: 'inbox@intelliflow-crm.com',
      subject: 'E2E test email',
      text: 'Hello from the E2E test suite.',
      headers: [
        'From: sender@example.com',
        'To: inbox@intelliflow-crm.com',
        'Subject: E2E test email',
        'Content-Type: text/plain; charset=utf-8',
      ].join('\r\n'),
      provider: 'sendgrid',
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    // tRPC wraps result in { result: { data: ... } }
    const data = body?.result?.data ?? body;
    expect(data.success).toBe(true);
    expect(typeof data.emailId).toBe('string');
  });

  test('POST malformed payload (missing required info) returns error', async ({ request }) => {
    // No headers, no rawEmail, no provider — triggers "Unable to parse email format"
    const response = await callWebhook(request, {});

    // tRPC returns 200 with error body or 400 depending on server config
    const status = response.status();
    if (status === 200) {
      const body = await response.json();
      // tRPC error response has error shape
      expect(body?.error || body?.result?.error).toBeDefined();
    } else {
      expect([400, 500]).toContain(status);
    }
  });

  test('POST with rawEmail format returns 200 + success', async ({ request }) => {
    const rawEmail = [
      'From: rawtest@example.com',
      'To: inbox@intelliflow-crm.com',
      'Subject: Raw email E2E test',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'This is a raw email body for E2E testing.',
    ].join('\r\n');

    const response = await callWebhook(request, {
      rawEmail,
      provider: 'raw',
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    const data = body?.result?.data ?? body;
    expect(data.success).toBe(true);
    expect(typeof data.emailId).toBe('string');
  });
});
