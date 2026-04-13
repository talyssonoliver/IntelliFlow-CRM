import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const reportPath = path.join(
      process.cwd(),
      '../../artifacts/benchmarks/trpc-benchmark-report.html'
    );

    if (!fs.existsSync(reportPath)) {
      return new NextResponse(
        `<html><body style="font-family: sans-serif; padding: 2rem; text-align: center;">
          <h2>tRPC Benchmark Report Not Generated</h2>
          <p>Run the following commands from the repo root to generate the report:</p>
          <pre style="background: #f1f5f9; padding: 1rem; border-radius: 4px; text-align: left; display: inline-block;">
npx dotenv -e .env.test -- npx tsx apps/api/src/shared/performance-benchmark.ts
node scripts/ci/generate-trpc-benchmark-report.js
          </pre>
        </body></html>`,
        {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
          },
        }
      );
    }

    const html = fs.readFileSync(reportPath, 'utf-8');

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Error reading tRPC benchmark report:', error);
    return new NextResponse(
      `<html><body style="font-family: sans-serif; padding: 2rem;">
        <h2>Error Loading Report</h2>
        <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
      </body></html>`,
      {
        status: 500,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      }
    );
  }
}
