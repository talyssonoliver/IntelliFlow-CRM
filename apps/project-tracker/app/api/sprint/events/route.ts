import { NextResponse } from 'next/server';
import { processEvents } from '../../../../lib/subprocess-spawner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Store for active connections and their event queues
const connections = new Map<
  string,
  {
    controller: ReadableStreamDefaultController;
    runId: string;
  }
>();

/**
 * GET /api/sprint/events?runId=xxx
 * Server-Sent Events endpoint for real-time execution updates
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get('runId');

  if (!runId) {
    return NextResponse.json({ error: 'runId query parameter is required' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const connectionId = `${runId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const stream = new ReadableStream({
    start(controller) {
      // Store connection
      connections.set(connectionId, { controller, runId });

      // Send initial connection message
      const initMessage = formatSSE({
        type: 'connected',
        runId,
        connectionId,
        timestamp: new Date().toISOString(),
      });
      controller.enqueue(encoder.encode(initMessage));

      // Set up event listeners
      const progressHandler = (progress: any) => {
        if (progress.runId === runId) {
          const message = formatSSE({
            type: 'progress',
            data: progress,
            timestamp: new Date().toISOString(),
          });
          try {
            controller.enqueue(encoder.encode(message));
          } catch {
            // Connection may be closed
            cleanup();
          }
        }
      };

      const taskProgressHandler = (progress: any) => {
        if (progress.runId === runId) {
          const message = formatSSE({
            type: 'task_progress',
            data: progress,
            timestamp: new Date().toISOString(),
          });
          try {
            controller.enqueue(encoder.encode(message));
          } catch {
            // Connection may be closed
            cleanup();
          }
        }
      };

      // Listen to process events
      processEvents.on('progress', progressHandler);
      processEvents.on('task_progress', taskProgressHandler);

      // Cleanup function
      const cleanup = () => {
        processEvents.off('progress', progressHandler);
        processEvents.off('task_progress', taskProgressHandler);
        connections.delete(connectionId);
      };

      // Keep-alive ping every 30 seconds
      const pingInterval = setInterval(() => {
        try {
          const ping = formatSSE({ type: 'ping', timestamp: new Date().toISOString() });
          controller.enqueue(encoder.encode(ping));
        } catch {
          clearInterval(pingInterval);
          cleanup();
        }
      }, 30000);

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
        cleanup();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },

    cancel() {
      // Cleanup when stream is cancelled
      connections.delete(connectionId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}

/**
 * POST /api/sprint/events
 * Broadcast an event to all connections for a run
 */
export async function POST(request: Request) {
  try {
    const { runId, event } = await request.json();

    if (!runId || !event) {
      return NextResponse.json({ error: 'runId and event are required' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const message = formatSSE({
      type: event.type || 'update',
      data: event,
      timestamp: new Date().toISOString(),
    });

    let broadcastCount = 0;

    // Broadcast to all connections for this runId
    for (const [id, conn] of connections) {
      if (conn.runId === runId) {
        try {
          conn.controller.enqueue(encoder.encode(message));
          broadcastCount++;
        } catch {
          // Connection may be closed, remove it
          connections.delete(id);
        }
      }
    }

    return NextResponse.json({
      success: true,
      broadcastCount,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to broadcast event' }, { status: 500 });
  }
}

/**
 * Format data as Server-Sent Event
 */
function formatSSE(data: Record<string, unknown>): string {
  const jsonData = JSON.stringify(data);
  return `data: ${jsonData}\n\n`;
}

/**
 * Get active connections count
 */
export function getActiveConnections(): number {
  return connections.size;
}
