import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { NextRequest } from 'next/server';

// Mock fs module with default export
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  const mockPromises = {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    appendFile: vi.fn(),
    mkdir: vi.fn(),
    stat: vi.fn(),
  };
  return {
    ...actual,
    default: {
      ...actual,
      promises: mockPromises,
    },
    promises: mockPromises,
  };
});

// Import after mocking
const { GET, POST } = await import('../../app/api/tracking/status/route');

const mockFs = fs as unknown as {
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  appendFile: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
};

// Sample CSV content for testing
const SAMPLE_CSV = `Task ID,Section,Description,Status,Target Sprint,Planned Finish
IFC-001,Architecture,Technical Architecture Spike,Completed,1,2025-12-20
IFC-002,Architecture,Domain Model Design,In Progress,1,2026-01-10
IFC-003,Core CRM,tRPC API Foundation,Backlog,2,
IFC-004,Core CRM,Lead Aggregate,Blocked,2,
IFC-005,Core CRM,Contact Aggregate,Planned,3,2026-02-15`;

// Sample JSONL history content
const SAMPLE_HISTORY_JSONL = `{"timestamp":"2025-01-04T10:00:00Z","summary":{"total":5,"completed":1,"in_progress":1,"blocked":1,"backlog":2}}
{"timestamp":"2025-01-05T10:00:00Z","summary":{"total":5,"completed":2,"in_progress":0,"blocked":1,"backlog":2}}`;

