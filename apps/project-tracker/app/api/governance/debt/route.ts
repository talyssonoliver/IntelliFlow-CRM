/**
 * GET /api/governance/debt
 * Returns the technical debt ledger
 */

import { NextResponse } from 'next/server';
import { loadDebtLedger } from '@/lib/governance';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // Filter by status
    const severity = searchParams.get('severity'); // Filter by severity
    const expiringOnly = searchParams.get('expiring') === 'true';

    const debtLedger = loadDebtLedger();

    if (!debtLedger) {
      return NextResponse.json(
        {
          error: 'Debt ledger not found',
          message: 'debt-ledger.yaml not found in docs/ directory.',
        },
        { status: 404 }
      );
    }

    // Convert items to array and apply filters
    let items = Object.entries(debtLedger.items).map(([key, item]) => ({
      ...item,
      id: key, // Use the key as the ID (overrides any existing id in item)
    }));

    if (status) {
      items = items.filter((item) => item.status === status);
    }

    if (severity) {
      items = items.filter((item) => item.severity === severity);
    }

    if (expiringOnly) {
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      items = items.filter((item) => {
        const expiry = new Date(item.expiry_date);
        return expiry <= thirtyDaysFromNow;
      });
    }

    // Sort by expiry date (soonest first)
    items.sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());

    return NextResponse.json(
      {
        success: true,
        summary: debtLedger.summary,
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
    console.error('Error fetching debt ledger:', error);
    return NextResponse.json(
      { error: 'Failed to fetch debt ledger', details: String(error) },
      { status: 500 }
    );
  }
}
