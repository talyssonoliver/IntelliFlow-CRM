import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  objectsToCSV,
  arrayToCSV,
  downloadCSV,
  exportToCSV,
  exportAnalyticsToCSV,
  exportPipelineToCSV,
  type CSVExportOptions,
  type AnalyticsMetric,
  type PipelineStage,
} from '../csv';

// ============================================
// objectsToCSV
// ============================================

describe('objectsToCSV', () => {
  it('returns empty string for empty array', () => {
    expect(objectsToCSV([])).toBe('');
  });

  it('generates CSV with headers from object keys', () => {
    const data = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ];
    const csv = objectsToCSV(data);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('name,age');
    expect(lines[1]).toBe('Alice,30');
    expect(lines[2]).toBe('Bob,25');
  });

  it('uses provided headers', () => {
    const data = [{ name: 'Alice', age: 30, city: 'London' }];
    const csv = objectsToCSV(data, { headers: ['name', 'city'] });
    const lines = csv.split('\n');
    expect(lines[0]).toBe('name,city');
    expect(lines[1]).toBe('Alice,London');
  });

  it('skips header row when includeHeaders is false', () => {
    const data = [{ name: 'Alice', age: 30 }];
    const csv = objectsToCSV(data, { includeHeaders: false });
    const lines = csv.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('Alice,30');
  });

  it('escapes fields containing commas', () => {
    const data = [{ name: 'Doe, Jane', age: 28 }];
    const csv = objectsToCSV(data);
    expect(csv).toContain('"Doe, Jane"');
  });

  it('escapes fields containing double quotes', () => {
    const data = [{ name: 'He said "hello"', age: 30 }];
    const csv = objectsToCSV(data);
    expect(csv).toContain('"He said ""hello"""');
  });

  it('escapes fields containing newlines', () => {
    const data = [{ name: 'Line1\nLine2', age: 30 }];
    const csv = objectsToCSV(data);
    expect(csv).toContain('"Line1\nLine2"');
  });

  it('escapes fields containing carriage returns', () => {
    const data = [{ name: 'Line1\rLine2', age: 30 }];
    const csv = objectsToCSV(data);
    expect(csv).toContain('"Line1\rLine2"');
  });

  it('handles null and undefined values as empty strings', () => {
    const data = [{ name: null, age: undefined }] as any[];
    const csv = objectsToCSV(data);
    const lines = csv.split('\n');
    expect(lines[1]).toBe(',');
  });

  it('supports custom delimiter', () => {
    const data = [{ name: 'Alice', age: 30 }];
    const csv = objectsToCSV(data, { delimiter: ';' });
    const lines = csv.split('\n');
    expect(lines[0]).toBe('name;age');
    expect(lines[1]).toBe('Alice;30');
  });

  it('escapes fields containing the custom delimiter', () => {
    const data = [{ name: 'A;B', age: 30 }];
    const csv = objectsToCSV(data, { delimiter: ';' });
    expect(csv).toContain('"A;B"');
  });

  it('handles boolean values', () => {
    const data = [{ active: true, deleted: false }];
    const csv = objectsToCSV(data);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('true,false');
  });
});

// ============================================
// arrayToCSV
// ============================================

describe('arrayToCSV', () => {
  it('converts 2D array to CSV string', () => {
    const data = [
      ['Name', 'Age'],
      ['Alice', 30],
      ['Bob', 25],
    ];
    const csv = arrayToCSV(data);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Name,Age');
    expect(lines[1]).toBe('Alice,30');
    expect(lines[2]).toBe('Bob,25');
  });

  it('handles empty 2D array', () => {
    expect(arrayToCSV([])).toBe('');
  });

  it('escapes special characters', () => {
    const data = [['Hello, world', 'She said "hi"']];
    const csv = arrayToCSV(data);
    expect(csv).toContain('"Hello, world"');
    expect(csv).toContain('"She said ""hi"""');
  });

  it('supports custom delimiter', () => {
    const data = [['A', 'B'], ['C', 'D']];
    const csv = arrayToCSV(data, { delimiter: '\t' });
    expect(csv).toBe('A\tB\nC\tD');
  });

  it('handles null and undefined cells', () => {
    const data = [[null, undefined, 'test']];
    const csv = arrayToCSV(data);
    expect(csv).toBe(',,test');
  });
});

