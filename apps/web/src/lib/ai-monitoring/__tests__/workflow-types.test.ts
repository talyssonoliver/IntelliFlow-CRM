/**
 * workflow-types utility tests — PG-193
 *
 * Pure-function tests for label derivation, progress calculation, and
 * step-status normalisation.
 */

import { describe, it, expect } from 'vitest';
import {
  STEP_TYPE_LABELS,
  computeProgressPercent,
  getStepLabel,
  mapStepStatus,
} from '@/lib/ai-monitoring/workflow-types';

describe('STEP_TYPE_LABELS', () => {
  it('covers the eight documented workflow step types', () => {
    const expectedKeys = [
      'score',
      'condition',
      'assign',
      'notify',
      'approval',
      'classify',
      'route',
      'sla',
    ];
    for (const key of expectedKeys) {
      expect(STEP_TYPE_LABELS[key]).toBeTruthy();
    }
  });
});

describe('getStepLabel', () => {
  it('returns the canonical label for a known step type', () => {
    expect(getStepLabel('score')).toBe('Lead Scoring');
    expect(getStepLabel('notify')).toBe('Send Notification');
    expect(getStepLabel('sla')).toBe('SLA Assignment');
  });

  it('title-cases an unknown snake_case type', () => {
    expect(getStepLabel('custom_action')).toBe('Custom Action');
  });

  it('title-cases a single unknown word', () => {
    expect(getStepLabel('webhook')).toBe('Webhook');
  });
});

describe('computeProgressPercent', () => {
  it('returns 0 when total is 0', () => {
    expect(computeProgressPercent(0, 0)).toBe(0);
  });

  it('returns 0 when total is negative', () => {
    expect(computeProgressPercent(5, -1)).toBe(0);
  });

  it('caps at 100 when completed exceeds total', () => {
    expect(computeProgressPercent(10, 8)).toBe(100);
  });

  it('floors at 0 when completed is negative', () => {
    expect(computeProgressPercent(-1, 8)).toBe(0);
  });

  it('rounds to the nearest integer', () => {
    expect(computeProgressPercent(1, 3)).toBe(33);
    expect(computeProgressPercent(2, 3)).toBe(67);
  });

  it('returns 100 for a full run', () => {
    expect(computeProgressPercent(8, 8)).toBe(100);
  });

  it('returns 50 for a half run', () => {
    expect(computeProgressPercent(4, 8)).toBe(50);
  });
});

describe('mapStepStatus', () => {
  it('maps canonical lowercase statuses identically', () => {
    expect(mapStepStatus('completed')).toBe('completed');
    expect(mapStepStatus('running')).toBe('running');
    expect(mapStepStatus('pending')).toBe('pending');
    expect(mapStepStatus('failed')).toBe('failed');
    expect(mapStepStatus('skipped')).toBe('skipped');
  });

  it('maps uppercase strings', () => {
    expect(mapStepStatus('COMPLETED')).toBe('completed');
    expect(mapStepStatus('RUNNING')).toBe('running');
    expect(mapStepStatus('FAILED')).toBe('failed');
  });

  it('normalises synonyms to completed', () => {
    expect(mapStepStatus('success')).toBe('completed');
    expect(mapStepStatus('done')).toBe('completed');
  });

  it('normalises synonyms to running', () => {
    expect(mapStepStatus('in_progress')).toBe('running');
    expect(mapStepStatus('active')).toBe('running');
  });

  it('normalises synonyms to failed', () => {
    expect(mapStepStatus('error')).toBe('failed');
  });

  it('normalises synonyms to pending', () => {
    expect(mapStepStatus('queued')).toBe('pending');
    expect(mapStepStatus('waiting')).toBe('pending');
  });

  it('returns pending for null/undefined/empty/unknown', () => {
    expect(mapStepStatus(null)).toBe('pending');
    expect(mapStepStatus(undefined)).toBe('pending');
    expect(mapStepStatus('')).toBe('pending');
    expect(mapStepStatus('???')).toBe('pending');
  });
});
