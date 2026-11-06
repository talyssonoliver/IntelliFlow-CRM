/**
 * Google Calendar Webhook Route Handler (IFC-224)
 *
 * POST /api/webhooks/google/calendar
 *
 * Receives push notifications from Google Calendar and triggers sync.
 * Always returns 200 OK to prevent Google retry storms.
 */

import { timingSafeEqual } from 'node:crypto';
import { getGoogleAdapter, getWebhookService } from './providers';
import { isRateLimited, checkIpAllowlist } from '../../rate-limiter';

/** Fails closed: with no configured token, no notification is accepted. */
function isValidChannelToken(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(received, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export async function POST(request: Request): Promise<Response> {
  // Rate limiting (NF-002)
  if (isRateLimited(request)) {
    return Response.json({ received: true, processed: false, error: 'rate_limited' });
  }
  checkIpAllowlist(request);
  const channelId = request.headers.get('x-goog-channel-id');
  const resourceId = request.headers.get('x-goog-resource-id');
  const resourceState = request.headers.get('x-goog-resource-state');

  // Sync state — channel establishment ping, not a real event
  if (resourceState === 'sync') {
    return Response.json({ received: true, verification: true });
  }

  // Validate required headers
  if (!channelId || !resourceId || !resourceState) {
    console.warn('[GoogleWebhook] security_event_missing_headers', {
      hasChannelId: !!channelId,
      hasResourceId: !!resourceId,
      hasResourceState: !!resourceState,
    });
    return Response.json({ received: true, processed: false, error: 'missing_headers' });
  }

  if (
    !isValidChannelToken(
      request.headers.get('x-goog-channel-token'),
      process.env.GOOGLE_CALENDAR_CHANNEL_TOKEN
    )
  ) {
    console.warn('[GoogleWebhook] security_event_invalid_channel_token', { channelId });
    return Response.json({ received: true, processed: false, error: 'invalid_token' });
  }

  // Build headers map for adapter
  const headers: Record<string, string> = {};
  for (const key of [
    'x-goog-channel-id',
    'x-goog-resource-id',
    'x-goog-resource-state',
    'x-goog-resource-uri',
    'x-goog-channel-token',
    'x-goog-message-number',
  ]) {
    const val = request.headers.get(key);
    if (val) headers[key] = val;
  }

  try {
    const adapter = getGoogleAdapter();
    const parseResult = adapter.parseWebhookPayload(headers, {});

    if (parseResult.isFailure) {
      console.warn('[GoogleWebhook] parse_failed', {
        channelId,
        resourceState,
      });
      return Response.json({ received: true, processed: false, error: 'parse_failed' });
    }

    const webhookService = getWebhookService();
    try {
      await webhookService.processNotification(parseResult.value);
    } catch (err) {
      console.error('[GoogleWebhook] process_error', {
        channelId,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }

    return Response.json({ received: true, processed: true });
  } catch (err) {
    console.error('[GoogleWebhook] unexpected_error', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return Response.json({ received: true, processed: false, error: 'internal_error' });
  }
}
