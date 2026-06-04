/**
 * bootContactEmbedWorker — changed-line coverage (PR #264 diff).
 *
 * The two changed runtime lines in ai-worker.ts that were uncovered:
 *   line 316: const { getEmbeddingChain } = await import('./chains/embedding.chain.js')
 *   line 328: const result = await getEmbeddingChain().generateEmbedding({ text })
 *
 * We directly invoke the private method (via `as any` cast) so we don't need
 * to boot the full AIWorker (Redis, BullMQ, OTel) to cover these two lines.
 * The `generateEmbedding` closure on line 328 is only reached when the
 * ContactEmbedWorker consumer calls it; the test captures that callback and
 * invokes it explicitly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted spy values
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  const mockGenerateEmbedding = vi.fn().mockResolvedValue({
    vector: [0.1, 0.2, 0.3],
    dimensions: 3,
    model: 'rag-free',
    text: 'hello',
  });

  const mockGetEmbeddingChain = vi.fn().mockReturnValue({
    generateEmbedding: mockGenerateEmbedding,
  });

  let capturedGenerateEmbeddingCb: ((text: string) => Promise<number[] | null>) | null = null;
  const mockContactEmbedWorkerStart = vi.fn().mockResolvedValue(undefined);
  const MockContactEmbedWorkerCtor = vi.fn().mockImplementation(function (
    _prisma: unknown,
    _redisConnection: unknown,
    embeddingChainLike: { generateEmbedding: (text: string) => Promise<number[] | null> },
    _updateFn: unknown
  ) {
    capturedGenerateEmbeddingCb = embeddingChainLike.generateEmbedding;
    return { start: mockContactEmbedWorkerStart };
  });

  return {
    mockGenerateEmbedding,
    mockGetEmbeddingChain,
    capturedGenerateEmbeddingCb: () => capturedGenerateEmbeddingCb,
    mockContactEmbedWorkerStart,
    MockContactEmbedWorkerCtor,
  };
});

// ---------------------------------------------------------------------------
// Module mocks
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

// Intercepts `await import('./chains/embedding.chain.js')` in ai-worker.ts (line 316)
vi.mock('../chains/embedding.chain', () => ({
  getEmbeddingChain: h.mockGetEmbeddingChain,
  EmbeddingChain: vi.fn(),
}));

// Capture the generateEmbedding callback passed to ContactEmbedWorker ctor
vi.mock('../workers/contact-embed-worker', () => ({
  ContactEmbedWorker: h.MockContactEmbedWorkerCtor,
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
  FEEDBACK_ANALYTICS_CRON: '0 2 * * *',
  MEMORY_RETENTION_CRON: '0 3 * * *',
  DEFAULT_SCORING_JOB_OPTIONS: { attempts: 3 },
  DEFAULT_INSIGHT_JOB_OPTIONS: { attempts: 3 },
  DEFAULT_FEEDBACK_ANALYTICS_JOB_OPTIONS: { attempts: 3 },
  DEFAULT_MEMORY_RETENTION_JOB_OPTIONS: { attempts: 3 },
  processScoringJob: vi.fn(),
  processPredictionJob: vi.fn(),
  processInsightJob: vi.fn(),
  processSummarizeJob: vi.fn(),
  processFeedbackAnalyticsJob: vi.fn(),
  processMemoryRetentionJob: vi.fn(),
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
describe('AIWorker.bootContactEmbedWorker — changed-line coverage (D2 PR #264)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish default mock behaviours cleared by clearAllMocks()
    h.mockGetEmbeddingChain.mockReturnValue({ generateEmbedding: h.mockGenerateEmbedding });
    h.mockGenerateEmbedding.mockResolvedValue({
      vector: [0.1, 0.2, 0.3],
      dimensions: 3,
      model: 'rag-free',
      text: 'hello',
    });
    h.mockContactEmbedWorkerStart.mockResolvedValue(undefined);
    h.MockContactEmbedWorkerCtor.mockImplementation(function (
      _prisma: unknown,
      _redisConnection: unknown,
      embeddingChainLike: { generateEmbedding: (text: string) => Promise<number[] | null> },
      _updateFn: unknown
    ) {
      (h as any)._cb = embeddingChainLike.generateEmbedding;
      return { start: h.mockContactEmbedWorkerStart };
    });
  });

  it('imports getEmbeddingChain and starts ContactEmbedWorker (line 316 reached)', async () => {
    const worker = new AIWorker();
    (worker as any).prisma = { $connect: vi.fn(), $disconnect: vi.fn() };

    await (worker as any).bootContactEmbedWorker();

    // ContactEmbedWorker was constructed and started → means the import path ran
    expect(h.MockContactEmbedWorkerCtor).toHaveBeenCalledTimes(1);
    expect(h.mockContactEmbedWorkerStart).toHaveBeenCalledTimes(1);
  });

  it('generateEmbedding callback invokes getEmbeddingChain().generateEmbedding (line 328 reached)', async () => {
    const worker = new AIWorker();
    (worker as any).prisma = { $connect: vi.fn(), $disconnect: vi.fn() };

    await (worker as any).bootContactEmbedWorker();

    // Extract the callback captured by the mock ContactEmbedWorker constructor
    const cb = (h as any)._cb as ((text: string) => Promise<number[] | null>) | undefined;
    expect(cb).toBeTypeOf('function');

    const vector = await cb!('test embedding text');

    // getEmbeddingChain() was called inside the closure (line 328)
    expect(h.mockGetEmbeddingChain).toHaveBeenCalled();
    // generateEmbedding received the wrapped { text } input
    expect(h.mockGenerateEmbedding).toHaveBeenCalledWith({ text: 'test embedding text' });
    // Callback returns the vector from the EmbeddingResult
    expect(vector).toEqual([0.1, 0.2, 0.3]);
  });

  it('generateEmbedding callback returns null when chain result has no vector', async () => {
    h.mockGenerateEmbedding.mockResolvedValue({ vector: undefined });

    const worker = new AIWorker();
    (worker as any).prisma = { $connect: vi.fn(), $disconnect: vi.fn() };

    await (worker as any).bootContactEmbedWorker();

    const cb = (h as any)._cb as ((text: string) => Promise<number[] | null>) | undefined;
    const result = await cb!('text without vector');
    expect(result).toBeNull();
  });

  it('bootContactEmbedWorker swallows errors and logs a warning (resilience)', async () => {
    h.mockContactEmbedWorkerStart.mockRejectedValue(new Error('Redis connect refused'));

    const worker = new AIWorker();
    (worker as any).prisma = { $connect: vi.fn(), $disconnect: vi.fn() };

    // Must not throw
    await expect((worker as any).bootContactEmbedWorker()).resolves.toBeUndefined();
    expect((worker as any).logger.warn).toHaveBeenCalled();
  });
});
