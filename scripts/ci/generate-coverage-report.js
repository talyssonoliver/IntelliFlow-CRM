#!/usr/bin/env node
/**
 * Coverage Report Generator
 *
 * Generates HTML and JSON summary reports from Vitest/Istanbul coverage.
 * Used in CI/CD pipeline to create artifacts for Governance dashboard.
 *
 * @see IFC-129 - UI Coverage (ui-coverage.html)
 * @see ENV-010-AI - Test Coverage Setup
 */

const fs = require('fs');
const path = require('path');

const prNumber = process.env.PR_NUMBER || 'N/A';

// Possible coverage summary locations (in priority order)
const coveragePaths = [
  'artifacts/misc/coverage/coverage-summary.json',  // Main aggregated coverage
  'artifacts/coverage/coverage-summary.json',
  'coverage/coverage-summary.json',
  'packages/domain/artifacts/coverage/lcov.info',
  'packages/application/artifacts/coverage/lcov.info',
  'artifacts/coverage/lcov.info'
];

let coverageData = null;

// Try to find coverage summary
for (const coveragePath of coveragePaths) {
  if (fs.existsSync(coveragePath)) {
    if (coveragePath.endsWith('.json')) {
      coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
      break;
    } else if (coveragePath.endsWith('.info')) {
      // Parse lcov.info for basic metrics
      const lcov = fs.readFileSync(coveragePath, 'utf8');
      const lines = { total: 0, covered: 0 };
      const branches = { total: 0, covered: 0 };
      const functions = { total: 0, covered: 0 };

      lcov.split('\n').forEach(line => {
        if (line.startsWith('LF:')) lines.total += parseInt(line.slice(3));
        if (line.startsWith('LH:')) lines.covered += parseInt(line.slice(3));
        if (line.startsWith('BRF:')) branches.total += parseInt(line.slice(4));
        if (line.startsWith('BRH:')) branches.covered += parseInt(line.slice(4));
        if (line.startsWith('FNF:')) functions.total += parseInt(line.slice(4));
        if (line.startsWith('FNH:')) functions.covered += parseInt(line.slice(4));
      });

      coverageData = {
        total: {
          lines: { total: lines.total, covered: lines.covered, pct: lines.total ? (lines.covered / lines.total * 100) : 0 },
          branches: { total: branches.total, covered: branches.covered, pct: branches.total ? (branches.covered / branches.total * 100) : 0 },
          functions: { total: functions.total, covered: functions.covered, pct: functions.total ? (functions.covered / functions.total * 100) : 0 },
          statements: { total: lines.total, covered: lines.covered, pct: lines.total ? (lines.covered / lines.total * 100) : 0 }
        }
      };
      break;
    }
  }
}

// Default coverage if none found
if (!coverageData) {
  console.warn('No coverage data found, generating placeholder report');
  coverageData = {
    total: {
      lines: { total: 0, covered: 0, pct: 0 },
      branches: { total: 0, covered: 0, pct: 0 },
      functions: { total: 0, covered: 0, pct: 0 },
      statements: { total: 0, covered: 0, pct: 0 }
    }
  };
}

const total = coverageData.total || {};
const metrics = {
  lines: Math.round(total.lines?.pct || 0),
  branches: Math.round(total.branches?.pct || 0),
  functions: Math.round(total.functions?.pct || 0),
  statements: Math.round(total.statements?.pct || 0)
};

const overallCoverage = Math.round(
  (metrics.lines + metrics.branches + metrics.functions + metrics.statements) / 4
);

