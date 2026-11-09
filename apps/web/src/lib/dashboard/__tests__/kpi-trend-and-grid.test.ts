import { describe, it, expect } from 'vitest';

import {
  TREND_DISPLAY_CAP,
  TREND_MIN_BASELINE,
  formatTrendPercent,
  shouldShowTrend,
} from '../kpi-calculator';
import { DASHBOARD_COL_SPAN_CLASSES, dashboardColSpanClass, dashboardWidgetKind } from '../grid';

describe('shouldShowTrend (#1225 UI-009)', () => {
  it('hides the badge when the baseline is near zero', () => {
    expect(shouldShowTrend(900, 1)).toBe(false);
    expect(shouldShowTrend(50, TREND_MIN_BASELINE - 1)).toBe(false);
    expect(shouldShowTrend(50, TREND_MIN_BASELINE)).toBe(true);
    expect(shouldShowTrend(50, 80, 100)).toBe(false);
  });

  it('hides a change that rounds to zero, and non-finite input', () => {
    expect(shouldShowTrend(0.4, 50)).toBe(false);
    expect(shouldShowTrend(0.4, 50, 5, 1)).toBe(true);
    expect(shouldShowTrend(Number.NaN, 50)).toBe(false);
    expect(shouldShowTrend(10, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('formatTrendPercent', () => {
  it('signs and rounds the percentage', () => {
    expect(formatTrendPercent(12.4)).toBe('+12%');
    expect(formatTrendPercent(-4.46, 1)).toBe('-4.5%');
    expect(formatTrendPercent(0)).toBe('+0%');
  });

  it('caps the display at >999%', () => {
    expect(formatTrendPercent(TREND_DISPLAY_CAP)).toBe('+999%');
    expect(formatTrendPercent(1500)).toBe('>999%');
    expect(formatTrendPercent(-1500)).toBe('<-999%');
  });
});

describe('dashboard grid spans', () => {
  it('puts KPI cards two per phone row and wide widgets on a full row', () => {
    expect(dashboardColSpanClass(1)).toBe('col-span-1');
    expect(dashboardColSpanClass(2)).toBe('col-span-2');
    expect(dashboardColSpanClass(3)).toBe('col-span-2 lg:col-span-3');
    expect(dashboardColSpanClass(4)).toBe('col-span-2 lg:col-span-4');
    expect(dashboardColSpanClass(undefined)).toBe('col-span-1');
    expect(dashboardColSpanClass(9)).toBe('col-span-1');
    // No span leaves a wide widget at one phone column.
    for (const [span, cls] of Object.entries(DASHBOARD_COL_SPAN_CLASSES)) {
      if (Number(span) > 1) expect(cls.startsWith('col-span-2')).toBe(true);
    }
  });
});

describe('dashboard grid: panels take the full phone row (#1249 visual check)', () => {
  it('keeps KPI tiles two per phone row', () => {
    expect(dashboardColSpanClass(1, 'kpi')).toBe('col-span-1');
  });

  it('gives a 1-span panel the full phone row and half a row from md', () => {
    expect(dashboardColSpanClass(1, 'panel')).toBe('col-span-2 md:col-span-1');
    expect(dashboardColSpanClass(undefined, 'panel')).toBe('col-span-2 md:col-span-1');
    expect(dashboardColSpanClass(9, 'panel')).toBe('col-span-2 md:col-span-1');
  });

  it('keeps wider panels as before', () => {
    expect(dashboardColSpanClass(2, 'panel')).toBe('col-span-2');
    expect(dashboardColSpanClass(3, 'panel')).toBe('col-span-2 lg:col-span-3');
  });

  it('treats only KPI tiles as KPI', () => {
    for (const type of ['total-leads', 'sales-revenue', 'active-deals', 'open-tickets']) {
      expect(dashboardWidgetKind(type)).toBe('kpi');
    }
    for (const type of ['upcoming-tasks', 'recent-activity', 'pipeline-summary', 'deals-won']) {
      expect(dashboardWidgetKind(type)).toBe('panel');
    }
    expect(dashboardWidgetKind('unknown-widget')).toBe('panel');
  });
});
