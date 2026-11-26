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

/**
 * A run of 1-span KPI tiles that does not fill its rows leaves a hole beside the last tile
 * (3 tiles on the 2-column phone grid, 3 on the 4-column desktop grid). The last tile(s) of the
 * run grow to fill the row instead. Returns, per widget id, the span classes to use in place of
 * the plain `col-span-1`. Literal strings so Tailwind keeps them.
 */
export function kpiRunSpanClasses(
  widgets: ReadonlyArray<{ id: string; type: string; colSpan?: number }>
): Map<string, string> {
  const out = new Map<string, string>();
  let run: string[] = [];
  const flush = () => {
    const n = run.length;
    run.forEach((id, idx) => {
      const small = n % 2 === 1 && idx === n - 1 ? 'col-span-2' : 'col-span-1';
      const r = n % 4;
      let large = 'lg:col-span-1';
      if (idx >= n - r) {
        if (r === 1) large = 'lg:col-span-4';
        else if (r === 2) large = 'lg:col-span-2';
        else if (idx === n - 1) large = 'lg:col-span-2';
      }
      out.set(id, `${small} ${large}`);
    });
    run = [];
  };
  for (const w of widgets) {
    if (dashboardWidgetKind(w.type) === 'kpi' && (w.colSpan ?? 1) === 1) run.push(w.id);
    else flush();
  }
  flush();
  return out;
}
