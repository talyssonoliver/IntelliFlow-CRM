import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const REPORT_PATHS: Record<string, string[]> = {
  lighthouse: [
    'artifacts/lighthouse/lighthouse-report.html',
    'artifacts/lighthouse/lighthouse-360-report.html',
  ],
  coverage: [
    'artifacts/misc/coverage-reports/ui-coverage.html',
    'artifacts/coverage/lcov-report/index.html',
  ],
  performance: ['artifacts/benchmarks/performance-report.html'],
};

function findReportPath(reportType: string): string | null {
  const paths = REPORT_PATHS[reportType];
  if (!paths) return null;

  // Check multiple base paths for monorepo structure
  const basePaths = [
    process.cwd(),
    path.join(process.cwd(), '..', '..'),
    path.join(process.cwd(), '..', '..', '..'),
  ];

  for (const basePath of basePaths) {
    for (const relativePath of paths) {
      const fullPath = path.join(basePath, relativePath);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const reportType = searchParams.get('report');

  if (!reportType) {
    return NextResponse.json({ success: false, error: 'Report type is required' }, { status: 400 });
  }

  const reportPath = findReportPath(reportType);

  if (!reportPath) {
    // Return a placeholder HTML
    const placeholderHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reportType} Report - Not Found</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    h1 { color: #f59e0b; margin-bottom: 1rem; }
    p { color: #94a3b8; margin-bottom: 1.5rem; }
    .tip {
      background: #1e293b;
      padding: 1rem;
      border-radius: 8px;
      font-size: 0.875rem;
    }
    code {
      background: #334155;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Report Not Available</h1>
    <p>The ${reportType} report has not been generated yet.</p>
    <div class="tip">
      <strong>Tip:</strong> Reports are generated during CI/CD pipeline execution.<br>
      Run <code>pnpm run test:coverage</code> locally to generate coverage reports.
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(placeholderHtml, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  }

  try {
    const html = fs.readFileSync(reportPath, 'utf8');
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error('Failed to read report:', error);
    return NextResponse.json({ success: false, error: 'Failed to read report' }, { status: 500 });
  }
}
