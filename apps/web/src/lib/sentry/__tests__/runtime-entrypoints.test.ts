import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initSentry: vi.fn(),
  startTracing: vi.fn(),
  captureRequestError: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureRequestError: mocks.captureRequestError,
  captureRouterTransitionStart: mocks.captureRouterTransitionStart,
}));
vi.mock('../init', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../init')>()),
  initSentry: mocks.initSentry,
}));
vi.mock('../../../tracing/otel', () => ({ startTracing: mocks.startTracing }));

const dsn = ['https://', 'k'.repeat(8), '@sentry.example.invalid/', '1'].join('');

describe('Sentry runtime entrypoints', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.initSentry.mockReset();
    mocks.startTracing.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('sentry.server.config passes server env to initSentry', async () => {
    vi.stubEnv('SENTRY_DSN', dsn);
    vi.stubEnv('SENTRY_ENVIRONMENT', 'staging');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'sha1');
    await import('../../../sentry.server.config');
    expect(mocks.initSentry).toHaveBeenCalledWith({
      dsn,
      runtime: 'nodejs',
      environment: 'staging',
      release: 'sha1',
    });
  });

  it('sentry.edge.config passes server env to initSentry', async () => {
    vi.stubEnv('SENTRY_DSN', dsn);
    vi.stubEnv('SENTRY_ENVIRONMENT', 'staging');
    await import('../../../sentry.edge.config');
    expect(mocks.initSentry).toHaveBeenCalledWith(
      expect.objectContaining({ dsn, runtime: 'edge', environment: 'staging' })
    );
  });

  it('instrumentation-client uses only the public DSN and exports the router hook', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', dsn);
    vi.stubEnv('SENTRY_DSN', 'must-not-be-used');
    const mod = await import('../../../instrumentation-client');
    expect(mocks.initSentry).toHaveBeenCalledWith(
      expect.objectContaining({ dsn, runtime: 'browser' })
    );
    expect(mod.onRouterTransitionStart).toBe(mocks.captureRouterTransitionStart);
  });

  describe('instrumentation register()', () => {
    it('with a DSN on nodejs, Sentry owns tracing and the OTel SDK is not started', async () => {
      vi.stubEnv('NEXT_RUNTIME', 'nodejs');
      vi.stubEnv('SENTRY_DSN', dsn);
      vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '');
      const mod = await import('../../../instrumentation');
      await mod.register();
      expect(mocks.initSentry).toHaveBeenCalledOnce();
      expect(mocks.startTracing).not.toHaveBeenCalled();
      expect(mod.onRequestError).toBe(mocks.captureRequestError);
    });

    it('warns when a DSN and an OTLP endpoint are both set', async () => {
      vi.stubEnv('NEXT_RUNTIME', 'nodejs');
      vi.stubEnv('SENTRY_DSN', dsn);
      vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://collector.example.invalid:4318');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await (await import('../../../instrumentation')).register();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Sentry owns the tracer provider'));
      expect(mocks.startTracing).not.toHaveBeenCalled();
    });

    it('without a DSN on nodejs, tracing starts exactly as before', async () => {
      vi.stubEnv('NEXT_RUNTIME', 'nodejs');
      vi.stubEnv('SENTRY_DSN', '');
      await (await import('../../../instrumentation')).register();
      expect(mocks.startTracing).toHaveBeenCalledOnce();
    });

    it('loads the edge config on the edge runtime and nothing else', async () => {
      vi.stubEnv('NEXT_RUNTIME', 'edge');
      vi.stubEnv('SENTRY_DSN', dsn);
      await (await import('../../../instrumentation')).register();
      expect(mocks.initSentry).toHaveBeenCalledWith(expect.objectContaining({ runtime: 'edge' }));
      expect(mocks.startTracing).not.toHaveBeenCalled();
    });
  });
});
