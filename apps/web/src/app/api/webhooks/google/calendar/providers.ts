/**
 * Google Calendar Webhook — Provider Factories (IFC-224)
 *
 * Isolated module for lazy adapter/service creation.
 * Easily mockable in tests without requiring @intelliflow/adapters resolution.
 */

import { getCalendarWebhookService } from '../../../../../lib/calendar-webhook-service';

interface CalendarWebhookService {
  processNotification(payload: unknown): Promise<{ processed: boolean; error?: string }>;
}

interface GoogleAdapter {
  parseWebhookPayload(headers: Record<string, string>, body: unknown): {
    isSuccess: boolean;
    isFailure: boolean;
    value: unknown;
    error: unknown;
  };
}

let adapterOverride: GoogleAdapter | null = null;
let serviceOverride: CalendarWebhookService | null = null;

export function getGoogleAdapter(): GoogleAdapter {
  if (adapterOverride) return adapterOverride;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic require returns untyped module
  const { GoogleCalendarAdapter } = require('@intelliflow/adapters') as Record<string, any>;
  return new GoogleCalendarAdapter({
    clientId: '',
    clientSecret: '',
    redirectUri: '',
  });
}

export function getWebhookService(): CalendarWebhookService {
  if (serviceOverride) return serviceOverride;
  return getCalendarWebhookService();
}


