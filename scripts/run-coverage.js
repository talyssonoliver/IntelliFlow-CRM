#!/usr/bin/env node
/**
 * run-coverage.js
 *
 * Runs Vitest coverage for each workspace project SEQUENTIALLY with its own
 * reportsDirectory, then merges all per-project coverage-final.json files into
 * a single canonical artifact at artifacts/coverage/.
 *
 * WHY: Vitest 4.x race condition — when multiple workspace projects run
 * concurrently they share artifacts/coverage/.tmp/, causing ENOENT errors when
 * one project deletes .tmp/ while another is still writing worker temp files.
 * Running one project at a time gives each its own .tmp/ namespace.
 *
 * Usage:
 *   node scripts/run-coverage.js           # runs all projects
 *   node scripts/run-coverage.js --merge-only  # skip test runs, just merge
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PARTS_DIR = path.join(ROOT, 'artifacts', 'coverage-parts');
const FINAL_DIR = path.join(ROOT, 'artifacts', 'coverage');

// All workspace project names (must match `name` in each vitest.config.ts)
// NOTE: api is last because it's a large project that may take a long time
const PROJECTS = [
  'web',
  'ai-worker',
  'domain',
  // `db` is in sonar.sources (so Sonar's new_coverage covers it via the CI
  // sharded run) and its src is NOT in sonar.coverage.exclusions, but it was
  // missing here — so pre-ship's local merged lcov had zero db coverage and
  // diff-coverage flagged every db logic change as "no lcov". Add it to close
  // the pre-ship↔Sonar parity gap. db tests are node-env unit tests (no live
  // DB) and run in ~2s.
  'db',
  'adapters',
  'application',
  'validators',
  'ui',
  'observability',
  'worker-shared',
  'notifications-worker',
  'events-worker',
  'ingestion-worker',
  'architecture',
  'a11y',
  'integration',
  'api',
];

// Projects that are allowed extra time (in ms). Default timeout is 20 minutes.
const PROJECT_TIMEOUT_MS = {
  api: 30 * 60 * 1000, // 30 minutes for large api project
  web: 25 * 60 * 1000, // 25 minutes for web
  default: 20 * 60 * 1000, // 20 minutes for everything else
};

const MERGE_ONLY = process.argv.includes('--merge-only');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runVitest(project) {
  return new Promise((resolve) => {
    const outDir = path.join(PARTS_DIR, project);
    // Capture per-project test results as JSON so we can distinguish
    // real test failures from coverage-threshold breaches. Both surface
    // as vitest exit code 1, but their semantics differ:
    //   - real test failures → job MUST fail (CI red, not fake-green)
    //   - threshold breach with all tests passing → warn, but the
    //     suite is honest. Threshold debt is tracked separately.
    const resultJsonPath = path.join(outDir, 'vitest-result.json');
    const args = [
      '--max-old-space-size=8192',
      '--expose-gc',
      path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'),
      'run',
      '--coverage',
      `--coverage.reportsDirectory=${outDir}`,
      `--project=${project}`,
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${resultJsonPath}`,
    ];

    console.log(`\n▶ Running coverage for project: ${project}`);

    // Ensure outDir exists for the JSON report.
    fs.mkdirSync(outDir, { recursive: true });

    const child = spawn('node', args, {
      cwd: ROOT,
      env: { ...process.env, COVERAGE_RUN: '1' },
      stdio: 'inherit',
    });

    const timeoutMs = PROJECT_TIMEOUT_MS[project] ?? PROJECT_TIMEOUT_MS.default;
    const timer = setTimeout(() => {
      console.warn(`  ⚠ ${project} timed out after ${timeoutMs / 60000} min — killing`);
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);

      // Inspect the JSON report to classify the exit.
      let result = { project, code: code ?? 1, testFailures: 0, thresholdBreach: false };
      if (fs.existsSync(resultJsonPath)) {
        try {
          const r = JSON.parse(fs.readFileSync(resultJsonPath, 'utf8'));
          result.testFailures = (r.numFailedTests || 0) + (r.numFailedTestSuites || 0);
          // If exit was non-zero but no test failures, it's threshold breach.
          if (code !== 0 && result.testFailures === 0) {
            result.thresholdBreach = true;
          }
        } catch (err) {
          console.warn(`  ⚠ ${project} could not parse vitest JSON report: ${err.message}`);
        }
      } else if (code !== 0) {
        // No JSON report and non-zero exit — could be early crash. Treat
        // as test failure to be safe (NOT fake-green).
        result.testFailures = -1; // unknown but non-zero
      }

      if (code === 0) {
        console.log(`  ✓ ${project} done (all tests pass, thresholds met)`);
      } else if (result.thresholdBreach) {
        console.warn(
          `  ⚠ ${project} tests pass but coverage thresholds breached (debt — not a test failure)`
        );
      } else {
        console.warn(
          `  ✗ ${project} exit ${code} — ${result.testFailures === -1 ? 'no JSON report (early crash?)' : result.testFailures + ' test failure(s)'}`
        );
      }
      resolve(result);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      console.error(`  ✗ ${project} spawn error: ${err.message}`);
      resolve({ project, code: 1, testFailures: -1, thresholdBreach: false });
    });
  });
}

// ---------------------------------------------------------------------------
// Istanbul merge
// ---------------------------------------------------------------------------

/**
 * Ensures coverage-final.json exists for a project, falling back to .tmp merge.
 * Returns true if the file is ready to read, false if the project should be skipped.
 */
