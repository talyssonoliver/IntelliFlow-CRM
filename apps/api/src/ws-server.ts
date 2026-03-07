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
      // Use WebSocket-specific context creation
      const authHeader = opts.req.headers.authorization as string | undefined;
      return createWSContext(authHeader);
    },
    // Keep connections alive with ping/pong
    keepAlive: {
      enabled: true,
      pingMs: 30000,
      pongWaitMs: 5000,
    },
  });

  // Connection handling
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const clientId = req.headers['sec-websocket-key'] || 'unknown';
    console.log(`[WS] Client connected: ${clientId}`);

    ws.on('close', () => {
      console.log(`[WS] Client disconnected: ${clientId}`);
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
