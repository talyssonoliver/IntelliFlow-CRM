/**
 * Dashboard grid spans (#1225 UI-009). The grid is 2 columns on phones, 2 from
 * `md` and 4 from `lg`. Only KPI tiles sit two per phone row; every other widget
 * (a list, chart or panel) takes the full phone row whatever its span, since half
 * a phone width wraps its text to a word or two per line.
 * Shared by the live grid and its Suspense skeletons so they never disagree.
 */
export const DASHBOARD_GRID_CLASSES = 'grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6';

export const DASHBOARD_COL_SPAN_CLASSES: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-2 lg:col-span-3',
  4: 'col-span-2 lg:col-span-4',
};

/** Spans for widgets that are not KPI tiles: a 1-span panel is full width below `md`. */
export const DASHBOARD_PANEL_COL_SPAN_CLASSES: Record<number, string> = {
  ...DASHBOARD_COL_SPAN_CLASSES,
  1: 'col-span-2 md:col-span-1',
};

/** Widget types rendered as a KPI tile (KpiCard); these sit two per phone row. */
export const KPI_WIDGET_TYPES: ReadonlySet<string> = new Set([
  'total-leads',
  'sales-revenue',
  'active-deals',
  'open-tickets',
  'active-leads',
  'conversion-rate',
  'revenue',
]);

export type DashboardWidgetKind = 'kpi' | 'panel';

export function dashboardWidgetKind(type: string): DashboardWidgetKind {
  return KPI_WIDGET_TYPES.has(type) ? 'kpi' : 'panel';
}

export function dashboardColSpanClass(
  colSpan: number | undefined,
  kind: DashboardWidgetKind = 'kpi'
): string {
  const table = kind === 'kpi' ? DASHBOARD_COL_SPAN_CLASSES : DASHBOARD_PANEL_COL_SPAN_CLASSES;
  return table[colSpan ?? 1] ?? table[1];
}
