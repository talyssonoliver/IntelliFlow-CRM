/**
 * Standalone API Server Entry Point
 *
 * Boots the Node HTTP server for the API package.
 * Kept separate from index.ts so workspace consumers can import
 * the API library without pulling runtime-only HTTP server code.
 */

import './instrument';
import { initializeSentry } from './tracing/sentry';
import { disconnectPrisma } from '@intelliflow/db';
import { shutdownAllQueues } from '@intelliflow/platform/queues';
import { startApiServer } from './http-server';
import { stopBackgroundJobs } from './background-jobs';

initializeSentry()
  .catch((err) => {
    console.error('[API] Sentry initialization failed:', err);
  })
  .then(() => startApiServer())
  .catch((err) => {
    console.error('[API] Failed to start API server:', err);
    process.exit(1);
  });

/** Longest the SIGTERM handler waits for an in-flight job tick (API_SHUTDOWN_JOBS_TIMEOUT_MS). */
function jobsDrainTimeoutMs(env: NodeJS.ProcessEnv): number {
  const value = Number(env.API_SHUTDOWN_JOBS_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 10_000;
}

/** Resolves when `work` does, or after `ms`, so a hung tick cannot block shutdown. */
async function withCap(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[API] background job tick still running after ${String(ms)}ms; continuing`);
      resolve();
    }, ms);
    timer.unref?.();
  });
  try {
    await Promise.race([work, cap]);
  } finally {
    clearTimeout(timer);
  }
}

process.on('SIGTERM', async () => {
  console.log('[API] SIGTERM received — shutting down gracefully');
  // Let a mid-flight tick finish, but never past the cap: the queues and Prisma
  // below must still close before Railway's SIGKILL.
  await withCap(stopBackgroundJobs(), jobsDrainTimeoutMs(process.env));
  await shutdownAllQueues();
  await disconnectPrisma();
  process.exit(0);
});
