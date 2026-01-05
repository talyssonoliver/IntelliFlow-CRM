#!/usr/bin/env node
/**
 * Lighthouse Report Generator
 *
 * Generates HTML and JSON summary reports from Lighthouse CI manifest.
 * Used in CI/CD pipeline to create artifacts for Governance dashboard.
 *
 * @see IFC-090 - Contact 360 View (lighthouse-360-report.html)
 */

const fs = require('fs');
const path = require('path');

const manifestPath = process.argv[2];
const prNumber = process.argv[3] || 'N/A';

if (!manifestPath || !fs.existsSync(manifestPath)) {
  console.error('Usage: generate-lighthouse-report.js <manifest.json> [pr-number]');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const results = Array.isArray(manifest) ? manifest[0] : manifest;
const summary = results.summary || {};

const scores = {
  performance: Math.round((summary.performance || 0) * 100),
  accessibility: Math.round((summary.accessibility || 0) * 100),
  bestPractices: Math.round((summary['best-practices'] || 0) * 100),
  seo: Math.round((summary.seo || 0) * 100)
};

const getScoreClass = (score) => score >= 90 ? 'good' : score >= 50 ? 'average' : 'poor';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lighthouse Report - IntelliFlow CRM</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --accent: #3b82f6;
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
    .scores {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    .score-card {
      background: var(--card);
      border-radius: 16px;
      padding: 2rem;
      text-align: center;
      transition: transform 0.2s;
    }
    .score-card:hover { transform: translateY(-4px); }
    .score-ring {
      width: 120px;
      height: 120px;
      margin: 0 auto 1rem;
      position: relative;
    }
    .score-ring svg { transform: rotate(-90deg); }
    .score-ring circle {
      fill: none;
      stroke-width: 8;
      stroke-linecap: round;
    }
    .score-ring .bg { stroke: #334155; }
    .score-ring .progress { transition: stroke-dashoffset 0.5s ease-out; }
    .score-ring .progress.good { stroke: var(--good); }
    .score-ring .progress.average { stroke: var(--average); }
    .score-ring .progress.poor { stroke: var(--poor); }
    .score-value {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 2rem;
      font-weight: bold;
    }
    .score-value.good { color: var(--good); }
    .score-value.average { color: var(--average); }
    .score-value.poor { color: var(--poor); }
    .score-label { color: var(--text-muted); font-weight: 500; }
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
    .badge.ci { background: #3b82f6; color: #fff; }
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
      <h1>Lighthouse Performance Report</h1>
      <p class="meta">
        <span>Generated: ${new Date().toISOString()}</span>
        <span>PR: #${prNumber}</span>
        <span>URL: ${results.url || 'N/A'}</span>
      </p>
    </header>

    <div class="scores">
      ${Object.entries({ Performance: scores.performance, Accessibility: scores.accessibility, 'Best Practices': scores.bestPractices, SEO: scores.seo })
        .map(([label, score]) => {
          const circumference = 2 * Math.PI * 52;
          const offset = circumference - (score / 100) * circumference;
          return `
      <div class="score-card">
        <div class="score-ring">
          <svg width="120" height="120">
            <circle class="bg" cx="60" cy="60" r="52"></circle>
            <circle class="progress ${getScoreClass(score)}" cx="60" cy="60" r="52"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${offset}"></circle>
          </svg>
          <span class="score-value ${getScoreClass(score)}">${score}</span>
        </div>
        <div class="score-label">${label}</div>
      </div>`;
        }).join('')}
    </div>

    <div class="info-card">
      <h3>Report Information</h3>
      <p><span class="badge ci">CI Generated</span></p>
      <p style="margin-top: 0.5rem;">
        This report was automatically generated by the CI/CD pipeline using Lighthouse CI.
        Results are based on ${results.runs || 3} test runs against the preview deployment.
      </p>
    </div>

    <footer>
      IntelliFlow CRM - Governance Dashboard | Generated by GitHub Actions
    </footer>
  </div>
</body>
</html>`;

// Ensure output directory exists
const outputDir = 'artifacts/lighthouse';
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Write HTML report
fs.writeFileSync(path.join(outputDir, 'lighthouse-report.html'), html);

// Write JSON summary for API consumption
const jsonSummary = {
  generatedAt: new Date().toISOString(),
  source: 'ci',
  prNumber,
  url: results.url || 'N/A',
  scores,
  thresholds: {
    performance: 90,
    accessibility: 90,
    bestPractices: 90,
    seo: 90
  },
  passed: Object.values(scores).every(s => s >= 90)
};

fs.writeFileSync(
  path.join(outputDir, 'lighthouse-summary.json'),
  JSON.stringify(jsonSummary, null, 2)
);

console.log('Lighthouse reports generated:');
console.log(`  - ${outputDir}/lighthouse-report.html`);
console.log(`  - ${outputDir}/lighthouse-summary.json`);
console.log(`Scores: Performance=${scores.performance}, Accessibility=${scores.accessibility}, Best Practices=${scores.bestPractices}, SEO=${scores.seo}`);
