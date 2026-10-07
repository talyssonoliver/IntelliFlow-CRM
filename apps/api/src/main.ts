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

initializeSentry()
  .catch((err) => {
    console.error('[API] Sentry initialization failed:', err);
  })
  .then(() => startApiServer())
  .catch((err) => {
    console.error('[API] Failed to start API server:', err);
    process.exit(1);
  });

process.on('SIGTERM', async () => {
  console.log('[API] SIGTERM received — shutting down gracefully');
  await shutdownAllQueues();
  await disconnectPrisma();
  process.exit(0);
});
