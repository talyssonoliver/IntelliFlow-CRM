/**
 * Tests for pdf.ts
 *
 * Tests the PDF export utility functions: exportToPDF and exportAnalyticsToPDF.
 * Mocks browser APIs (window.open, document.write, etc.) since these
 * functions rely on browser print functionality.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  exportToPDF,
  exportAnalyticsToPDF,
  type PDFExportOptions,
  type ReportSection,
  type AnalyticsReportData,
} from '../pdf';

describe('exportToPDF', () => {
  let mockPrintWindow: {
    document: {
      write: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    };
    onload: (() => void) | null;
    focus: ReturnType<typeof vi.fn>;
    print: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockPrintWindow = {
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
      onload: null,
      focus: vi.fn(),
      print: vi.fn(),
    };

    vi.stubGlobal('open', vi.fn().mockReturnValue(mockPrintWindow));
  });

  it('opens a new window for printing', () => {
    const sections: ReportSection[] = [];
    exportToPDF(sections);
    expect(window.open).toHaveBeenCalledWith('', '_blank');
  });

  it('writes HTML to the print window', () => {
    const sections: ReportSection[] = [];
    exportToPDF(sections);
    expect(mockPrintWindow.document.write).toHaveBeenCalled();
    const writtenHTML = mockPrintWindow.document.write.mock.calls[0][0] as string;
    expect(writtenHTML).toContain('<!DOCTYPE html>');
    expect(writtenHTML).toContain('<html>');
    expect(writtenHTML).toContain('</html>');
  });

  it('closes the document after writing', () => {
    exportToPDF([]);
    expect(mockPrintWindow.document.close).toHaveBeenCalled();
  });

  it('sets onload handler for printing', () => {
    exportToPDF([]);
    expect(mockPrintWindow.onload).toBeTypeOf('function');
  });

  it('triggers focus and print on load', () => {
    exportToPDF([]);
    // Simulate onload
    if (mockPrintWindow.onload) {
      mockPrintWindow.onload();
    }
    expect(mockPrintWindow.focus).toHaveBeenCalled();
    expect(mockPrintWindow.print).toHaveBeenCalled();
  });

  it('handles popup blocker gracefully', () => {
    vi.stubGlobal('open', vi.fn().mockReturnValue(null));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    exportToPDF([]);

    expect(consoleSpy).toHaveBeenCalledWith('Could not open print window. Please allow popups.');
    consoleSpy.mockRestore();
  });

  it('uses default title when not provided', () => {
    exportToPDF([]);
    const html = mockPrintWindow.document.write.mock.calls[0][0] as string;
    expect(html).toContain('Analytics Report');
  });

  it('uses custom title when provided', () => {
    exportToPDF([], { title: 'My Custom Report' });
    const html = mockPrintWindow.document.write.mock.calls[0][0] as string;
    expect(html).toContain('My Custom Report');
  });

  it('includes subtitle when provided', () => {
    exportToPDF([], { subtitle: 'Q1 2026 Summary' });
    const html = mockPrintWindow.document.write.mock.calls[0][0] as string;
    expect(html).toContain('Q1 2026 Summary');
  });

  it('does not include subtitle when not provided', () => {
    exportToPDF([], { title: 'Test' });
    const html = mockPrintWindow.document.write.mock.calls[0][0] as string;
    // subtitle class should not appear with content
    expect(html).not.toContain('class="subtitle"');
  });

  it('includes timestamp by default', () => {
    exportToPDF([]);
    const html = mockPrintWindow.document.write.mock.calls[0][0] as string;
    expect(html).toContain('Generated:');
  });

  it('excludes timestamp when includeTimestamp is false', () => {
    exportToPDF([], { includeTimestamp: false });
    const html = mockPrintWindow.document.write.mock.calls[0][0] as string;
    expect(html).not.toContain('Generated:');
  });

  it('includes print color adjust styles', () => {
    exportToPDF([]);
    const html = mockPrintWindow.document.write.mock.calls[0][0] as string;
    expect(html).toContain('@media print');
    expect(html).toContain('print-color-adjust: exact');
  });

  it('includes footer', () => {
    exportToPDF([]);
    const html = mockPrintWindow.document.write.mock.calls[0][0] as string;
    expect(html).toContain('IntelliFlow CRM - Analytics Report');
  });

  // =========================================================================
  // Section rendering
  // =========================================================================
  describe('metrics section', () => {
    it('renders metrics grid with metric cards', () => {
      const sections: ReportSection[] = [
        {
          title: 'Key Metrics',
          type: 'metrics',
          data: [
            { name: 'Revenue', value: '$50,000', trend: '+10%' },
            { name: 'Leads', value: 150 },
          ],
        },
      ];

      exportToPDF(sections);
      const html = mockPrintWindow.document.write.mock.calls[0][0] as string;

      expect(html).toContain('Key Metrics');
      expect(html).toContain('metrics-grid');
      expect(html).toContain('metric-card');
      expect(html).toContain('Revenue');
      expect(html).toContain('$50,000');
      expect(html).toContain('Leads');
      expect(html).toContain('150');
    });

    it('renders positive trend with positive class', () => {
      const sections: ReportSection[] = [
        {
          title: 'Metrics',
          type: 'metrics',
          data: [{ name: 'Growth', value: '25%', trend: '+15%' }],
        },
      ];

      exportToPDF(sections);
      const html = mockPrintWindow.document.write.mock.calls[0][0] as string;
      expect(html).toContain('class="trend positive"');
      expect(html).toContain('+15%');
    });

    it('renders negative trend with negative class', () => {
      const sections: ReportSection[] = [
        {
          title: 'Metrics',
          type: 'metrics',
          data: [{ name: 'Churn', value: '5%', trend: '-2%' }],
        },
      ];

      exportToPDF(sections);
      const html = mockPrintWindow.document.write.mock.calls[0][0] as string;
      expect(html).toContain('class="trend negative"');
      expect(html).toContain('-2%');
    });

    it('omits trend when not provided', () => {
      const sections: ReportSection[] = [
        {
          title: 'Metrics',
          type: 'metrics',
          data: [{ name: 'Total', value: 100 }],
        },
      ];

      exportToPDF(sections);
      const html = mockPrintWindow.document.write.mock.calls[0][0] as string;
      expect(html).not.toContain('class="trend');
    });
  });

  describe('table section', () => {
    it('renders table with headers and rows', () => {
      const sections: ReportSection[] = [
        {
          title: 'Pipeline',
          type: 'table',
          data: [
            { Stage: 'Prospecting', Value: 10000, Deals: 5 },
            { Stage: 'Closing', Value: 50000, Deals: 2 },
          ],
        },
      ];

      exportToPDF(sections);
      const html = mockPrintWindow.document.write.mock.calls[0][0] as string;

      expect(html).toContain('Pipeline');
      expect(html).toContain('<table>');
      expect(html).toContain('<thead>');
      expect(html).toContain('<tbody>');
      expect(html).toContain('<th>Stage</th>');
      expect(html).toContain('<th>Value</th>');
      expect(html).toContain('<th>Deals</th>');
      expect(html).toContain('<td>Prospecting</td>');
      expect(html).toContain('<td>10000</td>');
      expect(html).toContain('<td>Closing</td>');
    });

    it('renders empty content for empty table data', () => {
      const sections: ReportSection[] = [{ title: 'Empty Table', type: 'table', data: [] }];

      exportToPDF(sections);
      const html = mockPrintWindow.document.write.mock.calls[0][0] as string;
      expect(html).toContain('Empty Table');
      expect(html).not.toContain('<table>');
    });

    it('handles null/undefined values in table data', () => {
      const sections: ReportSection[] = [
        {
          title: 'Table',
          type: 'table',
          data: [{ name: 'Test', value: null }],
        },
      ];

      exportToPDF(sections);
      const html = mockPrintWindow.document.write.mock.calls[0][0] as string;
      expect(html).toContain('<td></td>');
    });
  });

  describe('text section', () => {
    it('renders text content', () => {
      const sections: ReportSection[] = [
        {
          title: 'Summary',
          type: 'text',
          data: 'This is a summary of the report.',
        },
      ];

      exportToPDF(sections);
      const html = mockPrintWindow.document.write.mock.calls[0][0] as string;

      expect(html).toContain('Summary');
      expect(html).toContain('text-content');
      expect(html).toContain('This is a summary of the report.');
    });
  });

  describe('HTML escaping', () => {
    it('escapes HTML special characters in title', () => {
      exportToPDF([], { title: '<script>alert("xss")</script>' });
      const html = mockPrintWindow.document.write.mock.calls[0][0] as string;
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('escapes HTML special characters in subtitle', () => {
      exportToPDF([], { subtitle: 'A & B < C > D' });
      const html = mockPrintWindow.document.write.mock.calls[0][0] as string;
      expect(html).toContain('A &amp; B &lt; C &gt; D');
    });

    it('escapes HTML in section titles', () => {
      const sections: ReportSection[] = [
        { title: 'Title with "quotes"', type: 'text', data: 'content' },
      ];

      exportToPDF(sections);
      const html = mockPrintWindow.document.write.mock.calls[0][0] as string;
      expect(html).toContain('Title with &quot;quotes&quot;');
    });

    it('escapes HTML in metric names and values', () => {
      const sections: ReportSection[] = [
        {
          title: 'Metrics',
          type: 'metrics',
          data: [{ name: '<b>Revenue</b>', value: '100 & 200' }],
        },
      ];

      exportToPDF(sections);
      const html = mockPrintWindow.document.write.mock.calls[0][0] as string;
      expect(html).toContain('&lt;b&gt;Revenue&lt;/b&gt;');
      expect(html).toContain('100 &amp; 200');
    });

    it('escapes single quotes', () => {
      exportToPDF([], { title: "It's a test" });
      const html = mockPrintWindow.document.write.mock.calls[0][0] as string;
      expect(html).toContain('It&#39;s a test');
    });
  });

  describe('multiple sections', () => {
    it('renders all sections in order', () => {
      const sections: ReportSection[] = [
        { title: 'First', type: 'text', data: 'Section 1' },
        { title: 'Second', type: 'text', data: 'Section 2' },
        { title: 'Third', type: 'text', data: 'Section 3' },
      ];

      exportToPDF(sections);
      const html = mockPrintWindow.document.write.mock.calls[0][0] as string;

      const firstIdx = html.indexOf('First');
      const secondIdx = html.indexOf('Second');
      const thirdIdx = html.indexOf('Third');

      expect(firstIdx).toBeLessThan(secondIdx);
      expect(secondIdx).toBeLessThan(thirdIdx);
    });
  });
});

// ============================================================================
// exportAnalyticsToPDF
// ============================================================================
describe('exportAnalyticsToPDF', () => {
  let mockPrintWindow: {
    document: {
      write: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    };
    onload: (() => void) | null;
    focus: ReturnType<typeof vi.fn>;
    print: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockPrintWindow = {
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
      onload: null,
      focus: vi.fn(),
      print: vi.fn(),
    };

    vi.stubGlobal('open', vi.fn().mockReturnValue(mockPrintWindow));
  });

  it('exports analytics data with metrics and pipeline sections', () => {
    const data: AnalyticsReportData = {
      metrics: [{ name: 'Revenue', value: '$50,000', trend: '+10%' }],
      pipeline: [{ stage: 'Prospecting', value: 10000, deals: 5, percentage: 25 }],
      period: 'Q1 2026',
    };

    exportAnalyticsToPDF(data);

    expect(window.open).toHaveBeenCalled();
    const html = mockPrintWindow.document.write.mock.calls[0][0] as string;

    expect(html).toContain('Analytics Report');
    expect(html).toContain('Period: Q1 2026');
    expect(html).toContain('Key Metrics');
    expect(html).toContain('Revenue');
    expect(html).toContain('Pipeline Overview');
    expect(html).toContain('Prospecting');
  });

  it('maps pipeline data to table format with correct column names', () => {
    const data: AnalyticsReportData = {
      metrics: [],
      pipeline: [{ stage: 'Closing', value: 50000, deals: 3, percentage: 75 }],
      period: 'Q2 2026',
    };

    exportAnalyticsToPDF(data);
    const html = mockPrintWindow.document.write.mock.calls[0][0] as string;

    expect(html).toContain('Stage');
    expect(html).toContain('Value');
    expect(html).toContain('Deals');
    expect(html).toContain('Progress (%)');
    expect(html).toContain('Closing');
    expect(html).toContain('50000');
    expect(html).toContain('3');
    expect(html).toContain('75');
  });

  it('uses custom options when provided', () => {
    const data: AnalyticsReportData = {
      metrics: [],
      pipeline: [],
      period: 'Q1 2026',
    };

    exportAnalyticsToPDF(data, {
      title: 'Custom Title',
      includeTimestamp: false,
    });

    const html = mockPrintWindow.document.write.mock.calls[0][0] as string;
    expect(html).toContain('Custom Title');
    expect(html).not.toContain('Generated:');
  });

  it('handles empty metrics and pipeline', () => {
    const data: AnalyticsReportData = {
      metrics: [],
      pipeline: [],
      period: 'All Time',
    };

    expect(() => exportAnalyticsToPDF(data)).not.toThrow();
    expect(window.open).toHaveBeenCalled();
  });
});

// ============================================================================
// Type interfaces
// ============================================================================
describe('type interfaces', () => {
  it('PDFExportOptions has expected shape', () => {
    const options: PDFExportOptions = {
      title: 'Report',
      subtitle: 'Summary',
      orientation: 'landscape',
      includeTimestamp: true,
    };
    expect(options.title).toBe('Report');
    expect(options.orientation).toBe('landscape');
  });

  it('ReportSection has expected shape', () => {
    const section: ReportSection = {
      title: 'Test',
      type: 'metrics',
      data: [],
    };
    expect(section.title).toBe('Test');
    expect(section.type).toBe('metrics');
  });

  it('ReportSection type accepts all valid values', () => {
    const types: ReportSection['type'][] = ['metrics', 'table', 'text'];
    expect(types).toHaveLength(3);
  });

  it('AnalyticsReportData has expected shape', () => {
    const data: AnalyticsReportData = {
      metrics: [{ name: 'Test', value: 100, trend: '+5%' }],
      pipeline: [{ stage: 'Stage 1', value: 1000, deals: 5, percentage: 50 }],
      period: 'Q1',
    };
    expect(data.metrics).toHaveLength(1);
    expect(data.pipeline).toHaveLength(1);
    expect(data.period).toBe('Q1');
  });
});
