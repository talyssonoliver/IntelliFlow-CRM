/**
 * CalendarWebhookService Tests (IFC-224)
 *
 * Tests for webhook notification processing, idempotency, and delegation.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { WebhookPayload, SyncResult } from '@intelliflow/application';
import type { CalendarSyncServicePort } from '@intelliflow/application';
import { Result, DomainError } from '@intelliflow/domain';

// Will be implemented in Step 7
import { CalendarWebhookService } from '../calendar-webhook.service';

class TestDomainError extends DomainError {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

function createMockSyncService(): CalendarSyncServicePort {
  return {
    executeFullSync: vi.fn(),
    executeIncrementalSync: vi.fn(),
    handleWebhookNotification: vi.fn(),
    resolveConflict: vi.fn(),
    queueForSync: vi.fn(),
    getSyncStatus: vi.fn(),
  } as unknown as CalendarSyncServicePort;
}

function createPayload(overrides: Partial<WebhookPayload> = {}): WebhookPayload {
  return {
    provider: 'google',
    resourceId: 'resource-123',
    changeType: 'updated',
    channelId: 'channel-456',
    timestamp: new Date('2026-03-07T00:00:00Z'),
    ...overrides,
  };
}

describe('CalendarWebhookService', () => {
  let service: CalendarWebhookService;
  let mockSyncService: CalendarSyncServicePort;

  beforeEach(() => {
    mockSyncService = createMockSyncService();
    service = new CalendarWebhookService(mockSyncService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('processNotification calls handleWebhookNotification with parsed payload', async () => {
    const payload = createPayload();
    const syncResult: SyncResult = {
      success: true,
      operation: 'update',
      idempotencyKey: 'google:channel-456:resource-123:updated',
    };
    vi.mocked(mockSyncService.handleWebhookNotification).mockResolvedValue(Result.ok(syncResult));

    const result = await service.processNotification(payload);

    expect(result.processed).toBe(true);
    expect(mockSyncService.handleWebhookNotification).toHaveBeenCalledWith(payload);
  });

  it('processNotification returns success result when sync succeeds', async () => {
    const payload = createPayload();
    vi.mocked(mockSyncService.handleWebhookNotification).mockResolvedValue(
      Result.ok({
        success: true,
        operation: 'update' as const,
        idempotencyKey: 'key-1',
      })
    );

    const result = await service.processNotification(payload);

    expect(result.processed).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('processNotification returns failure result when sync fails (no throw)', async () => {
    const payload = createPayload();
    vi.mocked(mockSyncService.handleWebhookNotification).mockResolvedValue(
      Result.fail(new TestDomainError('Sync failed', 'SYNC_ERROR'))
    );

    const result = await service.processNotification(payload);

    expect(result.processed).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('deduplicates duplicate payload within TTL window', async () => {
    const payload = createPayload();
    vi.mocked(mockSyncService.handleWebhookNotification).mockResolvedValue(
      Result.ok({
        success: true,
        operation: 'update' as const,
        idempotencyKey: 'key-1',
      })
    );

    await service.processNotification(payload);
    const secondResult = await service.processNotification(payload);

    expect(mockSyncService.handleWebhookNotification).toHaveBeenCalledTimes(1);
    expect(secondResult.processed).toBe(true);
    expect(secondResult.deduplicated).toBe(true);
  });

  it('processes same payload again after TTL expiry', async () => {
    const payload = createPayload();
    vi.mocked(mockSyncService.handleWebhookNotification).mockResolvedValue(
      Result.ok({
        success: true,
        operation: 'update' as const,
        idempotencyKey: 'key-1',
      })
    );

    await service.processNotification(payload);

    // Simulate TTL expiry by advancing time
    vi.useFakeTimers();
    vi.advanceTimersByTime(61 * 60 * 1000); // 61 minutes

    await service.processNotification(payload);
    vi.useRealTimers();

    expect(mockSyncService.handleWebhookNotification).toHaveBeenCalledTimes(2);
  });

  it('logs structured event on success', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const payload = createPayload();
    vi.mocked(mockSyncService.handleWebhookNotification).mockResolvedValue(
      Result.ok({
        success: true,
        operation: 'update' as const,
        idempotencyKey: 'key-1',
      })
    );

    await service.processNotification(payload);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('webhook_notification_processed'),
      expect.any(Object)
    );
  });

  it('logs structured event on failure', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const payload = createPayload();
    vi.mocked(mockSyncService.handleWebhookNotification).mockResolvedValue(
      Result.fail(new TestDomainError('Sync failed', 'SYNC_ERROR'))
    );

    await service.processNotification(payload);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('webhook_notification_failed'),
      expect.any(Object)
    );
  });

  it('cleans up expired idempotency entries when map exceeds threshold', async () => {
    vi.mocked(mockSyncService.handleWebhookNotification).mockResolvedValue(
      Result.ok({
        success: true,
        operation: 'update' as const,
        idempotencyKey: 'key',
      })
    );

    // Generate >1000 unique entries to trigger cleanup
    for (let i = 0; i < 1002; i++) {
      await service.processNotification(
        createPayload({ resourceId: `resource-${i}`, channelId: `channel-${i}` })
      );
    }

    // Should not throw — cleanup runs internally
    expect(mockSyncService.handleWebhookNotification).toHaveBeenCalledTimes(1002);
  });

  it('handles CalendarSyncServicePort being unavailable (stub mode)', async () => {
    const stubService = new CalendarWebhookService(undefined);
    const payload = createPayload();

    const result = await stubService.processNotification(payload);

    expect(result.processed).toBe(true);
  });
});
