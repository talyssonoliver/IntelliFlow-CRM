import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const ROOT_DIR = path.join(process.cwd(), '..', '..');
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'artifacts');
const COVERAGE_PATH = path.join(ARTIFACTS_DIR, 'coverage', 'coverage-summary.json');
const BUILD_STATE_PATH = path.join(ARTIFACTS_DIR, 'reports', 'build-state.json');

export const dynamic = 'force-dynamic';

interface BuildMetrics {
  turbo: {
    success: boolean;
    tasks_run: number;
    tasks_cached: number;
    duration_ms: number;
    errors: string[];
    lastRun: string | null;
  };
  tests: {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
    coverage: number;
    lastRun: string | null;
  };
  typecheck: {
    success: boolean;
    errors: number;
    warnings: number;
    lastRun: string | null;
  };
  lint: {
    success: boolean;
    errors: number;
    warnings: number;
    lastRun: string | null;
  };
}

interface BuildState {
  turbo?: BuildMetrics['turbo'];
  tests?: BuildMetrics['tests'];
  typecheck?: BuildMetrics['typecheck'];
  lint?: BuildMetrics['lint'];
}

async function readJsonFile<T>(
  filePath: string
): Promise<{ data: T | null; lastUpdated: string | null }> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const stats = await fs.stat(filePath);
    return {
      data: JSON.parse(content),
      lastUpdated: stats.mtime.toISOString(),
    };
  } catch {
    return { data: null, lastUpdated: null };
  }
}

async function saveBuildState(state: BuildState): Promise<void> {
  const dir = path.dirname(BUILD_STATE_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(BUILD_STATE_PATH, JSON.stringify(state, null, 2));
}

export async function GET() {
  try {
    // Read saved build state
    const { data: buildState, lastUpdated: stateUpdated } =
      await readJsonFile<BuildState>(BUILD_STATE_PATH);

    // Read coverage summary for test data
    const { data: coverageData, lastUpdated: coverageUpdated } =
      await readJsonFile<any>(COVERAGE_PATH);

    const coverage = coverageData?.total?.lines?.pct ?? 0;

    const metrics: BuildMetrics = {
      turbo: buildState?.turbo ?? {
        success: true,
        tasks_run: 0,
        tasks_cached: 0,
        duration_ms: 0,
        errors: [],
        lastRun: stateUpdated,
      },
      tests: buildState?.tests ?? {
        passed: 0,
        failed: 0,
        skipped: 0,
        total: 0,
        coverage,
        lastRun: coverageUpdated,
      },
      typecheck: buildState?.typecheck ?? {
        success: true,
        errors: 0,
        warnings: 0,
        lastRun: stateUpdated,
      },
      lint: buildState?.lint ?? {
        success: true,
        errors: 0,
        warnings: 0,
        lastRun: stateUpdated,
      },
    };

    // If we have coverage data but no saved tests, use coverage info
    if (!buildState?.tests && coverageData) {
      metrics.tests.coverage = coverage;
      metrics.tests.lastRun = coverageUpdated;
    }

    return NextResponse.json({
      status: 'ok',
      metrics,
    });
  } catch (error) {
    console.error('Error reading build metrics:', error);
    return NextResponse.json({ status: 'error', message: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'all';

  try {
    // Read existing state to preserve other results
    const { data: existingState } = await readJsonFile<BuildState>(BUILD_STATE_PATH);
    const state: BuildState = existingState ?? {};

    if (type === 'all' || type === 'typecheck') {
      const startTime = Date.now();
      try {
        const { stdout, stderr } = await execAsync(
          'npx turbo typecheck --output-logs=errors-only 2>&1',
          {
            cwd: ROOT_DIR,
            timeout: 300000,
            env: { ...process.env, FORCE_COLOR: '0' },
          }
        );
        const duration = Date.now() - startTime;
        const output = stdout + stderr;

        // Count TypeScript errors from output
        const errorMatch = output.match(/Found (\d+) error/);
        const errorCount = errorMatch ? parseInt(errorMatch[1], 10) : 0;
        const hasErrors = errorCount > 0 || output.includes('error TS');

        state.typecheck = {
          success: !hasErrors,
          errors: errorCount,
          warnings: 0,
          lastRun: new Date().toISOString(),
        };

        // Parse turbo summary if available
        const tasksMatch = output.match(/Tasks:\s+(\d+)\s+successful,\s+(\d+)\s+total/);
        const cachedMatch = output.match(/Cached:\s+(\d+)\s+cached,\s+(\d+)\s+total/);
        if (tasksMatch) {
          state.turbo = {
            success: !hasErrors,
            tasks_run: parseInt(tasksMatch[2], 10),
            tasks_cached: cachedMatch ? parseInt(cachedMatch[1], 10) : 0,
            duration_ms: duration,
            errors: hasErrors ? [output.slice(0, 500)] : [],
            lastRun: new Date().toISOString(),
          };
        }
      } catch (err: any) {
        const output = (err.stdout ?? '') + (err.stderr ?? '');
        const errorMatch = output.match(/Found (\d+) error/);
        const errorCount = errorMatch ? parseInt(errorMatch[1], 10) : 1;

        state.typecheck = {
          success: false,
          errors: errorCount,
          warnings: 0,
          lastRun: new Date().toISOString(),
        };
      }
    }

    if (type === 'all' || type === 'lint') {
      try {
        const { stdout, stderr } = await execAsync(
          'npx turbo lint --output-logs=errors-only 2>&1',
          {
            cwd: ROOT_DIR,
            timeout: 300000,
            env: { ...process.env, FORCE_COLOR: '0' },
          }
        );
        const output = stdout + stderr;

        const errorMatch = output.match(/(\d+)\s+error/);
        const warningMatch = output.match(/(\d+)\s+warning/);
        const errorCount = errorMatch ? parseInt(errorMatch[1], 10) : 0;
        const warningCount = warningMatch ? parseInt(warningMatch[1], 10) : 0;

        state.lint = {
          success: errorCount === 0,
          errors: errorCount,
          warnings: warningCount,
          lastRun: new Date().toISOString(),
        };
      } catch (err: any) {
        const output = (err.stdout ?? '') + (err.stderr ?? '');
        const errorMatch = output.match(/(\d+)\s+error/);
        const warningMatch = output.match(/(\d+)\s+warning/);

        state.lint = {
          success: false,
          errors: errorMatch ? parseInt(errorMatch[1], 10) : 1,
          warnings: warningMatch ? parseInt(warningMatch[1], 10) : 0,
          lastRun: new Date().toISOString(),
        };
      }
    }

    // Save updated state
    await saveBuildState(state);

    // Return fresh metrics
    const response = await GET();
    const data = await response.json();

    return NextResponse.json({
      status: 'ok',
      message: `Build validation completed (${type})`,
      metrics: data.metrics,
    });
  } catch (error) {
    console.error('Error running build validation:', error);
    return NextResponse.json({ status: 'error', message: String(error) }, { status: 500 });
  }
}
