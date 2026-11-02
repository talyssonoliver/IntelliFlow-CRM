import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Use vi.hoisted for mocks to be available during module loading
const {
  span,
  tracer,
  getTracer,
  captureException,
  setUser,
  setTag,
  setContext,
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
    setContext: vi.fn(),
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
        procedure: { use: (mw: any) => mw },
      }),
    }),
  },
}));

vi.mock('./sentry', () => ({
  captureException: (err: unknown) => captureException(err),
  setUser: (user: Record<string, unknown> | null) => setUser(user),
  setTag: (key: string, value: string) => setTag(key, value),
  setContext: (name: string, ctx: Record<string, unknown>) => setContext(name, ctx),
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

/** The spy logger installed for every api test by src/test/setup.ts (IFC-074). */
async function apiLogger() {
  const { getApiLogger } = await import('./logger.js');
  return getApiLogger() as unknown as Record<'info' | 'warn' | 'error', ReturnType<typeof vi.fn>>;
}

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

  it('records success spans and logs request', async () => {
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
    // ADR-053: the query-budget snapshot is surfaced onto the span.
    expect(span.setAttribute).toHaveBeenCalledWith('db.query.count', expect.any(Number));
    expect(span.setAttribute).toHaveBeenCalledWith('db.query.over_budget', expect.any(Boolean));
    expect(setUser).toHaveBeenCalled();
    expect(setTag).toHaveBeenCalled();
    // IFC-074: the request record goes through the api pino logger, not console.
    const logger = await apiLogger();
    expect(logger.info).toHaveBeenCalledWith(
      {
        type: 'trpc.request',
        correlationId: 'cid',
        path: 'misc.health',
        method: 'query',
        durationMs: expect.any(Number),
        status: 'success',
      },
      'trpc request'
    );
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('trpc.request'));
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
    const logger = await apiLogger();
    expect(logger.error).toHaveBeenCalledWith(
      {
        type: 'trpc.error',
        correlationId: 'cid',
        path: 'misc.health',
        method: 'query',
        durationMs: expect.any(Number),
        status: 'error',
        code: 'INTERNAL_SERVER_ERROR',
        errorName: 'Error',
      },
      'trpc error'
    );
  });

  it('never puts the error message, stack, cause or request id on the error record', async () => {
    const { tracingMiddleware } = await import('./middleware.js');
    const err = new MockTRPCError({
      code: 'BAD_REQUEST',
      message: 'person@example.invalid is bad',
    });
    (err as Error & { cause?: unknown }).cause = new Error('inner');
    const next = async () => {
      throw err;
    };

    await expect(
      (tracingMiddleware as any)({ path: 'lead.create', type: 'mutation', next, ctx: {} })
    ).rejects.toThrow();

    const logger = await apiLogger();
    const [record] = logger.error.mock.calls[0] as [Record<string, unknown>, string];
    expect(record).not.toHaveProperty('message');
    expect(record).not.toHaveProperty('error');
    expect(record).not.toHaveProperty('stack');
    expect(record).not.toHaveProperty('cause');
    expect(record).not.toHaveProperty('requestId');
    expect(JSON.stringify(record)).not.toContain('example.invalid');
    expect(record.code).toBe('BAD_REQUEST');
  });

  it('omits code for a non-TRPC error', async () => {
    const { tracingMiddleware } = await import('./middleware.js');
    const next = async () => {
      throw new TypeError('x');
    };

    await expect(
      (tracingMiddleware as any)({ path: 'misc.health', type: 'query', next, ctx: {} })
    ).rejects.toThrow();

    const logger = await apiLogger();
    const [record] = logger.error.mock.calls[0] as [Record<string, unknown>, string];
    expect(record.code).toBeUndefined();
    expect(record.errorName).toBe('TypeError');
  });

  it.each([
    ['spaces and symbols', 'x y<>'],
    ['a newline', 'Bad' + String.fromCharCode(10) + 'Name'],
    ['62 characters', 'E'.repeat(62)],
    ['an empty name', ''],
  ])('falls back to errorName "Error" for a name with %s', async (_label, name) => {
    const { tracingMiddleware } = await import('./middleware.js');
    const err = new Error('boom');
    err.name = name;
    const next = async () => {
      throw err;
    };

    await expect(
      (tracingMiddleware as any)({ path: 'misc.health', type: 'query', next, ctx: {} })
    ).rejects.toThrow();

    const logger = await apiLogger();
    const [record] = logger.error.mock.calls[0] as [Record<string, unknown>, string];
    expect(record.errorName).toBe('Error');
  });

  it('logs "invalid" for a path outside the procedure-name pattern', async () => {
    const { tracingMiddleware } = await import('./middleware.js');

    await (tracingMiddleware as any)({
      path: 'a b',
      type: 'query',
      next: async () => 'ok',
      ctx: {},
    });

    const logger = await apiLogger();
    const [record] = logger.info.mock.calls[0] as [Record<string, unknown>, string];
    expect(record.path).toBe('invalid');
  });

  it('logs a trpc.slow warning for requests over 50ms', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { tracingMiddleware } = await import('./middleware.js');
      const next = vi.fn(async () => {
        vi.setSystemTime(Date.now() + 60);
        return 'slow';
      });

      await (tracingMiddleware as any)({ path: 'lead.list', type: 'query', next, ctx: {} });

      const logger = await apiLogger();
      expect(logger.warn).toHaveBeenCalledWith(
        {
          type: 'trpc.slow',
          correlationId: 'cid',
          path: 'lead.list',
          method: 'query',
          durationMs: expect.any(Number),
          targetMs: 50,
        },
        'slow trpc request'
      );
      const [record] = logger.warn.mock.calls[0] as [Record<string, number>, string];
      expect(record.durationMs).toBeGreaterThan(50);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not warn for a fast request', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { tracingMiddleware } = await import('./middleware.js');

      await (tracingMiddleware as any)({
        path: 'lead.list',
        type: 'query',
        next: async () => 'fast',
        ctx: {},
      });

      const logger = await apiLogger();
      expect(logger.warn).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits the request record before the span ends', async () => {
    const { tracingMiddleware } = await import('./middleware.js');

    await (tracingMiddleware as any)({
      path: 'misc.health',
      type: 'query',
      next: async () => 'ok',
      ctx: {},
    });

    const logger = await apiLogger();
    expect(logger.info.mock.invocationCallOrder[0]).toBeLessThan(
      span.end.mock.invocationCallOrder[0]
    );
  });

  it('emits the error record before the span ends', async () => {
    const { tracingMiddleware } = await import('./middleware.js');
    const next = async () => {
      throw new Error('x');
    };

    await expect(
      (tracingMiddleware as any)({ path: 'misc.health', type: 'query', next, ctx: {} })
    ).rejects.toThrow();

    const logger = await apiLogger();
    expect(logger.error.mock.invocationCallOrder[0]).toBeLessThan(
      span.end.mock.invocationCallOrder[0]
    );
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
