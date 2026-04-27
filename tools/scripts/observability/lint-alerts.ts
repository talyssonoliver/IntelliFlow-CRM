#!/usr/bin/env tsx
/**
 * IFC-032 — Validate the Grafana alert provisioning YAML at
 * `infra/monitoring/grafana/provisioning/alerting/intelliflow-rules.yaml`.
 *
 * Asserts:
 *   • apiVersion === 1
 *   • exactly one group named "intelliflow-workflows"
 *   • the four required rules are present with the correct titles + threshold
 *     values (or matching expr fragments where threshold is implicit).
 *
 * Exit codes:
 *   0 — file conforms to the IFC-032 alert contract
 *   1 — any check failed (prints concrete diff to stderr)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const RULES_PATH = resolve(
  REPO_ROOT,
  'infra',
  'monitoring',
  'grafana',
  'provisioning',
  'alerting',
  'intelliflow-rules.yaml'
);

interface RuleExpectation {
  title: string;
  /**
   * Required substring that must appear in the rule's expr (proves the right
   * Prometheus metric is being queried). The threshold for numeric rules is
   * embedded in the expr itself (e.g. `expr ... > 0.01`) and verified by
   * `exprThresholdRegex` below — we deliberately do NOT rely on a top-level
   * `threshold:` metadata field, which some Grafana provisioning surfaces
   * ignore at evaluation time.
   */
  exprFragment: string;
  /**
   * Regex that must match the rule's expr text. For numeric rules, encodes the
   * threshold operator + value (e.g. `> 0.01`). For OtelCollectorDown the
   * threshold is implicit in `absent_over_time` (any non-empty result fires).
   */
  exprThresholdRegex: RegExp;
  severity: 'warning' | 'critical';
}

const REQUIRED_RULES: RuleExpectation[] = [
  {
    title: 'WorkflowErrorRateHigh',
    exprFragment: 'otelcol_processor_errors_total',
    exprThresholdRegex: />\s*0\.01\b/,
    severity: 'warning',
  },
  {
    title: 'WorkflowP95LatencyHigh',
    exprFragment: 'histogram_quantile(0.95',
    exprThresholdRegex: />\s*500\b/,
    severity: 'warning',
  },
  {
    title: 'OtelCollectorDown',
    exprFragment: 'absent_over_time',
    // absent_over_time inherently fires when result is non-empty — no inline
    // numeric threshold required.
    exprThresholdRegex: /absent_over_time\s*\(/,
    severity: 'critical',
  },
  {
    title: 'LeadRoutingFailures',
    exprFragment: 'STATUS_CODE_ERROR',
    exprThresholdRegex: />\s*5\b/,
    severity: 'warning',
  },
];

interface AlertRule {
  uid?: string;
  title?: string;
  data?: Array<{ model?: { expr?: string } }>;
  labels?: Record<string, string>;
}

interface AlertGroup {
  name?: string;
  rules?: AlertRule[];
}

interface AlertFile {
  apiVersion?: number;
  groups?: AlertGroup[];
}

export function lintAlertsContent(rawYaml: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  let parsed: AlertFile;
  try {
    parsed = yaml.load(rawYaml) as AlertFile;
  } catch (err) {
    return { ok: false, errors: [`YAML parse error: ${(err as Error).message}`] };
  }

  if (parsed?.apiVersion !== 1) {
    errors.push(`apiVersion must be 1 (got ${parsed?.apiVersion})`);
  }
  if (!Array.isArray(parsed?.groups) || parsed.groups.length !== 1) {
    errors.push(
      `Expected exactly 1 group, got ${Array.isArray(parsed?.groups) ? parsed.groups.length : 'none'}`
    );
    return { ok: false, errors };
  }

  const group = parsed.groups[0];
  if (group.name !== 'intelliflow-workflows') {
    errors.push(`group.name must be "intelliflow-workflows" (got "${group.name}")`);
  }
  const rules = group.rules ?? [];
  const titles = rules.map((r) => r.title ?? '').filter(Boolean);

  for (const expected of REQUIRED_RULES) {
    const actual = rules.find((r) => r.title === expected.title);
    if (!actual) {
      errors.push(`Missing required rule "${expected.title}"`);
      continue;
    }
    const exprs = (actual.data ?? []).map((d) => d.model?.expr ?? '').join(' ');
    if (!exprs.includes(expected.exprFragment)) {
      errors.push(
        `Rule "${expected.title}" expr does not contain expected fragment "${expected.exprFragment}"`
      );
    }
    if (!expected.exprThresholdRegex.test(exprs)) {
      errors.push(
        `Rule "${expected.title}" expr does not match expected threshold regex ${expected.exprThresholdRegex} — threshold must be embedded in the Prometheus expression so Grafana's evaluator fires correctly`
      );
    }
    if (actual.labels?.severity !== expected.severity) {
      errors.push(
        `Rule "${expected.title}" severity mismatch: expected ${expected.severity}, got ${actual.labels?.severity}`
      );
    }
    if (actual.labels?.service !== 'intelliflow-workflow') {
      errors.push(
        `Rule "${expected.title}" labels.service must be "intelliflow-workflow" (got "${actual.labels?.service}")`
      );
    }
  }

  // Surface unexpected rules so we don't silently grow the alert set
  const expectedTitles = new Set(REQUIRED_RULES.map((r) => r.title));
  for (const t of titles) {
    if (!expectedTitles.has(t)) {
      errors.push(
        `Unexpected rule "${t}" — IFC-032 contract requires exactly the four documented rules`
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

async function main() {
  const raw = readFileSync(RULES_PATH, 'utf8');
  const { ok, errors } = lintAlertsContent(raw);
  if (!ok) {
    // eslint-disable-next-line no-console
    console.error('[lint-alerts] FAILED:');
    for (const err of errors) {
      // eslint-disable-next-line no-console
      console.error('  - ' + err);
    }
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log('[lint-alerts] OK — all 4 IFC-032 alert rules conform.');
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[lint-alerts] ERROR:', err);
    process.exit(1);
  });
}
