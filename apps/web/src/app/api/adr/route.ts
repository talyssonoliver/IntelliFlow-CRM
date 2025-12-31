import { NextRequest, NextResponse } from 'next/server';
import {
  getAllADRs,
  searchADRs,
  getADRStats,
  generateDependencyGraph,
} from '@/lib/adr/adr-service';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'list';
  const query = searchParams.get('q');

  try {
    switch (action) {
      case 'list':
        const adrs = getAllADRs();
        return NextResponse.json({ success: true, data: adrs });

      case 'search':
        if (!query) {
          return NextResponse.json(
            { success: false, error: 'Query parameter "q" is required' },
            { status: 400 }
          );
        }
        const results = searchADRs(query);
        return NextResponse.json({ success: true, data: results });

      case 'stats':
        const stats = getADRStats();
        return NextResponse.json({ success: true, data: stats });

      case 'graph':
        const graph = generateDependencyGraph();
        return NextResponse.json({ success: true, data: graph });

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('ADR API error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
