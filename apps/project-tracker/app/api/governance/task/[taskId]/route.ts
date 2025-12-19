/**
 * GET /api/governance/task/[taskId]
 * Returns governance data for a specific task
 */

import { NextResponse } from 'next/server';
import { getTaskOverride, loadReviewQueue, loadDebtLedger } from '@/lib/governance';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params;

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const override = getTaskOverride(taskId);
    const reviewQueue = loadReviewQueue();
    const debtLedger = loadDebtLedger();

    // Find this task in review queue
    const reviewItem = reviewQueue?.items.find((item) => item.task_id === taskId);

    // Find debt items related to this task
    const debtItems = debtLedger?.items
      ? Object.entries(debtLedger.items)
          .filter(([_, item]) => item.origin_task === taskId)
          .map(([key, item]) => ({ ...item, id: key }))
      : [];

    // Calculate waiver status
    let waiverStatus: 'none' | 'active' | 'expiring_soon' | 'expired' = 'none';
    if (override?.waiverExpiry) {
      const now = new Date();
      const expiry = new Date(override.waiverExpiry);
      const daysUntilExpiry = Math.floor(
        (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysUntilExpiry < 0) {
        waiverStatus = 'expired';
      } else if (daysUntilExpiry <= 30) {
        waiverStatus = 'expiring_soon';
      } else {
        waiverStatus = 'active';
      }
    }

    return NextResponse.json(
      {
        success: true,
        taskId,
        override: override || null,
        reviewQueue: reviewItem || null,
        debtItems,
        waiverStatus,
        hasGovernance: !!override,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching task governance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch task governance', details: String(error) },
      { status: 500 }
    );
  }
}
