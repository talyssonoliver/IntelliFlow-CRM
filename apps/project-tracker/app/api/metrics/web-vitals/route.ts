/**
 * GET /api/metrics/web-vitals
 * POST /api/metrics/web-vitals (runs fresh Lighthouse scan)
 *
 * RSI (Recursive Self-Improvement) endpoint that provides web vitals
 * metrics from Lighthouse reports or runs fresh scans on demand.
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface WebVitalsMetrics {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  pwa?: number;
}

interface WebVitalsReport {
  url: string;
  timestamp: string;
  metrics: WebVitalsMetrics;
  overallScore: number;
  status: 'passing' | 'warning' | 'failing';
  coreWebVitals?: {
    lcp: number; // Largest Contentful Paint (ms)
    fid: number; // First Input Delay (ms)
    cls: number; // Cumulative Layout Shift
  };
}

// Get project root path
function getProjectRoot(): string {
  return process.cwd().replace(/[\\/]apps[\\/]project-tracker$/, '');
}

// Load latest Lighthouse report
function loadLatestLighthouseReport(): WebVitalsReport | null {
  const projectRoot = getProjectRoot();
  const possiblePaths = [
    join(projectRoot, 'artifacts', 'lighthouse', 'lighthouse-summary.json'),
    join(projectRoot, 'artifacts', 'lighthouse', 'lighthouse-report.json'),
    join(projectRoot, 'artifacts', 'reports', 'web-vitals-report.json'),
  ];

  for (const reportPath of possiblePaths) {
    try {
      if (existsSync(reportPath)) {
        const content = JSON.parse(readFileSync(reportPath, 'utf8'));

        // Handle different report formats
        if (content.scores) {
          // Summary format
          return {
            url: content.url || 'http://localhost:3000',
            timestamp: content.generatedAt || new Date().toISOString(),
            metrics: {
              performance: content.scores.performance || 0,
              accessibility: content.scores.accessibility || 0,
              bestPractices: content.scores.bestPractices || 0,
              seo: content.scores.seo || 0,
            },
            overallScore: Math.round(
              (content.scores.performance + content.scores.accessibility +
               content.scores.bestPractices + content.scores.seo) / 4
            ),
            status: content.scores.performance >= 90 ? 'passing' :
                    content.scores.performance >= 70 ? 'warning' : 'failing',
          };
        } else if (content.categories) {
          // Raw Lighthouse format
          const metrics = {
            performance: Math.round((content.categories.performance?.score || 0) * 100),
            accessibility: Math.round((content.categories.accessibility?.score || 0) * 100),
            bestPractices: Math.round((content.categories['best-practices']?.score || 0) * 100),
            seo: Math.round((content.categories.seo?.score || 0) * 100),
          };

          return {
            url: content.finalUrl || content.requestedUrl || 'http://localhost:3000',
            timestamp: content.fetchTime || new Date().toISOString(),
            metrics,
            overallScore: Math.round(
              (metrics.performance + metrics.accessibility +
               metrics.bestPractices + metrics.seo) / 4
            ),
            status: metrics.performance >= 90 ? 'passing' :
                    metrics.performance >= 70 ? 'warning' : 'failing',
            coreWebVitals: content.audits ? {
              lcp: content.audits['largest-contentful-paint']?.numericValue || 0,
              fid: content.audits['max-potential-fid']?.numericValue || 0,
              cls: content.audits['cumulative-layout-shift']?.numericValue || 0,
            } : undefined,
          };
        }
      }
    } catch (error) {
      console.error(`Error loading ${reportPath}:`, error);
    }
  }

  return null;
}

// Load historical reports for trending
function loadHistoricalReports(): WebVitalsReport[] {
  const projectRoot = getProjectRoot();
  const lighthouseDir = join(projectRoot, 'artifacts', 'lighthouse');
  const reports: WebVitalsReport[] = [];

  try {
    if (existsSync(lighthouseDir)) {
      const files = readdirSync(lighthouseDir)
        .filter(f => f.endsWith('.json') && f.includes('lighthouse'))
        .slice(-10); // Last 10 reports

      for (const file of files) {
        const report = loadLatestLighthouseReport();
        if (report) {
          reports.push(report);
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return reports;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeHistory = searchParams.get('history') === 'true';

    // Load latest report
    const latestReport = loadLatestLighthouseReport();

    if (!latestReport) {
      return NextResponse.json(
        {
          source: 'unavailable',
          timestamp: new Date().toISOString(),
          pattern: 'RSI',
          message: 'No Lighthouse report found. Run POST to generate one, or run: npx lighthouse http://localhost:3000 --output=json',
          placeholder: {
            metrics: {
              performance: 0,
              accessibility: 0,
              bestPractices: 0,
              seo: 0,
            },
            overallScore: 0,
            status: 'failing' as const,
          },
        },
        {
          status: 200,
          headers: {
            'Cache-Control': 'no-store, no-cache, max-age=0',
          },
        }
      );
    }

    // Calculate trend from historical data
    const historicalReports = includeHistory ? loadHistoricalReports() : [];
    let trend = 'stable';

    if (historicalReports.length >= 2) {
      const recent = historicalReports.slice(-2);
      const older = historicalReports.slice(0, -2);

      if (older.length > 0) {
        const recentAvg = recent.reduce((sum, r) => sum + r.overallScore, 0) / recent.length;
        const olderAvg = older.reduce((sum, r) => sum + r.overallScore, 0) / older.length;

        if (recentAvg > olderAvg + 5) trend = 'improving';
        else if (recentAvg < olderAvg - 5) trend = 'declining';
      }
    }

    return NextResponse.json(
      {
        source: 'fresh',
        timestamp: new Date().toISOString(),
        pattern: 'RSI',
        latest: latestReport,
        trend,
        history: includeHistory ? historicalReports : undefined,
        thresholds: {
          performance: { target: 90, current: latestReport.metrics.performance },
          accessibility: { target: 90, current: latestReport.metrics.accessibility },
          bestPractices: { target: 90, current: latestReport.metrics.bestPractices },
          seo: { target: 90, current: latestReport.metrics.seo },
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error generating web vitals:', error);
    return NextResponse.json(
      { error: 'Failed to generate web vitals', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const url = body.url || 'http://localhost:3000';

    const projectRoot = getProjectRoot();
    const outputDir = join(projectRoot, 'artifacts', 'lighthouse');
    const outputFile = join(outputDir, `lighthouse-${Date.now()}.json`);

    // Ensure output directory exists
    mkdirSync(outputDir, { recursive: true });

    // Try to run Lighthouse
    try {
      execSync(
        `npx lighthouse "${url}" --output=json --output-path="${outputFile}" --chrome-flags="--headless --no-sandbox"`,
        {
          cwd: projectRoot,
          timeout: 120000, // 2 minutes
          encoding: 'utf8',
        }
      );

      // Load and return the new report
      const newReport = loadLatestLighthouseReport();

      return NextResponse.json(
        {
          source: 'fresh-scan',
          timestamp: new Date().toISOString(),
          pattern: 'RSI',
          message: 'Lighthouse scan completed successfully',
          report: newReport,
        },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, max-age=0',
          },
        }
      );
    } catch (execError) {
      return NextResponse.json(
        {
          source: 'error',
          timestamp: new Date().toISOString(),
          error: 'Lighthouse scan failed',
          details: String(execError),
          suggestion: 'Ensure Chrome is installed and the target URL is accessible',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error running Lighthouse scan:', error);
    return NextResponse.json(
      { error: 'Failed to run Lighthouse scan', details: String(error) },
      { status: 500 }
    );
  }
}
