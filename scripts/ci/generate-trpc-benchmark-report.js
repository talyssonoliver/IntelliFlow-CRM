#!/usr/bin/env node
/**
 * tRPC Benchmark Report Generator
 *
 * Reads artifacts/benchmarks/trpc-benchmark-summary.json (produced by
 * apps/api/src/shared/performance-benchmark.ts) and generates a governance-
 * ready HTML report at artifacts/benchmarks/trpc-benchmark-report.html.
 *
 * Mirrors the lighthouse report pattern (scripts/ci/generate-lighthouse-report.js).
 *
 * Usage:
 *   node scripts/ci/generate-trpc-benchmark-report.js [summaryPath]
 */

const fs = require('fs');
const path = require('path');

const summaryPath =
  process.argv[2] || path.join('artifacts', 'benchmarks', 'trpc-benchmark-summary.json');

if (!fs.existsSync(summaryPath)) {
  console.error(`Error: summary file not found: ${summaryPath}`);
  console.error('Run the benchmark first:');
  console.error('  npx dotenv -e .env.test -- npx tsx apps/api/src/shared/performance-benchmark.ts');
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const { thresholds, totals, operations, generatedAt, kpi, passed } = summary;

const fmt = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(2) : '—');
const statusClass = (op) => {
  if (op.error) return 'error';
  if (op.p95 == null) return 'error';
  if (op.p95 < thresholds.p95 && (op.p99 == null || op.p99 < thresholds.p99)) return 'good';
  if (op.p95 < thresholds.p95) return 'average';
  return 'poor';
};
const statusIcon = (op) => {
  const cls = statusClass(op);
  if (cls === 'good') return '✅';
  if (cls === 'average') return '⚠️';
  if (cls === 'error') return '❌';
  return '❌';
};

