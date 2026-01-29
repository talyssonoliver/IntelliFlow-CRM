/**
 * PDF Export Utility
 * Generates PDF reports using browser print functionality
 * For more complex PDFs, consider integrating jsPDF or react-pdf
 */

export interface PDFExportOptions {
  title?: string;
  subtitle?: string;
  orientation?: 'portrait' | 'landscape';
  includeTimestamp?: boolean;
}

export interface ReportSection {
  title: string;
  type: 'metrics' | 'table' | 'text';
  data: unknown;
}

/**
 * Generate HTML content for PDF export
 */
function generatePDFHTML(
  sections: ReportSection[],
  options: PDFExportOptions = {}
): string {
  const {
    title = 'Analytics Report',
    subtitle = '',
    includeTimestamp = true,
  } = options;

  const timestamp = new Date().toLocaleString();

  const styles = `
    <style>
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #1e293b;
        line-height: 1.5;
        padding: 40px;
      }
      .header {
        border-bottom: 2px solid #137fec;
        padding-bottom: 20px;
        margin-bottom: 30px;
      }
      .header h1 {
        font-size: 28px;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 4px;
      }
      .header .subtitle {
        font-size: 14px;
        color: #64748b;
      }
      .header .timestamp {
        font-size: 12px;
        color: #94a3b8;
        margin-top: 8px;
      }
      .section {
        margin-bottom: 30px;
        page-break-inside: avoid;
      }
      .section-title {
        font-size: 18px;
        font-weight: 600;
        color: #0f172a;
        margin-bottom: 16px;
        padding-bottom: 8px;
        border-bottom: 1px solid #e2e8f0;
      }
      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
      }
      .metric-card {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 16px;
      }
      .metric-card .label {
        font-size: 12px;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
      }
      .metric-card .value {
        font-size: 24px;
        font-weight: 700;
        color: #0f172a;
      }
      .metric-card .trend {
        font-size: 12px;
        margin-top: 4px;
      }
      .metric-card .trend.positive { color: #16a34a; }
      .metric-card .trend.negative { color: #dc2626; }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      th, td {
        padding: 12px;
        text-align: left;
        border-bottom: 1px solid #e2e8f0;
      }
      th {
        background: #f1f5f9;
        font-weight: 600;
        color: #475569;
      }
      tr:last-child td { border-bottom: none; }
      .text-content {
        font-size: 14px;
        color: #475569;
      }
      .footer {
        margin-top: 40px;
        padding-top: 20px;
        border-top: 1px solid #e2e8f0;
        font-size: 11px;
        color: #94a3b8;
        text-align: center;
      }
    </style>
  `;

  const headerHTML = `
    <div class="header">
      <h1>${escapeHTML(title)}</h1>
      ${subtitle ? `<p class="subtitle">${escapeHTML(subtitle)}</p>` : ''}
      ${includeTimestamp ? `<p class="timestamp">Generated: ${timestamp}</p>` : ''}
    </div>
  `;

  const sectionsHTML = sections.map(section => {
    let contentHTML = '';

    if (section.type === 'metrics' && Array.isArray(section.data)) {
      const metrics = section.data as Array<{
        name: string;
        value: string | number;
        trend?: string;
      }>;
      contentHTML = `
        <div class="metrics-grid">
          ${metrics.map(m => `
            <div class="metric-card">
              <div class="label">${escapeHTML(m.name)}</div>
              <div class="value">${escapeHTML(String(m.value))}</div>
              ${m.trend ? `<div class="trend ${m.trend.startsWith('+') ? 'positive' : 'negative'}">${escapeHTML(m.trend)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    } else if (section.type === 'table' && Array.isArray(section.data)) {
      const rows = section.data as Array<Record<string, unknown>>;
      if (rows.length > 0) {
        const headers = Object.keys(rows[0]);
        contentHTML = `
          <table>
            <thead>
              <tr>${headers.map(h => `<th>${escapeHTML(h)}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${rows.map(row => `
                <tr>${headers.map(h => `<td>${escapeHTML(String(row[h] ?? ''))}</td>`).join('')}</tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }
    } else if (section.type === 'text') {
      contentHTML = `<div class="text-content">${escapeHTML(String(section.data))}</div>`;
    }

    return `
      <div class="section">
        <h2 class="section-title">${escapeHTML(section.title)}</h2>
        ${contentHTML}
      </div>
    `;
  }).join('');

  const footerHTML = `
    <div class="footer">
      IntelliFlow CRM - Analytics Report
    </div>
  `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>${escapeHTML(title)}</title>
        ${styles}
      </head>
      <body>
        ${headerHTML}
        ${sectionsHTML}
        ${footerHTML}
      </body>
    </html>
  `;
}

/**
 * Escape HTML special characters
 */
function escapeHTML(str: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, char => htmlEntities[char]);
}

/**
 * Export report to PDF using browser print dialog
 */
export function exportToPDF(
  sections: ReportSection[],
  options: PDFExportOptions = {}
): void {
  const html = generatePDFHTML(sections, options);

  // Open in new window for printing
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    console.error('Could not open print window. Please allow popups.');
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for content to load, then trigger print
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
    // Close window after printing (optional - some browsers don't allow this)
    // printWindow.close();
  };
}

/**
 * Export analytics report to PDF
 */
export interface AnalyticsReportData {
  metrics: Array<{ name: string; value: string | number; trend: string }>;
  pipeline: Array<{ stage: string; value: string | number; deals: number; percentage: number }>;
  period: string;
}

export function exportAnalyticsToPDF(
  data: AnalyticsReportData,
  options: PDFExportOptions = {}
): void {
  const sections: ReportSection[] = [
    {
      title: 'Key Metrics',
      type: 'metrics',
      data: data.metrics,
    },
    {
      title: 'Pipeline Overview',
      type: 'table',
      data: data.pipeline.map(p => ({
        Stage: p.stage,
        Value: p.value,
        Deals: p.deals,
        'Progress (%)': p.percentage,
      })),
    },
  ];

  exportToPDF(sections, {
    title: 'Analytics Report',
    subtitle: `Period: ${data.period}`,
    ...options,
  });
}
