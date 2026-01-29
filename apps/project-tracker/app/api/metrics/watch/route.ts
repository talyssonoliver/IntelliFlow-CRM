import { NextRequest } from 'next/server';
import { watch, FSWatcher, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PATHS } from '@/lib/paths';
import { syncAllMetrics } from '@/lib/data-sync';

export const dynamic = 'force-dynamic';

// Debounce sync to avoid multiple triggers on rapid file changes
let syncTimeout: NodeJS.Timeout | null = null;
let lastSyncTime = 0;
const SYNC_DEBOUNCE_MS = 2000; // 2 seconds debounce

async function triggerAutoSync(): Promise<boolean> {
  const now = Date.now();

  // Skip if synced recently
  if (now - lastSyncTime < SYNC_DEBOUNCE_MS) {
    return false;
  }

  lastSyncTime = now;

  try {
    console.log('[AutoSync] Triggering sync after CSV change...');
    const result = await syncAllMetrics();
    console.log(`[AutoSync] Complete: ${result.filesUpdated.length} files updated`);
    return true;
  } catch (error) {
    console.error('[AutoSync] Failed:', error);
    return false;
  }
}

/**
 * GET /api/metrics/watch
 *
 * Server-Sent Events endpoint that watches for file changes:
 * 1. Sprint_plan.csv - Single source of truth (triggers auto-sync)
 * 2. All sprint directories - Derived metrics
 *
 * When CSV changes:
 * 1. Auto-sync is triggered to update all derived files
 * 2. Clients are notified to re-fetch from /api/unified-data
 */
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const watchers: FSWatcher[] = [];

      const sendUpdate = (source: 'csv' | 'json' | 'sync', filename?: string, synced?: boolean) => {
        const data = `data: ${JSON.stringify({
          timestamp: Date.now(),
          source,
          filename: filename || null,
          synced: synced || false,
        })}\n\n`;
        controller.enqueue(encoder.encode(data));
      };

      // Send initial connection message
      sendUpdate('json', 'connected');

      // 1. Watch Sprint_plan.csv (source of truth) - triggers auto-sync
      try {
        const csvPath = PATHS.sprintTracking.SPRINT_PLAN_CSV;
        const csvDir = dirname(csvPath);

        const csvWatcher = watch(csvDir, async (eventType, filename) => {
          if (filename === 'Sprint_plan.csv') {
            console.log(`[Watch] CSV changed: ${filename} (${eventType})`);

            // Debounce sync
            if (syncTimeout) {
              clearTimeout(syncTimeout);
            }

            syncTimeout = setTimeout(async () => {
              // Auto-sync when CSV changes
              const synced = await triggerAutoSync();

              // Notify clients after sync
              sendUpdate('csv', filename, synced);

              if (synced) {
                sendUpdate('sync', 'auto-sync-complete', true);
              }
            }, 500); // 500ms delay to batch rapid changes
          }
        });
        watchers.push(csvWatcher);
        console.log('[Watch] Watching CSV:', csvPath);
      } catch (error) {
        console.error('[Watch] Failed to watch CSV directory:', error);
      }

      // 2. Watch ALL sprint directories (not just sprint-0)
      try {
        const metricsDir = PATHS.sprintTracking.root;

        // Find all sprint-* directories
        const entries = readdirSync(metricsDir, { withFileTypes: true });
        const sprintDirs = entries
          .filter((e) => e.isDirectory() && e.name.startsWith('sprint-'))
          .map((e) => join(metricsDir, e.name));

        for (const sprintDir of sprintDirs) {
          if (!existsSync(sprintDir)) continue;

          const jsonWatcher = watch(sprintDir, { recursive: true }, (eventType, filename) => {
            if (filename?.endsWith('.json')) {
              console.log(`[Watch] JSON changed: ${filename} (${eventType})`);
              sendUpdate('json', filename);
            }
          });
          watchers.push(jsonWatcher);
        }

        console.log(`[Watch] Watching ${sprintDirs.length} sprint directories`);
      } catch (error) {
        console.error('[Watch] Failed to watch metrics directories:', error);
      }

      // Cleanup on connection close
      request.signal.addEventListener('abort', () => {
        console.log('[Watch] SSE connection closed, cleaning up watchers');
        if (syncTimeout) {
          clearTimeout(syncTimeout);
        }
        watchers.forEach((w) => w.close());
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering for Nginx
    },
  });
}
