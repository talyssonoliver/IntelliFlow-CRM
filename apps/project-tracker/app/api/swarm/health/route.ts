import { NextResponse } from 'next/server';
import { readFile, readdir } from 'node:fs/promises';
import { PATHS, getSwarmHealthPath } from '@/lib/paths';

// Default configuration (matches swarm-manager.sh defaults)
const DEFAULT_MAX_CONCURRENT = 4;
const DEFAULT_WATCHDOG_THRESHOLD = 900; // 15 minutes in seconds

export async function GET() {
  const locksPath = PATHS.artifacts.locks;

  try {
    const healthPath = getSwarmHealthPath();

    const data = await readFile(healthPath, 'utf-8');
    const health = JSON.parse(data);

    // Ensure defaults are set
    return NextResponse.json({
      active: health.active ?? 0,
      max: health.max ?? DEFAULT_MAX_CONCURRENT,
      watchdog_threshold: health.watchdog_threshold ?? DEFAULT_WATCHDOG_THRESHOLD,
      recent_claude_errors: health.recent_claude_errors ?? 0,
      timestamp: health.timestamp ?? new Date().toISOString(),
    });
  } catch {
    // Health file doesn't exist - count active locks directly
    let activeCount = 0;
    try {
      const files = await readdir(locksPath);
      activeCount = files.filter((f) => f.endsWith('.lock')).length;
    } catch {
      // .locks directory doesn't exist
    }

    return NextResponse.json({
      active: activeCount,
      max: DEFAULT_MAX_CONCURRENT,
      watchdog_threshold: DEFAULT_WATCHDOG_THRESHOLD,
      recent_claude_errors: 0,
      timestamp: new Date().toISOString(),
    });
  }
}
