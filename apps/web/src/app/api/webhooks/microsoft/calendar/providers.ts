/**
 * Microsoft Calendar Webhook — Provider Factories (IFC-224)
 *
 * Isolated module for lazy adapter/service creation.
 */

import { getCalendarWebhookService } from '../../../../../lib/calendar-webhook-service';

interface CalendarWebhookService {
  processNotification(payload: unknown): Promise<{ processed: boolean; error?: string }>;
}

interface MicrosoftAdapter {
  parseWebhookPayload(headers: Record<string, string>, body: unknown): {
    isSuccess: boolean;
    isFailure: boolean;
    value: unknown;
    error: unknown;
  };
}

let adapterOverride: MicrosoftAdapter | null = null;
let serviceOverride: CalendarWebhookService | null = null;

export function getMicrosoftAdapter(): MicrosoftAdapter {
  if (adapterOverride) return adapterOverride;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic require returns untyped module
  const { MicrosoftCalendarAdapter } = require('@intelliflow/adapters') as Record<string, any>;
  return new MicrosoftCalendarAdapter({
    clientId: '',
    clientSecret: '',
    tenantId: '',
    redirectUri: '',
  });
}

export function getWebhookService(): CalendarWebhookService {
  if (serviceOverride) return serviceOverride;
  return getCalendarWebhookService();
}


