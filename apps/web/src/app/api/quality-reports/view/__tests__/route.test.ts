/**
 * Tests for /api/quality-reports/view route
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExistsSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockNextResponseCtor = vi.hoisted(() => vi.fn());
const mockNextResponseJson = vi.hoisted(() => vi.fn());

vi.mock('next/server', () => {
  // Must be a regular function (not arrow) to support 'new' calls
  function MockNextResponse(this: any, ...args: unknown[]) {
    return mockNextResponseCtor(...args);
  }
  MockNextResponse.json = (...args: unknown[]) => mockNextResponseJson(...args);
  return {
    NextRequest: vi.fn(),
    NextResponse: MockNextResponse,
  };
});

vi.mock('fs', () => ({
  default: {
    existsSync: (...a: unknown[]) => mockExistsSync(...a),
    readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  },
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
}));

import { GET } from '../route';

function makeReq(params: Record<string, string> = {}) {
  const sp = new URLSearchParams(params);
  return {
    url: 'http://localhost/api/quality-reports/view?' + sp.toString(),
    nextUrl: { searchParams: sp },
  } as any;
}

describe('/api/quality-reports/view', () => {
  beforeEach(() => {
    mockNextResponseCtor.mockImplementation((body: string, init?: { headers?: Record<string, string> }) => ({
      text: () => Promise.resolve(body),
      body,
      status: 200,
      headers: new Map(Object.entries(init?.headers || {})),
    }));
    mockNextResponseJson.mockImplementation(
      (body: unknown, init?: { status?: number }) => ({
        json: () => Promise.resolve(body),
        body,
        status: init?.status || 200,
        headers: new Map(),
      }),
    );
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('<html><body>Report</body></html>');
  });

  it('returns 400 when no report type specified', async () => {
    const res = await GET(makeReq());
    const d = await res.json();
    expect(d.success).toBe(false);
    expect(res.status).toBe(400);
  });

  it('returns placeholder HTML when report file not found', async () => {
    mockExistsSync.mockReturnValue(false);
    const res = await GET(makeReq({ report: 'lighthouse' }));
    const body = await res.text();
    expect(body).toContain('Report Not Available');
    expect(body).toContain('lighthouse');
    expect(res.headers.get('Content-Type')).toBe('text/html');
  });

  it('returns HTML report when file exists', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('<html><body>Real Report Content</body></html>');
    const res = await GET(makeReq({ report: 'lighthouse' }));
    const body = await res.text();
    expect(body).toContain('Real Report Content');
  });

  it('handles coverage report type', async () => {
    mockExistsSync.mockReturnValue(false);
    const res = await GET(makeReq({ report: 'coverage' }));
    const body = await res.text();
    expect(body).toContain('coverage');
  });

  it('handles performance report type', async () => {
    mockExistsSync.mockReturnValue(false);
    const res = await GET(makeReq({ report: 'performance' }));
    const body = await res.text();
    expect(body).toContain('performance');
  });

  it('handles readFileSync errors', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => { throw new Error('EACCES'); });
    const res = await GET(makeReq({ report: 'lighthouse' }));
    const d = await res.json();
    expect(d.success).toBe(false);
    expect(res.status).toBe(500);
  });
});
