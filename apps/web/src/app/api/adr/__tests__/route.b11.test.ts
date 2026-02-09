/**
 * ADR Route B11 Tests - covers all branches (0% coverage)
 *
 * Targets:
 * - GET: action=list
 * - GET: action=search with query
 * - GET: action=search without query (400)
 * - GET: action=stats
 * - GET: action=graph
 * - GET: default action (unknown -> 400)
 * - GET: error handling (500)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAllADRs = vi.hoisted(() => vi.fn());
const mockSearchADRs = vi.hoisted(() => vi.fn());
const mockGetADRStats = vi.hoisted(() => vi.fn());
const mockGenerateDependencyGraph = vi.hoisted(() => vi.fn());

vi.mock('next/server', async (importOriginal) => {
  const orig = (await importOriginal()) as any;
  return {
    ...orig,
    NextResponse: {
      json: (body: unknown, init?: { status?: number }) => ({
        json: () => Promise.resolve(body),
        status: init?.status || 200,
      }),
    },
  };
});

vi.mock('@/lib/adr/adr-service', () => ({
  getAllADRs: (...args: unknown[]) => mockGetAllADRs(...args),
  searchADRs: (...args: unknown[]) => mockSearchADRs(...args),
  getADRStats: (...args: unknown[]) => mockGetADRStats(...args),
  generateDependencyGraph: (...args: unknown[]) => mockGenerateDependencyGraph(...args),
}));

import { GET } from '../route';

function makeReq(params: Record<string, string> = {}) {
  const sp = new URLSearchParams(params);
  return {
    url: 'http://localhost/api/adr?' + sp.toString(),
  } as any;
}

describe('/api/adr route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllADRs.mockReturnValue([{ id: 'ADR-001', title: 'Test' }]);
    mockSearchADRs.mockReturnValue([{ id: 'ADR-002', title: 'Found' }]);
    mockGetADRStats.mockReturnValue({ total: 5, accepted: 3 });
    mockGenerateDependencyGraph.mockReturnValue({ nodes: [], edges: [] });
  });

  describe('action=list (default)', () => {
    it('should return all ADRs', async () => {
      const res = await GET(makeReq());
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data).toEqual([{ id: 'ADR-001', title: 'Test' }]);
      expect(mockGetAllADRs).toHaveBeenCalled();
    });

    it('should return all ADRs with explicit action=list', async () => {
      const res = await GET(makeReq({ action: 'list' }));
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(mockGetAllADRs).toHaveBeenCalled();
    });
  });

  describe('action=search', () => {
    it('should search ADRs with query', async () => {
      const res = await GET(makeReq({ action: 'search', q: 'test query' }));
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data).toEqual([{ id: 'ADR-002', title: 'Found' }]);
      expect(mockSearchADRs).toHaveBeenCalledWith('test query');
    });

    it('should return 400 when query is missing', async () => {
      const res = await GET(makeReq({ action: 'search' }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Query parameter "q" is required');
    });
  });

  describe('action=stats', () => {
    it('should return ADR stats', async () => {
      const res = await GET(makeReq({ action: 'stats' }));
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data).toEqual({ total: 5, accepted: 3 });
      expect(mockGetADRStats).toHaveBeenCalled();
    });
  });

  describe('action=graph', () => {
    it('should return dependency graph', async () => {
      const res = await GET(makeReq({ action: 'graph' }));
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data).toEqual({ nodes: [], edges: [] });
      expect(mockGenerateDependencyGraph).toHaveBeenCalled();
    });
  });

  describe('unknown action', () => {
    it('should return 400 for unknown action', async () => {
      const res = await GET(makeReq({ action: 'foobar' }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unknown action: foobar');
    });
  });

  describe('error handling', () => {
    it('should return 500 when service throws', async () => {
      mockGetAllADRs.mockImplementation(() => {
        throw new Error('File system error');
      });

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await GET(makeReq());
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('File system error');
      errorSpy.mockRestore();
    });
  });
});
