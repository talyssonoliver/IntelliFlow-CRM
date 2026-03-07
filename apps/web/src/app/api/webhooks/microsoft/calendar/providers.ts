/**
 * Microsoft Calendar Webhook — Provider Factories (IFC-224)
 *
 * Isolated module for lazy adapter/service creation.
 */

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
  const { getCalendarWebhookService } = require('../../../../../lib/calendar-webhook-service');
  return getCalendarWebhookService();
}

export function setMicrosoftAdapterForTests(adapter: MicrosoftAdapter | null): void {
  adapterOverride = adapter;
}
export function setWebhookServiceForTests(service: CalendarWebhookService | null): void {
  serviceOverride = service;
}
