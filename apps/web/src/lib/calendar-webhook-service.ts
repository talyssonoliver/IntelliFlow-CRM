/**
 * Calendar Webhook Service accessor — web edge context (IFC-224)
 *
 * Provides a singleton CalendarWebhookService for Next.js route handlers.
 *
 * NO-SYNC MODE: Constructed without a CalendarSyncServicePort.
 * Incoming notifications are received, deduplicated in-process, and
 * acknowledged (HTTP 200/202) — no calendar sync is triggered from the
 * web process.
 *
 * Why: apps/web has no access to database adapters. Real sync is wired in
 * the tRPC API container (apps/api/src/container.ts) which constructs
 *   new CalendarWebhookService(new CalendarSyncServiceAdapter())
 * so every notification processed there triggers an actual sync operation.
 *
 * TODO(IFC-XXX): Route webhook notifications through the API container
 * (e.g. via an internal tRPC mutation or a shared queue) so that sync
 * actually runs, then remove this web-side singleton entirely.
 *
 * IDEMPOTENCY: Deduplication relies on an in-memory Map inside
 * CalendarWebhookService with a 60-minute TTL. This is process-local —
 * deduplicated state is not shared across replicas and is lost on cold
 * starts. For distributed deduplication, a shared store (Redis / Supabase)
 * must back CalendarSyncServicePort.handleWebhookNotification.
 *
 * CALLERS: getWebhookService() in
 *   app/api/webhooks/google/calendar/providers.ts
 *   app/api/webhooks/microsoft/calendar/providers.ts
 * Tests override at the provider layer via vi.mock('../providers', ...),
 * not at this level.
 */

import { CalendarWebhookService } from '@intelliflow/application';

let instance: CalendarWebhookService | null = null;

/**
 * Returns the singleton CalendarWebhookService for web route handlers.
 * Runs in no-sync mode — see file header.
 */
export function getCalendarWebhookService(): CalendarWebhookService {
  // No CalendarSyncServicePort injected: operates in no-sync mode.
  // See TODO(IFC-XXX) in file header for the upgrade path.
  instance ??= new CalendarWebhookService();
  return instance;
}
