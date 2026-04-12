/**
 * Microsoft Calendar Webhook Route Handler (IFC-224)
 *
 * POST /api/webhooks/microsoft/calendar
 *
 * Receives notifications from Microsoft Graph and triggers sync.
 * Always returns 200/202 to prevent Microsoft retry storms.
 */

import { timingSafeEqual } from 'node:crypto';
import { getMicrosoftAdapter, getWebhookService } from './providers';
import { isRateLimited, checkIpAllowlist } from '../../rate-limiter';

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB
const VALIDATION_TOKEN_REGEX = /^[\w\-.~+/]+=*$/;

function validateClientState(
  notifClientState: string | undefined,
  clientStateSecret: string | undefined,
  subscriptionId: string
): boolean {
  if (!notifClientState || !clientStateSecret) {
    console.warn('[MicrosoftWebhook] security_event_missing_client_state', {
      subscriptionId,
      hasClientState: !!notifClientState,
      hasSecret: !!clientStateSecret,
    });
    return false;
  }
  try {
    const stateBuffer = Buffer.from(notifClientState, 'utf8');
    const secretBuffer = Buffer.from(clientStateSecret, 'utf8');
    if (stateBuffer.length !== secretBuffer.length || !timingSafeEqual(stateBuffer, secretBuffer)) {
      console.warn('[MicrosoftWebhook] security_event_client_state_mismatch', { subscriptionId });
      return false;
    }
    return true;
  } catch {
    console.warn('[MicrosoftWebhook] security_event_client_state_validation_error', {
      subscriptionId,
    });
    return false;
  }
}

async function processNotifications(
  notifications: unknown[],
  clientStateSecret: string | undefined
): Promise<void> {
  const adapter = getMicrosoftAdapter();
  const webhookService = getWebhookService();
  const headers: Record<string, string> = {};

  for (const notification of notifications) {
    const notif = notification as Record<string, unknown>;
    const subscriptionId = notif.subscriptionId as string;
    if (
      !validateClientState(
        notif.clientState as string | undefined,
        clientStateSecret,
        subscriptionId
      )
    ) {
      continue;
    }
    const parseResult = adapter.parseWebhookPayload(headers, { value: [notif] });
    if (parseResult.isFailure) {
      console.warn('[MicrosoftWebhook] parse_failed', { subscriptionId });
      continue;
    }
    try {
      await webhookService.processNotification(
        parseResult.value as Parameters<typeof webhookService.processNotification>[0]
      );
    } catch (err) {
      console.error('[MicrosoftWebhook] process_error', {
        subscriptionId,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }
}

export async function POST(request: Request): Promise<Response> {
  // Rate limiting (NF-002)
  if (isRateLimited(request)) {
    return Response.json({ received: true, processed: false, error: 'rate_limited' });
  }
  checkIpAllowlist(request);
  const url = new URL(request.url);
  const validationToken = url.searchParams.get('validationToken');

  // Microsoft subscription validation handshake
  if (validationToken) {
    if (!VALIDATION_TOKEN_REGEX.test(validationToken)) {
      return Response.json(
        { received: true, processed: false, error: 'invalid_validation_token' },
        { status: 200 }
      );
    }
    return new Response(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Check payload size
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return Response.json(
      { received: true, processed: false, error: 'payload_too_large' },
      { status: 200 }
    );
  }

  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_SIZE) {
      return Response.json(
        { received: true, processed: false, error: 'payload_too_large' },
        { status: 200 }
      );
    }
    const body = JSON.parse(rawBody);
    const notifications = body?.value;

    if (!Array.isArray(notifications) || notifications.length === 0) {
      return Response.json(
        { received: true, processed: false, error: 'empty_value' },
        { status: 200 }
      );
    }

    const clientStateSecret = process.env.MSGRAPH_CLIENT_STATE_SECRET;
    await processNotifications(notifications, clientStateSecret);

    return Response.json({ received: true, processed: true }, { status: 202 });
  } catch (err) {
    console.error('[MicrosoftWebhook] unexpected_error', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return Response.json(
      { received: true, processed: false, error: 'internal_error' },
      { status: 200 }
    );
  }
}
