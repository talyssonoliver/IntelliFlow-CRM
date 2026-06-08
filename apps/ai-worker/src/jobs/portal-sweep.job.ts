/**
 * Portal Delivery Sweep Job Handler
 *
 * BullMQ cron job (daily 05:00 UTC) on the `portal-sweep` queue. The Leangency
 * portal has no scheduler of its own, so this is the heartbeat that drives its
 * time-based delivery transitions: it POSTs to the portal's
 * `/api/internal/delivery/sweep` endpoint (Bearer PORTAL_INTERNAL_SECRET), which
 * auto-pauses onboardings stalled past their 3-day cap. The portal owns the
 * logic; this job owns the tick.
 *
 * 05:00 UTC is deliberately one hour BEFORE the portal's own Vercel-Cron fallback
 * (06:00 UTC), so the CRM job wins the race and the Vercel job is a true backup.
 * The sweep is idempotent, so a double-fire is harmless.
 *
 * Inert (logs + no-ops) when the portal env is not configured.
 *
 * @module ai-worker/jobs/portal-sweep
 * @task IFC-314 - CRM->portal delivery/billing sync (step 8)
 */

import type { Job } from 'bullmq';
import { z } from 'zod';
import pino from 'pino';

const logger = pino({
  name: 'portal-sweep-job',
  level: process.env.LOG_LEVEL || 'info',
});

/** Queue name for the portal delivery sweep cron. */
export const PORTAL_SWEEP_QUEUE = 'portal-sweep';

/** Daily at 05:00 UTC — clear of the 02:00/03:00 jobs, 1h before the Vercel backup. */
export const PORTAL_SWEEP_CRON = '0 5 * * *';

/** BullMQ default job options — attempts matches the other scheduled jobs. */
export const DEFAULT_PORTAL_SWEEP_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: { age: 7 * 24 * 60 * 60, count: 30 },
  removeOnFail: { age: 30 * 24 * 60 * 60 },
} as const;

export const PortalSweepJobDataSchema = z.object({
  correlationId: z.string().optional(),
});
export type PortalSweepJobData = z.infer<typeof PortalSweepJobDataSchema>;

export interface PortalSweepJobResult {
  success: boolean;
  /** Number of onboardings the portal evaluated. */
  evaluated: number;
  /** Slugs the portal auto-paused this run. */
  paused: string[];
  /** True when the job no-opped because the portal env is not configured. */
  skipped?: boolean;
}

const TIMEOUT_MS = 15000;

export async function processPortalSweepJob(
  job: Job<PortalSweepJobData>
): Promise<PortalSweepJobResult> {
  const baseUrl = process.env.LEANGENCY_PORTAL_INTERNAL_URL;
  const secret = process.env.PORTAL_INTERNAL_SECRET;

  if (!baseUrl || !secret) {
    logger.warn(
      '[portal-sweep] LEANGENCY_PORTAL_INTERNAL_URL / PORTAL_INTERNAL_SECRET not set; skipping'
    );
    return { success: true, evaluated: 0, paused: [], skipped: true };
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/api/internal/delivery/sweep`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    const body = await res.text();
    if (!res.ok) {
      logger.error(
        { status: res.status, body: body.slice(0, 200) },
        '[portal-sweep] sweep request failed'
      );
      // Throw → BullMQ retries (attempts: 3). Idempotent, so a retry is safe.
      throw new Error(`portal sweep failed: HTTP ${res.status}`);
    }

    const parsed = JSON.parse(body) as { evaluated?: number; paused?: string[] };
    const result: PortalSweepJobResult = {
      success: true,
      evaluated: parsed.evaluated ?? 0,
      paused: parsed.paused ?? [],
    };
    logger.info({ jobId: job.id, ...result }, '[portal-sweep] sweep complete');
    return result;
  } finally {
    clearTimeout(timeout);
  }
}
