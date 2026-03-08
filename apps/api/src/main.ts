/**
 * Standalone API Server Entry Point
 *
 * Boots the Node HTTP server for the API package.
 * Kept separate from index.ts so workspace consumers can import
 * the API library without pulling runtime-only HTTP server code.
 */

import { startTracing } from './tracing/otel';
import { disconnectPrisma } from '@intelliflow/db';
import { shutdownAllQueues } from '@intelliflow/platform/queues';
import { startApiServer } from './http-server';

if (process.env.OTEL_ENABLED !== 'false') {
  startTracing();
}

process.on('SIGTERM', async () => {
  console.log('[API] SIGTERM received — shutting down gracefully');
  await shutdownAllQueues();
  await disconnectPrisma();
  process.exit(0);
});

startApiServer();
