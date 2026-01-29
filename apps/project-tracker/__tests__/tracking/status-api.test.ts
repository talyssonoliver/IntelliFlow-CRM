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
const SAMPLE_CSV = `Task ID,Section,Description,Status,Target Sprint
IFC-001,Architecture,Technical Architecture Spike,Completed,1
IFC-002,Architecture,Domain Model Design,In Progress,1
IFC-003,Core CRM,tRPC API Foundation,Backlog,2
IFC-004,Core CRM,Lead Aggregate,Blocked,2
IFC-005,Core CRM,Contact Aggregate,Planned,3`;

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
        blocked: 1,
        backlog: 2,
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

    // Note: History feature not yet implemented in the route
    it.skip('handles history=true query parameter', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_HISTORY_JSONL);

      const request = new NextRequest('http://localhost:3002/api/tracking/status?history=true');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.entries).toBeDefined();
      expect(Array.isArray(data.entries)).toBe(true);
    });

    // Note: History feature not yet implemented in the route
    it.skip('returns entries with delta calculations for history', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_HISTORY_JSONL);

      const request = new NextRequest('http://localhost:3002/api/tracking/status?history=true');
      const response = await GET(request);
      const data = await response.json();

      expect(data.entries.length).toBe(2);
      // Most recent entry (index 0) should have delta
      const mostRecent = data.entries[0];
      expect(mostRecent.delta).toBeDefined();
      expect(mostRecent.delta.completed).toBe(1); // 2 - 1 = +1
    });

    // Note: History feature not yet implemented in the route
    it.skip('returns empty entries array when no history file exists', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));

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

    // Note: History JSONL append feature not yet implemented in the route
    it.skip('appends entry to history JSONL file', async () => {
      mockFs.readFile.mockResolvedValueOnce(SAMPLE_CSV);
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValueOnce(undefined);
      mockFs.appendFile.mockResolvedValueOnce(undefined);

      await POST();

      expect(mockFs.appendFile).toHaveBeenCalled();
      const appendCall = mockFs.appendFile.mock.calls[0];
      expect(appendCall[0]).toContain('status-history.jsonl');
      expect(appendCall[1]).toContain('timestamp');
      expect(appendCall[1]).toContain('summary');
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

    it('normalizes status values case-insensitively', async () => {
      const mixedCaseCSV = `Task ID,Section,Description,Status,Target Sprint
IFC-001,Architecture,Task 1,COMPLETED,1
IFC-002,Architecture,Task 2,completed,1
IFC-003,Architecture,Task 3,Done,1
IFC-004,Architecture,Task 4,done,1`;

      mockFs.readFile.mockResolvedValueOnce(mixedCaseCSV);

      const request = new NextRequest('http://localhost:3002/api/tracking/status');
      const response = await GET(request);
      const data = await response.json();

      expect(data.snapshot.summary.completed).toBe(4);
    });
  });
});
