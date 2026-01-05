#!/usr/bin/env node

/**
 * SonarQube Live Metrics Fetcher
 *
 * Queries SonarQube API for real-time quality metrics.
 * Falls back to cached data if SonarQube is unavailable.
 *
 * Usage:
 *   node scripts/sonarqube-metrics.js              # Fetch metrics
 *   node scripts/sonarqube-metrics.js --json       # JSON output
 *   node scripts/sonarqube-metrics.js --save       # Save to artifacts
 *   node scripts/sonarqube-metrics.js --gate       # Check quality gate only
 *
 * Environment:
 *   SONAR_HOST_URL - SonarQube server URL (default: http://localhost:9000)
 *   SONAR_TOKEN - Authentication token
 *   SONAR_PROJECT_KEY - Project key (default: IntelliFlow)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const OUTPUT_DIR = join(PROJECT_ROOT, 'artifacts', 'reports', 'code-analysis');
const METRICS_OUTPUT = join(OUTPUT_DIR, 'sonarqube-metrics.json');
const HISTORY_FILE = join(OUTPUT_DIR, 'sonarqube-history.json');

// Load .env.local
function loadEnv() {
  const envPath = join(PROJECT_ROOT, '.env.local');
  if (!existsSync(envPath)) return;

  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const raw = line.trim();
      if (!raw || raw.startsWith('#')) continue;
      const normalized = raw.startsWith('export ') ? raw.slice(7).trim() : raw;
      const idx = normalized.indexOf('=');
      if (idx <= 0) continue;
      const key = normalized.slice(0, idx).trim();
      let value = normalized.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch { /* ignore */ }
}

loadEnv();

const SONAR_HOST = process.env.SONAR_HOST_URL || 'http://localhost:9000';
const SONAR_TOKEN = process.env.SONAR_TOKEN;
const PROJECT_KEY = process.env.SONAR_PROJECT_KEY || 'IntelliFlow';

/**
 * Check if SonarQube is available
 */
async function checkSonarHealth() {
  try {
    const response = await fetch(`${SONAR_HOST}/api/system/status`, {
      method: 'GET',
      headers: SONAR_TOKEN ? { 'Authorization': `Bearer ${SONAR_TOKEN}` } : {}
    });
    if (!response.ok) return { available: false, reason: `HTTP ${response.status}` };
    const data = await response.json();
    return { available: data.status === 'UP', version: data.version, status: data.status };
  } catch (error) {
    return { available: false, reason: error.message };
  }
}

/**
 * Fetch project metrics from SonarQube
 */
