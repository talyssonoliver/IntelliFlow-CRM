import { NextRequest } from 'next/server';
import { watch } from 'node:fs';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      // Watch the metrics directory for changes
      const metricsPath = join(process.cwd(), 'docs', 'metrics', 'sprint-0');
      
      const sendUpdate = () => {
        const data = `data: ${JSON.stringify({ timestamp: Date.now() })}\n\n`;
        controller.enqueue(encoder.encode(data));
      };

      // Send initial connection message
      sendUpdate();

      // Watch for file changes
      const watcher = watch(metricsPath, { recursive: true }, (eventType, filename) => {
        if (filename?.endsWith('.json')) {
          console.log(`File changed: ${filename}`);
          sendUpdate();
        }
      });

      // Cleanup on connection close
      request.signal.addEventListener('abort', () => {
        watcher.close();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