const maxP95 = operations.reduce(
  (m, o) => (typeof o.p95 === 'number' && o.p95 > m ? o.p95 : m),
  thresholds.p95
);
const barWidth = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100, Math.max(1, (value / maxP95) * 100))
    : 0;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>tRPC Benchmark Report - IntelliFlow CRM</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --card-2: #273449;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --accent: #3b82f6;
      --good: #22c55e;
      --average: #f59e0b;
      --poor: #ef4444;
      --error: #6b7280;
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
    .banner {
      background: var(--card);
      border-left: 4px solid ${passed ? 'var(--good)' : 'var(--poor)'};
      border-radius: 8px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .banner-status { font-size: 1.25rem; font-weight: 600; color: #fff; }
    .banner-status.good { color: var(--good); }
    .banner-status.poor { color: var(--poor); }
    .totals { display: flex; gap: 2rem; color: var(--text-muted); font-size: 0.9rem; }
    .totals strong { color: var(--text); }
    .scores {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .kpi-card {
      background: var(--card);
      border-radius: 12px;
      padding: 1.25rem 1.5rem;
    }
    .kpi-label { color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; }
    .kpi-value { font-size: 1.5rem; font-weight: 700; color: #fff; }
    .kpi-value.good { color: var(--good); }
    .kpi-value.poor { color: var(--poor); }
    .kpi-sub { color: var(--text-muted); font-size: 0.8rem; margin-top: 0.25rem; }
    .table-card {
      background: var(--card);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      overflow-x: auto;
    }
    .table-card h3 { color: #fff; margin-bottom: 1rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.75rem 0.5rem; border-bottom: 1px solid #334155; font-size: 0.9rem; white-space: nowrap; }
    th { color: var(--text-muted); font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
    td.op { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #fff; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .status { font-weight: 600; }
    .status.good { color: var(--good); }
    .status.average { color: var(--average); }
    .status.poor { color: var(--poor); }
    .status.error { color: var(--error); }
    .bar-cell { min-width: 160px; }
    .bar-wrap { background: var(--card-2); border-radius: 4px; height: 8px; width: 100%; overflow: hidden; }
    .bar { height: 100%; border-radius: 4px; }
    .bar.good { background: var(--good); }
    .bar.average { background: var(--average); }
    .bar.poor { background: var(--poor); }
    .bar.error { background: var(--error); }
    .error-row td { background: rgba(239, 68, 68, 0.06); color: var(--text-muted); font-size: 0.85rem; white-space: normal; }
    .info-card {
      background: var(--card);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    .info-card h3 { margin-bottom: 0.5rem; color: #fff; }
    .info-card code { background: var(--card-2); padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.85rem; }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      background: var(--accent);
      color: #fff;
      margin-right: 0.5rem;
    }
    .badge.kpi { background: #8b5cf6; }
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
      <h1>tRPC API Benchmark Report</h1>
      <p class="meta">
        <span>Generated: ${generatedAt}</span>
        <span>KPI: ${kpi}</span>
        <span>Thresholds: p50 &lt; ${thresholds.p50}ms · p95 &lt; ${thresholds.p95}ms · p99 &lt; ${thresholds.p99}ms</span>
      </p>
    </header>

    <div class="banner">
      <div class="banner-status ${passed ? 'good' : 'poor'}">
        ${passed ? '✅ PASSED' : '❌ FAILED'}
      </div>
      <div class="totals">
        <div><strong>${totals.total}</strong> total</div>
        <div><strong>${totals.completed}</strong> completed</div>
        <div><strong>${totals.passed}</strong> passed</div>
        <div><strong>${totals.failedKpi}</strong> failed KPI</div>
        <div><strong>${totals.errored}</strong> errored</div>
      </div>
    </div>

    <div class="scores">
      <div class="kpi-card">
        <div class="kpi-label">p50 Threshold</div>
        <div class="kpi-value">&lt; ${thresholds.p50}ms</div>
        <div class="kpi-sub">Median response time</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">p95 Threshold</div>
        <div class="kpi-value">&lt; ${thresholds.p95}ms</div>
        <div class="kpi-sub">95th percentile</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">p99 Threshold</div>
        <div class="kpi-value">&lt; ${thresholds.p99}ms</div>
        <div class="kpi-sub">99th percentile</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Pass rate</div>
        <div class="kpi-value ${passed ? 'good' : 'poor'}">${totals.completed > 0 ? Math.round((totals.passed / totals.completed) * 100) : 0}%</div>
        <div class="kpi-sub">${totals.passed}/${totals.completed} completed benchmarks</div>
      </div>
    </div>

    <div class="table-card">
      <h3>Per-Operation Results</h3>
      <table>
        <thead>
          <tr>
            <th>Operation</th>
            <th class="num">Iter</th>
            <th class="num">p50 (ms)</th>
            <th class="num">p95 (ms)</th>
            <th class="num">p99 (ms)</th>
            <th class="num">mean (ms)</th>
            <th class="bar-cell">p95 vs threshold</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${operations
            .map((op) => {
              const cls = statusClass(op);
              const w = barWidth(op.p95);
              const mainRow = `
          <tr>
            <td class="op">${op.operation}</td>
            <td class="num">${op.iterations}</td>
            <td class="num">${fmt(op.p50)}</td>
            <td class="num">${fmt(op.p95)}</td>
            <td class="num">${fmt(op.p99)}</td>
            <td class="num">${fmt(op.mean)}</td>
            <td class="bar-cell"><div class="bar-wrap"><div class="bar ${cls}" style="width: ${w}%"></div></div></td>
            <td class="status ${cls}">${statusIcon(op)} ${cls.toUpperCase()}</td>
          </tr>`;
              if (op.error) {
                const shortErr = op.error.split('\n')[0].slice(0, 260);
                return (
                  mainRow +
                  `
          <tr class="error-row"><td colspan="8"><strong>error:</strong> ${shortErr.replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'))}</td></tr>`
                );
              }
              return mainRow;
            })
            .join('')}
        </tbody>
      </table>
    </div>

    <div class="info-card">
      <h3>Report Information</h3>
      <p><span class="badge">Local Benchmark</span><span class="badge kpi">${kpi}</span></p>
      <p style="margin-top: 0.75rem;">
        This report is produced by
        <code>apps/api/src/shared/performance-benchmark.ts</code> — an in-process
        tRPC caller benchmark measuring per-procedure latency against a seeded
        local Postgres. It is distinct from the k6 CI gate
        (<code>.github/workflows/performance-gate.yml</code>), which measures
        wire-level concurrency thresholds (p95 &le; 200ms under load).
      </p>
      <p style="margin-top: 0.5rem;">
        Regenerate with:
        <code>npx dotenv -e .env.test -- npx tsx apps/api/src/shared/performance-benchmark.ts &amp;&amp; node scripts/ci/generate-trpc-benchmark-report.js</code>
      </p>
    </div>

    <footer>
      IntelliFlow CRM — Governance Dashboard · tRPC Benchmark Artifact
    </footer>
  </div>
</body>
</html>`;

const outputDir = path.join('artifacts', 'benchmarks');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const htmlPath = path.join(outputDir, 'trpc-benchmark-report.html');
fs.writeFileSync(htmlPath, html);

console.log('tRPC benchmark report generated:');
console.log(`  - ${htmlPath}`);
console.log(
  `  Summary: ${totals.passed}/${totals.completed} passed, ${totals.failedKpi} failed KPI, ${totals.errored} errored`
);
