import { NextRequest, NextResponse } from 'next/server';
import { testRunnerEvents, type TestRunProgress } from '@/lib/test-runner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Store for active connections
const connections = new Map<
  string,
  {
    controller: ReadableStreamDefaultController;
    runId: string;
  }
>();

/**
 * GET /api/quality-reports/test-run/events?runId=xxx
 * Server-Sent Events endpoint for real-time test progress updates
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get('runId');

  if (!runId) {
    return NextResponse.json(
      { error: 'runId query parameter is required' },
      { status: 400 }
    );
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

      // Set up event listener for this run
      const progressHandler = (progress: TestRunProgress) => {
        const message = formatSSE(progress);
        try {
          controller.enqueue(encoder.encode(message));

          // Close connection when run completes
          if (progress.type === 'complete' || progress.type === 'error') {
            setTimeout(() => {
              cleanup();
              try {
                controller.close();
              } catch {
                // Already closed
              }
            }, 1000); // Give client time to receive final message
          }
        } catch {
          // Connection may be closed
          cleanup();
        }
      };

      // Listen to events for this specific run
      testRunnerEvents.onRunProgress(runId, progressHandler);

      // Cleanup function
      const cleanup = () => {
        testRunnerEvents.offRunProgress(runId, progressHandler);
        connections.delete(connectionId);
      };

      // Keep-alive ping every 30 seconds
      const pingInterval = setInterval(() => {
        try {
          const ping = formatSSE({
            runId,
            type: 'ping',
            timestamp: new Date().toISOString(),
          });
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
 * Format data as Server-Sent Event
 */
function formatSSE(data: object): string {
  const jsonData = JSON.stringify(data);
  return `data: ${jsonData}\n\n`;
}

/**
 * Get active connections count (for debugging)
 */
function getActiveConnections(): number {
  return connections.size;
}

// Reference to avoid unused function warning
void getActiveConnections;
