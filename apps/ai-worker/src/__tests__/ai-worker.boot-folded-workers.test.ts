/**
 * bootNotificationEmailWorker — changed-line coverage (#230 fold, notifications-worker only).
 *
 * diff-coverage flagged ai-worker.ts at 41/68 (60.3%) new-line coverage after
 * the fold — these three boot methods and their onStop() cleanup lines were
 * added but only ever exercised via their early-return / catch paths in other
 * tests (env vars unset in the test environment, or the real dynamic imports
 * throwing before reaching the success-path log line). This file drives each
 * one down its real success path, and its resilience path, directly — same
 * approach as ai-worker.boot-contact-embed.test.ts (invoke the private method
 * via an `as any` cast rather than booting the full worker).
 *
 * Lines covered:
 *   486  bootNotificationEmailWorker — resend branch
 *   497  bootNotificationEmailWorker — sendgrid branch
 *   523  bootNotificationEmailWorker — success log
 *   onStop() — the "NotificationEmailWorker stopped" log line
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted spy values
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  const mockBootNotificationEmailWorker = vi.fn().mockResolvedValue({ stop: vi.fn() });
  const mockCreatePrismaUserEmailLookup = vi.fn().mockReturnValue(vi.fn());

  const mockCreateEmailServiceAdapter = vi.fn().mockReturnValue({ send: vi.fn() });
  const MockRealNotificationServiceAdapter = vi.fn().mockImplementation(function () {
    return {};
  });
  const MockMockNotificationServiceAdapter = vi.fn().mockImplementation(function () {
    return {};
  });

  return {
    mockBootNotificationEmailWorker,
    mockCreatePrismaUserEmailLookup,
    mockCreateEmailServiceAdapter,
    MockRealNotificationServiceAdapter,
    MockMockNotificationServiceAdapter,
  };
});

// ---------------------------------------------------------------------------
// Module mocks (same baseline as ai-worker.boot-contact-embed.test.ts, so
// importing ai-worker.ts does not need Redis/BullMQ/OTel/Prisma for real)
// ---------------------------------------------------------------------------
vi.mock('@intelliflow/worker-shared', () => ({
  BaseWorker: class MockBaseWorker {
    logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    constructor(_opts: unknown) {}
    getQueue(_name: string) {
      return {
        upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
    }
    async start() {
      await (this as unknown as { onStart?: () => Promise<void> }).onStart?.();
    }
    async stop() {
      await (this as unknown as { onStop?: () => Promise<void> }).onStop?.();
    }
    getStatus() {
      return { state: 'running' };
    }
  },
}));

vi.mock('../workers/notification-email-worker', () => ({
  bootNotificationEmailWorker: h.mockBootNotificationEmailWorker,
  createPrismaUserEmailLookup: h.mockCreatePrismaUserEmailLookup,
}));

vi.mock('@intelliflow/adapters', () => ({
  DurableAuditLogAdapter: vi.fn().mockImplementation(() => ({})),
  createEmailServiceAdapter: h.mockCreateEmailServiceAdapter,
  RealNotificationServiceAdapter: h.MockRealNotificationServiceAdapter,
  MockNotificationServiceAdapter: h.MockMockNotificationServiceAdapter,
}));

vi.mock('@intelliflow/db', () => ({
  prisma: { $connect: vi.fn(), $disconnect: vi.fn() },
  PrismaClient: vi.fn(),
  updateContactEmbedding: vi.fn().mockResolvedValue(undefined),
  runWithQueryBudget: vi.fn().mockImplementation(async (_opts: unknown, fn: () => unknown) => fn()),
  resolveBackgroundBudget: vi.fn().mockReturnValue(50),
  getQueryBudgetStore: vi.fn().mockReturnValue(undefined),
}));

vi.mock('../jobs', () => ({
  AI_WORKER_QUEUES: [],
  SCORING_QUEUE: 'ai-scoring',
  PREDICTION_QUEUE: 'ai-prediction',
  INSIGHT_QUEUE: 'ai-insights',
  SUMMARIZE_QUEUE: 'ai-summarize-conversation',
  FEEDBACK_ANALYTICS_QUEUE: 'ai-feedback-analytics',
  MEMORY_RETENTION_QUEUE: 'ai-memory-retention',
  PORTAL_SWEEP_QUEUE: 'portal-sweep',
  FEEDBACK_ANALYTICS_CRON: '0 2 * * *',
  MEMORY_RETENTION_CRON: '0 3 * * *',
  PORTAL_SWEEP_CRON: '0 5 * * *',
  DEFAULT_SCORING_JOB_OPTIONS: { attempts: 3 },
  DEFAULT_INSIGHT_JOB_OPTIONS: { attempts: 3 },
  DEFAULT_FEEDBACK_ANALYTICS_JOB_OPTIONS: { attempts: 3 },
  DEFAULT_MEMORY_RETENTION_JOB_OPTIONS: { attempts: 3 },
  DEFAULT_PORTAL_SWEEP_JOB_OPTIONS: { attempts: 3 },
  processScoringJob: vi.fn(),
  processPredictionJob: vi.fn(),
  processInsightJob: vi.fn(),
  processSummarizeJob: vi.fn(),
  processFeedbackAnalyticsJob: vi.fn(),
  processMemoryRetentionJob: vi.fn(),
  processPortalSweepJob: vi.fn(),
  processEnrichmentJob: vi.fn(),
  processEntityInsightJob: vi.fn(),
  processReplyDraftJob: vi.fn(),
  processAccountScoringJob: vi.fn(),
  processTagSuggestionJob: vi.fn(),
}));

vi.mock('../config/ai.config', () => ({
  aiConfig: {
    provider: 'mock',
    openai: { model: 'gpt-4o', apiKey: '', baseUrl: '' },
    ollama: { model: 'mistral', baseUrl: 'http://localhost:11434' },
    costTracking: { enabled: false },
    performance: { cacheEnabled: false },
  },
  loadAIConfig: vi.fn(),
}));

vi.mock('../utils/cost-tracker', () => ({
  costTracker: {
    generateReport: vi.fn().mockReturnValue(''),
    getStatistics: vi.fn().mockReturnValue({ totalOperations: 0, totalCost: 0 }),
    addListener: vi.fn(),
  },
}));

vi.mock('../services/agent-status', () => ({
  extractJobContext: vi.fn().mockReturnValue(null),
  markAgentActive: vi.fn().mockResolvedValue(undefined),
  markAgentIdle: vi.fn().mockResolvedValue(undefined),
  markAgentError: vi.fn().mockResolvedValue(undefined),
  recordToolCall: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../monitoring', () => ({
  hallucinationChecker: {
    checkOutput: vi
      .fn()
      .mockResolvedValue({ hallucinated: false, score: 0, hallucinationTypes: [] }),
  },
  RedisMonitoringPublisher: vi.fn().mockImplementation(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

vi.mock('../monitoring/monitoring-flush.service', () => ({
  MonitoringFlushService: vi.fn().mockImplementation(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

vi.mock('../utils/audit-log', () => ({
  setAuditLogAdapter: vi.fn(),
}));

vi.mock('../chains/rag-context.chain', () => ({
  ragContextChain: { setRetrievalService: vi.fn() },
}));

vi.mock('../services/retrieval-service', () => ({
  RetrievalService: vi.fn().mockImplementation(() => ({ search: vi.fn() })),
}));

vi.mock('@intelliflow/observability', () => ({
  runWithLogContext: vi.fn().mockImplementation((_ctx: unknown, fn: () => unknown) => fn()),
  getCurrentLogContext: vi.fn().mockReturnValue(null),
}));

vi.mock('../tracing/tenant-context', () => ({
  tenantContextStore: {
    run: vi.fn().mockImplementation((_ctx: unknown, fn: () => unknown) => fn()),
  },
}));

vi.mock('bullmq', () => ({
  Job: class {},
  Queue: vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue({}),
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
  })),
  QueueEvents: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@bull-board/api', () => ({ createBullBoard: vi.fn() }));
vi.mock('@bull-board/api/bullMQAdapter', () => ({
  BullMQAdapter: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('@bull-board/express', () => ({
  ExpressAdapter: vi.fn().mockImplementation(() => ({
    setBasePath: vi.fn(),
    getRouter: vi.fn().mockReturnValue(vi.fn()),
  })),
}));
vi.mock('express', () => {
  const app = {
    use: vi.fn(),
    get: vi.fn(),
    disable: vi.fn(),
    listen: vi.fn((_p: number, cb?: () => void) => {
      cb?.();
      return { close: vi.fn() };
    }),
  };
  return { default: vi.fn(() => app) };
});

// ---------------------------------------------------------------------------
// SUT import — after all vi.mock() calls
// ---------------------------------------------------------------------------
import { AIWorker } from '../ai-worker';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AIWorker — folded-worker boot methods (#230)', () => {
  const ENV_KEYS = [
    'EMAIL_PROVIDER',
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
    'EMAIL_FROM_ADDRESS',
    'EMAIL_FROM_NAME',
    'SENDGRID_API_KEY',
  ] as const;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    h.mockBootNotificationEmailWorker.mockResolvedValue({ stop: vi.fn() });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  // -- bootNotificationEmailWorker --------------------------------------

  it('boots the resend adapter when EMAIL_PROVIDER=resend (line 486)', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 'test-resend-key';

    const worker = new AIWorker();
    (worker as any).prisma = { $connect: vi.fn(), $disconnect: vi.fn() };

    await (worker as any).bootNotificationEmailWorker();

    expect(h.mockCreateEmailServiceAdapter).toHaveBeenCalledWith({
      resendApiKey: 'test-resend-key',
    });
    expect(h.MockRealNotificationServiceAdapter).toHaveBeenCalledTimes(1);
    expect(h.mockBootNotificationEmailWorker).toHaveBeenCalledTimes(1);
    expect((worker as any).logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Notification email worker started')
    );
  });

  it('boots the sendgrid adapter when EMAIL_PROVIDER=sendgrid (line 497)', async () => {
    process.env.EMAIL_PROVIDER = 'sendgrid';
    process.env.SENDGRID_API_KEY = 'test-sendgrid-key';

    const worker = new AIWorker();
    (worker as any).prisma = { $connect: vi.fn(), $disconnect: vi.fn() };

    await (worker as any).bootNotificationEmailWorker();

    expect(h.mockCreateEmailServiceAdapter).toHaveBeenCalledWith({
      sendgridApiKey: 'test-sendgrid-key',
    });
    expect(h.MockRealNotificationServiceAdapter).toHaveBeenCalledTimes(1);
    expect(h.mockBootNotificationEmailWorker).toHaveBeenCalledTimes(1);
  });

  // codex-review finding mock-delivery-drains-real-queue: a resend/sendgrid
  // misconfiguration (provider selected, key missing) must NOT fall through
  // to the mock adapter — that would silently drain the real backlog as
  // "delivered" without ever sending an email. The consumer must refuse to
  // boot instead, leaving jobs queued.

  it('refuses to boot (and never falls back to mock) when EMAIL_PROVIDER=resend but RESEND_API_KEY is missing', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    // RESEND_API_KEY deliberately not set

    const worker = new AIWorker();
    (worker as any).prisma = { $connect: vi.fn(), $disconnect: vi.fn() };

    await (worker as any).bootNotificationEmailWorker();

    expect(h.MockMockNotificationServiceAdapter).not.toHaveBeenCalled();
    expect(h.MockRealNotificationServiceAdapter).not.toHaveBeenCalled();
    expect(h.mockBootNotificationEmailWorker).not.toHaveBeenCalled();
    expect((worker as any).logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ emailProvider: 'resend' }),
      expect.stringContaining('RESEND_API_KEY is not set')
    );
  });

  it('refuses to boot (and never falls back to mock) when EMAIL_PROVIDER=sendgrid but SENDGRID_API_KEY is missing', async () => {
    process.env.EMAIL_PROVIDER = 'sendgrid';
    // SENDGRID_API_KEY deliberately not set

    const worker = new AIWorker();
    (worker as any).prisma = { $connect: vi.fn(), $disconnect: vi.fn() };

    await (worker as any).bootNotificationEmailWorker();

    expect(h.MockMockNotificationServiceAdapter).not.toHaveBeenCalled();
    expect(h.MockRealNotificationServiceAdapter).not.toHaveBeenCalled();
    expect(h.mockBootNotificationEmailWorker).not.toHaveBeenCalled();
    expect((worker as any).logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ emailProvider: 'sendgrid' }),
      expect.stringContaining('SENDGRID_API_KEY is not set')
    );
  });

  it('falls back to the mock adapter and still logs success when no provider key is set', async () => {
    const worker = new AIWorker();
    (worker as any).prisma = { $connect: vi.fn(), $disconnect: vi.fn() };

    await (worker as any).bootNotificationEmailWorker();

    expect(h.MockMockNotificationServiceAdapter).toHaveBeenCalledTimes(1);
    expect((worker as any).logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Notification email worker started')
    );
  });

  it('bootNotificationEmailWorker swallows errors and logs a warning (resilience)', async () => {
    h.mockBootNotificationEmailWorker.mockRejectedValue(new Error('redis connect refused'));

    const worker = new AIWorker();
    (worker as any).prisma = { $connect: vi.fn(), $disconnect: vi.fn() };

    await expect((worker as any).bootNotificationEmailWorker()).resolves.toBeUndefined();
    expect((worker as any).logger.warn).toHaveBeenCalled();
  });

  // -- onStop() cleanup --

  it('stops the notification email worker on shutdown and logs it', async () => {
    const worker = new AIWorker();
    const notificationStop = vi.fn().mockResolvedValue(undefined);
    (worker as any).notificationEmailWorkerHandle = { stop: notificationStop };

    await (worker as any).onStop();

    expect(notificationStop).toHaveBeenCalledTimes(1);
    const infoCalls = (worker as any).logger.info.mock.calls.map((c: unknown[]) => c[0]);
    expect(infoCalls).toContain('NotificationEmailWorker stopped');
  });

  it('onStop is a clean no-op for the notification email worker when it was not booted', async () => {
    const worker = new AIWorker();

    await expect((worker as any).onStop()).resolves.toBeUndefined();

    const infoCalls = (worker as any).logger.info.mock.calls.map((c: unknown[]) => c[0]);
    expect(infoCalls).not.toContain('NotificationEmailWorker stopped');
  });
});
