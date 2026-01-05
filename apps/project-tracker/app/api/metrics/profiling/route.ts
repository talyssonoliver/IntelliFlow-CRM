/**
 * GET /api/metrics/profiling
 *
 * RSI (Recursive Self-Improvement) endpoint that provides performance
 * profiling metrics from benchmark runs and trace data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface BenchmarkResult {
  operation: string;
  meanTime: number;
  p95Time: number;
  p99Time: number;
  opsPerSecond: number;
  target?: number;
  met: boolean;
}

interface ProfilingReport {
  timestamp: string;
  source: string;
  benchmarks: BenchmarkResult[];
  summary: {
    totalBenchmarks: number;
    passing: number;
    failing: number;
    overallScore: number;
  };
}

// Get project root path
function getProjectRoot(): string {
  return process.cwd().replace(/[\\/]apps[\\/]project-tracker$/, '');
}

// Load benchmark results
function loadBenchmarkResults(): ProfilingReport | null {
  const projectRoot = getProjectRoot();
  const possiblePaths = [
    join(projectRoot, 'artifacts', 'benchmarks', 'performance-summary.json'),
    join(projectRoot, 'artifacts', 'benchmarks', 'performance-benchmark.json'),
    join(projectRoot, 'artifacts', 'misc', 'profiling-results.json'),
  ];

  for (const benchPath of possiblePaths) {
    try {
      if (existsSync(benchPath)) {
        const content = JSON.parse(readFileSync(benchPath, 'utf8'));
        const stats = statSync(benchPath);

        // Handle performance-summary.json format
        if (content.benchmarks && Array.isArray(content.benchmarks)) {
          const benchmarks: BenchmarkResult[] = content.benchmarks.map((b: any) => ({
            operation: b.operation || b.name || 'Unknown',
            meanTime: b.meanTime || b.mean || 0,
            p95Time: b.p95Time || b.p95 || 0,
            p99Time: b.p99Time || b.p99 || 0,
            opsPerSecond: b.opsPerSecond || (b.meanTime > 0 ? 1000 / b.meanTime : 0),
            target: b.target,
            met: b.target ? (b.p95Time || b.meanTime) <= b.target : true,
          }));

          const passing = benchmarks.filter(b => b.met).length;

          return {
            timestamp: content.timestamp || stats.mtime.toISOString(),
            source: benchPath.split(/[\\/]/).pop() || 'unknown',
            benchmarks,
            summary: {
              totalBenchmarks: benchmarks.length,
              passing,
              failing: benchmarks.length - passing,
              overallScore: benchmarks.length > 0
                ? Math.round((passing / benchmarks.length) * 100)
                : 0,
            },
          };
        }

        // Handle profiling-results.json format
        if (content.profiles || content.traces) {
          const profiles = content.profiles || content.traces || [];
          const benchmarks: BenchmarkResult[] = profiles.map((p: any) => ({
            operation: p.name || p.operation || 'Unknown',
            meanTime: p.duration || p.meanTime || 0,
            p95Time: p.p95 || p.duration * 1.2 || 0,
            p99Time: p.p99 || p.duration * 1.5 || 0,
            opsPerSecond: p.duration > 0 ? 1000 / p.duration : 0,
            target: p.target || 100,
            met: p.duration <= (p.target || 100),
          }));

          const passing = benchmarks.filter(b => b.met).length;

          return {
            timestamp: content.timestamp || stats.mtime.toISOString(),
            source: 'profiling-results.json',
            benchmarks,
            summary: {
              totalBenchmarks: benchmarks.length,
              passing,
              failing: benchmarks.length - passing,
              overallScore: benchmarks.length > 0
                ? Math.round((passing / benchmarks.length) * 100)
                : 0,
            },
          };
        }
      }
    } catch (error) {
      console.error(`Error loading ${benchPath}:`, error);
    }
  }

  return null;
}

// Generate synthetic benchmarks based on API routes
function generateSyntheticBenchmarks(): BenchmarkResult[] {
  const projectRoot = getProjectRoot();
  const apiDirs = [
    join(projectRoot, 'apps', 'project-tracker', 'app', 'api'),
    join(projectRoot, 'apps', 'api', 'src', 'modules'),
  ];

  const endpoints: BenchmarkResult[] = [];

  for (const apiDir of apiDirs) {
    try {
      if (existsSync(apiDir)) {
        const routes = readdirSync(apiDir, { recursive: true })
          .filter(f => String(f).endsWith('route.ts'))
          .slice(0, 20); // Limit to 20 routes

        for (const route of routes) {
          const routePath = String(route).replace(/[\\/]route\.ts$/, '').replace(/[\\/]/g, '/');
          endpoints.push({
            operation: `API: ${routePath}`,
            meanTime: Math.random() * 50 + 10, // Synthetic: 10-60ms
            p95Time: Math.random() * 80 + 20,  // Synthetic: 20-100ms
            p99Time: Math.random() * 120 + 30, // Synthetic: 30-150ms
            opsPerSecond: Math.random() * 100 + 50,
            target: 100,
            met: true,
          });
        }
      }
    } catch {
      // Ignore errors
    }
  }

  return endpoints;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const operationFilter = searchParams.get('operation');
    const includesSynthetic = searchParams.get('synthetic') === 'true';

    // Load real benchmark results
    let report = loadBenchmarkResults();

    // If no real data, generate synthetic
    if (!report && includesSynthetic) {
      const syntheticBenchmarks = generateSyntheticBenchmarks();
      const passing = syntheticBenchmarks.filter(b => b.met).length;

      report = {
        timestamp: new Date().toISOString(),
        source: 'synthetic',
        benchmarks: syntheticBenchmarks,
        summary: {
          totalBenchmarks: syntheticBenchmarks.length,
          passing,
          failing: syntheticBenchmarks.length - passing,
          overallScore: syntheticBenchmarks.length > 0
            ? Math.round((passing / syntheticBenchmarks.length) * 100)
            : 0,
        },
      };
    }

    if (!report) {
      return NextResponse.json(
        {
          source: 'unavailable',
          timestamp: new Date().toISOString(),
          pattern: 'RSI',
          message: 'No profiling data available. Run benchmarks to generate data, or use ?synthetic=true for synthetic data.',
          placeholder: {
            benchmarks: [],
            summary: {
              totalBenchmarks: 0,
              passing: 0,
              failing: 0,
              overallScore: 0,
            },
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

    // Apply operation filter
    if (operationFilter) {
      report.benchmarks = report.benchmarks.filter(b =>
        b.operation.toLowerCase().includes(operationFilter.toLowerCase())
      );
      const passing = report.benchmarks.filter(b => b.met).length;
      report.summary = {
        totalBenchmarks: report.benchmarks.length,
        passing,
        failing: report.benchmarks.length - passing,
        overallScore: report.benchmarks.length > 0
          ? Math.round((passing / report.benchmarks.length) * 100)
          : 0,
      };
    }

    // Define performance targets
    const targets = {
      api_p95: { target: 100, unit: 'ms', description: 'API response p95 < 100ms' },
      api_p99: { target: 200, unit: 'ms', description: 'API response p99 < 200ms' },
      database: { target: 20, unit: 'ms', description: 'Database query < 20ms' },
      aiScoring: { target: 2000, unit: 'ms', description: 'AI scoring < 2s' },
    };

    return NextResponse.json(
      {
        source: 'fresh',
        timestamp: new Date().toISOString(),
        pattern: 'RSI',
        dataSource: report.source,
        filters: {
          operation: operationFilter || 'all',
        },
        report,
        targets,
        status: report.summary.overallScore >= 90 ? 'passing' :
                report.summary.overallScore >= 70 ? 'warning' : 'failing',
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error generating profiling metrics:', error);
    return NextResponse.json(
      { error: 'Failed to generate profiling metrics', details: String(error) },
      { status: 500 }
    );
  }
}
