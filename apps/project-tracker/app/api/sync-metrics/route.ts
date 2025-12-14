import { NextResponse } from 'next/server';
import { syncMetricsFromCSV } from '@/lib/data-sync';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/sync-metrics
 * Synchronizes all metrics files from Sprint_plan.csv (single source of truth)
 */
export async function POST() {
  try {
    const csvPath = join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.csv');
    const metricsDir = join(process.cwd(), 'docs', 'metrics');

    console.log('Starting metrics sync...');
    const result = syncMetricsFromCSV(csvPath, metricsDir);

    if (result.success) {
      console.log(`✅ Sync completed: ${result.summary.filesWritten} files updated`);
      return NextResponse.json({
        success: true,
        message: 'Metrics synchronized successfully',
        summary: result.summary,
        filesUpdated: result.filesUpdated,
      });
    } else {
      console.error('❌ Sync failed:', result.errors);
      return NextResponse.json({
        success: false,
        message: 'Sync completed with errors',
        summary: result.summary,
        filesUpdated: result.filesUpdated,
        errors: result.errors,
      }, { status: 207 }); // 207 Multi-Status (partial success)
    }
  } catch (error) {
    console.error('Error syncing metrics:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to sync metrics',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sync-metrics
 * Returns sync status and last run info
 */
export async function GET() {
  return NextResponse.json({
    message: 'Use POST to trigger metrics synchronization',
    endpoint: '/api/sync-metrics',
    method: 'POST'
  });
}
