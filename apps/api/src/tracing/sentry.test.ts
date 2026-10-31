import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Unmock modules that are globally mocked in setup.ts but need real implementation here
vi.unmock('./sentry');

type SentryInitOptions = {
  dsn?: string;
  environment?: string;
  release?: string;
  tracesSampleRate?: number;
  beforeSend?: (event: any, hint?: any) => any;
  beforeBreadcrumb?: (breadcrumb: any, hint?: any) => any;
  beforeSendTransaction?: (event: any, hint?: any) => any;
};

const sentryInit = vi.fn();
const httpIntegration = vi.fn((_options?: unknown) => ({ name: 'httpIntegration' }));
const nativeNodeFetchIntegration = vi.fn(() => ({ name: 'nativeNodeFetchIntegration' }));
const sentryFlush = vi.fn(async () => true);
const sentryClose = vi.fn(async () => {});
const sentryCaptureException = vi.fn(() => 'evt-1');
const sentryCaptureMessage = vi.fn(() => 'msg-1');
const sentryStartSpan = vi.fn((_ctx: any, fn: any) => fn());
const sentrySetUser = vi.fn();
const sentrySetTag = vi.fn();
const sentrySetContext = vi.fn();

vi.mock('@sentry/node', () => ({
  init: sentryInit,
  httpIntegration,
  nativeNodeFetchIntegration,
  flush: sentryFlush,
  close: sentryClose,
  captureException: sentryCaptureException,
  captureMessage: sentryCaptureMessage,
  startSpan: sentryStartSpan,
  setUser: sentrySetUser,
  setTag: sentrySetTag,
  setContext: sentrySetContext,
}));

