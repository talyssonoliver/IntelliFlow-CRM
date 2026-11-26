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
 * (3 tiles on the 2-column phone grid, 3 on the 4-column desktop grid). The tiles of the last,
 * partly filled row grow to fill it. Where a run starts depends on the panels before it (a 3-span
 * panel leaves one column at `lg`, a 1-span panel leaves one at `md`), so the column is tracked
 * per breakpoint: phone and `md` have 2 columns, `lg` has 4. Returns, per widget id, the span
 * classes to use in place of the plain `col-span-1`. Literal strings so Tailwind keeps them.
 */
const BASE_SPAN: Record<number, string> = { 1: 'col-span-1', 2: 'col-span-2' };
const MD_SPAN: Record<number, string> = { 1: 'md:col-span-1', 2: 'md:col-span-2' };
const LG_SPAN: Record<number, string> = {
  1: 'lg:col-span-1',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
};

/** How many columns a non-fill widget takes at each breakpoint (phone, md, lg). */
function panelSpans(kind: DashboardWidgetKind, colSpan: number): [number, number, number] {
  if (kind === 'kpi' && colSpan === 1) return [1, 1, 1];
  const span = Math.min(Math.max(colSpan, 1), 4);
  // A 1-span panel is the full phone row and one column from md; wider ones are full below lg.
  return [2, span === 1 ? 1 : 2, span];
}

/** Widths of the `count` tiles of a run's last partly filled row, so they add up to `width`. */
function shareWidth(width: number, count: number): number[] {
  const base = Math.floor(width / count);
  const extra = width % count;
  return Array.from({ length: count }, (_, i) => base + (i >= count - extra ? 1 : 0));
}

export function kpiRunSpanClasses(
  widgets: ReadonlyArray<{ id: string; type: string; colSpan?: number }>
): Map<string, string> {
  const out = new Map<string, string>();
  const cols = [2, 2, 4];
  let pos = [0, 0, 0];
  let run: string[] = [];
  let runStart = [0, 0, 0];

  const flush = () => {
    if (run.length === 0) return;
    const n = run.length;
    const spans = cols.map((c, bp) => {
      const start = runStart[bp];
      const widths = new Array<number>(n).fill(1);
      const inFirstRow = start + n <= c;
      const lastCount = inFirstRow ? n : (start + n) % c;
      if (lastCount > 0) {
        const width = inFirstRow ? c - start : c;
        shareWidth(width, lastCount).forEach((w, i) => {
          widths[n - lastCount + i] = w;
        });
      }
      return widths;
    });
    run.forEach((id, idx) => {
      out.set(
        id,
        `${BASE_SPAN[spans[0][idx]]} ${MD_SPAN[spans[1][idx]]} ${LG_SPAN[spans[2][idx]]}`
      );
    });
    run = [];
    pos = [0, 0, 0]; // a filled run always ends on a full row
  };

  for (const w of widgets) {
    const kind = dashboardWidgetKind(w.type);
    const colSpan = w.colSpan ?? 1;
    if (kind === 'kpi' && colSpan === 1) {
      if (run.length === 0) runStart = [...pos];
      run.push(w.id);
      continue;
    }
    flush();
    const spans = panelSpans(kind, colSpan);
    pos = pos.map((p, bp) => {
      const next = p + spans[bp] > cols[bp] ? 0 : p;
      return (next + spans[bp]) % cols[bp];
    });
  }
  flush();
  return out;
}
