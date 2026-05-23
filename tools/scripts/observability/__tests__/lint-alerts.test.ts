/**
 * IFC-032 — lint-alerts.ts unit tests
 *
 * Two cases:
 *   1. accepts the canonical intelliflow-rules.yaml file
 *   2. rejects when a required rule is missing or has the wrong threshold
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lintAlertsContent } from '../lint-alerts';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const CANONICAL_PATH = resolve(
  REPO_ROOT,
  'infra',
  'monitoring',
  'grafana',
  'provisioning',
  'alerting',
  'intelliflow-rules.yaml'
);

describe('lint-alerts (IFC-032)', () => {
  it('accepts the canonical intelliflow-rules.yaml file', () => {
    const raw = readFileSync(CANONICAL_PATH, 'utf8');
    const result = lintAlertsContent(raw);
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error('lint errors:', result.errors);
    }
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects when a required rule is missing', () => {
    const minimal = `
apiVersion: 1
groups:
  - name: intelliflow-workflows
    rules:
      - title: WorkflowErrorRateHigh
        labels:
          severity: warning
          service: intelliflow-workflow
        data:
          - model:
              expr: 'otelcol_processor_errors_total > 0.01'
`;
    const result = lintAlertsContent(minimal);
    expect(result.ok).toBe(false);
    // Missing 3 of the 4 required rules
    expect(
      result.errors.some((e) => e.includes('Missing required rule "WorkflowP95LatencyHigh"'))
    ).toBe(true);
    expect(result.errors.some((e) => e.includes('Missing required rule "OtelCollectorDown"'))).toBe(
      true
    );
    expect(
      result.errors.some((e) => e.includes('Missing required rule "LeadRoutingFailures"'))
    ).toBe(true);
  });

  it('rejects when a required rule has the wrong threshold embedded in expr', () => {
    // Take canonical and tamper with WorkflowErrorRateHigh's inline threshold
    const raw = readFileSync(CANONICAL_PATH, 'utf8');
    const tampered = raw.replace('> 0.01', '> 0.5');
    const result = lintAlertsContent(tampered);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('does not match expected threshold regex'))).toBe(
      true
    );
  });

  it('rejects when apiVersion is not 1', () => {
    const tampered = `
apiVersion: 2
groups:
  - name: intelliflow-workflows
    rules: []
`;
    const result = lintAlertsContent(tampered);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('apiVersion must be 1'))).toBe(true);
  });
});