const getScoreClass = (score) => score >= 90 ? 'good' : score >= 70 ? 'average' : 'poor';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Coverage Report - IntelliFlow CRM</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --accent: #8b5cf6;
      --good: #22c55e;
      --average: #f59e0b;
      --poor: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    header { margin-bottom: 2rem; }
    h1 { font-size: 2rem; color: #fff; margin-bottom: 0.5rem; }
    .meta { color: var(--text-muted); font-size: 0.875rem; }
    .meta span { margin-right: 1.5rem; }
    .overall {
      background: linear-gradient(135deg, var(--card) 0%, #2d3748 100%);
      border-radius: 16px;
      padding: 2rem;
      text-align: center;
      margin-bottom: 2rem;
    }
    .overall-score {
      font-size: 4rem;
      font-weight: bold;
      margin-bottom: 0.5rem;
    }
    .overall-score.good { color: var(--good); }
    .overall-score.average { color: var(--average); }
    .overall-score.poor { color: var(--poor); }
    .overall-label { color: var(--text-muted); font-size: 1.25rem; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .metric-card {
      background: var(--card);
      border-radius: 12px;
      padding: 1.5rem;
    }
    .metric-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }
    .metric-label { font-weight: 500; }
    .metric-value { font-size: 1.5rem; font-weight: bold; }
    .metric-value.good { color: var(--good); }
    .metric-value.average { color: var(--average); }
    .metric-value.poor { color: var(--poor); }
    .progress-bar {
      height: 8px;
      background: #334155;
      border-radius: 4px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .progress-fill.good { background: var(--good); }
    .progress-fill.average { background: var(--average); }
    .progress-fill.poor { background: var(--poor); }
    .info-card {
      background: var(--card);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .info-card h3 { margin-bottom: 0.5rem; color: #fff; }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge.ci { background: #8b5cf6; color: #fff; }
    .thresholds {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      margin-top: 1rem;
    }
    .threshold {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
    }
    .threshold-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
    footer {
      text-align: center;
      color: var(--text-muted);
      font-size: 0.875rem;
      padding-top: 2rem;
      border-top: 1px solid #334155;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Test Coverage Report</h1>
      <p class="meta">
        <span>Generated: ${new Date().toISOString()}</span>
        <span>PR: #${prNumber}</span>
      </p>
    </header>

    <div class="overall">
      <div class="overall-score ${getScoreClass(overallCoverage)}">${overallCoverage}%</div>
      <div class="overall-label">Overall Coverage</div>
    </div>

    <div class="metrics">
      ${Object.entries({ Lines: metrics.lines, Branches: metrics.branches, Functions: metrics.functions, Statements: metrics.statements })
        .map(([label, value]) => `
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-label">${label}</span>
          <span class="metric-value ${getScoreClass(value)}">${value}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${getScoreClass(value)}" style="width: ${value}%"></div>
        </div>
      </div>`).join('')}
    </div>

    <div class="info-card">
      <h3>Coverage Thresholds</h3>
      <p>Required thresholds from Sprint Plan:</p>
      <div class="thresholds">
        <div class="threshold">
          <div class="threshold-dot" style="background: var(--good)"></div>
          <span>Domain Layer: 95%</span>
        </div>
        <div class="threshold">
          <div class="threshold-dot" style="background: var(--good)"></div>
          <span>Application Layer: 90%</span>
        </div>
        <div class="threshold">
          <div class="threshold-dot" style="background: var(--average)"></div>
          <span>Overall: 90%</span>
        </div>
      </div>
    </div>

    <div class="info-card">
      <h3>Report Source</h3>
      <p><span class="badge ci">CI Generated</span></p>
      <p style="margin-top: 0.5rem;">
        This report was automatically generated by the CI/CD pipeline from Vitest coverage output.
      </p>
    </div>

    <footer>
      IntelliFlow CRM - Governance Dashboard | Generated by GitHub Actions
    </footer>
  </div>
</body>
</html>`;

// Ensure output directories exist
const htmlOutputDir = 'artifacts/misc/coverage-reports';
const jsonOutputDir = 'artifacts/coverage';

[htmlOutputDir, jsonOutputDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Write HTML report
fs.writeFileSync(path.join(htmlOutputDir, 'ui-coverage.html'), html);

// Write JSON summary for API consumption
const jsonSummary = {
  generatedAt: new Date().toISOString(),
  source: 'ci',
  prNumber,
  coverage: {
    overall: overallCoverage,
    lines: metrics.lines,
    branches: metrics.branches,
    functions: metrics.functions,
    statements: metrics.statements
  },
  thresholds: {
    domain: 95,
    application: 90,
    overall: 90
  },
  passed: overallCoverage >= 90,
  raw: total
};

fs.writeFileSync(
  path.join(jsonOutputDir, 'coverage-summary.json'),
  JSON.stringify(jsonSummary, null, 2)
);

console.log('Coverage reports generated:');
console.log(`  - ${htmlOutputDir}/ui-coverage.html`);
console.log(`  - ${jsonOutputDir}/coverage-summary.json`);
console.log(`Overall coverage: ${overallCoverage}% (${overallCoverage >= 90 ? 'PASSED' : 'FAILED'})`);
