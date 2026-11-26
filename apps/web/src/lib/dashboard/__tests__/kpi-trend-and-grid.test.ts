import { describe, it, expect } from 'vitest';

import {
  TREND_DISPLAY_CAP,
  TREND_MIN_BASELINE,
  formatTrendPercent,
  shouldShowTrend,
} from '../kpi-calculator';
import {
  DASHBOARD_COL_SPAN_CLASSES,
  dashboardColSpanClass,
  dashboardWidgetKind,
  kpiRunSpanClasses,
} from '../grid';

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
    // The cap applies to the shown value: these round past 999.
    expect(formatTrendPercent(999.5)).toBe('>999%');
    expect(formatTrendPercent(-999.5)).toBe('<-999%');
    expect(formatTrendPercent(999.96, 1)).toBe('>999%');
    expect(formatTrendPercent(999.4)).toBe('+999%');
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

describe('kpiRunSpanClasses (no hole beside the last KPI tile)', () => {
  const kpi = (id: string, type = 'total-leads') => ({ id, type, colSpan: 1 });
  const panel = (id: string, colSpan: number) => ({ id, type: 'pipeline', colSpan });

  it('three tiles: the third fills the phone row and spans two on desktop', () => {
    const m = kpiRunSpanClasses([kpi('a'), kpi('b'), kpi('c')]);
    expect(m.get('a')).toBe('col-span-1 md:col-span-1 lg:col-span-1');
    expect(m.get('b')).toBe('col-span-1 md:col-span-1 lg:col-span-1');
    expect(m.get('c')).toBe('col-span-2 md:col-span-2 lg:col-span-2');
  });

  it('four tiles need no fill', () => {
    const m = kpiRunSpanClasses([kpi('a'), kpi('b'), kpi('c'), kpi('d')]);
    expect([...m.values()].every((v) => v === 'col-span-1 md:col-span-1 lg:col-span-1')).toBe(true);
  });

  it('a lone tile takes the whole row', () => {
    expect(kpiRunSpanClasses([kpi('a')]).get('a')).toBe('col-span-2 md:col-span-2 lg:col-span-4');
  });

  it('after a 3-span panel (one column left at lg) a lone tile fills that column, not a new row', () => {
    const m = kpiRunSpanClasses([panel('p', 3), kpi('d')]);
    expect(m.get('d')).toBe('col-span-2 md:col-span-2 lg:col-span-1');
  });

  it('after a 3-span panel, two tiles use the leftover column then a full row', () => {
    const m = kpiRunSpanClasses([panel('p', 3), kpi('a'), kpi('b')]);
    expect(m.get('a')).toBe('col-span-1 md:col-span-1 lg:col-span-1');
    expect(m.get('b')).toBe('col-span-1 md:col-span-1 lg:col-span-4');
  });

  it('after a 1-span panel (one column of two at md) tiles are counted from the second column', () => {
    const m = kpiRunSpanClasses([panel('p', 1), kpi('a'), kpi('b'), kpi('c')]);
    // md: panel, a | b, c fill. Phone: panel full row, a b | c full row.
    expect(m.get('a')).toBe('col-span-1 md:col-span-1 lg:col-span-1');
    expect(m.get('b')).toBe('col-span-1 md:col-span-1 lg:col-span-1');
    expect(m.get('c')).toBe('col-span-2 md:col-span-1 lg:col-span-1');
  });

  it('a panel ends a run, so each run is filled on its own', () => {
    const m = kpiRunSpanClasses([kpi('a'), kpi('b'), kpi('c'), panel('p', 4), kpi('d')]);
    expect(m.get('c')).toBe('col-span-2 md:col-span-2 lg:col-span-2');
    expect(m.has('p')).toBe(false);
    expect(m.get('d')).toBe('col-span-2 md:col-span-2 lg:col-span-4');
  });
});
