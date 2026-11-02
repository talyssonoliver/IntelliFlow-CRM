/**
 * IFC-117: AI_METRIC_DEFINITIONS is built from a compact row table. These tests pin every exported
 * description and the parser's validation, so dashboards, rules and the tools-side asset check see
 * the same definitions as before. Names, types and units are pinned in otel-ai-metrics.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { AI_METRIC_DEFINITIONS, parseAiMetricRow } from '../otel-ai-types';

describe('AI_METRIC_DEFINITIONS', () => {
  it('keeps every instrument description', () => {
    const pinned: Array<[string, string]> = [
      ['intelliflow.ai.inference.latency', 'Wall time of a monitored AI chain call'],
      ['intelliflow.ai.inference.count', 'Monitored AI chain calls by outcome'],
      ['intelliflow.ai.confidence', 'Model-reported confidence (0-1) of successful calls'],
      ['intelliflow.ai.cost.usd', 'Token cost of AI calls in USD'],
      [
        'intelliflow.ai.value.estimated.usd',
        'Estimated value booked for AI outcomes in USD (configured estimate, not a measured outcome)',
      ],
      [
        'intelliflow.ai.hallucination.checks',
        'Outputs run through the heuristic hallucination checker',
      ],
      [
        'intelliflow.ai.hallucination.detected',
        'Outputs the heuristic checker flagged as hallucinated',
      ],
      ['intelliflow.ai.hallucination.types', 'Hallucination types on flagged outputs'],
      ['intelliflow.ai.hallucination.skipped', 'Hallucination checks skipped, by reason'],
      ['intelliflow.ai.drift.score', 'Latest output-distribution shift score (display only)'],
      [
        'intelliflow.ai.drift.detections',
        'Output-distribution shift events (counted at onset and again on each severity escalation)',
      ],
      ['intelliflow.ai.drift.checks', 'Scheduled drift evaluations, by status'],
      ['intelliflow.ai.drift.last_check', 'Epoch seconds of the last scheduled drift tick'],
      [
        'intelliflow.ai.retraining.triggers',
        'Retraining threshold breaches from the feedback-analytics job',
      ],
    ];
    expect(AI_METRIC_DEFINITIONS.map((d) => [d.name, d.description])).toEqual(pinned);
  });

  it('exports plain definition objects with exactly name, type, unit and description', () => {
    for (const d of AI_METRIC_DEFINITIONS) {
      expect(Object.keys(d).sort()).toEqual(['description', 'name', 'type', 'unit']);
    }
  });
});

describe('parseAiMetricRow', () => {
  it('parses a row with an empty unit', () => {
    expect(parseAiMetricRow('intelliflow.ai.x | gauge |  | Something measured')).toEqual({
      name: 'intelliflow.ai.x',
      type: 'gauge',
      unit: '',
      description: 'Something measured',
    });
  });

  it.each([
    'intelliflow.ai.x | summary | 1 | Unknown instrument type',
    'intelliflow.ai.x | counter | 1',
    'intelliflow.ai.x | counter | 1 | a | b',
    ' | counter | 1 | No name',
    'intelliflow.ai.x | counter | 1 | ',
  ])('rejects a malformed row: %s', (row) => {
    expect(() => parseAiMetricRow(row)).toThrow(/Malformed AI metric row/);
  });
});