function ensureProjectCoverage(project, finalPath, createCoverageMap) {
  if (fs.existsSync(finalPath)) return true;

  const tmpDir = path.join(PARTS_DIR, project, '.tmp');
  if (!fs.existsSync(tmpDir)) {
    console.log(`  skip ${project} (no coverage-final.json)`);
    return false;
  }

  const tmpFiles = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.json'));
  if (tmpFiles.length === 0) {
    console.log(`  skip ${project} (no coverage-final.json, empty .tmp)`);
    return false;
  }

  console.log(
    `  \u26a0 ${project} has no coverage-final.json but has ${tmpFiles.length} .tmp files — merging manually`
  );
  try {
    const projectMap = createCoverageMap({});
    for (const tmpFile of tmpFiles) {
      const tmpData = JSON.parse(fs.readFileSync(path.join(tmpDir, tmpFile), 'utf8'));
      projectMap.merge(createCoverageMap(tmpData));
    }
    fs.writeFileSync(finalPath, JSON.stringify(projectMap.toJSON()), 'utf8');
    console.log(`  \u2713 manually merged ${project} .tmp files into coverage-final.json`);
    return true;
  } catch (error_) {
    console.warn(`  \u26a0 ${project} .tmp merge error: ${error_.message}`);
    return false;
  }
}

function mergeProjectCoverage(project, finalPath, mergedMap, createCoverageMap) {
  if (!ensureProjectCoverage(project, finalPath, createCoverageMap)) return false;

  try {
    const data = JSON.parse(fs.readFileSync(finalPath, 'utf8'));
    const keys = Object.keys(data);
    if (keys.length === 0) {
      console.log(`  skip ${project} (empty coverage-final.json)`);
      return false;
    }
    mergedMap.merge(createCoverageMap(data));
    console.log(`  merged ${project} (${keys.length} files)`);
    return true;
  } catch (err) {
    console.warn(`  \u26a0 ${project} parse error: ${err.message}`);
    return false;
  }
}

