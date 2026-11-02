/**
 * IFC-117: static cross-check between the instruments ai-worker registers and every metric the
 * AI dashboard and AI alert rules query.
 *
 * ASSUMPTION (cannot be proven from the repo — that is NEEDS_HUMAN N5): Grafana Cloud's OTLP
 * ingest translates OTel names to Prometheus names by replacing dots with underscores, adding
 * `_total` to monotonic counters and the unit suffix `_milliseconds` for `ms`, and exposing
 * histograms as `_bucket`/`_sum`/`_count`; unit-less instruments get no suffix. The golden table
 * below is written out by hand on purpose: deriving it with a helper would let a wrong rule
 * agree with itself. The post-deploy dry run (grafana-ai-alert-rules.yml, dry_run=true) is the
 * real check of these names.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  AI_METRIC_DEFINITIONS,
  ATTRIBUTE_KEYS,
} from '../../../apps/ai-worker/src/monitoring/otel-ai-types';
// The tokenizer the apply script validates with; the 'tokenizer' block below pins its behaviour.
import { labelNames, metricNames } from '../observability/apply-grafana-ai-alert-rules.mjs';

const REPO = join(__dirname, '../../..');
const RULES = JSON.parse(
  readFileSync(join(REPO, 'infra/monitoring/grafana/cloud/ai-alert-rules.json'), 'utf8')
);
const DASHBOARD = JSON.parse(
  readFileSync(join(REPO, 'infra/monitoring/grafana/cloud/dashboard-ai-models.json'), 'utf8')
);
const LEGACY_DASHBOARD = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/ifc-117-legacy/ai-grafana-dashboard.json'), 'utf8')
);
const LEGACY_RULES = yaml.load(
  readFileSync(join(__dirname, 'fixtures/ifc-117-legacy/ai-prometheus-rules.yaml'), 'utf8')
) as { groups: { rules: { expr: string }[] }[] };

/** OTel instrument -> the Prometheus series names it is expected to appear as. */
const GOLDEN: Record<string, string[]> = {
  'intelliflow.ai.inference.latency': [
    'intelliflow_ai_inference_latency_milliseconds_bucket',
    'intelliflow_ai_inference_latency_milliseconds_sum',
    'intelliflow_ai_inference_latency_milliseconds_count',
  ],
  'intelliflow.ai.inference.count': ['intelliflow_ai_inference_count_total'],
  'intelliflow.ai.confidence': [
    'intelliflow_ai_confidence_bucket',
    'intelliflow_ai_confidence_sum',
    'intelliflow_ai_confidence_count',
  ],
  'intelliflow.ai.cost.usd': ['intelliflow_ai_cost_usd_total'],
  'intelliflow.ai.value.estimated.usd': ['intelliflow_ai_value_estimated_usd_total'],
  'intelliflow.ai.hallucination.checks': ['intelliflow_ai_hallucination_checks_total'],
  'intelliflow.ai.hallucination.detected': ['intelliflow_ai_hallucination_detected_total'],
  'intelliflow.ai.hallucination.types': ['intelliflow_ai_hallucination_types_total'],
  'intelliflow.ai.hallucination.skipped': ['intelliflow_ai_hallucination_skipped_total'],
  'intelliflow.ai.drift.score': ['intelliflow_ai_drift_score'],
  'intelliflow.ai.drift.detections': ['intelliflow_ai_drift_detections_total'],
  'intelliflow.ai.drift.checks': ['intelliflow_ai_drift_checks_total'],
  'intelliflow.ai.drift.last_check': ['intelliflow_ai_drift_last_check'],
  'intelliflow.ai.retraining.triggers': ['intelliflow_ai_retraining_triggers_total'],
};

/** The one non-AI metric the rules may use: the LLM-span gate (span metrics from traces). */
const SPAN_GATE_METRICS = new Set(['traces_spanmetrics_calls_total']);
/** Labels that are resource, span or histogram labels rather than facade attributes. */
const NON_FACADE_LABELS = new Set(['job', 'service', 'span_name', 'le']);

const ALLOWED_NAMES = new Set([...Object.values(GOLDEN).flat(), ...SPAN_GATE_METRICS]);

function violations(exprs: string[]): string[] {
  const out: string[] = [];
  for (const expr of exprs) {
    const names = metricNames(expr);
    if (names.length === 0) out.push(`no metric found in: ${expr}`);
    for (const n of names)
      if (!ALLOWED_NAMES.has(n)) out.push(`${n} is not a registered instrument`);
    for (const l of labelNames(expr)) {
      if (!NON_FACADE_LABELS.has(l) && !(ATTRIBUTE_KEYS as readonly string[]).includes(l)) {
        out.push(`label ${l} is not a facade attribute`);
      }
    }
  }
  return out;
}

