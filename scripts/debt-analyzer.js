#!/usr/bin/env node

/**
 * Dynamic Debt Analyzer
 *
 * Reads debt-ledger.yaml and generates fresh trending analysis.
 * Designed for continuous quality metrics with RSI (Recursive Self-Improvement).
 *
 * Usage:
 *   node scripts/debt-analyzer.js              # Output to stdout
 *   node scripts/debt-analyzer.js --json       # JSON output
 *   node scripts/debt-analyzer.js --save       # Save to artifacts
 *   node scripts/debt-analyzer.js --action-items  # Generate action items
 *
 * Integrates with:
 *   - apps/project-tracker/app/api/code-analysis/route.ts
 *   - apps/web/src/app/governance/quality-reports/
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const DEBT_LEDGER_PATH = join(PROJECT_ROOT, 'docs', 'debt-ledger.yaml');
const OUTPUT_DIR = join(PROJECT_ROOT, 'artifacts', 'reports', 'code-analysis');
const DEBT_OUTPUT = join(OUTPUT_DIR, 'debt-analysis.json');
const HISTORY_FILE = join(OUTPUT_DIR, 'debt-history.json');

/**
 * Load and parse debt ledger
 */
function loadDebtLedger() {
  if (!existsSync(DEBT_LEDGER_PATH)) {
    return { items: {}, summary: { total_items: 0, by_severity: {}, by_status: {} } };
  }

  try {
    const content = readFileSync(DEBT_LEDGER_PATH, 'utf-8');
    return parseYaml(content);
  } catch (error) {
    console.error('Failed to parse debt-ledger.yaml:', error.message);
    return { items: {}, summary: { total_items: 0, by_severity: {}, by_status: {} } };
  }
}

/**
 * Load historical debt data for trending
 */
function loadHistory() {
  if (!existsSync(HISTORY_FILE)) {
    return { snapshots: [] };
  }

  try {
    return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
  } catch {
    return { snapshots: [] };
  }
}

/**
 * Save snapshot to history for trending
 */
function saveSnapshot(analysis) {
  const history = loadHistory();
  const today = new Date().toISOString().split('T')[0];

  // Only keep one snapshot per day
  const existingIndex = history.snapshots.findIndex(s => s.date === today);
  const snapshot = {
    date: today,
    timestamp: new Date().toISOString(),
    totals: analysis.summary,
    bySeverity: analysis.bySeverity,
    byOwner: analysis.byOwner
  };

  if (existingIndex >= 0) {
    history.snapshots[existingIndex] = snapshot;
  } else {
    history.snapshots.push(snapshot);
  }

  // Keep last 90 days of history
  history.snapshots = history.snapshots
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 90);

  mkdirSync(dirname(HISTORY_FILE), { recursive: true });
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

  return history;
}

/**
 * Analyze debt ledger and generate metrics
 */
function analyzeDebt() {
  const ledger = loadDebtLedger();
  const items = ledger.items || {};
  const now = new Date();

  // Categorize items
  const byStatus = { open: [], in_progress: [], resolved: [], wont_fix: [] };
  const bySeverity = { critical: [], high: [], medium: [], low: [] };
  const byOwner = {};
  const expiringSoon = [];
  const overdue = [];

  for (const [id, item] of Object.entries(items)) {
    const status = item.status || 'open';
    const severity = item.severity || 'medium';
    const owner = item.owner || 'Unassigned';

    // By status
    if (byStatus[status]) {
      byStatus[status].push({ id, ...item });
    }

    // By severity
    if (bySeverity[severity]) {
      bySeverity[severity].push({ id, ...item });
    }

    // By owner
    if (!byOwner[owner]) {
      byOwner[owner] = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
    }
    byOwner[owner][severity] = (byOwner[owner][severity] || 0) + 1;
    byOwner[owner].total++;

    // Check expiry
    if (item.expiry_date) {
      const expiry = new Date(item.expiry_date);
      const daysUntilExpiry = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry < 0 && status !== 'resolved' && status !== 'wont_fix') {
        overdue.push({ id, ...item, daysOverdue: Math.abs(daysUntilExpiry) });
      } else if (daysUntilExpiry <= 30 && daysUntilExpiry >= 0 && status !== 'resolved' && status !== 'wont_fix') {
        expiringSoon.push({ id, ...item, daysUntilExpiry });
      }
    }
  }

  // Calculate health score (0-100)
  const totalItems = Object.keys(items).length;
  const criticalCount = bySeverity.critical.length;
  const overdueCount = overdue.length;
  const resolvedCount = byStatus.resolved.length;

  let healthScore = 100;
  healthScore -= criticalCount * 5;  // -5 per critical
  healthScore -= overdueCount * 10;  // -10 per overdue
  healthScore -= bySeverity.high?.length * 2 || 0;  // -2 per high
  healthScore += resolvedCount * 2;  // +2 per resolved
  healthScore = Math.max(0, Math.min(100, healthScore));

  // Determine status
  let status = 'healthy';
  if (criticalCount > 0 || overdueCount > 0) status = 'critical';
  else if (bySeverity.high?.length > 5) status = 'warning';
  else if (totalItems > 30) status = 'attention';

  const analysis = {
    timestamp: new Date().toISOString(),
    status,
    healthScore,
    summary: {
      total: totalItems,
      open: byStatus.open.length,
      inProgress: byStatus.in_progress.length,
      resolved: byStatus.resolved.length,
      critical: criticalCount,
      overdue: overdueCount,
      expiringSoon: expiringSoon.length
    },
    bySeverity: {
      critical: bySeverity.critical.length,
      high: bySeverity.high?.length || 0,
      medium: bySeverity.medium.length,
      low: bySeverity.low.length
    },
    byOwner,
    criticalItems: bySeverity.critical.map(i => ({
      id: i.id,
      description: i.description?.split('\n')[0] || 'No description',
      owner: i.owner,
      expiry: i.expiry_date,
      origin: i.origin_task
    })),
    overdueItems: overdue.sort((a, b) => b.daysOverdue - a.daysOverdue),
    expiringSoonItems: expiringSoon.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry),
    actionItems: generateActionItems(bySeverity, overdue, expiringSoon)
  };

  return analysis;
}

