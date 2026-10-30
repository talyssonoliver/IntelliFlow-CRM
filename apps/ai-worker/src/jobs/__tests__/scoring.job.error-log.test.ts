/**
 * The scoring job's fallback logs carry an error class only: a provider error can echo prompt or
 * lead text, and no AI log line may carry error text (IFC-117 NF-002).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';

const pinoLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
}));
vi.mock('pino', () => {
  const pino = Object.assign(() => pinoLogger, {
    stdTimeFunctions: { isoTime: () => '' },
    stdSerializers: { err: (e: unknown) => e },
  });
  return { default: pino, pino };
});

const mockScoreLead = vi.fn();
vi.mock('../../chains/scoring.chain', () => {
  class LeadScoringChain {
    scoreLead = (input: unknown) => mockScoreLead(input);
  }
  return {
    leadScoringChain: { scoreLead: (input: unknown) => mockScoreLead(input) },
    LeadScoringChain,
  };
});

vi.mock('../../versioning/chain-version-loader', () => ({
  getVersionLoader: vi.fn(() => ({
    getChainConfig: vi.fn().mockRejectedValue(new Error('no DB in tests')),
  })),
  configureVersionLoader: vi.fn(),
  CHAIN_TYPE_MAP: { LEAD_SCORING: 'SCORING' },
}));

const prismaMock = vi.hoisted(() => ({
  leadAIInsight: { upsert: vi.fn() },
  lead: { groupBy: vi.fn() },
}));
vi.mock('@intelliflow/db', () => ({ prisma: prismaMock }));

// PG-203: every lead is eligible and the locked write runs straight against the prisma mock.
// The guard itself is tested in lib/__tests__/data-request-guard.test.ts.
vi.mock('../../lib/data-request-guard', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  scoringBlockedBy: vi.fn(async () => null),
  writeIfStillEligible: vi.fn(
    async (_prisma: unknown, _job: unknown, write: (tx: unknown) => Promise<unknown>) => ({
      written: true,
      value: await write(prismaMock),
    })
  ),
}));

// A configured fallback provider, so the #324 job-level fallback path runs deterministically.
vi.mock('../../lib/llm-factory', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return { ...actual, resolveFallbackProvider: vi.fn(() => 'litellm') };
});

import { processScoringJob, type ScoringJobData } from '../scoring.job';
import { __resetBreakers } from '../../lib/llm-factory';

const canary = ['provider', 'echo', 'canary'].join('-');
const fail = (where: string) => new Error(`${where} failed for ${canary}`);
const SCORED = {
  score: 70,
  confidence: 0.8,
  factors: [{ name: 'f', impact: 10, reasoning: 'A reasonably detailed factor reasoning.' }],
  modelVersion: 'litellm:scoring-free:v1',
};

function job(leadId = '12345678-0000-4000-8000-000012345678'): Job<ScoringJobData> {
  return {
    data: {
      leadId,
      tenantId: '99999999-0000-4000-8000-000099999999',
      lead: { email: 'lead@example.invalid', source: 'WEBSITE' },
      priority: 5,
    },
    id: 'error-log-job',
    name: 'scoring',
    updateProgress: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
    token: 'test-lock-token',
    extendLock: vi.fn().mockResolvedValue(undefined),
    progress: 0,
    attemptsMade: 0,
  } as unknown as Job<ScoringJobData>;
}

const warnFor = (message: string) =>
  pinoLogger.warn.mock.calls.filter(([, msg]) => String(msg).includes(message));
const errorFor = (message: string) =>
  pinoLogger.error.mock.calls.filter(([, msg]) => String(msg).includes(message));

describe('processScoringJob — fallback logs (IFC-117 NF-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pinoLogger.child.mockReturnValue(pinoLogger);
    prismaMock.leadAIInsight.upsert.mockResolvedValue({ id: 'insight-1' });
    __resetBreakers();
  });

  it('logs the primary failure by class when the fallback provider recovers', async () => {
    mockScoreLead.mockRejectedValueOnce(fail('primary')).mockResolvedValueOnce(SCORED);

    await processScoringJob(job());

    const logs = warnFor('recovered via fallback provider');
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain(canary);
    expect(logs[0][0]).toMatchObject({ primaryErrorClass: 'other' });
  });

  it('logs both failures by class when the job drops to the heuristic', async () => {
    mockScoreLead.mockRejectedValueOnce(fail('primary')).mockRejectedValueOnce(fail('fallback'));

    const result = await processScoringJob(job());

    expect(result.modelVersion).toBe('fallback');
    const fallbackLogs = warnFor('Fallback provider also failed');
    const heuristicLogs = warnFor('using heuristic fallback');
    expect(fallbackLogs).toHaveLength(1);
    expect(heuristicLogs).toHaveLength(1);
    expect(JSON.stringify(pinoLogger.warn.mock.calls)).not.toContain(canary);
    expect(fallbackLogs[0][0]).toMatchObject({ errorClass: 'other' });
    expect(heuristicLogs[0][0]).toMatchObject({ errorClass: 'other' });
  });

  it('logs a failed result write by class, never the database error text', async () => {
    mockScoreLead.mockResolvedValueOnce(SCORED);
    prismaMock.leadAIInsight.upsert.mockRejectedValueOnce(fail('upsert'));

    await processScoringJob(job());

    const logs = errorFor('Failed to persist scoring result');
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain(canary);
    expect(logs[0][0]).toMatchObject({ errorClass: 'other' });
  });

  it('logs a failed scheduled dispatch by class, never the database error text', async () => {
    prismaMock.lead.groupBy.mockRejectedValueOnce(fail('groupBy'));

    await processScoringJob(job('00000000-0000-0000-0000-000000000000'));

    const logs = errorFor('Scheduled scoring dispatcher failed');
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain(canary);
    expect(logs[0][0]).toMatchObject({ errorClass: 'other' });
  });
});