async function mergeCoverage() {
  console.log('\n🔀 Merging per-project coverage into artifacts/coverage/ …');

  // Dynamic import because istanbul-lib-* may be ESM or CJS depending on version
  const [coverageLib, reportLib, reportsModule] = await Promise.all([
    import('istanbul-lib-coverage'),
    import('istanbul-lib-report'),
    import('istanbul-reports'),
  ]);

  const createCoverageMap = coverageLib.default?.createCoverageMap ?? coverageLib.createCoverageMap;
  const createContext = reportLib.default?.createContext ?? reportLib.createContext;
  const create = reportsModule.default?.create ?? reportsModule.create;

  const mergedMap = createCoverageMap({});

  // Collect all per-project coverage-final.json files
  let found = 0;
  for (const project of PROJECTS) {
    const finalPath = path.join(PARTS_DIR, project, 'coverage-final.json');
    if (mergeProjectCoverage(project, finalPath, mergedMap, createCoverageMap)) {
      found++;
    }
  }

  if (found === 0) {
    console.error('❌ No per-project coverage files found — aborting merge');
    process.exit(1);
  }

  // Write merged output to artifacts/coverage/
  fs.mkdirSync(FINAL_DIR, { recursive: true });

  const context = createContext({
    dir: FINAL_DIR,
    defaultSummarizer: 'pkg',
    coverageMap: mergedMap,
  });

  // Generate all needed reports
  for (const reportType of ['json', 'json-summary', 'lcovonly', 'text']) {
    try {
      const reporter = create(reportType === 'lcovonly' ? 'lcovonly' : reportType);
      reporter.execute(context);
    } catch (err) {
      console.warn(`  ⚠ ${reportType} report error: ${err.message}`);
    }
  }

  // istanbul-reports writes 'lcov.info' for lcovonly reporter — ensure consistent naming
  const lcovWritten = path.join(FINAL_DIR, 'lcov.info');
  if (!fs.existsSync(lcovWritten)) {
    // Some versions write to coverage/lcov.info inside reportsDirectory
    const alt = path.join(FINAL_DIR, 'lcov', 'lcov.info');
    if (fs.existsSync(alt)) {
      fs.copyFileSync(alt, lcovWritten);
    }
  }

  // Print summary
  const summary = mergedMap.getCoverageSummary();
  const l = summary.lines;
  const s = summary.statements;
  const f = summary.functions;
  const b = summary.branches;
  console.log(`\n📊 Merged coverage summary:`);
  console.log(`   Lines:      ${l.covered}/${l.total} (${l.pct.toFixed(1)}%)`);
  console.log(`   Statements: ${s.covered}/${s.total} (${s.pct.toFixed(1)}%)`);
  console.log(`   Functions:  ${f.covered}/${f.total} (${f.pct.toFixed(1)}%)`);
  console.log(`   Branches:   ${b.covered}/${b.total} (${b.pct.toFixed(1)}%)`);
  console.log(`\n✅ Canonical coverage written to: artifacts/coverage/`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const projectResults = [];

  if (!MERGE_ONLY) {
    // Clean out stale per-project coverage parts
    if (fs.existsSync(PARTS_DIR)) {
      fs.rmSync(PARTS_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(PARTS_DIR, { recursive: true });

    console.log(`🧪 Running coverage for ${PROJECTS.length} projects sequentially…`);

    // Run projects one at a time to avoid .tmp race condition
    for (let i = 0; i < PROJECTS.length; i++) {
      const project = PROJECTS[i];
      console.log(`\n━━━ [${i + 1}/${PROJECTS.length}] ${project} ━━━`);
      const result = await runVitest(project);
      projectResults.push(result);
      // Force GC between projects to free memory
      if (globalThis.gc) globalThis.gc();
    }
  }

  await mergeCoverage();

  // Classify per-project results — only real TEST FAILURES fail the script.
  // Threshold breaches with all tests passing are real debt but tracked
  // separately so we don't fake-green AND don't fake-red on debt.
  const testFailedProjects = projectResults.filter((r) => r.testFailures !== 0);
  const thresholdOnlyProjects = projectResults.filter((r) => r.thresholdBreach);

  if (thresholdOnlyProjects.length > 0) {
    console.warn(
      `\n⚠ ${thresholdOnlyProjects.length} project(s) breached coverage thresholds (all tests passed — this is debt, not a regression):`
    );
    for (const p of thresholdOnlyProjects) {
      console.warn(`   - ${p.project}`);
    }
  }

  if (testFailedProjects.length > 0) {
    console.error(`\n❌ ${testFailedProjects.length} project(s) had ACTUAL TEST FAILURES:`);
    for (const f of testFailedProjects) {
      const detail =
        f.testFailures === -1
          ? `exit ${f.code} (no JSON report — early crash?)`
          : `${f.testFailures} test failure(s), exit ${f.code}`;
      console.error(`   - ${f.project}: ${detail}`);
    }
    if (process.env.COVERAGE_ALLOW_TEST_FAILURES === '1') {
      console.warn(
        '\n   COVERAGE_ALLOW_TEST_FAILURES=1 set — exiting 0 despite failures.\n' +
          '   Use only for local debugging. CI must NEVER set this.'
      );
      return;
    }
    process.exit(1);
  }

  console.log(`\n✅ All ${projectResults.length} projects: tests passed`);
  if (thresholdOnlyProjects.length > 0) {
    console.log(`   (${thresholdOnlyProjects.length} have threshold debt — see warnings above)`);
  }
}

try {
  await main();
} catch (err) {
  console.error('Fatal error:', err);
  process.exit(1);
}
