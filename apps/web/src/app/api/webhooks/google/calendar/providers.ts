/**
 * Google Calendar Webhook — Provider Factories (IFC-224)
 *
 * Isolated module for lazy adapter/service creation.
 * Easily mockable in tests without requiring @intelliflow/adapters resolution.
 *
 * Webhook payload parsing is inlined here to avoid importing @intelliflow/adapters
 * from the web app (hexagonal architecture: web → application, not web → adapters).
 */

import { getCalendarWebhookService } from '../../../../../lib/calendar-webhook-service';

interface CalendarWebhookService {
  processNotification(payload: unknown): Promise<{ processed: boolean; error?: string }>;
}

interface WebhookParseResult {
  isSuccess: boolean;
  isFailure: boolean;
  value: unknown;
  error: unknown;
}

interface GoogleAdapter {
  parseWebhookPayload(headers: Record<string, string>, body: unknown): WebhookParseResult;
}

const adapterOverride: GoogleAdapter | null = null;
const serviceOverride: CalendarWebhookService | null = null;

/**
 * Inline Google webhook payload parser.
 * Mirrors GoogleCalendarAdapter.parseWebhookPayload logic (packages/adapters)
 * to avoid importing @intelliflow/adapters from the Next.js web app.
 */
function parseGoogleWebhookPayload(headers: Record<string, string>): WebhookParseResult {
  const resourceState = headers['x-goog-resource-state'];
  const resourceId = headers['x-goog-resource-id'];
  const channelId = headers['x-goog-channel-id'];
  const resourceUri = headers['x-goog-resource-uri'];

  if (!resourceState || !resourceId || !channelId) {
    return {
      isSuccess: false,
      isFailure: true,
      value: null,
      error: 'Invalid webhook payload: missing required headers',
    };
  }

  let changeType: 'created' | 'updated' | 'deleted';
  switch (resourceState) {
    case 'sync':
    case 'exists':
      changeType = 'updated';
      break;
    case 'not_exists':
      changeType = 'deleted';
      break;
    default:
      changeType = 'updated';
  }

  return {
    isSuccess: true,
    isFailure: false,
    value: {
      provider: 'google',
      resourceId,
      changeType,
      resourceUri,
      channelId,
      timestamp: new Date(),
    },
    error: null,
  };
}

const inlineAdapter: GoogleAdapter = {
  parseWebhookPayload: (headers: Record<string, string>) => parseGoogleWebhookPayload(headers),
};

export function getGoogleAdapter(): GoogleAdapter {
  if (adapterOverride) return adapterOverride;
  return inlineAdapter;
}

export function getWebhookService(): CalendarWebhookService {
  if (serviceOverride) return serviceOverride;
  return getCalendarWebhookService();
}