describe('Sentry integration (sentry.ts)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    sentryInit.mockClear();
    httpIntegration.mockClear();
    nativeNodeFetchIntegration.mockClear();
    sentryFlush.mockClear();
    sentryClose.mockClear();
    sentryCaptureException.mockClear();
    sentryCaptureMessage.mockClear();
    sentryStartSpan.mockClear();
    sentrySetUser.mockClear();
    sentrySetTag.mockClear();
    sentrySetContext.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('does not initialize in development', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SENTRY_DSN = 'https://example@dsn.ingest.sentry.io/123';

    const { initializeSentry } = await import('./sentry.js');
    await initializeSentry();

    expect(sentryInit).not.toHaveBeenCalled();
  });

  it('does not initialize without DSN in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SENTRY_DSN;

    const { initializeSentry } = await import('./sentry.js');
    await initializeSentry();

    expect(sentryInit).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it('initializes in production and scrubs sensitive data via hooks', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SENTRY_DSN = 'https://example@dsn.ingest.sentry.io/123';
    process.env.SENTRY_ENVIRONMENT = 'production';
    process.env.SENTRY_TRACES_SAMPLE_RATE = '0.25';
    process.env.npm_package_version = '1.2.3';

    const { initializeSentry, flushSentry, closeSentry, captureException, captureMessage } =
      await import('./sentry.js');

    await initializeSentry();

    expect(sentryInit).toHaveBeenCalledTimes(1);

    const options = sentryInit.mock.calls[0]?.[0] as SentryInitOptions;
    expect(options.dsn).toBe(process.env.SENTRY_DSN);
    expect(options.environment).toBe('production');
    expect(options.release).toBe('intelliflow-api@1.2.3');
    expect(options.tracesSampleRate).toBeCloseTo(0.25, 5);
    expect(options.beforeSend).toBeTypeOf('function');
    expect(options.beforeBreadcrumb).toBeTypeOf('function');

    // beforeSend: scrub sensitive request headers + user context fields
    const event: any = {
      request: {
        headers: {
          authorization: 'Bearer secret',
          cookie: 'session=secret',
          'x-api-key': 'secret',
          other: 'ok',
        },
      },
      contexts: {
        user: { id: 'user-1', email: 'a@b.com', username: 'name' },
      },
    };
    const scrubbed = options.beforeSend?.(event);
    expect(scrubbed.request.headers.authorization).toBeUndefined();
    expect(scrubbed.request.headers.cookie).toBeUndefined();
    expect(scrubbed.request.headers['x-api-key']).toBeUndefined();
    expect(scrubbed.request.headers.other).toBe('ok');
    expect(scrubbed.contexts.user.email).toBeUndefined();
    expect(scrubbed.contexts.user.username).toBeUndefined();

    // beforeBreadcrumb: scrub apikey param
    const breadcrumb: any = {
      category: 'http',
      data: { url: 'https://example.com/?apikey=secret&x=1' },
    };
    const cleaned = options.beforeBreadcrumb?.(breadcrumb);
    expect(cleaned.data.url).toBe('https://example.com/?apikey=***&x=1');

    // PG-208: the task-automation webhook token never reaches Sentry.
    const token = 'tat_' + 'k'.repeat(43);
    const path = `/api/webhooks/task-automation/${token}`;
    const webhookEvent: any = {
      request: { url: `https://api.example.invalid${path}?x=1` },
      transaction: `POST ${path}`,
      spans: [{ description: `POST ${path}` }, {}],
    };
    const scrubbedEvent = options.beforeSend?.(webhookEvent);
    expect(scrubbedEvent.request.url).toBe(
      'https://api.example.invalid/api/webhooks/task-automation/***?x=1'
    );
    expect(scrubbedEvent.transaction).toBe('POST /api/webhooks/task-automation/***');
    expect(scrubbedEvent.spans[0].description).toBe('POST /api/webhooks/task-automation/***');
    const crumb = options.beforeBreadcrumb?.({
      category: 'http',
      data: {
        url: `https://api.example.invalid${path}`,
        to: `/webhooks/task-automation/${token}`,
        from: 'x',
      },
    } as any);
    expect(crumb.data.url).toBe('https://api.example.invalid/api/webhooks/task-automation/***');
    expect(crumb.data.to).toBe('/webhooks/task-automation/***');
    expect(JSON.stringify([scrubbedEvent, crumb])).not.toContain(token);

    // Transactions skip beforeSend: their URLs, span attributes and headers are scrubbed too.
    const transaction: any = {
      transaction: `POST ${path}`,
      request: {
        url: `https://api.example.invalid${path}`,
        headers: { 'X-IntelliFlow-Signature': 't=1,v1=ab', 'Idempotency-Key': 'k1', accept: '*/*' },
      },
      spans: [
        { data: { 'url.full': `https://api.example.invalid${path}`, 'http.status_code': 202 } },
      ],
      contexts: { trace: { data: { 'http.target': path } } },
    };
    const scrubbedTransaction = options.beforeSendTransaction?.(transaction);
    expect(JSON.stringify(scrubbedTransaction)).not.toContain(token);
    expect(scrubbedTransaction.spans[0].data['http.status_code']).toBe(202);
    expect(scrubbedTransaction.request.headers).toEqual({ accept: '*/*' });
    expect(options.beforeSendTransaction?.({} as any)).toEqual({});

    // The webhook path is not traced at all.
    const httpOptions = httpIntegration.mock.calls[0]?.[0] as {
      ignoreIncomingRequests: (urlPath: string) => boolean;
    };
    expect(httpOptions.ignoreIncomingRequests(path)).toBe(true);
    expect(httpOptions.ignoreIncomingRequests('/trpc/task.list')).toBe(false);

    captureException(new Error('boom'), { user: { id: 'u' } });
    captureMessage('hello');
    expect(sentryCaptureException).toHaveBeenCalled();
    expect(sentryCaptureMessage).toHaveBeenCalled();

    const flushed = await flushSentry(1);
    expect(flushed).toBe(true);
    await closeSentry();
    expect(sentryClose).toHaveBeenCalled();
  });

  it('flushSentry returns false when flush throws', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SENTRY_DSN = 'https://example@dsn.ingest.sentry.io/123';
    sentryFlush.mockRejectedValueOnce(new Error('fail'));
    const { initializeSentry, flushSentry } = await import('./sentry.js');
    await initializeSentry();
    const ok = await flushSentry(1);
    expect(ok).toBe(false);
  });
});
