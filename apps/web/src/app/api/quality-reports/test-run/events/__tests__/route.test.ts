/**
 * Tests for /api/quality-reports/test-run/events SSE route
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOnRunProgress = vi.hoisted(() => vi.fn());
const mockOffRunProgress = vi.hoisted(() => vi.fn());
const mockNextResponseJson = vi.hoisted(() => vi.fn());

vi.mock('next/server', () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    json: (...args: unknown[]) => mockNextResponseJson(...args),
  },
}));

vi.mock('@/lib/test-runner', () => ({
  testRunnerEvents: {
    onRunProgress: (...a: unknown[]) => mockOnRunProgress(...a),
    offRunProgress: (...a: unknown[]) => mockOffRunProgress(...a),
  },
}));

import { GET } from '../route';

function makeReq(params: Record<string, string> = {}) {
  const sp = new URLSearchParams(params);
  const abortController = new AbortController();
  return {
    url: 'http://localhost/api/quality-reports/test-run/events?' + sp.toString(),
    nextUrl: { searchParams: sp },
    signal: abortController.signal,
    _abortController: abortController,
  } as any;
}

describe('/api/quality-reports/test-run/events', () => {
  beforeEach(() => {
    mockNextResponseJson.mockImplementation(
      (body: unknown, init?: { status?: number }) => ({
        json: () => Promise.resolve(body),
        body,
        status: init?.status || 200,
        headers: new Map(),
      }),
    );
    mockOnRunProgress.mockReturnValue(undefined);
    mockOffRunProgress.mockReturnValue(undefined);
  });

  it('returns 400 when runId is missing', async () => {
    const res = await GET(makeReq());
    const d = await res.json();
    expect(d.error).toContain('runId');
    expect(res.status).toBe(400);
  });

  it('returns a ReadableStream response for valid runId', async () => {
    const res = await GET(makeReq({ runId: 'test-run-1' }));
    expect(res).toBeDefined();
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toContain('no-cache');
  });

  it('sets up event listener for the run', async () => {
    const res = await GET(makeReq({ runId: 'test-run-2' }));
    expect(res).toBeDefined();
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('connected');
    expect(text).toContain('test-run-2');
    expect(mockOnRunProgress).toHaveBeenCalledWith('test-run-2', expect.any(Function));
    reader.cancel();
  });

  it('sends SSE-formatted data', async () => {
    const res = await GET(makeReq({ runId: 'test-run-3' }));
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toMatch(/^data: \{.*\}\n\n$/s);
    reader.cancel();
  });

  it('cleans up on abort', async () => {
    const req = makeReq({ runId: 'test-run-4' });
    const res = await GET(req);
    const reader = res.body!.getReader();
    await reader.read();
    req._abortController.abort();
    await new Promise((r) => setTimeout(r, 50));
    expect(mockOffRunProgress).toHaveBeenCalledWith('test-run-4', expect.any(Function));
    reader.cancel();
  });
});
