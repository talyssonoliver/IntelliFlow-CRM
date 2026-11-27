/**
 * tRPC WebSocket Server
 *
 * Standalone WebSocket server for tRPC subscriptions.
 * Enables real-time updates for lead scores, tasks, notifications, etc.
 *
 * @module @intelliflow/api/ws-server
 * @task IFC-016/IFC-150 Integration
 */

// Must stay the first import: refuses to start in production without a valid license key.
import '@intelliflow/validators/enforce-license';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
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

// Railway injects PORT for every service with a generated public domain and
// routes the domain's traffic to whatever port the container actually binds
// (see apps/api/src/http-server.ts's API_PORT, which already follows this).
// This server previously read only WS_PORT, so on a fresh/unconfigured
// deployment (no WS_PORT set in the Railway dashboard) it fell straight to
// the local-dev default of 3001 regardless of the port Railway assigned,
// leaving the public domain unable to reach the process (issue #851). An
// explicit WS_PORT still wins when set, so an existing hand-managed Railway
// config that pins it keeps working unchanged.
const WS_PORT = Number(process.env.WS_PORT ?? process.env.PORT ?? 3001);

// ============================================================================
// WebSocket Server
// ============================================================================

/**
 * Answer plain HTTP requests (anything that is not a WebSocket upgrade) (MVP-004).
 *
 * GET/HEAD /health returns 200 so uptime checks can tell the service is running. Every other
 * request keeps the 426 Upgrade Required that the bare WebSocket server answered before.
 */
export function handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
  const path = (req.url ?? '/').split('?')[0];
  if (path === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(426, { 'Content-Type': 'text/plain' });
  res.end('Upgrade Required');
}

/**
 * Create and configure the WebSocket server for tRPC subscriptions
 */
export function createWebSocketServer(port: number = WS_PORT): WebSocketServer {
  // One HTTP server on the port: /health for plain requests, WebSocket upgrades for tRPC.
  // The WebSocket server re-emits the HTTP server's 'listening' and 'error' events.
  const server = createServer(handleHttpRequest);
  const wss = new WebSocketServer({ server });
  server.listen(port);

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

      const activeTenant =
        typeof connectionParams?.['x-active-tenant'] === 'string'
          ? connectionParams['x-active-tenant']
          : null;

      return createWSContext(authHeader, activeTenant);
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
      // wss.close() leaves a server it was given open, so close the HTTP server too.
      server.close(() => {
        console.log('[WS] WebSocket server closed');
        process.exit(0);
      });
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
