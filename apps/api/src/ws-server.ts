/**
 * tRPC WebSocket Server
 *
 * Standalone WebSocket server for tRPC subscriptions.
 * Enables real-time updates for lead scores, tasks, notifications, etc.
 *
 * @module @intelliflow/api/ws-server
 * @task IFC-016/IFC-150 Integration
 */

import type { IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { appRouter } from './router';
import { createWSContext, type Context } from './context';
import {
  evaluateRealtimeCapacity,
  getRealtimeCapacityConfig,
  logCapacityIfChanged,
  type RealtimeCapacityEvaluation,
  type RealtimeCapacityStatus,
} from './realtime/capacity';

// ============================================================================
// Configuration
// ============================================================================

const WS_PORT = Number(process.env.WS_PORT ?? 3001);

// ============================================================================
// WebSocket Server
// ============================================================================

/**
 * Create and configure the WebSocket server for tRPC subscriptions
 */
export function createWebSocketServer(port: number = WS_PORT): WebSocketServer {
  const wss = new WebSocketServer({ port });

  // Apply tRPC WebSocket handler
  const handler = applyWSSHandler({
    wss,
    router: appRouter,
    createContext: async (opts): Promise<Context> => {
      const connectionParams = opts.info?.connectionParams;
      const authHeader =
        (typeof connectionParams?.authorization === 'string' && connectionParams.authorization) ||
        (typeof connectionParams?.Authorization === 'string' && connectionParams.Authorization) ||
        opts.req.headers.authorization;

      return createWSContext(authHeader);
    },
    // Keep connections alive with ping/pong
    keepAlive: {
      enabled: true,
      pingMs: 30000,
      pongWaitMs: 5000,
    },
  });

  // Realtime capacity evaluator (issue #318, caveat 3b): turn the live
  // wss.clients count into an ok/warning/critical status, logging on transitions
  // so capacity is real evidence rather than an assumed limit.
  const capacityConfig = getRealtimeCapacityConfig();
  let capacityStatus: RealtimeCapacityStatus = 'ok';
  const reportCapacity = (): void => {
    const evaluation = evaluateRealtimeCapacity(wss.clients.size, capacityConfig);
    capacityStatus = logCapacityIfChanged(evaluation, capacityStatus);
  };

  // Connection handling
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const clientId = req.headers['sec-websocket-key'] || 'unknown';
    console.log(`[WS] Client connected: ${clientId}`);
    reportCapacity();

    ws.on('close', () => {
      console.log(`[WS] Client disconnected: ${clientId}`);
      reportCapacity();
    });

    ws.on('error', (error: Error) => {
      console.error(`[WS] Client error (${clientId}):`, error.message);
    });
  });

  // Server lifecycle
  wss.on('listening', () => {
    console.log(`[WS] tRPC WebSocket server listening on ws://localhost:${port}`);
  });

  wss.on('error', (error: Error) => {
    console.error('[WS] Server error:', error);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[WS] Shutting down WebSocket server...');
    handler.broadcastReconnectNotification();
    wss.close(() => {
      console.log('[WS] WebSocket server closed');
      process.exit(0);
    });
  });

  return wss;
}

/**
 * Live realtime-capacity evaluator: evaluates the current concurrent-connection
 * count of `wss` against the configured cap/thresholds. The queryable counterpart
 * to the WS server's transition logging (issue #318, caveat 3b).
 */
export function getRealtimeCapacity(wss: WebSocketServer): RealtimeCapacityEvaluation {
  return evaluateRealtimeCapacity(wss.clients.size);
}

// ============================================================================
// Standalone Execution
// ============================================================================

// Run as standalone server if executed directly
if (require.main === module) {
  createWebSocketServer();

  console.log(`
  =========================================
  tRPC WebSocket Server
  =========================================
  Port: ${WS_PORT}
  Subscriptions: subscriptions.onLeadScored
                 subscriptions.onTaskAssigned
                 subscriptions.onSystemEvent
                 subscriptions.onAIProgress
                 subscriptions.heartbeat
  =========================================
  `);
}

export { WS_PORT };
