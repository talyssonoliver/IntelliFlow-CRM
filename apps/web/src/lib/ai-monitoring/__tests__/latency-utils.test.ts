import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatLatencyMs,
  getSLOBadgeClass,
  getSLOStatusLabel,
  getLatencyAlertBadgeClass,
  getLatencyAlertIcon,
  formatPhaseLabel,
  getP95ComplianceColor,
  isStaleLatencyData,
} from '../latency-utils';

describe('formatLatencyMs', () => {
  it('formats normal values with commas', () => {
    expect(formatLatencyMs(1523)).toBe('1,523ms');
  });

  it('formats large values with commas', () => {
    expect(formatLatencyMs(12345)).toBe('12,345ms');
  });

  it('formats small positive values', () => {
    expect(formatLatencyMs(5)).toBe('5ms');
  });

  it('returns "< 1ms" for sub-1ms values', () => {
    expect(formatLatencyMs(0.5)).toBe('< 1ms');
  });

  it('returns "< 1ms" for zero', () => {
    expect(formatLatencyMs(0)).toBe('< 1ms');
  });

  it('returns "< 1ms" for negative values', () => {
    expect(formatLatencyMs(-5)).toBe('< 1ms');
  });

  it('rounds decimal values', () => {
    expect(formatLatencyMs(99.7)).toBe('100ms');
  });
});

describe('getSLOBadgeClass', () => {
  it('returns green classes when compliant', () => {
    const result = getSLOBadgeClass(true);
    expect(result).toContain('green');
  });

  it('returns red classes when non-compliant', () => {
    const result = getSLOBadgeClass(false);
    expect(result).toContain('red');
  });
});

describe('getSLOStatusLabel', () => {
  it('returns PASS for true', () => {
    expect(getSLOStatusLabel(true)).toBe('PASS');
  });

  it('returns FAIL for false', () => {
    expect(getSLOStatusLabel(false)).toBe('FAIL');
  });
});

describe('getLatencyAlertBadgeClass', () => {
  it('returns amber classes for warning', () => {
    const result = getLatencyAlertBadgeClass('warning');
    expect(result).toContain('amber');
  });

  it('returns red classes for critical', () => {
    const result = getLatencyAlertBadgeClass('critical');
    expect(result).toContain('red');
  });
});

describe('getLatencyAlertIcon', () => {
  it('returns "warning" for warning severity', () => {
    expect(getLatencyAlertIcon('warning')).toBe('warning');
  });

  it('returns "error" for critical severity', () => {
    expect(getLatencyAlertIcon('critical')).toBe('error');
  });
});

describe('formatPhaseLabel', () => {
  it('formats model_inference to "Model Inference"', () => {
    expect(formatPhaseLabel('model_inference')).toBe('Model Inference');
  });

  it('formats queue_wait to "Queue Wait"', () => {
    expect(formatPhaseLabel('queue_wait')).toBe('Queue Wait');
  });

  it('formats preprocessing to "Preprocessing"', () => {
    expect(formatPhaseLabel('preprocessing')).toBe('Preprocessing');
  });

  it('formats postprocessing to "Postprocessing"', () => {
    expect(formatPhaseLabel('postprocessing')).toBe('Postprocessing');
  });

  it('formats total to "Total"', () => {
    expect(formatPhaseLabel('total')).toBe('Total');
  });
});

describe('getP95ComplianceColor', () => {
  it('returns green when ratio <= 1.0', () => {
    const result = getP95ComplianceColor(90, 100);
    expect(result).toContain('green');
  });

  it('returns green when exactly at target', () => {
    const result = getP95ComplianceColor(100, 100);
    expect(result).toContain('green');
  });

  it('returns amber when ratio between 1.0 and 1.5', () => {
    const result = getP95ComplianceColor(120, 100);
    expect(result).toContain('amber');
  });

  it('returns red when ratio > 1.5', () => {
    const result = getP95ComplianceColor(200, 100);
    expect(result).toContain('red');
  });

  it('returns muted for zero target', () => {
    const result = getP95ComplianceColor(100, 0);
    expect(result).toContain('muted');
  });
});

describe('isStaleLatencyData', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false for null timestamp', () => {
    expect(isStaleLatencyData(null)).toBe(false);
  });

  it('returns false for fresh data (< 1h)', () => {
    const recent = new Date(Date.now() - 30 * 60000).toISOString(); // 30 min ago
    expect(isStaleLatencyData(recent)).toBe(false);
  });

  it('returns true for stale data (> 1h)', () => {
    const stale = new Date(Date.now() - 2 * 3600000).toISOString(); // 2 hours ago
    expect(isStaleLatencyData(stale)).toBe(true);
  });
});
