/**
 * Trigger: a subscription ended, so the workspace's data export is queued at once (agreement
 * clause 5: a standalone copy within 14 days; the job runs in minutes, not days).
 *
 * Called by the Stripe subscription sync (both the raw-body webhook and the operator replay
 * procedure) after the ended status is persisted. A failed queue write is absorbed inside
 * requestExportForEndedSubscription: the export row, once created, is durable and the worker's
 * sweep repairs a lost job. When the row itself cannot be written the error is rethrown, so the
 * webhook answers 5xx and Stripe redelivers (the persist before it is an idempotent upsert, and
 * the export request is idempotent per subscription).
 */
import type { PrismaClient } from '@intelliflow/db';
import { requestExportForEndedSubscription } from '@intelliflow/adapters';
import { enqueueWorkspaceExport } from './workspace-export.queue';

/** The export request could not be recorded: the caller must fail so the event is retried. */
export class WorkspaceExportTriggerError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'WorkspaceExportTriggerError';
  }
}

export interface EndedSubscriptionInfo {
  tenantId: string;
  subscriptionId: string;
}

interface LoggerLike {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export function createEndedSubscriptionExportHook(
  prisma: PrismaClient,
  logger: LoggerLike,
  enqueue: typeof enqueueWorkspaceExport = enqueueWorkspaceExport
): (info: EndedSubscriptionInfo) => Promise<void> {
  return async (info) => {
    try {
      const outcome = await requestExportForEndedSubscription(prisma, info, enqueue);
      logger.info(
        {
          tenantId: info.tenantId,
          subscriptionId: info.subscriptionId,
          outcome: outcome.kind,
          ...(outcome.kind === 'skipped' ? { reason: outcome.reason } : {}),
        },
        '[workspace-export] subscription ended'
      );
    } catch (err) {
      logger.error(
        { tenantId: info.tenantId, subscriptionId: info.subscriptionId, err: String(err) },
        '[workspace-export] could not record the export for an ended subscription'
      );
      throw new WorkspaceExportTriggerError(
        `could not record the workspace export: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    }
  };
}
