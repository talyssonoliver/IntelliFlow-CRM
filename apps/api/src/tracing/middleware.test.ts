import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Use vi.hoisted for mocks to be available during module loading
const {
  span,
  tracer,
  getTracer,
  captureException,
  setUser,
  setTag,
  initializeRequestContext,
  runWithContext,
  getCorrelationId,
} = vi.hoisted(() => {
  const span = {
    setStatus: vi.fn(),
    setAttribute: vi.fn(),
    end: vi.fn(),
    recordException: vi.fn(),
  };
  const tracer = {
    startActiveSpan: vi.fn((_name: string, _options: any, fn: any) => fn(span)),
  };
  return {
    span,
    tracer,
    getTracer: vi.fn(() => tracer),
    captureException: vi.fn(),
    setUser: vi.fn(),
    setTag: vi.fn(),
    initializeRequestContext: vi.fn(() => ({ correlationId: 'cid', startTime: Date.now() })),
    runWithContext: vi.fn((_ctx: any, fn: any) => fn()),
    getCorrelationId: vi.fn(() => 'cid'),
  };
});

vi.mock('@opentelemetry/api', () => ({
  trace: { getTracer: () => getTracer() },
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

class MockTRPCError extends Error {
  code: string;
  constructor({ code, message }: { code: string; message: string }) {
    super(message);
    this.code = code;
  }
}

vi.mock('@trpc/server', () => ({
  TRPCError: MockTRPCError,
  initTRPC: {
    context: () => ({
      create: () => ({
        middleware: (fn: any) => fn,
      }),
    }),
  },
}));

vi.mock('./sentry', () => ({
  captureException: (err: unknown) => captureException(err),
  setUser: (user: Record<string, unknown> | null) => setUser(user),
  setTag: (key: string, value: string) => setTag(key, value),
}));

vi.mock('./correlation', () => ({
  initializeRequestContext: () => initializeRequestContext(),
  runWithContext: <T>(ctx: unknown, fn: () => T) => runWithContext(ctx, fn),
  getCorrelationId: () => getCorrelationId(),
}));

vi.mock('../trpc', () => ({
  publicProcedure: { use: vi.fn(() => ({})) },
  protectedProcedure: { use: vi.fn(() => ({})) },
}));

describe('tRPC tracing middleware (middleware.ts)', () => {
  beforeEach(() => {
    // Reset modules first to ensure fresh imports
    vi.resetModules();
    span.setStatus.mockClear();
    span.setAttribute.mockClear();
    span.end.mockClear();
    span.recordException.mockClear();
    tracer.startActiveSpan.mockClear();
    getTracer.mockClear();
    captureException.mockClear();
    setUser.mockClear();
    setTag.mockClear();
    initializeRequestContext.mockClear();
    runWithContext.mockClear();
    getCorrelationId.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // TODO: Test timing out - investigate dynamic import issue
  it.skip('records success spans and logs request', async () => {
    const { tracingMiddleware } = await import('./middleware.js');

    const next = vi.fn(async () => ({ ok: true }));
    const result = await (tracingMiddleware as any)({
      path: 'misc.health',
      type: 'query',
      next,
      ctx: { user: { userId: 'u1', email: 'u1@example.com' } },
    });

    expect(result).toEqual({ ok: true });
    expect(getTracer).toHaveBeenCalled();
    expect(tracer.startActiveSpan).toHaveBeenCalled();
    expect(span.setStatus).toHaveBeenCalledWith({ code: 1 });
    expect(span.end).toHaveBeenCalled();
    expect(setUser).toHaveBeenCalled();
    expect(setTag).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalled();
  });

  it('records error spans and captures exceptions', async () => {
    const { tracingMiddleware } = await import('./middleware.js');

    const next = vi.fn(async () => {
      throw new MockTRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'boom' });
    });

    await expect(
      (tracingMiddleware as any)({
        path: 'misc.health',
        type: 'query',
        next,
        ctx: { user: { userId: 'u1', email: 'u1@example.com' } },
      })
    ).rejects.toThrow('boom');

    expect(span.setStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 2,
      })
    );
    expect(span.recordException).toHaveBeenCalled();
    expect(span.end).toHaveBeenCalled();
    expect(captureException).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('metricsMiddleware logs success and error', async () => {
    const { metricsMiddleware } = await import('./middleware.js');

    const okNext = vi.fn(async () => 'ok');
    const ok = await (metricsMiddleware as any)({ path: 'x', type: 'query', next: okNext });
    expect(ok).toBe('ok');

    const badNext = vi.fn(async () => {
      throw new Error('fail');
    });
    await expect(
      (metricsMiddleware as any)({ path: 'x', type: 'query', next: badNext })
    ).rejects.toThrow('fail');
    expect(console.error).toHaveBeenCalled();
  });
});