async function fetchMetrics() {
  const metricKeys = [
    'bugs', 'vulnerabilities', 'code_smells', 'security_hotspots',
    'coverage', 'duplicated_lines_density', 'ncloc', 'complexity',
    'reliability_rating', 'security_rating', 'sqale_rating',
    'sqale_debt_ratio', 'alert_status', 'quality_gate_details'
  ].join(',');

  try {
    const response = await fetch(
      `${SONAR_HOST}/api/measures/component?component=${PROJECT_KEY}&metricKeys=${metricKeys}`,
      {
        method: 'GET',
        headers: SONAR_TOKEN ? { 'Authorization': `Bearer ${SONAR_TOKEN}` } : {}
      }
    );

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const measures = {};

    for (const measure of data.component?.measures || []) {
      measures[measure.metric] = measure.value;
    }

    return { success: true, measures };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Fetch quality gate status
 */
async function fetchQualityGate() {
  try {
    const response = await fetch(
      `${SONAR_HOST}/api/qualitygates/project_status?projectKey=${PROJECT_KEY}`,
      {
        method: 'GET',
        headers: SONAR_TOKEN ? { 'Authorization': `Bearer ${SONAR_TOKEN}` } : {}
      }
    );

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return {
      success: true,
      status: data.projectStatus?.status || 'UNKNOWN',
      conditions: data.projectStatus?.conditions || []
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Fetch recent issues
 */
async function fetchIssues(severity = 'CRITICAL,BLOCKER') {
  try {
    const response = await fetch(
      `${SONAR_HOST}/api/issues/search?componentKeys=${PROJECT_KEY}&severities=${severity}&statuses=OPEN,CONFIRMED&ps=10`,
      {
        method: 'GET',
        headers: SONAR_TOKEN ? { 'Authorization': `Bearer ${SONAR_TOKEN}` } : {}
      }
    );

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return {
      success: true,
      total: data.total || 0,
      issues: (data.issues || []).map(i => ({
        key: i.key,
        severity: i.severity,
        type: i.type,
        message: i.message,
        component: i.component?.split(':').pop(),
        line: i.line
      }))
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Convert SonarQube rating (1-5) to letter grade
 */
function ratingToGrade(rating) {
  const grades = { '1.0': 'A', '2.0': 'B', '3.0': 'C', '4.0': 'D', '5.0': 'E' };
  return grades[rating] || rating;
}

/**
 * Load cached metrics
 */
function loadCache() {
  if (!existsSync(METRICS_OUTPUT)) return null;
  try {
    return JSON.parse(readFileSync(METRICS_OUTPUT, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Save metrics to history
 */
function saveToHistory(metrics) {
  let history = { snapshots: [] };
  if (existsSync(HISTORY_FILE)) {
    try {
      history = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
    } catch { /* ignore */ }
  }

  const today = new Date().toISOString().split('T')[0];
  const snapshot = {
    date: today,
    timestamp: new Date().toISOString(),
    bugs: metrics.bugs,
    vulnerabilities: metrics.vulnerabilities,
    codeSmells: metrics.codeSmells,
    coverage: metrics.coverage,
    debtRatio: metrics.debtRatio,
    gateStatus: metrics.qualityGate?.status
  };

  const existingIndex = history.snapshots.findIndex(s => s.date === today);
  if (existingIndex >= 0) {
    history.snapshots[existingIndex] = snapshot;
  } else {
    history.snapshots.push(snapshot);
  }

  history.snapshots = history.snapshots
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 90);

  mkdirSync(dirname(HISTORY_FILE), { recursive: true });
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

  return history;
}

/**
 * Calculate trending from history
 */
function calculateTrending(metrics) {
  let history = { snapshots: [] };
  if (existsSync(HISTORY_FILE)) {
    try {
      history = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
    } catch { /* ignore */ }
  }

  const snapshots = history.snapshots || [];
  if (snapshots.length < 2) {
    return { trend: 'stable', bugChange: 0, vulnerabilityChange: 0, history: [] };
  }

  const recent = snapshots.slice(0, 7);
  const current = {
    bugs: parseInt(metrics.bugs) || 0,
    vulnerabilities: parseInt(metrics.vulnerabilities) || 0
  };
  const previous = {
    bugs: recent[1]?.bugs || current.bugs,
    vulnerabilities: recent[1]?.vulnerabilities || current.vulnerabilities
  };

  const bugChange = current.bugs - previous.bugs;
  const vulnChange = current.vulnerabilities - previous.vulnerabilities;

  let trend = 'stable';
  if (bugChange > 0 || vulnChange > 0) trend = 'degrading';
  else if (bugChange < 0 || vulnChange < 0) trend = 'improving';

  return {
    trend,
    bugChange,
    vulnerabilityChange: vulnChange,
    history: recent.map(s => ({
      date: s.date,
      bugs: s.bugs,
      vulnerabilities: s.vulnerabilities,
      coverage: s.coverage
    }))
  };
}

/**
 * Main function to fetch all metrics
 */
async function fetchAllMetrics(options = {}) {
  const health = await checkSonarHealth();

  if (!health.available) {
    const cached = loadCache();
    if (cached) {
      return {
        ...cached,
        source: 'cache',
        sonarAvailable: false,
        reason: health.reason,
        cachedAt: cached.timestamp
      };
    }

    return {
      success: false,
      sonarAvailable: false,
      reason: health.reason,
      message: 'SonarQube unavailable and no cached data. Run `node scripts/sonarqube-helper.js start` to start SonarQube.',
      timestamp: new Date().toISOString()
    };
  }

  const [metricsResult, gateResult, issuesResult] = await Promise.all([
    fetchMetrics(),
    fetchQualityGate(),
    fetchIssues()
  ]);

  if (!metricsResult.success) {
    return {
      success: false,
      sonarAvailable: true,
      error: metricsResult.error,
      timestamp: new Date().toISOString()
    };
  }

  const m = metricsResult.measures;
  const metrics = {
    success: true,
    sonarAvailable: true,
    sonarVersion: health.version,
    projectKey: PROJECT_KEY,
    timestamp: new Date().toISOString(),
    source: 'live',

    // Raw metrics
    bugs: parseInt(m.bugs) || 0,
    vulnerabilities: parseInt(m.vulnerabilities) || 0,
    codeSmells: parseInt(m.code_smells) || 0,
    securityHotspots: parseInt(m.security_hotspots) || 0,
    coverage: parseFloat(m.coverage) || 0,
    duplications: parseFloat(m.duplicated_lines_density) || 0,
    linesOfCode: parseInt(m.ncloc) || 0,
    complexity: parseInt(m.complexity) || 0,

    // Ratings
    reliabilityRating: ratingToGrade(m.reliability_rating),
    securityRating: ratingToGrade(m.security_rating),
    maintainabilityRating: ratingToGrade(m.sqale_rating),
    debtRatio: parseFloat(m.sqale_debt_ratio) || 0,

    // Quality Gate
    qualityGate: gateResult.success ? {
      status: gateResult.status,
      passed: gateResult.status === 'OK',
      conditions: gateResult.conditions.map(c => ({
        metric: c.metricKey,
        status: c.status,
        actual: c.actualValue,
        threshold: c.errorThreshold
      }))
    } : { status: 'UNKNOWN', passed: false },

    // Critical/Blocker issues
    criticalIssues: issuesResult.success ? {
      total: issuesResult.total,
      issues: issuesResult.issues
    } : { total: 0, issues: [] },

    // Health score calculation
    healthScore: calculateHealthScore(m, gateResult),

    // Compliance with quality-gate-config.json
    compliance: checkCompliance(m, gateResult)
  };

  // Add trending
  metrics.trending = calculateTrending(metrics);

  // Save to cache and history
  if (options.save !== false) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(METRICS_OUTPUT, JSON.stringify(metrics, null, 2));
    saveToHistory(metrics);
  }

  return metrics;
}

/**
 * Calculate health score (0-100)
 */
function calculateHealthScore(measures, gateResult) {
  let score = 100;

  // Bugs penalty
  const bugs = parseInt(measures.bugs) || 0;
  score -= bugs * 2;

  // Vulnerabilities penalty (severe)
  const vulns = parseInt(measures.vulnerabilities) || 0;
  score -= vulns * 5;

  // Security hotspots penalty
  const hotspots = parseInt(measures.security_hotspots) || 0;
  score -= hotspots;

  // Debt ratio penalty
  const debtRatio = parseFloat(measures.sqale_debt_ratio) || 0;
  if (debtRatio > 5) score -= (debtRatio - 5) * 2;

  // Coverage bonus
  const coverage = parseFloat(measures.coverage) || 0;
  if (coverage >= 90) score += 5;
  else if (coverage < 80) score -= (80 - coverage) / 2;

  // Quality gate bonus/penalty
  if (gateResult.status === 'OK') score += 10;
  else if (gateResult.status === 'ERROR') score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Check compliance with quality-gate-config.json
 */
function checkCompliance(measures, gateResult) {
  const configPath = join(PROJECT_ROOT, 'artifacts', 'misc', 'quality-gate-config.json');
  let config = null;

  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch { /* ignore */ }
  }

  if (!config) {
    return { configured: false, message: 'quality-gate-config.json not found' };
  }

  const thresholds = config.thresholds || {};
  const violations = [];

  // Check debt ratio
  const debtRatio = parseFloat(measures.sqale_debt_ratio) || 0;
  if (debtRatio > (thresholds.technicalDebtRatioMax || 3)) {
    violations.push({
      metric: 'technicalDebtRatio',
      actual: debtRatio,
      threshold: thresholds.technicalDebtRatioMax || 3,
      message: `Debt ratio ${debtRatio}% exceeds max ${thresholds.technicalDebtRatioMax || 3}%`
    });
  }

  // Check coverage
  const coverage = parseFloat(measures.coverage) || 0;
  if (coverage < (thresholds.coverageMinOverall || 90)) {
    violations.push({
      metric: 'coverageOverall',
      actual: coverage,
      threshold: thresholds.coverageMinOverall || 90,
      message: `Coverage ${coverage}% below min ${thresholds.coverageMinOverall || 90}%`
    });
  }

  return {
    configured: true,
    compliant: violations.length === 0,
    violations,
    checkedAt: new Date().toISOString()
  };
}

// CLI handling
const args = process.argv.slice(2);
const options = {
  json: args.includes('--json'),
  save: args.includes('--save'),
  gate: args.includes('--gate')
};

(async () => {
  if (options.gate) {
    const health = await checkSonarHealth();
    if (!health.available) {
      console.log('SonarQube unavailable');
      process.exit(1);
    }
    const gate = await fetchQualityGate();
    if (options.json) {
      console.log(JSON.stringify(gate, null, 2));
    } else {
      console.log(`Quality Gate: ${gate.status}`);
      if (gate.conditions) {
        for (const c of gate.conditions) {
          const icon = c.status === 'OK' ? '✓' : '✗';
          console.log(`  ${icon} ${c.metricKey}: ${c.actualValue} (threshold: ${c.errorThreshold})`);
        }
      }
    }
    process.exit(gate.status === 'OK' ? 0 : 1);
  }

  const metrics = await fetchAllMetrics({ save: options.save });

  if (options.json) {
    console.log(JSON.stringify(metrics, null, 2));
  } else {
    console.log('\n=== SONARQUBE METRICS ===\n');

    if (!metrics.sonarAvailable) {
      console.log(`Status: OFFLINE (${metrics.reason})`);
      if (metrics.source === 'cache') {
        console.log(`Using cached data from: ${metrics.cachedAt}`);
      }
    } else {
      console.log(`Status: ONLINE (${metrics.sonarVersion})`);
    }

    if (metrics.success) {
      console.log(`\nHealth Score: ${metrics.healthScore}/100`);
      console.log(`Quality Gate: ${metrics.qualityGate?.status} ${metrics.qualityGate?.passed ? '✓' : '✗'}`);
      console.log(`\nMetrics:`);
      console.log(`  Bugs: ${metrics.bugs}`);
      console.log(`  Vulnerabilities: ${metrics.vulnerabilities}`);
      console.log(`  Code Smells: ${metrics.codeSmells}`);
      console.log(`  Coverage: ${metrics.coverage}%`);
      console.log(`  Duplications: ${metrics.duplications}%`);
      console.log(`  Debt Ratio: ${metrics.debtRatio}%`);
      console.log(`\nRatings:`);
      console.log(`  Reliability: ${metrics.reliabilityRating}`);
      console.log(`  Security: ${metrics.securityRating}`);
      console.log(`  Maintainability: ${metrics.maintainabilityRating}`);
      console.log(`\nTrend: ${metrics.trending?.trend}`);

      if (!metrics.compliance?.compliant && metrics.compliance?.violations?.length > 0) {
        console.log(`\nCompliance Violations:`);
        for (const v of metrics.compliance.violations) {
          console.log(`  ✗ ${v.message}`);
        }
      }
    }
  }
})();

// Export for programmatic use
export { fetchAllMetrics, checkSonarHealth, fetchQualityGate, fetchMetrics };
