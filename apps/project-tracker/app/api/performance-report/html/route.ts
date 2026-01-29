import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // Read the actual performance-report.html file
    const reportPath = path.join(process.cwd(), '../../artifacts/benchmarks/performance-report.html');

    if (!fs.existsSync(reportPath)) {
      return new NextResponse(
        `<html><body style="font-family: sans-serif; padding: 2rem; text-align: center;">
          <h2>Performance Report Not Generated</h2>
          <p>Run the following command to generate the report:</p>
          <code style="background: #f1f5f9; padding: 0.5rem 1rem; border-radius: 4px;">
            npx tsx artifacts/benchmarks/generate-performance-report.ts
          </code>
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
    console.error('Error reading performance report:', error);
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
