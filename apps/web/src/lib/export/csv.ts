/**
 * CSV Export Utility
 * Converts data arrays to CSV format and triggers download
 */

export interface CSVExportOptions {
  filename?: string;
  headers?: string[];
  delimiter?: string;
  includeHeaders?: boolean;
}

/**
 * Escape CSV field value
 * Handles commas, quotes, and newlines
 */
function escapeCSVField(value: unknown, delimiter: string): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);

  // Check if value needs to be quoted
  const needsQuoting =
    stringValue.includes(delimiter) ||
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r');

  if (needsQuoting) {
    // Escape double quotes by doubling them
    const escaped = stringValue.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return stringValue;
}

/**
 * Convert array of objects to CSV string
 */
export function objectsToCSV<T extends Record<string, unknown>>(
  data: T[],
  options: CSVExportOptions = {}
): string {
  const {
    headers,
    delimiter = ',',
    includeHeaders = true,
  } = options;

  if (data.length === 0) {
    return '';
  }

  // Get headers from first object if not provided
  const columnHeaders = headers || Object.keys(data[0]);

  const rows: string[] = [];

  // Add header row
  if (includeHeaders) {
    rows.push(columnHeaders.map(h => escapeCSVField(h, delimiter)).join(delimiter));
  }

  // Add data rows
  for (const item of data) {
    const row = columnHeaders.map(header => {
      const value = item[header];
      return escapeCSVField(value, delimiter);
    });
    rows.push(row.join(delimiter));
  }

  return rows.join('\n');
}

/**
 * Convert 2D array to CSV string
 */
export function arrayToCSV(
  data: unknown[][],
  options: CSVExportOptions = {}
): string {
  const { delimiter = ',' } = options;

  return data
    .map(row => row.map(cell => escapeCSVField(cell, delimiter)).join(delimiter))
    .join('\n');
}

/**
 * Trigger CSV file download in browser
 */
export function downloadCSV(csvContent: string, filename: string): void {
  // Add BOM for Excel compatibility with UTF-8
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up the URL object
  URL.revokeObjectURL(url);
}

/**
 * Export data to CSV file
 * Main entry point for CSV export
 */
export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  options: CSVExportOptions = {}
): void {
  const { filename = 'export' } = options;
  const csvContent = objectsToCSV(data, options);
  downloadCSV(csvContent, filename);
}

/**
 * Export analytics metrics to CSV
 */
export interface AnalyticsMetric {
  name: string;
  value: string | number;
  trend: string;
  period: string;
}

export function exportAnalyticsToCSV(
  metrics: AnalyticsMetric[],
  filename = 'analytics-report'
): void {
  const headers = ['Metric', 'Value', 'Trend', 'Period'];
  const data = metrics.map(m => ({
    Metric: m.name,
    Value: m.value,
    Trend: m.trend,
    Period: m.period,
  }));

  exportToCSV(data, { filename, headers });
}

/**
 * Export pipeline data to CSV
 */
export interface PipelineStage {
  stage: string;
  value: string | number;
  deals: number;
  percentage: number;
}

// Re-export for convenience
export type { PipelineStage as PipelineStageExport };

export function exportPipelineToCSV(
  stages: PipelineStage[],
  filename = 'pipeline-report'
): void {
  const headers = ['Stage', 'Value', 'Deals', 'Percentage'];
  const data = stages.map(s => ({
    Stage: s.stage,
    Value: s.value,
    Deals: s.deals,
    Percentage: `${s.percentage}%`,
  }));

  exportToCSV(data, { filename, headers });
}
