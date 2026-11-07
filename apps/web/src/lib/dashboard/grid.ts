/**
 * Dashboard grid spans (#1225 UI-009). The grid is 2 columns on phones, 2 from
 * `md` and 4 from `lg`. A 1-span widget (a KPI card) takes one phone column, so
 * KPIs sit two per row; every wider widget takes the full phone row.
 * Shared by the live grid and its Suspense skeletons so they never disagree.
 */
export const DASHBOARD_GRID_CLASSES = 'grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6';

export const DASHBOARD_COL_SPAN_CLASSES: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-2 lg:col-span-3',
  4: 'col-span-2 lg:col-span-4',
};

export function dashboardColSpanClass(colSpan: number | undefined): string {
  return DASHBOARD_COL_SPAN_CLASSES[colSpan ?? 1] ?? 'col-span-1';
}
