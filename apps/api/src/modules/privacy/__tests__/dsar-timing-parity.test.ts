/**
 * PG-203 DSAR — a wrong link answers the same whether or not the request exists.
 *
 * Structural, not wall-clock: the real public router, the real DataSubjectRequestService and
 * the real token port, with a recording repository and a spied timingSafeEqual. For an unknown
 * request id and a known one with a wrong token, verify and downloadExport must make the same
 * repository reads, compare exactly once (against a dummy hash when the id is unknown) and give
 * byte-identical answers with the same status.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getHTTPStatusCodeFromError } from '@trpc/server/http';
import { TRPCError } from '@trpc/server';
import { DataSubjectRequestService } from '@intelliflow/application';
import { privacyPublicRouter } from '../privacy-public.router';
import { createDsarTokenPort } from '../dsar-token';
import { bookingLookupLimiter, bookingSubmitLimiter } from '../../calendar/booking-abuse';
import { createPublicContext } from '../../../test/setup';

const crypto = vi.hoisted(() => ({
  timingSafeEqual: undefined as unknown as ReturnType<typeof vi.fn>,
}));
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  crypto.timingSafeEqual = vi.fn(actual.timingSafeEqual);
  return { ...actual, timingSafeEqual: crypto.timingSafeEqual };
});

const NOW = new Date('2026-10-22T10:00:00Z');
const KNOWN_ID = 'clhrequest000000000';
const UNKNOWN_ID = 'clhunknown000000000';
const tokens = createDsarTokenPort(() => 'test-salt-for-dsar');

let calls: string[];
let known: Record<string, unknown>;

/** A repository that records every method called on it, and knows one request. */
function recordingRepo() {
  return new Proxy(
    {},
    {
      get: (_target, name: string) =>
        vi.fn(async (...args: unknown[]) => {
          calls.push(name);
          if (name === 'findById') return args[0] === KNOWN_ID ? known : null;
          return null;
        }),
    }
  );
}

function caller() {
  const service = new DataSubjectRequestService({
    repo: recordingRepo(),
    subjectData: recordingRepo(),
    restrictions: recordingRepo(),
    notifications: { send: vi.fn() },
    tokens,
    appUrl: () => 'https://app.example.invalid',
  } as never);
  const ctx = createPublicContext({
    services: { dsar: service } as never,
    req: new Request('https://api.example.invalid/trpc', {
      headers: { 'x-real-ip': '203.0.113.50' },
    }) as never,
  });
  return privacyPublicRouter.createCaller(ctx as never);
}

/** Runs one call from a fresh limiter and returns what reached the repository and the wire. */
async function observe(run: () => Promise<unknown>) {
  bookingLookupLimiter.reset();
  bookingSubmitLimiter.reset();
  calls = [];
  crypto.timingSafeEqual.mockClear();
  const error = await run().then(
    () => null,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(TRPCError);
  const trpc = error as TRPCError;
  return {
    reads: [...calls],
    compares: crypto.timingSafeEqual.mock.calls.length,
    status: getHTTPStatusCodeFromError(trpc),
    wire: JSON.stringify({ code: trpc.code, message: trpc.message, cause: trpc.cause ?? null }),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const later = new Date(NOW.getTime() + 3_600_000);
  known = {
    id: KNOWN_ID,
    tenantId: 'clhtenant0000000000',
    type: 'ACCESS',
    status: 'PENDING_VERIFICATION',
    subjectEmail: 'ada@example.invalid',
    verificationTokenHash: tokens.issue().hash,
    verificationExpiresAt: later,
    exportTokenHash: tokens.issue().hash,
    exportExpiresAt: later,
    exportDownloads: 0,
  };
});

describe('DSAR links do not reveal whether a request exists', () => {
  it.each([
    ['verify', (token: string, requestId: string) => caller().verify({ requestId, token })],
    [
      'downloadExport',
      (token: string, requestId: string) => caller().downloadExport({ requestId, token }),
    ],
  ])('%s: same reads, one compare and identical answers', async (_name, call) => {
    const wrong = tokens.issue().token;
    const unknown = await observe(() => call(wrong, UNKNOWN_ID));
    const knownWrongToken = await observe(() => call(wrong, KNOWN_ID));

    expect(unknown.reads).toEqual(['findById']);
    expect(knownWrongToken.reads).toEqual(unknown.reads);
    expect(unknown.compares).toBe(1);
    expect(knownWrongToken.compares).toBe(1);
    expect(knownWrongToken.status).toBe(unknown.status);
    expect(knownWrongToken.wire).toBe(unknown.wire);
  });
});
