/**
 * Microsoft Calendar Webhook — Provider Factories (IFC-224)
 *
 * Isolated module for lazy adapter/service creation.
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

interface MicrosoftAdapter {
  parseWebhookPayload(headers: Record<string, string>, body: unknown): WebhookParseResult;
}

const adapterOverride: MicrosoftAdapter | null = null;
const serviceOverride: CalendarWebhookService | null = null;

/**
 * Inline Microsoft webhook payload parser.
 * Mirrors MicrosoftCalendarAdapter.parseWebhookPayload logic (packages/adapters)
 * to avoid importing @intelliflow/adapters from the Next.js web app.
 */
function parseMicrosoftWebhookPayload(
  _headers: Record<string, string>,
  body: unknown
): WebhookParseResult {
  const payload = body as {
    value?: Array<{
      subscriptionId?: string;
      clientState?: string;
      changeType?: 'created' | 'updated' | 'deleted';
      resource?: string;
      resourceData?: { id?: string };
    }>;
  };

  if (!payload.value || payload.value.length === 0) {
    return {
      isSuccess: false,
      isFailure: true,
      value: null,
      error: 'Empty webhook payload',
    };
  }

  const notification = payload.value[0];

  return {
    isSuccess: true,
    isFailure: false,
    value: {
      provider: 'microsoft',
      resourceId: notification.resourceData?.id ?? '',
      changeType: notification.changeType ?? 'updated',
      resourceUri: notification.resource,
      channelId: notification.clientState ?? notification.subscriptionId,
      timestamp: new Date(),
    },
    error: null,
  };
}

const inlineAdapter: MicrosoftAdapter = {
  parseWebhookPayload: (headers: Record<string, string>, body: unknown) =>
    parseMicrosoftWebhookPayload(headers, body),
};

export function getMicrosoftAdapter(): MicrosoftAdapter {
  if (adapterOverride) return adapterOverride;
  return inlineAdapter;
}

export function getWebhookService(): CalendarWebhookService {
  if (serviceOverride) return serviceOverride;
  return getCalendarWebhookService();
}
