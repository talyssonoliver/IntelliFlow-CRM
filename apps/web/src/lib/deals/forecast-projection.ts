/**
 * Revenue projection for Deal Forecast (owner 23/11: no made-up figures).
 *
 * It used to append "Oct, Nov, Dec" with the monthly average grown by 10%, 20% and 30%: numbers
 * nobody forecast. Now:
 * - actual: revenue from deals won in each of the last six months (the API's `monthlyRevenue`);
 * - projected: for this month and the next two, the open deals expected to close that month,
 *   each counted at value × its probability. An open deal whose expected close date has passed
 *   is still expected, so it counts in this month. A deal with no expected close date is left
 *   out: there is no month to put it in.
 */

export interface MonthlyProjection {
  month: string;
  actual: number | null;
  projected: number | null;
}

export interface ProjectableDeal {
  value: number;
  probability: number;
  /** YYYY-MM-DD, or '' when the deal has none. */
  expectedCloseDate: string;
}

/** The API labels months this way (en-GB short month, UTC); keep the two in step. */
export function monthLabel(date: Date): string {
  return date.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
}

function monthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

/** Months from this one to the deal's expected close; a past date counts as this month. */
function monthsAhead(deal: ProjectableDeal, year: number, month: number): number | null {
  if (!deal.expectedCloseDate) return null;
  const close = new Date(`${deal.expectedCloseDate}T00:00:00Z`);
  if (Number.isNaN(close.getTime())) return null;
  return Math.max(0, (close.getUTCFullYear() - year) * 12 + (close.getUTCMonth() - month));
}

/** Weighted value of open deals for this month and the next two (index 0 = this month). */
function weightedByMonthAhead(
  deals: readonly ProjectableDeal[],
  year: number,
  month: number
): number[] {
  const projected = [0, 0, 0];
  for (const deal of deals) {
    const ahead = monthsAhead(deal, year, month);
    if (ahead === null || ahead > 2) continue;
    projected[ahead] += (deal.value * deal.probability) / 100;
  }
  return projected;
}

export function buildRevenueProjection(
  monthlyRevenue: readonly { month: string; actual: number | null }[],
  deals: readonly ProjectableDeal[],
  now: Date = new Date()
): MonthlyProjection[] {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const actualByLabel = new Map(monthlyRevenue.map((m) => [m.month, m.actual ?? 0]));

  const projected = weightedByMonthAhead(deals, year, month);

  const rows: MonthlyProjection[] = [];
  for (let back = 5; back >= 0; back--) {
    const start = monthStart(year, month - back);
    const actual = actualByLabel.get(monthLabel(start)) ?? 0;
    rows.push({
      month: monthLabel(start),
      actual: actual > 0 ? actual : null,
      projected: back === 0 && projected[0] > 0 ? Math.round(projected[0]) : null,
    });
  }
  for (let ahead = 1; ahead <= 2; ahead++) {
    rows.push({
      month: monthLabel(monthStart(year, month + ahead)),
      actual: null,
      projected: projected[ahead] > 0 ? Math.round(projected[ahead]) : null,
    });
  }
  return rows;
}
