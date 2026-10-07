import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ init: vi.fn() }));

import * as Sentry from '@sentry/nextjs';
import { initSentry, isServerSentryEnabled } from '../init';
import { filterBreadcrumb, scrubEvent } from '../scrub';

// Built at runtime, on a reserved host, so no DSN-shaped literal is committed.
const dsn = ['https://', 'k'.repeat(8), '@sentry.example.invalid/', '1'].join('');

describe('initSentry', () => {
  beforeEach(() => vi.mocked(Sentry.init).mockClear());

  it.each([undefined, '', '   '])('does not initialise without a DSN (%j)', (value) => {
    expect(initSentry({ dsn: value, runtime: 'nodejs' })).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('initialises error-only, PII-free, with scrubbing hooks', () => {
    expect(
      initSentry({
        dsn: ` ${dsn} `,
        runtime: 'browser',
        environment: 'preview',
        release: 'abc123',
      })
    ).toBe(true);
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    const options = vi.mocked(Sentry.init).mock.calls[0]![0]!;
    expect(options).toEqual({
      dsn,
      environment: 'preview',
      release: 'abc123',
      sendDefaultPii: false,
      beforeSend: scrubEvent,
      beforeBreadcrumb: filterBreadcrumb,
      initialScope: { tags: { runtime: 'browser' } },
    });
    expect(options).not.toHaveProperty('tracesSampleRate');
    expect(options).not.toHaveProperty('replaysSessionSampleRate');
    expect(options).not.toHaveProperty('replaysOnErrorSampleRate');
  });

  it('falls back to NODE_ENV and no release', () => {
    initSentry({ dsn, runtime: 'edge', environment: ' ', release: ' ' });
    const options = vi.mocked(Sentry.init).mock.calls[0]![0]!;
    expect(options.environment).toBe(process.env.NODE_ENV);
    expect(options.release).toBeUndefined();
  });
});

describe('isServerSentryEnabled', () => {
  it('reflects SENTRY_DSN', () => {
    expect(isServerSentryEnabled({ SENTRY_DSN: dsn })).toBe(true);
    expect(isServerSentryEnabled({ SENTRY_DSN: ' ' })).toBe(false);
    expect(isServerSentryEnabled({})).toBe(false);
  });
});
