import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

interface GenerateResult {
  report: string;
  success: boolean;
  message: string;
  duration: number;
}

async function getProjectRoot(): Promise<string> {
  // Navigate up from apps/web to project root
  const possibleRoots = [
    path.join(process.cwd(), '..', '..'),
    path.join(process.cwd(), '..', '..', '..'),
    process.cwd(),
  ];

  for (const root of possibleRoots) {
    try {
      const { stdout } = await execAsync('git rev-parse --show-toplevel', { cwd: root });
      return stdout.trim();
    } catch {
      continue;
    }
  }

  return possibleRoots[0];
}

async function generateCoverageReport(projectRoot: string, scope: string = 'standard'): Promise<GenerateResult> {
  const start = Date.now();
  const fs = await import('fs');

  // Determine test command based on scope
  const testCommands: Record<string, string> = {
    quick: 'vitest run --reporter=verbose --passWithNoTests packages/validators packages/domain --coverage',
    standard: 'vitest run --reporter=verbose --passWithNoTests --coverage',
    comprehensive: 'vitest run --reporter=verbose --coverage',
  };
  const testCommand = testCommands[scope] || testCommands.standard;

  try {
    // Ensure coverage directories exist
    const coverageDir = path.join(projectRoot, 'artifacts', 'coverage');
    const miscCoverageDir = path.join(projectRoot, 'artifacts', 'misc', 'coverage');

    if (!fs.existsSync(coverageDir)) {
      fs.mkdirSync(coverageDir, { recursive: true });
    }
    if (!fs.existsSync(miscCoverageDir)) {
      fs.mkdirSync(miscCoverageDir, { recursive: true });
    }

    let testOutput = '';
    let testSucceeded = false;
    let coverageGenerated = false;

    // Try running tests with coverage
    try {
      const { stdout } = await execAsync(testCommand, {
        cwd: projectRoot,
        timeout: 300000, // 5 minute timeout
        env: { ...process.env, CI: 'true', FORCE_COLOR: '0' },
      });
      testOutput = stdout;
      testSucceeded = true;
    } catch (testError) {
      // Tests may have failed but coverage might still have been generated
      const errOutput = testError instanceof Error ? testError.message : String(testError);
      testOutput = errOutput;

      // Check if coverage files were created despite test failures
      const coverageSummaryPath = path.join(coverageDir, 'coverage-summary.json');
      coverageGenerated = fs.existsSync(coverageSummaryPath);
    }

    // Check if coverage summary was generated
    const coverageSummaryPath = path.join(coverageDir, 'coverage-summary.json');
    if (fs.existsSync(coverageSummaryPath)) {
      coverageGenerated = true;

      // Copy to misc/coverage for consistency
      try {
        const coverageData = fs.readFileSync(coverageSummaryPath, 'utf8');
        fs.writeFileSync(path.join(miscCoverageDir, 'coverage-summary.json'), coverageData);
      } catch {
        // Non-fatal: couldn't copy to misc directory
      }
    }

    // Parse coverage from output if available
    const coverageMatch = testOutput.match(/All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/);

    // Try to generate HTML report if the script exists
    const reportScriptPath = path.join(projectRoot, 'scripts', 'ci', 'generate-coverage-report.js');
    if (fs.existsSync(reportScriptPath)) {
      try {
        await execAsync('node scripts/ci/generate-coverage-report.js', {
          cwd: projectRoot,
          timeout: 60000,
          env: { ...process.env, PR_NUMBER: 'local-' + new Date().toISOString().slice(0, 10) },
        });
      } catch {
        // Non-fatal: HTML generation failed but JSON may still be valid
      }
    }

    if (coverageGenerated) {
      const coverageInfo = coverageMatch
        ? ` (Stmts: ${coverageMatch[1]}%, Branch: ${coverageMatch[2]}%, Funcs: ${coverageMatch[3]}%, Lines: ${coverageMatch[4]}%)`
        : '';

      const statusNote = testSucceeded ? 'passing' : 'with some test failures';

      return {
        report: 'coverage',
        success: true,
        message: `Coverage report generated (${statusNote})${coverageInfo}`,
        duration: Date.now() - start,
      };
    }

    // If no coverage was generated, try to read existing coverage data
    const existingPaths = [
      path.join(projectRoot, 'artifacts', 'misc', 'coverage', 'coverage-summary.json'),
      path.join(projectRoot, 'coverage', 'coverage-summary.json'),
    ];

    for (const existingPath of existingPaths) {
      if (fs.existsSync(existingPath)) {
        return {
          report: 'coverage',
          success: true,
          message: 'Using existing coverage data (test execution failed, showing cached data)',
          duration: Date.now() - start,
        };
      }
    }

    // Nothing worked - return error with actionable guidance
    return {
      report: 'coverage',
      success: false,
      message: 'Coverage generation failed. Try running "pnpm test" locally to diagnose test issues.',
      duration: Date.now() - start,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      report: 'coverage',
      success: false,
      message: `Failed to generate coverage report: ${errorMessage.slice(0, 200)}`,
      duration: Date.now() - start,
    };
  }
}

