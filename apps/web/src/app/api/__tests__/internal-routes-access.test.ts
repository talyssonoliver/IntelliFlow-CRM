// @vitest-environment node
/**
 * Every internal route refuses a caller with no sign-in, and developer-only actions
 * refuse in production, before any of their own code runs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
vi.mock('@/lib/session', () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

const startTestRun = vi.fn();
vi.mock('@/lib/test-runner', () => ({
  startTestRun: (...args: unknown[]) => startTestRun(...args),
  getActiveRuns: () => new Map(),
  getRunState: () => undefined,
  cancelTestRun: () => false,
  testRunnerEvents: { on: vi.fn(), off: vi.fn() },
}));

const adrService = vi.hoisted(() => ({
  createADR: vi.fn(),
  updateADRStatus: vi.fn(),
  writeADRIndex: vi.fn(),
  generateADRIndex: vi.fn(),
  getAllADRs: vi.fn(() => []),
  searchADRs: vi.fn(() => []),
  validateAllADRs: vi.fn(() => []),
  getADRStats: vi.fn(),
  generateDependencyGraph: vi.fn(),
  VALID_STATUSES: ['Proposed'],
}));
vi.mock('@/lib/adr/adr-service', () => adrService);

import { NextRequest } from 'next/server';
import * as adr from '../adr/route';
import * as adrCreate from '../adr/create/route';
import * as adrIndex from '../adr/index/route';
import * as adrStatus from '../adr/status/route';
import * as adrValidate from '../adr/validate/route';
import * as complianceDetail from '../compliance/[standardId]/route';
import * as complianceRisks from '../compliance/risks/route';
import * as complianceTimeline from '../compliance/timeline/route';
import * as reports from '../quality-reports/route';
import * as generate from '../quality-reports/generate/route';
import * as status from '../quality-reports/status/route';
import * as testRun from '../quality-reports/test-run/route';
import * as testRunById from '../quality-reports/test-run/[runId]/route';
import * as events from '../quality-reports/test-run/events/route';
import * as view from '../quality-reports/view/route';

type Handler = (request: NextRequest, context: never) => Promise<Response>;

const ROUTE_CONTEXT = {
  params: Promise.resolve({ runId: 'run-1', standardId: 'iso-27001' }),
} as never;

const request = (method = 'GET', headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/internal?runId=run-1&jobId=job-1&report=coverage', {
    method,
    headers,
    ...(method === 'POST'
      ? { body: JSON.stringify({ title: 'x', id: 'x', status: 'Proposed' }) }
      : {}),
  });

const OPERATOR_READS: [string, unknown][] = [
  ['adr GET', adr.GET],
  ['adr/index GET', adrIndex.GET],
  ['adr/validate GET', adrValidate.GET],
  ['quality-reports GET', reports.GET],
  ['generate GET', generate.GET],
  ['status GET', status.GET],
  ['test-run GET', testRun.GET],
  ['test-run/[runId] GET', testRunById.GET],
  ['test-run/events GET', events.GET],
  ['view GET', view.GET],
];

const SIGNED_IN_READS: [string, unknown][] = [
  ['compliance/[standardId] GET', complianceDetail.GET],
  ['compliance/risks GET', complianceRisks.GET],
  ['compliance/timeline GET', complianceTimeline.GET],
];

const DEVELOPER_ACTIONS: [string, unknown, string][] = [
  ['adr/create POST', adrCreate.POST, 'POST'],
  ['adr/status POST', adrStatus.POST, 'POST'],
  ['adr/index POST', adrIndex.POST, 'POST'],
  ['generate POST', generate.POST, 'POST'],
  ['test-run POST', testRun.POST, 'POST'],
  ['test-run/[runId] DELETE', testRunById.DELETE, 'DELETE'],
];

const call = (handler: unknown, req: NextRequest) => (handler as Handler)(req, ROUTE_CONTEXT);
const BEARER = { authorization: 'Bearer abc' };
const customer = () =>
  getUser.mockResolvedValue({
    data: {
      user: {
        id: 'u1',
        email: 'customer@example.invalid',
        email_confirmed_at: '2026-01-01T00:00:00Z',
        user_metadata: { role: 'ADMIN' },
      },
    },
    error: null,
  });

beforeEach(() => {
  getUser.mockReset();
  startTestRun.mockReset();
  Object.values(adrService).forEach((fn) => {
    if (typeof fn === 'function') (fn as ReturnType<typeof vi.fn>).mockClear();
  });
  vi.stubEnv('PLATFORM_ADMIN_EMAILS', 'ops@example.invalid');
  vi.stubEnv('NODE_ENV', 'development');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('without a sign-in', () => {
  it.each([...OPERATOR_READS, ...SIGNED_IN_READS])('%s returns 401', async (_name, handler) => {
    expect((await call(handler, request())).status).toBe(401);
  });

  it.each(DEVELOPER_ACTIONS)('%s returns 401', async (_name, handler, method) => {
    expect((await call(handler, request(method))).status).toBe(401);
    expect(startTestRun).not.toHaveBeenCalled();
  });
});

describe('a signed-in customer, even one whose metadata says ADMIN', () => {
  it.each(OPERATOR_READS)('%s returns 403', async (_name, handler) => {
    customer();
    expect((await call(handler, request('GET', BEARER))).status).toBe(403);
  });

  it.each(DEVELOPER_ACTIONS)('%s returns 403', async (_name, handler, method) => {
    customer();
    expect((await call(handler, request(method, BEARER))).status).toBe(403);
    expect(startTestRun).not.toHaveBeenCalled();
    expect(adrService.createADR).not.toHaveBeenCalled();
  });

  it.each(SIGNED_IN_READS)('%s is allowed through', async (_name, handler) => {
    customer();
    expect((await call(handler, request('GET', BEARER))).status).not.toBe(401);
  });
});

describe('in production', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'production'));

  it.each(DEVELOPER_ACTIONS)('%s refuses even an operator', async (_name, handler, method) => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: 'op',
          email: 'ops@example.invalid',
          email_confirmed_at: '2026-01-01T00:00:00Z',
        },
      },
      error: null,
    });
    expect((await call(handler, request(method, BEARER))).status).toBe(403);
    expect(startTestRun).not.toHaveBeenCalled();
    expect(adrService.createADR).not.toHaveBeenCalled();
  });
});

describe('test-run input', () => {
  const operator = () =>
    getUser.mockResolvedValue({
      data: {
        user: {
          id: 'op',
          email: 'ops@example.invalid',
          email_confirmed_at: '2026-01-01T00:00:00Z',
        },
      },
      error: null,
    });
  const post = (body: unknown) =>
    new NextRequest('http://localhost/api/quality-reports/test-run', {
      method: 'POST',
      headers: BEARER,
      body: JSON.stringify(body),
    });

  it.each([
    ['a flag', { patterns: ['--config=x'] }],
    ['a non-array', { patterns: 'packages/domain' }],
    ['a non-string', { patterns: [1] }],
    ['shell characters', { patterns: ['a;b'] }],
    ['a zero timeout', { timeout: 0 }],
    ['an over-long timeout', { timeout: 31 * 60 * 1000 }],
    ['a text timeout', { timeout: '5' }],
  ])('refuses %s', async (_name, body) => {
    operator();
    const response = await testRun.POST(post(body));
    expect(response.status).toBe(400);
    expect(startTestRun).not.toHaveBeenCalled();
  });

  it('accepts test paths', async () => {
    operator();
    startTestRun.mockResolvedValue({
      runId: 'r',
      status: 'running',
      startedAt: 'now',
      config: {},
    });
    const response = await testRun.POST(post({ patterns: ['packages/domain/src/*.test.ts'] }));
    expect(response.status).toBe(200);
    expect(startTestRun).toHaveBeenCalledTimes(1);
  });
});
