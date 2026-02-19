/**
 * experiment-utils unit tests (PG-149 coverage)
 */

import { describe, it, expect } from 'vitest';
import {
  formatPValue,
  getSignificanceDescription,
  interpretEffectSize,
  formatConfidenceInterval,
  getStatusColor,
  getTypeLabel,
  getExperimentActions,
  computeExperimentStats,
} from '../experiment-utils';

describe('formatPValue', () => {
  it('returns "< 0.001" for very small p-values', () => {
    expect(formatPValue(0.0001)).toBe('< 0.001');
    expect(formatPValue(0.0009)).toBe('< 0.001');
  });

  it('returns "< 0.01" for small p-values', () => {
    expect(formatPValue(0.005)).toBe('< 0.01');
    expect(formatPValue(0.009)).toBe('< 0.01');
  });

  it('returns fixed decimal for regular p-values', () => {
    expect(formatPValue(0.05)).toBe('0.050');
    expect(formatPValue(0.123)).toBe('0.123');
    expect(formatPValue(0.5)).toBe('0.500');
  });
});

describe('getSignificanceDescription', () => {
  it('returns "Highly significant" for p < 0.001', () => {
    expect(getSignificanceDescription(0.0001)).toBe('Highly significant (p < 0.001)');
  });

  it('returns "Very significant" for 0.001 <= p < 0.01', () => {
    expect(getSignificanceDescription(0.005)).toBe('Very significant (p < 0.01)');
  });

  it('returns "Significant" for p < alpha', () => {
    expect(getSignificanceDescription(0.03)).toBe('Significant (p < 0.05)');
  });

  it('returns "Not significant" for p >= alpha', () => {
    expect(getSignificanceDescription(0.1)).toBe('Not significant');
    expect(getSignificanceDescription(0.5)).toBe('Not significant');
  });

  it('uses custom alpha', () => {
    expect(getSignificanceDescription(0.08, 0.1)).toBe('Significant (p < 0.1)');
    expect(getSignificanceDescription(0.03, 0.01)).toBe('Not significant');
  });
});

describe('interpretEffectSize', () => {
  it('returns NEGLIGIBLE for d < 0.2', () => {
    expect(interpretEffectSize(0.1)).toBe('NEGLIGIBLE');
    expect(interpretEffectSize(0.0)).toBe('NEGLIGIBLE');
    expect(interpretEffectSize(-0.1)).toBe('NEGLIGIBLE');
  });

  it('returns SMALL for 0.2 <= d < 0.5', () => {
    expect(interpretEffectSize(0.3)).toBe('SMALL');
    expect(interpretEffectSize(-0.4)).toBe('SMALL');
  });

  it('returns MEDIUM for 0.5 <= d < 0.8', () => {
    expect(interpretEffectSize(0.6)).toBe('MEDIUM');
    expect(interpretEffectSize(-0.7)).toBe('MEDIUM');
  });

  it('returns LARGE for d >= 0.8', () => {
    expect(interpretEffectSize(0.8)).toBe('LARGE');
    expect(interpretEffectSize(1.5)).toBe('LARGE');
    expect(interpretEffectSize(-1.0)).toBe('LARGE');
  });
});

describe('formatConfidenceInterval', () => {
  it('formats interval with one decimal', () => {
    expect(formatConfidenceInterval(2.3, 9.3)).toBe('[2.3, 9.3]');
    expect(formatConfidenceInterval(-1.5, 4.7)).toBe('[-1.5, 4.7]');
    expect(formatConfidenceInterval(0, 0)).toBe('[0.0, 0.0]');
  });
});

describe('getStatusColor', () => {
  it('returns correct classes for each status', () => {
    expect(getStatusColor('DRAFT')).toContain('slate');
    expect(getStatusColor('RUNNING')).toContain('blue');
    expect(getStatusColor('PAUSED')).toContain('amber');
    expect(getStatusColor('COMPLETED')).toContain('green');
    expect(getStatusColor('ARCHIVED')).toContain('slate');
  });

  it('returns default for unknown status', () => {
    expect(getStatusColor('UNKNOWN')).toContain('slate');
  });
});

describe('getTypeLabel', () => {
  it('returns human-readable labels', () => {
    expect(getTypeLabel('AI_VS_MANUAL')).toBe('AI vs Manual');
    expect(getTypeLabel('MODEL_COMPARISON')).toBe('Model Comparison');
    expect(getTypeLabel('THRESHOLD_TEST')).toBe('Threshold Test');
  });

  it('returns raw type for unknown', () => {
    expect(getTypeLabel('CUSTOM')).toBe('CUSTOM');
  });
});

describe('getExperimentActions', () => {
  it('returns Start for DRAFT', () => {
    const actions = getExperimentActions('DRAFT');
    expect(actions).toHaveLength(1);
    expect(actions[0].label).toBe('Start');
  });

  it('returns Pause and Complete for RUNNING', () => {
    const actions = getExperimentActions('RUNNING');
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.label)).toEqual(['Pause', 'Complete']);
  });

  it('returns Resume and Complete for PAUSED', () => {
    const actions = getExperimentActions('PAUSED');
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.label)).toEqual(['Resume', 'Complete']);
  });

  it('returns Archive for COMPLETED', () => {
    const actions = getExperimentActions('COMPLETED');
    expect(actions).toHaveLength(1);
    expect(actions[0].label).toBe('Archive');
  });

  it('returns empty for ARCHIVED or unknown', () => {
    expect(getExperimentActions('ARCHIVED')).toHaveLength(0);
    expect(getExperimentActions('UNKNOWN')).toHaveLength(0);
  });
});

describe('computeExperimentStats', () => {
  it('computes stats from experiment list', () => {
    const experiments = [
      { status: 'RUNNING', isSignificant: false, progressPercent: 50 },
      { status: 'RUNNING', isSignificant: false, progressPercent: 70 },
      { status: 'COMPLETED', isSignificant: true, progressPercent: 100 },
      { status: 'DRAFT', isSignificant: false, progressPercent: 0 },
    ] as any[];

    const stats = computeExperimentStats(experiments);
    expect(stats.total).toBe(4);
    expect(stats.running).toBe(2);
    expect(stats.completed).toBe(1);
    expect(stats.significant).toBe(1);
    expect(stats.avgProgress).toBe(55); // (50+70+100+0)/4 = 55
  });

  it('handles empty array', () => {
    const stats = computeExperimentStats([]);
    expect(stats.total).toBe(0);
    expect(stats.running).toBe(0);
    expect(stats.avgProgress).toBe(0);
  });
});