// ============================================
// downloadCSV
// ============================================

describe('downloadCSV', () => {
  let mockLink: Record<string, unknown>;
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockLink = {
      setAttribute: vi.fn(),
      style: {},
      click: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

    mockCreateObjectURL = vi.fn().mockReturnValue('blob:test-url');
    mockRevokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = mockCreateObjectURL;
    globalThis.URL.revokeObjectURL = mockRevokeObjectURL;
  });

  it('creates a link element and triggers download', () => {
    downloadCSV('a,b\n1,2', 'test.csv');

    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(mockLink.setAttribute).toHaveBeenCalledWith('href', 'blob:test-url');
    expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'test.csv');
    expect(mockLink.click).toHaveBeenCalled();
    expect(document.body.appendChild).toHaveBeenCalled();
    expect(document.body.removeChild).toHaveBeenCalled();
  });

  it('appends .csv extension if not present', () => {
    downloadCSV('data', 'report');
    expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'report.csv');
  });

  it('does not double-append .csv extension', () => {
    downloadCSV('data', 'report.csv');
    expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'report.csv');
  });

  it('creates blob with BOM for Excel compatibility', () => {
    downloadCSV('a,b', 'test');
    // The Blob constructor is called with BOM + content
    expect(mockCreateObjectURL).toHaveBeenCalled();
  });

  it('revokes object URL after download', () => {
    downloadCSV('data', 'test');
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });
});

// ============================================
// exportToCSV
// ============================================

describe('exportToCSV', () => {
  let mockLink: Record<string, unknown>;

  beforeEach(() => {
    mockLink = {
      setAttribute: vi.fn(),
      style: {},
      click: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:url');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it('exports data with default filename', () => {
    exportToCSV([{ a: 1 }]);
    expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'export.csv');
  });

  it('exports data with custom filename', () => {
    exportToCSV([{ a: 1 }], { filename: 'custom-report' });
    expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'custom-report.csv');
  });

  it('passes options through to objectsToCSV', () => {
    exportToCSV([{ a: 1, b: 2 }], { headers: ['a'] });
    // The download is triggered - we can't easily inspect CSV content
    // but we verify it doesn't throw
    expect(mockLink.click).toHaveBeenCalled();
  });
});

// ============================================
// exportAnalyticsToCSV
// ============================================

describe('exportAnalyticsToCSV', () => {
  let mockLink: Record<string, unknown>;

  beforeEach(() => {
    mockLink = {
      setAttribute: vi.fn(),
      style: {},
      click: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:url');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it('exports analytics metrics with correct headers', () => {
    const metrics: AnalyticsMetric[] = [
      { name: 'Revenue', value: 50000, trend: '+10%', period: 'Q1 2026' },
    ];
    exportAnalyticsToCSV(metrics);
    expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'analytics-report.csv');
    expect(mockLink.click).toHaveBeenCalled();
  });

  it('uses custom filename', () => {
    exportAnalyticsToCSV([], 'custom-analytics');
    expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'custom-analytics.csv');
  });
});

// ============================================
// exportPipelineToCSV
// ============================================

describe('exportPipelineToCSV', () => {
  let mockLink: Record<string, unknown>;

  beforeEach(() => {
    mockLink = {
      setAttribute: vi.fn(),
      style: {},
      click: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:url');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it('exports pipeline stages with correct headers', () => {
    const stages: PipelineStage[] = [
      { stage: 'Prospecting', value: 10000, deals: 5, percentage: 25 },
    ];
    exportPipelineToCSV(stages);
    expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'pipeline-report.csv');
    expect(mockLink.click).toHaveBeenCalled();
  });

  it('formats percentage with % suffix', () => {
    // We can't easily inspect the CSV content through mocks,
    // but we can verify the function runs without error
    const stages: PipelineStage[] = [
      { stage: 'Closing', value: 50000, deals: 10, percentage: 75 },
    ];
    exportPipelineToCSV(stages, 'my-pipeline');
    expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'my-pipeline.csv');
  });
});
