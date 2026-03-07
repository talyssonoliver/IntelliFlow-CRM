/**
 * CalendarWebhookService (IFC-224)
 *
 * Orchestrates webhook notification processing with idempotency and delegation.
 */

import type { CalendarSyncServicePort, WebhookPayload } from '@intelliflow/application';

export interface ProcessNotificationResult {
  processed: boolean;
  deduplicated?: boolean;
  error?: string;
}

const IDEMPOTENCY_TTL_MS = 60 * 60 * 1000; // 60 minutes

export class CalendarWebhookService {
  private readonly syncService: CalendarSyncServicePort | undefined;
  private readonly idempotencyMap = new Map<string, number>();

  constructor(syncService?: CalendarSyncServicePort) {
    this.syncService = syncService;
  }

  async processNotification(payload: WebhookPayload): Promise<ProcessNotificationResult> {
    const dedupKey = `${payload.provider}:${payload.channelId}:${payload.resourceId}:${payload.changeType}`;

    // Idempotency check
    const lastSeen = this.idempotencyMap.get(dedupKey);
    if (lastSeen !== undefined && Date.now() - lastSeen < IDEMPOTENCY_TTL_MS) {
      console.info('[CalendarWebhookService] webhook_notification_deduplicated', {
        provider: payload.provider,
        dedupKey,
      });
      return { processed: true, deduplicated: true };
    }

    // Record this notification
    this.idempotencyMap.set(dedupKey, Date.now());

    // Clean up expired entries periodically
    if (this.idempotencyMap.size > 1000) {
      this.cleanupExpiredEntries();
    }

    // Stub mode — no sync service available
    if (!this.syncService) {
      console.info('[CalendarWebhookService] webhook_notification_processed (stub mode)', {
        provider: payload.provider,
        resourceId: payload.resourceId,
        changeType: payload.changeType,
      });
      return { processed: true };
    }

    // Delegate to sync service
    const result = await this.syncService.handleWebhookNotification(payload);

    if (result.isSuccess) {
      console.info('[CalendarWebhookService] webhook_notification_processed', {
        provider: payload.provider,
        resourceId: payload.resourceId,
        changeType: payload.changeType,
        operation: result.value.operation,
      });
      return { processed: true };
    }

    const error = result.error;
    console.warn('[CalendarWebhookService] webhook_notification_failed', {
      provider: payload.provider,
      resourceId: payload.resourceId,
      changeType: payload.changeType,
      error: error.message,
    });
    return { processed: false, error: error.message };
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.idempotencyMap) {
      if (now - timestamp >= IDEMPOTENCY_TTL_MS) {
        this.idempotencyMap.delete(key);
      }
    }
  }
}
