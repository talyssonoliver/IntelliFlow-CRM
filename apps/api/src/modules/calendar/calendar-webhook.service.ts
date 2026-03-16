/**
 * CalendarWebhookService — re-export shim (IFC-224)
 *
 * The implementation lives in @intelliflow/application where it belongs:
 * it has no apps/api-specific dependencies and is also consumed by
 * apps/web's Next.js route handlers.
 *
 * This re-export preserves all existing imports within apps/api
 * (calendar-webhook.router.ts and tests) without modification.
 */
export { CalendarWebhookService, type ProcessNotificationResult } from '@intelliflow/application';