describe('Status Tracking API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/tracking/status', () => {
    it('returns current status snapshot from CSV', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_CSV);

      const request = new NextRequest('http://localhost:3002/api/tracking/status');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.snapshot).toBeDefined();
      expect(data.snapshot.summary).toMatchObject({
        total: 5,
        completed: 1,
        in_progress: 1,
        planned: 1,
        blocked: 1,
        backlog: 1,
      });
    });

    it('includes by_sprint breakdown in response', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_CSV);

      const request = new NextRequest('http://localhost:3002/api/tracking/status');
      const response = await GET(request);
      const data = await response.json();

      expect(data.snapshot.by_sprint).toBeDefined();
      expect(typeof data.snapshot.by_sprint).toBe('object');
    });

    it('includes by_section breakdown in response', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_CSV);

      const request = new NextRequest('http://localhost:3002/api/tracking/status');
      const response = await GET(request);
      const data = await response.json();

      expect(data.snapshot.by_section).toBeDefined();
      expect(typeof data.snapshot.by_section).toBe('object');
    });

    it('includes recent_completions in response', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_CSV);

      const request = new NextRequest('http://localhost:3002/api/tracking/status');
      const response = await GET(request);
      const data = await response.json();

      expect(data.snapshot.recent_completions).toBeDefined();
      expect(Array.isArray(data.snapshot.recent_completions)).toBe(true);
    });

    it('returns lastUpdated timestamp', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_CSV);

      const request = new NextRequest('http://localhost:3002/api/tracking/status');
      const response = await GET(request);
      const data = await response.json();

      expect(data.lastUpdated).toBeDefined();
      expect(new Date(data.lastUpdated).getTime()).not.toBeNaN();
    });

    it('falls back to cached snapshot on CSV read error', async () => {
      const cachedSnapshot = {
        generated_at: '2025-01-05T00:00:00Z',
        total: 10,
        completed: 5,
        in_progress: 2,
        blocked: 1,
        backlog: 2,
        tasks: {},
      };

      mockFs.readFile
        .mockRejectedValueOnce(new Error('CSV not found'))
        .mockResolvedValueOnce(JSON.stringify(cachedSnapshot));
      mockFs.stat.mockResolvedValueOnce({ mtime: new Date('2025-01-05T00:00:00Z') });

      const request = new NextRequest('http://localhost:3002/api/tracking/status');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
    });

    it('handles history=true query parameter', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_HISTORY_JSONL);

      const request = new NextRequest('http://localhost:3002/api/tracking/status?history=true');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.entries).toBeDefined();
      expect(Array.isArray(data.entries)).toBe(true);
    });

    it('returns entries with delta calculations for history', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_HISTORY_JSONL);

      const request = new NextRequest('http://localhost:3002/api/tracking/status?history=true');
      const response = await GET(request);
      const data = await response.json();

      expect(data.entries.length).toBe(2);
      // Second entry should have delta computed from first
      const secondEntry = data.entries[1];
      expect(secondEntry.delta).toBeDefined();
      expect(secondEntry.delta.completed).toBe(1); // 2 - 1 = +1
    });

    it('returns empty entries array when no history file exists', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));

      const request = new NextRequest('http://localhost:3002/api/tracking/status?history=true');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.entries).toEqual([]);
    });

    it('counts Planned status tasks separately (not as backlog)', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_CSV);

      const request = new NextRequest('http://localhost:3002/api/tracking/status');
      const response = await GET(request);
      const data = await response.json();

      expect(data.snapshot.summary.planned).toBe(1); // IFC-005 is Planned
      expect(data.snapshot.summary.backlog).toBe(1); // IFC-003 is Backlog
    });

    it('sources recent_completions description from CSV Description column', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_CSV);

      const request = new NextRequest('http://localhost:3002/api/tracking/status');
      const response = await GET(request);
      const data = await response.json();

      const completed = data.snapshot.recent_completions.find(
        (c: { task_id: string }) => c.task_id === 'IFC-001'
      );
      expect(completed).toBeDefined();
      // Should use Description column, not Section
      expect(completed.description).toBe('Technical Architecture Spike');
    });

    it('handles CSV with quoted commas via PapaParse', async () => {
      const csvWithQuotedCommas = `Task ID,Section,Description,Status,Target Sprint,Planned Finish
IFC-001,"Architecture, Design","Technical Architecture Spike, Phase 1",Completed,1,2025-12-20`;

      mockFs.readFile.mockResolvedValueOnce(csvWithQuotedCommas);

      const request = new NextRequest('http://localhost:3002/api/tracking/status');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.snapshot.summary.total).toBe(1);
      expect(data.snapshot.summary.completed).toBe(1);
      // Description should preserve the comma content
      const completed = data.snapshot.recent_completions[0];
      expect(completed.description).toContain('Phase 1');
    });

    it('handles GET ?history=true with empty JSONL', async () => {
      mockFs.readFile.mockResolvedValueOnce('');

      const request = new NextRequest('http://localhost:3002/api/tracking/status?history=true');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.entries).toEqual([]);
    });
  });

  describe('POST /api/tracking/status', () => {
    it('regenerates status snapshot from CSV', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_CSV);
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValueOnce(undefined);
      mockFs.appendFile.mockResolvedValueOnce(undefined);

      const response = await POST();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.message).toContain('generated from CSV');
      expect(data.snapshot).toBeDefined();
    });

    it('saves snapshot to file', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_CSV);
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValueOnce(undefined);
      mockFs.appendFile.mockResolvedValueOnce(undefined);

      await POST();

      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('appends entry to history JSONL file', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(SAMPLE_CSV)  // CSV read
        .mockResolvedValueOnce('');           // JSONL read for cap check
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.appendFile.mockResolvedValueOnce(undefined);

      await POST();

      expect(mockFs.appendFile).toHaveBeenCalled();
      const appendCall = mockFs.appendFile.mock.calls[0];
      expect(appendCall[0]).toContain('status-history.jsonl');
      expect(appendCall[1]).toContain('timestamp');
      expect(appendCall[1]).toContain('summary');
    });

    it('writes both snapshot JSON and JSONL on POST', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(SAMPLE_CSV)
        .mockResolvedValueOnce('');
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.appendFile.mockResolvedValueOnce(undefined);

      await POST();

      // Should write snapshot JSON file
      expect(mockFs.writeFile).toHaveBeenCalled();
      // Should also append to JSONL
      expect(mockFs.appendFile).toHaveBeenCalled();
    });

    it('returns error on CSV read failure', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('CSV not found'));

      const response = await POST();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.status).toBe('error');
    });

    it('returns proper snapshot structure', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_CSV);
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValueOnce(undefined);
      mockFs.appendFile.mockResolvedValueOnce(undefined);

      const response = await POST();
      const data = await response.json();

      expect(data.snapshot.summary).toMatchObject({
        total: expect.any(Number),
        completed: expect.any(Number),
        in_progress: expect.any(Number),
        planned: expect.any(Number),
        backlog: expect.any(Number),
        blocked: expect.any(Number),
      });
      expect(data.snapshot.by_sprint).toBeDefined();
      expect(data.snapshot.by_section).toBeDefined();
      expect(data.snapshot.recent_completions).toBeDefined();
    });

    it('returns 500 error when POST with empty CSV', async () => {
      const emptyCSV = `Task ID,Section,Description,Status,Target Sprint,Planned Finish`;

      mockFs.readFile.mockResolvedValueOnce(emptyCSV);
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const response = await POST();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.status).toBe('error');
    });

    it.todo('<5s refresh KPI — requires Playwright E2E test (NF-001 placeholder)');
  });

  describe('CSV Parsing', () => {
    it('handles quoted fields with commas', async () => {
      const csvWithQuotes = `Task ID,Section,Description,Status,Target Sprint
IFC-001,"Architecture, Design",Technical Architecture Spike,Completed,1`;

      mockFs.readFile.mockResolvedValueOnce(csvWithQuotes);

      const request = new NextRequest('http://localhost:3002/api/tracking/status');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.snapshot.summary.total).toBe(1);
    });

    it('handles empty CSV gracefully', async () => {
      const emptyCSV = `Task ID,Section,Description,Status,Target Sprint`;

      mockFs.readFile.mockResolvedValueOnce(emptyCSV);

      const request = new NextRequest('http://localhost:3002/api/tracking/status');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.snapshot.summary.total).toBe(0);
    });

    it('counts Completed and Done statuses correctly', async () => {
      const mixedStatusCSV = `Task ID,Section,Description,Status,Target Sprint
IFC-001,Architecture,Task 1,Completed,1
IFC-002,Architecture,Task 2,Completed,1
IFC-003,Architecture,Task 3,Done,1
IFC-004,Architecture,Task 4,Done,1`;

      mockFs.readFile.mockResolvedValueOnce(mixedStatusCSV);

      const request = new NextRequest('http://localhost:3002/api/tracking/status');
      const response = await GET(request);
      const data = await response.json();

      expect(data.snapshot.summary.completed).toBe(4);
    });
  });
});
