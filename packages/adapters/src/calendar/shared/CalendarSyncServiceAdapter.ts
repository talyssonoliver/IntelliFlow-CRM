/**
 * CalendarSyncServiceAdapter (IFC-224)
 *
 * Stub implementation of CalendarSyncServicePort.
 * Logs webhook notifications and returns ok results.
 * Full sync implementation is out of scope for IFC-224.
 */

import { Result, DomainError } from '@intelliflow/domain';
import type {
  CalendarSyncServicePort,
  WebhookPayload,
  SyncResult,
  SyncBatchResult,
  SyncError,
  ConflictResolution,
  CalendarProvider,
  ExternalCalendarEvent,
} from '@intelliflow/application';
import type { Appointment, AppointmentId } from '@intelliflow/domain';

export class CalendarSyncServiceAdapter implements CalendarSyncServicePort {
  async handleWebhookNotification(
    payload: WebhookPayload,
  ): Promise<Result<SyncResult, DomainError>> {
    console.info('[CalendarSyncServiceAdapter] webhook_notification_received (stub)', {
      provider: payload.provider,
      resourceId: payload.resourceId,
      changeType: payload.changeType,
    });

    return Result.ok({
      success: true,
      operation: 'skip' as const,
      idempotencyKey: `${payload.provider}:${payload.channelId}:${payload.resourceId}:${payload.changeType}`,
    });
  }

  async executeFullSync(
    userId: string,
    provider: CalendarProvider,
  ): Promise<Result<SyncBatchResult, DomainError>> {
    console.info('[CalendarSyncServiceAdapter] executeFullSync (stub)', { userId, provider });
    return Result.ok({
      processed: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      errors: [],
      hasMore: false,
    });
  }

  async executeIncrementalSync(
    userId: string,
    provider: CalendarProvider,
  ): Promise<Result<SyncBatchResult, DomainError>> {
    console.info('[CalendarSyncServiceAdapter] executeIncrementalSync (stub)', { userId, provider });
    return Result.ok({
      processed: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      errors: [],
      hasMore: false,
    });
  }

  async resolveConflict(
    localAppointment: Appointment,
    remoteEvent: ExternalCalendarEvent,
    strategy: ConflictResolution['strategy'],
  ): Promise<Result<ConflictResolution, DomainError>> {
    console.info('[CalendarSyncServiceAdapter] resolveConflict (stub)', { strategy });
    return Result.ok({
      strategy,
      localVersion: localAppointment,
      remoteVersion: remoteEvent,
    } as ConflictResolution);
  }

  async queueForSync(
    appointmentId: AppointmentId,
    operation: 'create' | 'update' | 'delete',
    provider: CalendarProvider,
  ): Promise<void> {
    console.info('[CalendarSyncServiceAdapter] queueForSync (stub)', {
      appointmentId: appointmentId.toString(),
      operation,
      provider,
    });
  }

  async getSyncStatus(
    userId: string,
    provider: CalendarProvider,
  ): Promise<{ lastSyncAt?: Date; syncToken?: string; pendingOperations: number; errors: SyncError[] }> {
    console.info('[CalendarSyncServiceAdapter] getSyncStatus (stub)', { userId, provider });
    return {
      pendingOperations: 0,
      errors: [],
    };
  }
}
