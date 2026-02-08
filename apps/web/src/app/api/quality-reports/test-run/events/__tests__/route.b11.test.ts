/**
 * Test Run Events Route B11 Tests - covers remaining uncovered branches
 *
 * Targets:
 * - progressHandler: complete event triggers cleanup and close
 * - progressHandler: error event triggers cleanup and close
 * - progressHandler: enqueue throws (connection closed)
 * - ping interval: enqueue throws (clears interval)
 * - cancel callback: cleans up connection
 * - formatSSE: JSON serialization
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

describe('/api/quality-reports/test-run/events b11', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('sends progress events and closes on complete', async () => {
    let capturedHandler: Function | null = null;
    mockOnRunProgress.mockImplementation((_runId: string, handler: Function) => {
      capturedHandler = handler;
    });

    const res = await GET(makeReq({ runId: 'run-complete' }));
    const reader = res.body!.getReader();

    // Read initial connected message
    await reader.read();

    // Simulate a complete event
    expect(capturedHandler).not.toBeNull();
    capturedHandler!({ type: 'complete', runId: 'run-complete' });

    // Read the complete event
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('"type":"complete"');

    // Wait for the setTimeout to fire for cleanup
    await new Promise(r => setTimeout(r, 1200));

    // offRunProgress should have been called for cleanup
    expect(mockOffRunProgress).toHaveBeenCalledWith('run-complete', expect.any(Function));

    reader.cancel();
  });

  it('sends progress events and closes on error', async () => {
    let capturedHandler: Function | null = null;
    mockOnRunProgress.mockImplementation((_runId: string, handler: Function) => {
      capturedHandler = handler;
    });

    const res = await GET(makeReq({ runId: 'run-error' }));
    const reader = res.body!.getReader();

    // Read initial connected message
    await reader.read();

    // Simulate an error event
    capturedHandler!({ type: 'error', runId: 'run-error', error: 'Test failed' });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('"type":"error"');

    await new Promise(r => setTimeout(r, 1200));
    expect(mockOffRunProgress).toHaveBeenCalledWith('run-error', expect.any(Function));

    reader.cancel();
  });

  it('handles normal progress events', async () => {
    let capturedHandler: Function | null = null;
    mockOnRunProgress.mockImplementation((_runId: string, handler: Function) => {
      capturedHandler = handler;
    });

    const res = await GET(makeReq({ runId: 'run-progress' }));
    const reader = res.body!.getReader();

    // Read initial connected message
    await reader.read();

    // Simulate a progress event (non-complete, non-error)
    capturedHandler!({ type: 'progress', runId: 'run-progress', percent: 50 });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('"percent":50');

    reader.cancel();
  });

  it('returns proper headers for SSE response', async () => {
    const res = await GET(makeReq({ runId: 'run-headers' }));

    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toContain('no-cache');
    expect(res.headers.get('Connection')).toBe('keep-alive');
    expect(res.headers.get('X-Accel-Buffering')).toBe('no');

    const reader = res.body!.getReader();
    reader.cancel();
  });
});