/**
 * Generate dynamic action items based on current state
 */
function generateActionItems(bySeverity, overdue, expiringSoon) {
  const immediate = [];
  const shortTerm = [];
  const longTerm = [];

  // Overdue items are immediate priority
  for (const item of overdue.slice(0, 5)) {
    immediate.push({
      priority: 'critical',
      task: `Resolve overdue debt: ${item.id}`,
      description: item.description?.split('\n')[0] || 'No description',
      owner: item.owner,
      daysOverdue: item.daysOverdue
    });
  }

  // Critical items not overdue
  for (const item of bySeverity.critical.filter(i => !overdue.find(o => o.id === i.id)).slice(0, 5)) {
    immediate.push({
      priority: 'high',
      task: `Address critical debt: ${item.id}`,
      description: item.description?.split('\n')[0] || 'No description',
      owner: item.owner,
      expiry: item.expiry_date
    });
  }

  // Expiring soon items
  for (const item of expiringSoon.slice(0, 5)) {
    shortTerm.push({
      priority: 'medium',
      task: `Resolve before expiry: ${item.id}`,
      description: item.description?.split('\n')[0] || 'No description',
      owner: item.owner,
      daysUntilExpiry: item.daysUntilExpiry
    });
  }

  // High severity items
  for (const item of (bySeverity.high || []).slice(0, 3)) {
    shortTerm.push({
      priority: 'medium',
      task: `Plan remediation: ${item.id}`,
      description: item.description?.split('\n')[0] || 'No description',
      owner: item.owner
    });
  }

  // Medium severity items for long-term
  for (const item of bySeverity.medium.slice(0, 5)) {
    longTerm.push({
      priority: 'low',
      task: `Schedule fix: ${item.id}`,
      description: item.description?.split('\n')[0] || 'No description',
      owner: item.owner
    });
  }

  return { immediate, shortTerm, longTerm };
}

/**
 * Calculate trending from history
 */
function calculateTrending(analysis) {
  const history = loadHistory();
  const snapshots = history.snapshots || [];

  if (snapshots.length < 2) {
    return { trend: 'stable', change: 0, history: [] };
  }

  const recent = snapshots.slice(0, 7);  // Last 7 days
  const current = analysis.summary.total;
  const previous = recent[1]?.totals?.total || current;

  const change = current - previous;
  let trend = 'stable';
  if (change > 2) trend = 'increasing';
  else if (change < -2) trend = 'decreasing';

  return {
    trend,
    change,
    percentChange: previous > 0 ? ((change / previous) * 100).toFixed(1) : 0,
    history: recent.map(s => ({
      date: s.date,
      total: s.totals?.total || 0,
      critical: s.bySeverity?.critical || 0
    }))
  };
}

/**
 * Main analysis function
 */
function runAnalysis(options = {}) {
  const analysis = analyzeDebt();
  const history = saveSnapshot(analysis);
  const trending = calculateTrending(analysis);

  const result = {
    ...analysis,
    trending,
    generatedAt: new Date().toISOString(),
    source: 'debt-analyzer',
    version: '1.0.0'
  };

  if (options.save) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(DEBT_OUTPUT, JSON.stringify(result, null, 2));
    console.log(`Saved to ${DEBT_OUTPUT}`);
  }

  return result;
}

// CLI handling
const args = process.argv.slice(2);
const options = {
  json: args.includes('--json'),
  save: args.includes('--save'),
  actionItems: args.includes('--action-items')
};

const result = runAnalysis(options);

if (options.actionItems) {
  console.log('\n=== IMMEDIATE ACTION ITEMS ===\n');
  for (const item of result.actionItems.immediate) {
    console.log(`[${item.priority.toUpperCase()}] ${item.task}`);
    console.log(`  Owner: ${item.owner}`);
    if (item.daysOverdue) console.log(`  OVERDUE by ${item.daysOverdue} days`);
    console.log();
  }

  console.log('\n=== SHORT-TERM (Next 2 Sprints) ===\n');
  for (const item of result.actionItems.shortTerm) {
    console.log(`[${item.priority.toUpperCase()}] ${item.task}`);
    console.log(`  Owner: ${item.owner}`);
    if (item.daysUntilExpiry) console.log(`  Expires in ${item.daysUntilExpiry} days`);
    console.log();
  }
} else if (options.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('\n=== DEBT ANALYSIS SUMMARY ===\n');
  console.log(`Health Score: ${result.healthScore}/100 (${result.status})`);
  console.log(`Total Items: ${result.summary.total}`);
  console.log(`  Critical: ${result.summary.critical}`);
  console.log(`  Overdue: ${result.summary.overdue}`);
  console.log(`  Expiring Soon: ${result.summary.expiringSoon}`);
  console.log(`\nTrend: ${result.trending.trend} (${result.trending.change >= 0 ? '+' : ''}${result.trending.change})`);

  if (result.criticalItems.length > 0) {
    console.log('\n=== CRITICAL ITEMS ===\n');
    for (const item of result.criticalItems.slice(0, 5)) {
      console.log(`- ${item.id}: ${item.description}`);
      console.log(`  Owner: ${item.owner}`);
    }
  }
}

// Export for programmatic use
export { runAnalysis, analyzeDebt, loadDebtLedger, calculateTrending };
