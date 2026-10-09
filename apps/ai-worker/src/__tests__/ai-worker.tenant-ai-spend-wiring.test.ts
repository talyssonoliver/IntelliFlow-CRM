/**
 * AIWorker.wireTenantAiSpend: the cost-tracker listener must never leave the recorder's promise
 * unobserved. A recorder rejection is reported through the worker logger at the call site.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  capturedListeners: [] as Array<(usage: unknown) => void>,
  record: vi.fn(),
}));

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
    addListener: (listener: (usage: unknown) => void) => {
      h.capturedListeners.push(listener);
      return () => undefined;
    },
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

vi.mock('@intelliflow/adapters', () => ({
  DurableAuditLogAdapter: vi.fn().mockImplementation(() => ({})),
  PrismaQuotaRepository: class {},
  PrismaTenantModuleRepository: class {},
}));

vi.mock('@intelliflow/application', () => ({
  QuotaService: class {},
}));

vi.mock('../utils/tenant-ai-spend', () => ({
  createTenantAiSpendRecorder: () => h.record,
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

// SUT
import { AIWorker } from '../ai-worker';

describe('AIWorker.wireTenantAiSpend listener', () => {
  beforeEach(() => {
    h.capturedListeners.length = 0;
    h.record.mockReset();
  });

  async function wire() {
    const worker = new AIWorker();
    (worker as any).prisma = { $connect: vi.fn(), $disconnect: vi.fn() };
    await (worker as any).wireTenantAiSpend();
    const logger = (worker as any).logger as { warn: ReturnType<typeof vi.fn> };
    return { listener: h.capturedListeners[0], logger };
  }

  it('hands each usage event to the recorder without logging a failure', async () => {
    h.record.mockResolvedValue(undefined);
    const { listener, logger } = await wire();

    listener({ cost: 0.02 });
    await Promise.resolve();

    expect(h.record).toHaveBeenCalledWith({ cost: 0.02 });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs a warning when the recorder rejects with an Error', async () => {
    h.record.mockRejectedValue(new Error('quota store down'));
    const { listener, logger } = await wire();

    listener({ cost: 0.02 });
    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(1));

    expect(logger.warn).toHaveBeenCalledWith(
      { error: 'quota store down' },
      expect.stringContaining('this usage was not attributed')
    );
  });

  it('stringifies a non-Error rejection when logging', async () => {
    h.record.mockRejectedValue('boom');
    const { listener, logger } = await wire();

    listener({ cost: 0.02 });
    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(1));

    expect(logger.warn).toHaveBeenCalledWith({ error: 'boom' }, expect.any(String));
  });
});
