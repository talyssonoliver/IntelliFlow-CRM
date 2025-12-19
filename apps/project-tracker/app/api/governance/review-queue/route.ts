/**
 * GET /api/governance/review-queue
 * Returns the review queue (tasks requiring human review)
 */

import { NextResponse } from 'next/server';
import { loadReviewQueue } from '@/lib/governance';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const priority = searchParams.get('priority'); // Filter by priority
    const tier = searchParams.get('tier'); // Filter by tier

    const reviewQueue = loadReviewQueue();

    if (!reviewQueue) {
      return NextResponse.json(
        {
          error: 'Review queue not found',
          message: 'review-queue.json not found. Run "pnpm run plan-lint" to generate.',
        },
        { status: 404 }
      );
    }

    // Apply filters
    let items = reviewQueue.items;

    if (priority) {
      items = items.filter((item) => item.priority === priority);
    }

    if (tier) {
      items = items.filter((item) => item.tier === tier);
    }

    return NextResponse.json(
      {
        success: true,
        meta: reviewQueue.meta,
        total: items.length,
        items,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching review queue:', error);
    return NextResponse.json(
      { error: 'Failed to fetch review queue', details: String(error) },
      { status: 500 }
    );
  }
}
