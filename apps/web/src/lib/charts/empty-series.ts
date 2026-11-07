/**
 * Empty-series check shared by every chart (#1225 UI-013).
 *
 * A chart given zero rows, or rows whose values are all zero, drew axes and no
 * marks: a blank box that reads as broken. Every chart asks this first and,
 * when it is true, shows a message in the plot area instead.
 */

// `object`, not Record<string, unknown>: chart point interfaces have no index signature.
type Row = number | null | undefined | object;

function isMissing(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  const n = typeof value === 'number' ? value : Number(value);
  return !Number.isFinite(n);
}

function isZeroish(value: unknown): boolean {
  return isMissing(value) || Number(value) === 0;
}

export interface EmptySeriesOptions {
  /**
   * The series holds measurements where zero is a real reading (a 0%
   * probability, zero drift, 0 ms, an NPS of 0): only rows with no finite
   * value count as empty. Leave it off for totals and counts, where an
   * all-zero series means nothing happened.
   */
  zeroIsData?: boolean;
}

function isNumericLike(value: unknown): boolean {
  if (typeof value === 'number') return true;
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
}

/**
 * True when there is nothing to plot: no rows, or every plotted value is zero
 * (or missing / not a number). With `zeroIsData`, zeros count as data.
 *
 * @param rows   numbers, or objects (one per point)
 * @param keys   for objects, the value keys to check. Omitted, every numeric
 *               field of the row counts (labels like `month` are strings and
 *               are ignored).
 */
export function isEmptySeries(
  rows: ReadonlyArray<Row> | null | undefined,
  keys?: string | readonly string[],
  options: EmptySeriesOptions = {}
): boolean {
  if (!rows || rows.length === 0) return true;
  const isEmptyValue = options.zeroIsData ? isMissing : isZeroish;
  let wanted: readonly string[] | undefined;
  if (typeof keys === 'string') wanted = [keys];
  else wanted = keys;
  return rows.every((row) => {
    if (row === null || row === undefined || typeof row !== 'object') return isEmptyValue(row);
    const record = row as Readonly<Record<string, unknown>>;
    const values = wanted
      ? wanted.map((k) => record[k])
      : Object.values(record).filter((v) => isNumericLike(v));
    return values.every(isEmptyValue);
  });
}

/** The default message a chart shows when `isEmptySeries` is true. */
export const EMPTY_CHART_MESSAGE = 'No data for this period yet';