async function generateLighthouseReport(projectRoot: string, url: string, _scope: string = 'standard'): Promise<GenerateResult> {
  const start = Date.now();
  const fs = await import('fs');

  // Ensure output directory exists (cross-platform)
  const lighthouseDir = path.join(projectRoot, 'artifacts', 'lighthouse');
  if (!fs.existsSync(lighthouseDir)) {
    fs.mkdirSync(lighthouseDir, { recursive: true });
  }

  try {
    // Check if lighthouse is installed
    let hasLighthouse = false;
    try {
      await execAsync('npx lighthouse --version', { cwd: projectRoot, timeout: 10000 });
      hasLighthouse = true;
    } catch {
      // Lighthouse not available
    }

    if (!hasLighthouse) {
      // Generate a placeholder report explaining what's needed
      const placeholder = {
        generatedAt: new Date().toISOString(),
        source: 'placeholder',
        type: 'unavailable',
        url,
        message: 'Lighthouse not installed or Chrome not available',
        scores: { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 },
        passed: false,
        instructions: 'Install Lighthouse: npm install -g lighthouse. Ensure Chrome/Chromium is installed.',
      };

      fs.writeFileSync(
        path.join(lighthouseDir, 'lighthouse-summary.json'),
        JSON.stringify(placeholder, null, 2)
      );

      // Generate placeholder HTML
      const placeholderHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lighthouse Report - Setup Required</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .container { text-align: center; padding: 2rem; max-width: 500px; }
    h1 { color: #f59e0b; margin-bottom: 1rem; }
    p { color: #94a3b8; margin-bottom: 1.5rem; }
    .tip { background: #1e293b; padding: 1rem; border-radius: 8px; font-size: 0.875rem; text-align: left; }
    code { background: #334155; padding: 0.25rem 0.5rem; border-radius: 4px; display: block; margin: 0.5rem 0; }
    .badge { display: inline-block; background: #8b5cf6; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <span class="badge">SETUP REQUIRED</span>
    <h1>Lighthouse Not Available</h1>
    <p>Lighthouse requires Chrome/Chromium to run performance audits.</p>
    <div class="tip">
      <strong>To enable Lighthouse reports:</strong>
      <code>npm install -g lighthouse</code>
      <code>npm install -g chrome-launcher</code>
      <p style="margin-top: 1rem; color: #94a3b8;">Ensure Chrome or Chromium is installed on your system.</p>
    </div>
    <p style="margin-top: 1.5rem; font-size: 0.75rem; color: #64748b;">Generated: ${new Date().toISOString()}</p>
  </div>
</body>
</html>`;

      fs.writeFileSync(path.join(lighthouseDir, 'lighthouse-report.html'), placeholderHtml);

      return {
        report: 'lighthouse',
        success: true,
        message: 'Lighthouse placeholder generated (Chrome/Lighthouse not installed)',
        duration: Date.now() - start,
      };
    }

    // Run Lighthouse
    const { stdout: lighthouseOutput } = await execAsync(
      `npx lighthouse ${url} --output json --output html --output-path "${path.join(lighthouseDir, 'lighthouse-report')}" --chrome-flags="--headless --no-sandbox --disable-gpu"`,
      {
        cwd: projectRoot,
        timeout: 120000, // 2 minute timeout
      }
    );

    // Log lighthouse output for debugging if verbose
    const outputPreview = lighthouseOutput.slice(0, 200);
    console.log(`[Lighthouse] Output preview: ${outputPreview}...`);

    // Parse the JSON output and create summary
    const reportPath = path.join(lighthouseDir, 'lighthouse-report.report.json');

    if (fs.existsSync(reportPath)) {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      const categories = report.categories || {};

      const summary = {
        generatedAt: new Date().toISOString(),
        source: 'local',
        type: 'real',
        prNumber: 'local',
        url,
        scores: {
          performance: Math.round((categories.performance?.score || 0) * 100),
          accessibility: Math.round((categories.accessibility?.score || 0) * 100),
          bestPractices: Math.round((categories['best-practices']?.score || 0) * 100),
          seo: Math.round((categories.seo?.score || 0) * 100),
        },
        passed: Object.values(categories as Record<string, { score?: number }>).every((c) => (c.score || 0) >= 0.9),
      };

      fs.writeFileSync(
        path.join(lighthouseDir, 'lighthouse-summary.json'),
        JSON.stringify(summary, null, 2)
      );

      // Rename HTML report if it has the .report suffix
      const htmlSource = path.join(lighthouseDir, 'lighthouse-report.report.html');
      const htmlDest = path.join(lighthouseDir, 'lighthouse-report.html');
      if (fs.existsSync(htmlSource) && htmlSource !== htmlDest) {
        fs.renameSync(htmlSource, htmlDest);
      }

      const avgScore = Math.round(
        (summary.scores.performance + summary.scores.accessibility + summary.scores.bestPractices + summary.scores.seo) / 4
      );

      return {
        report: 'lighthouse',
        success: true,
        message: `Lighthouse completed (Avg: ${avgScore}%, Perf: ${summary.scores.performance}%, A11y: ${summary.scores.accessibility}%)`,
        duration: Date.now() - start,
      };
    }

    return {
      report: 'lighthouse',
      success: true,
      message: 'Lighthouse report generated but JSON not found',
      duration: Date.now() - start,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Check for common Chrome-related errors
    if (errorMsg.includes('Chrome') || errorMsg.includes('chromium') || errorMsg.includes('ENOENT')) {
      return {
        report: 'lighthouse',
        success: false,
        message: 'Chrome/Chromium not found. Install Chrome or set CHROME_PATH environment variable.',
        duration: Date.now() - start,
      };
    }

    return {
      report: 'lighthouse',
      success: false,
      message: `Failed to generate Lighthouse report: ${errorMsg.slice(0, 150)}`,
      duration: Date.now() - start,
    };
  }
}

async function generatePerformanceReport(projectRoot: string, _scope: string = 'standard'): Promise<GenerateResult> {
  const start = Date.now();
  const fs = await import('fs');

  // Ensure output directory exists
  const benchmarkDir = path.join(projectRoot, 'artifacts', 'benchmarks');
  if (!fs.existsSync(benchmarkDir)) {
    fs.mkdirSync(benchmarkDir, { recursive: true });
  }

  try {
    // Check if k6 is available
    let hasK6 = false;
    try {
      await execAsync('k6 version', { cwd: projectRoot, timeout: 5000 });
      hasK6 = true;
    } catch {
      // k6 not available
    }

    if (hasK6) {
      // Run k6 load test if script exists
      const k6Script = path.join(projectRoot, 'artifacts/misc/k6/scripts/load-test.js');
      if (fs.existsSync(k6Script)) {
        await execAsync(`k6 run --out json=artifacts/benchmarks/k6-results.json ${k6Script}`, {
          cwd: projectRoot,
          timeout: 300000,
        });

        return {
          report: 'performance',
          success: true,
          message: 'Performance report generated with k6 load testing',
          duration: Date.now() - start,
        };
      }
    }

    // Generate a real performance benchmark using Node.js timing
    const benchmarkResults = {
      generatedAt: new Date().toISOString(),
      source: 'local',
      type: 'synthetic',
      message: hasK6 ? 'k6 script not found - synthetic benchmark generated' : 'k6 not installed - synthetic benchmark generated',
      benchmarks: [
        {
          operation: 'JSON parse (1KB)',
          iterations: 10000,
          p50Time: 0,
          p95Time: 0,
          p99Time: 0,
        },
        {
          operation: 'Array sort (1000 items)',
          iterations: 1000,
          p50Time: 0,
          p95Time: 0,
          p99Time: 0,
        },
      ],
      validation: {
        all_targets_met: false,
      },
    };

    // Run actual micro-benchmarks
    const runBenchmark = (fn: () => void, iterations: number): number[] => {
      const times: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        fn();
        times.push(performance.now() - startTime);
      }
      return times.sort((a, b) => a - b);
    };

    // Benchmark 1: JSON parsing
    const testJson = JSON.stringify({ data: Array(100).fill({ id: 1, name: 'test', value: Math.random() }) });
    const jsonTimes = runBenchmark(() => JSON.parse(testJson), 10000);
    benchmarkResults.benchmarks[0].p50Time = jsonTimes[Math.floor(jsonTimes.length * 0.5)];
    benchmarkResults.benchmarks[0].p95Time = jsonTimes[Math.floor(jsonTimes.length * 0.95)];
    benchmarkResults.benchmarks[0].p99Time = jsonTimes[Math.floor(jsonTimes.length * 0.99)];

    // Benchmark 2: Array sorting
    const sortTimes = runBenchmark(() => {
      const arr = Array.from({ length: 1000 }, () => Math.random());
      arr.sort((a, b) => a - b);
    }, 1000);
    benchmarkResults.benchmarks[1].p50Time = sortTimes[Math.floor(sortTimes.length * 0.5)];
    benchmarkResults.benchmarks[1].p95Time = sortTimes[Math.floor(sortTimes.length * 0.95)];
    benchmarkResults.benchmarks[1].p99Time = sortTimes[Math.floor(sortTimes.length * 0.99)];

    // Check if targets are met (p95 < 1ms for simple operations)
    benchmarkResults.validation.all_targets_met =
      benchmarkResults.benchmarks[0].p95Time < 1 && benchmarkResults.benchmarks[1].p95Time < 5;

    // Calculate overall score
    const avgP95 = benchmarkResults.benchmarks.reduce((sum, b) => sum + b.p95Time, 0) / benchmarkResults.benchmarks.length;
    const score = Math.max(0, Math.min(100, 100 - avgP95 * 10));

    const summary = {
      ...benchmarkResults,
      score: Math.round(score),
      passed: benchmarkResults.validation.all_targets_met,
      metrics: {
        jsonParse_p95: `${benchmarkResults.benchmarks[0].p95Time.toFixed(3)}ms`,
        arraySort_p95: `${benchmarkResults.benchmarks[1].p95Time.toFixed(3)}ms`,
      },
    };

    fs.writeFileSync(
      path.join(benchmarkDir, 'performance-summary.json'),
      JSON.stringify(summary, null, 2)
    );

    // Generate HTML report
    const htmlReport = generatePerformanceHtml(summary);
    fs.writeFileSync(path.join(benchmarkDir, 'performance-report.html'), htmlReport);

    return {
      report: 'performance',
      success: true,
      message: `Synthetic benchmarks completed (JSON p95: ${summary.metrics.jsonParse_p95}, Sort p95: ${summary.metrics.arraySort_p95})`,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      report: 'performance',
      success: false,
      message: `Failed to generate performance report: ${error instanceof Error ? error.message : String(error)}`,
      duration: Date.now() - start,
    };
  }
}

function generatePerformanceHtml(data: {
  generatedAt: string;
  source: string;
  type?: string;
  benchmarks: Array<{ operation: string; p50Time: number; p95Time: number; p99Time: number }>;
  score: number;
  passed: boolean;
  metrics: Record<string, string>;
}): string {
  const getScoreClass = (passed: boolean) => (passed ? 'success' : 'warning');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Performance Benchmark Report - IntelliFlow CRM</title>
  <style>
    :root { --bg: #0f172a; --card: #1e293b; --text: #e2e8f0; --text-muted: #94a3b8; --good: #22c55e; --warning: #f59e0b; --poor: #ef4444; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
    .container { max-width: 1000px; margin: 0 auto; padding: 2rem; }
    header { margin-bottom: 2rem; }
    h1 { font-size: 2rem; color: #fff; margin-bottom: 0.5rem; }
    .meta { color: var(--text-muted); font-size: 0.875rem; }
    .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; margin-left: 0.5rem; }
    .badge.success { background: var(--good); color: #fff; }
    .badge.warning { background: var(--warning); color: #000; }
    .badge.synthetic { background: #8b5cf6; color: #fff; }
    .overall { background: linear-gradient(135deg, var(--card) 0%, #2d3748 100%); border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 2rem; }
    .overall-score { font-size: 4rem; font-weight: bold; margin-bottom: 0.5rem; color: ${data.passed ? 'var(--good)' : 'var(--warning)'}; }
    .card { background: var(--card); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
    .card h3 { color: #fff; margin-bottom: 1rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #334155; }
    th { color: var(--text-muted); font-size: 0.875rem; }
    .time { font-family: monospace; }
    .good { color: var(--good); }
    .warning { color: var(--warning); }
    footer { text-align: center; color: var(--text-muted); font-size: 0.875rem; padding-top: 2rem; border-top: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Performance Benchmark Report <span class="badge ${getScoreClass(data.passed)}">${data.passed ? 'PASS' : 'REVIEW'}</span> ${data.type === 'synthetic' ? '<span class="badge synthetic">Synthetic</span>' : ''}</h1>
      <p class="meta">Generated: ${data.generatedAt} | Source: ${data.source}</p>
    </header>

    <div class="overall">
      <div class="overall-score">${data.score}%</div>
      <div style="color: var(--text-muted)">Performance Score</div>
    </div>

    <div class="card">
      <h3>Benchmark Results</h3>
      <table>
        <thead>
          <tr><th>Operation</th><th>p50 (median)</th><th>p95</th><th>p99</th></tr>
        </thead>
        <tbody>
          ${data.benchmarks
            .map(
              (b) => `
          <tr>
            <td>${b.operation}</td>
            <td class="time">${b.p50Time.toFixed(3)}ms</td>
            <td class="time ${b.p95Time < 1 ? 'good' : 'warning'}">${b.p95Time.toFixed(3)}ms</td>
            <td class="time">${b.p99Time.toFixed(3)}ms</td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h3>Summary Metrics</h3>
      <p>${Object.entries(data.metrics)
        .map(([k, v]) => `<strong>${k}:</strong> ${v}`)
        .join(' | ')}</p>
    </div>

    <footer>
      IntelliFlow CRM - Performance Benchmark | ${data.type === 'synthetic' ? 'Synthetic benchmark (k6 not available)' : 'Generated by k6'}
    </footer>
  </div>
</body>
</html>`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const reports = body.reports || ['coverage']; // Default to coverage only
    const lighthouseUrl = body.url || 'http://localhost:3000';
    const scope = body.scope || 'standard'; // quick, standard, comprehensive
    const jobId = body.jobId;

    const projectRoot = await getProjectRoot();
    const results: GenerateResult[] = [];

    // Import job storage for progress updates (if jobId provided)
    let updateProgress: ((updates: { currentReport?: string; progress?: number }) => void) | null = null;
    if (jobId) {
      try {
        const { setJob, updateJobProgress } = await import('../job-storage');
        setJob({
          id: jobId,
          reports,
          status: 'running',
          progress: 0,
          results: [],
          startedAt: new Date().toISOString(),
        });
        updateProgress = (updates) => {
          updateJobProgress(jobId, updates);
        };
      } catch {
        // Job storage module not available, continue without progress tracking
      }
    }

    const totalReports = reports.length;

    for (let i = 0; i < reports.length; i++) {
      const report = reports[i];
      const progressPercent = Math.round((i / totalReports) * 100);

      // Update progress before starting each report
      if (updateProgress) {
        updateProgress({ currentReport: report, progress: progressPercent });
      }

      switch (report) {
        case 'coverage':
          results.push(await generateCoverageReport(projectRoot, scope));
          break;
        case 'lighthouse':
          results.push(await generateLighthouseReport(projectRoot, lighthouseUrl, scope));
          break;
        case 'performance':
          results.push(await generatePerformanceReport(projectRoot, scope));
          break;
        default:
          results.push({
            report,
            success: false,
            message: `Unknown report type: ${report}`,
            duration: 0,
          });
      }
    }

    const allSuccess = results.every((r) => r.success);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    // Update final status
    if (jobId && updateProgress) {
      try {
        const { setJob } = await import('../job-storage');
        setJob({
          id: jobId,
          reports,
          status: allSuccess ? 'completed' : 'failed',
          progress: 100,
          results,
          startedAt: body.startedAt || new Date().toISOString(),
          completedAt: new Date().toISOString(),
        });
      } catch {
        // Continue without updating status
      }
    }

    return NextResponse.json({
      success: allSuccess,
      data: {
        results,
        totalDuration,
        generatedAt: new Date().toISOString(),
        scope,
      },
    });
  } catch (error) {
    console.error('Generate reports error:', error);
    return NextResponse.json(
      {
        success: false,
        error: `Failed to generate reports: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      availableReports: ['coverage', 'lighthouse', 'performance'],
      usage: {
        method: 'POST',
        body: {
          reports: ['coverage', 'lighthouse', 'performance'],
          url: 'http://localhost:3000 (for lighthouse)',
        },
      },
    },
  });
}
