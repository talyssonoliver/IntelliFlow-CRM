/**
 * Calendar Webhook Service accessor (IFC-224)
 *
 * Provides a singleton CalendarWebhookService for route handlers.
 * Uses CalendarSyncServiceAdapter stub until full sync is implemented.
 */

import { CalendarWebhookService } from '../../../api/src/modules/calendar/calendar-webhook.service';

let instance: CalendarWebhookService | null = null;

export function getCalendarWebhookService(): CalendarWebhookService {
  // Stub mode — no sync service. Once CalendarSyncServicePort has a real
  // implementation, inject it here.
  instance ??= new CalendarWebhookService();
  return instance;
}

/** Test-only: override the singleton */
export function setCalendarWebhookServiceForTests(
  service: CalendarWebhookService | null,
): void {
  instance = service;
}