const ruleExprs = (): string[] =>
  RULES.rules.flatMap((r: { expr: string; selector: string }) => [r.expr, r.selector]);
const dashboardExprs = (d: { panels?: { targets?: { expr?: string }[] }[] }): string[] =>
  (d.panels ?? []).flatMap((p) => (p.targets ?? []).map((t) => t.expr ?? '')).filter(Boolean);

describe('tokenizer', () => {
  it('extracts metrics, not functions, keywords, labels or grouping lists', () => {
    const tricky =
      'histogram_quantile(0.95, sum by (le) (rate(intelliflow_ai_inference_latency_milliseconds_bucket{job=~"(.*/)?ai-worker"}[10m]))) ' +
      'and on() (sum(rate(traces_spanmetrics_calls_total{service=~"(intelliflow-)?ai-worker", span_name=~"llm.*"}[30m])) or vector(0)) > 0';
    expect(metricNames(tricky).sort()).toEqual(
      [
        'intelliflow_ai_inference_latency_milliseconds_bucket',
        'traces_spanmetrics_calls_total',
      ].sort()
    );
    expect(labelNames(tricky).sort()).toEqual(['job', 'service', 'span_name'].sort());
  });
});

describe('golden name table', () => {
  it('covers every registered instrument exactly', () => {
    expect(Object.keys(GOLDEN).sort()).toEqual(AI_METRIC_DEFINITIONS.map((d) => d.name).sort());
  });
});

describe('AI alert rules and dashboard query only registered instruments', () => {
  it('every rule expr and selector', () => {
    expect(violations(ruleExprs())).toEqual([]);
  });

  it('every dashboard panel target', () => {
    const exprs = dashboardExprs(DASHBOARD.dashboard);
    expect(exprs.length).toBeGreaterThan(0);
    expect(violations(exprs)).toEqual([]);
  });

  it('negative control: the legacy files fail the same check (they query names nothing emits)', () => {
    expect(violations(dashboardExprs(LEGACY_DASHBOARD.dashboard)).length).toBeGreaterThan(0);
    expect(
      violations(LEGACY_RULES.groups.flatMap((g) => g.rules.map((r) => r.expr))).length
    ).toBeGreaterThan(0);
  });
});

describe('dashboard shape (ENV-008-AI dashboard job config shape)', () => {
  it('is { folderUid, dashboard } with no overwrite/message, a fixed uid and no panel ids', () => {
    expect(Object.keys(DASHBOARD).sort()).toEqual(['dashboard', 'folderUid']);
    expect(DASHBOARD.folderUid).toBe('intelliflow-prod');
    expect(DASHBOARD.dashboard.uid).toBe('ifc117-ai-models');
    for (const panel of DASHBOARD.dashboard.panels) {
      expect(panel.id).toBeUndefined();
      for (const target of panel.targets ?? [])
        expect(target.datasource).toEqual({ uid: 'grafanacloud-prom' });
    }
  });

  it('labels ROI as estimated with an n/a guard, hallucination as heuristic, and states the known limits', () => {
    const text = JSON.stringify(DASHBOARD.dashboard).toLowerCase();
    const panels = DASHBOARD.dashboard.panels as {
      title: string;
      description?: string;
      targets?: { expr: string }[];
    }[];
    const roi = panels.find((p) => /roi/i.test(p.title));
    expect(roi?.title.toLowerCase()).toContain('estimated');
    expect(JSON.stringify(roi)).toContain('n/a');
    // The denominator is filtered to > 0, so no cost gives no value (shown as n/a), never Inf.
    const roiExpr = (roi?.targets?.[0]?.expr ?? '').replaceAll(' ', '');
    // The division operator sits between the two sums: `...))/(sum(...`.
    const denominator = roiExpr.slice(roiExpr.indexOf('))/(') + 3);
    expect(denominator).toContain('intelliflow_ai_cost_usd_total');
    expect(denominator.endsWith('>0)')).toBe(true);
    const hallucination = panels.find((p) => /hallucination rate/i.test(p.title));
    expect(`${hallucination?.title} ${hallucination?.description}`.toLowerCase()).toContain(
      'detected by heuristic checker'
    );
    expect(text).toMatch(/timeouts?[^.]*(twice|double-count)/);
    expect(text).toContain('auto-response is not monitored in production');
  });
});
