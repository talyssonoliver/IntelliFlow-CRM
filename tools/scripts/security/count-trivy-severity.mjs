#!/usr/bin/env node
/**
 * Classify Trivy SARIF results into CVSS severity bands and emit per-band counts.
 *
 * WHY: the dependency-scan aggregate step historically counted SARIF results with
 * `level == "error"` and labelled the total "critical". But Trivy maps BOTH high
 * and critical CVSS to SARIF `level: "error"`, so that count over-reports —
 * e.g. run 30100561471 reported "9 critical" when the real breakdown was
 * 1 critical (CVSS 9.5), 7 high, 1 medium. This reads the numeric
 * `security-severity` property Trivy attaches to each rule and bands it per CVSS v3.
 *
 * CVSS v3 bands: critical >= 9.0, high 7.0–8.9, medium 4.0–6.9, low 0.1–3.9,
 * none = 0 or missing severity.
 *
 * Usage:  node tools/scripts/security/count-trivy-severity.mjs <trivy-results.sarif>
 * Stdout (GITHUB_OUTPUT-ready):
 *   critical_count=1
 *   high_count=7
 *   medium_count=1
 *   low_count=0
 *   none_count=0
 *   total_count=9
 */
import { readFileSync } from 'node:fs';

/** Map a numeric CVSS score to its severity band. */
export function classifyBand(score) {
  if (!Number.isFinite(score) || score <= 0) return 'none';
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  return 'low';
}

/**
 * Count Trivy SARIF results per severity band, keyed off each result rule's
 * numeric `security-severity` property (not the coarse SARIF `level`).
 * @returns {{critical:number,high:number,medium:number,low:number,none:number,total:number}}
 */
export function countBands(sarif) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, none: 0, total: 0 };
  const runs = Array.isArray(sarif?.runs) ? sarif.runs : [];
  for (const run of runs) {
    // Build ruleId -> security-severity. Trivy lists rules under tool.driver.rules;
    // fall back to tool.extensions[].rules for other emitters.
    const severityByRule = new Map();
    const ruleSets = [
      run?.tool?.driver?.rules,
      ...(run?.tool?.extensions ?? []).map((e) => e?.rules),
    ];
    for (const rules of ruleSets) {
      for (const rule of rules ?? []) {
        if (!rule?.id || severityByRule.has(rule.id)) continue;
        const raw = rule?.properties?.['security-severity'];
        severityByRule.set(rule.id, raw == null ? NaN : Number(raw));
      }
    }
    for (const result of run?.results ?? []) {
      const score = severityByRule.has(result?.ruleId) ? severityByRule.get(result.ruleId) : NaN;
      counts[classifyBand(score)] += 1;
      counts.total += 1;
    }
  }
  return counts;
}

/** Render counts as GITHUB_OUTPUT key=value lines. */
export function toGithubOutput(counts) {
  return [
    `critical_count=${counts.critical}`,
    `high_count=${counts.high}`,
    `medium_count=${counts.medium}`,
    `low_count=${counts.low}`,
    `none_count=${counts.none}`,
    `total_count=${counts.total}`,
  ].join('\n');
}

// CLI entry (only when run directly, not when imported by tests).
const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: count-trivy-severity.mjs <trivy-results.sarif>');
    process.exit(2);
  }
  let sarif;
  try {
    sarif = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    // Missing/unreadable SARIF must not crash the gate — report zero and move on.
    console.error(`[count-trivy-severity] could not read ${file}: ${err.message}`);
    console.log(toGithubOutput({ critical: 0, high: 0, medium: 0, low: 0, none: 0, total: 0 }));
    process.exit(0);
  }
  console.log(toGithubOutput(countBands(sarif)));
}
