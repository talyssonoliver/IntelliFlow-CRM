/**
 * AI Worker - Supplementary2 Tests
 *
 * Tests the AIWorker class and createAIWorker factory:
 * - Constructor configuration
 * - onStart: loadAIConfig, logger calls
 * - onStop: cost report generation
 * - processJob: routing to scoring and prediction queues
 * - processJob: unknown queue error
 * - getDependencyHealth: config loaded vs not loaded
 * - getDependencyHealth: cost tracker stats
 * - getDependencyHealth: error handling
 * - createAIWorker factory
 *
 * All dependencies (BaseWorker, jobs, config, cost-tracker) are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Hoisted mocks
// ============================================================
const mocks = vi.hoisted(() => ({
  mockProcessScoringJob: vi.fn().mockResolvedValue({ score: 85 }),
  mockProcessPredictionJob: vi.fn().mockResolvedValue({ prediction: 'high' }),
  mockLoadAIConfig: vi.fn().mockResolvedValue(undefined),
  mockGenerateReport: vi.fn().mockReturnValue('Cost Report: $0.00'),
  mockGetStatistics: vi.fn().mockReturnValue({
    totalOperations: 10,
    totalCost: 1.5,
    totalInputTokens: 5000,
    totalOutputTokens: 2000,
  }),
  mockStart: vi.fn().mockResolvedValue(undefined),
  mockLoggerInfo: vi.fn(),
}));

// ============================================================
// Mock BaseWorker
// ============================================================
vi.mock('@intelliflow/worker-shared', () => ({
  BaseWorker: class MockBaseWorker {
    logger = { info: mocks.mockLoggerInfo, error: vi.fn(), warn: vi.fn() };
    constructor(_opts: any) {}
    getQueue(_name: string) { return {}; }
    async start() {
      await (this as any).onStart?.();
      mocks.mockStart();
    }
    async stop() {
      await (this as any).onStop?.();
    }
  },
}));

// ============================================================
// Mock jobs
// ============================================================
vi.mock('../jobs', () => ({
  AI_WORKER_QUEUES: ['ai-scoring', 'ai-prediction', 'ai-insights'],
  SCORING_QUEUE: 'ai-scoring',
  PREDICTION_QUEUE: 'ai-prediction',
  INSIGHT_QUEUE: 'ai-insights',
  processScoringJob: mocks.mockProcessScoringJob,
  processPredictionJob: mocks.mockProcessPredictionJob,
  processInsightJob: vi.fn().mockResolvedValue({}),
}));

// ============================================================
// Mock config
// ============================================================
vi.mock('../config/ai.config', () => ({
  aiConfig: {
    provider: 'openai',
    openai: { model: 'gpt-4-turbo-preview' },
    ollama: { model: 'mistral' },
    costTracking: { enabled: true },
    performance: { cacheEnabled: true },
  },
  loadAIConfig: mocks.mockLoadAIConfig,
}));

// ============================================================
// Mock cost tracker
// ============================================================
vi.mock('../utils/cost-tracker', () => ({
  costTracker: {
    generateReport: mocks.mockGenerateReport,
    getStatistics: mocks.mockGetStatistics,
  },
}));

// ============================================================
// Mock agent-status (used by processJob)
// ============================================================
vi.mock('../services/agent-status', () => ({
  extractJobContext: vi.fn().mockReturnValue(null),
  markAgentActive: vi.fn().mockResolvedValue(undefined),
  markAgentIdle: vi.fn().mockResolvedValue(undefined),
  markAgentError: vi.fn().mockResolvedValue(undefined),
}));

// ============================================================
// Mock hallucination checker (used by processJob post-completion)
// ============================================================
vi.mock('../monitoring', () => ({
  hallucinationChecker: {
    checkOutput: vi.fn().mockResolvedValue({
      hallucinated: false,
      score: 0.1,
      hallucinationTypes: [],
    }),
  },
}));

// ============================================================
// Mock bullmq
// ============================================================
vi.mock('bullmq', () => ({
  Job: class {},
  Queue: class { constructor(_name: any, _opts: any) {} },
}));

// ============================================================
// Mock Bull Board + Express (used by startDashboard)
// ============================================================
vi.mock('@bull-board/api', () => ({
  createBullBoard: vi.fn(),
}));

vi.mock('@bull-board/api/bullMQAdapter', () => ({
  BullMQAdapter: class { constructor(_q: any) {} },
}));

vi.mock('@bull-board/express', () => ({
  ExpressAdapter: class {
    setBasePath = vi.fn();
    getRouter = vi.fn().mockReturnValue(vi.fn());
  },
}));

vi.mock('express', () => {
  const app = {
    use: vi.fn(),
    get: vi.fn(),
    disable: vi.fn(),
    listen: vi.fn((_port: number, cb?: () => void) => {
      cb?.();
      return { close: vi.fn() };
    }),
  };
  return { default: vi.fn(() => app) };
});

// ============================================================
// Import after mocks
// ============================================================
import { AIWorker, createAIWorker } from '../ai-worker';

// ============================================================
// Tests
// ============================================================
describe('AIWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockLoadAIConfig.mockResolvedValue(undefined);
    mocks.mockProcessScoringJob.mockResolvedValue({ score: 85 });
    mocks.mockProcessPredictionJob.mockResolvedValue({ prediction: 'high' });
    mocks.mockGetStatistics.mockReturnValue({
      totalOperations: 10,
      totalCost: 1.5,
      totalInputTokens: 5000,
      totalOutputTokens: 2000,
    });
    mocks.mockGenerateReport.mockReturnValue('Cost Report: $1.50');
  });

  // -------------------------------------------------------
  // Constructor
  // -------------------------------------------------------
  describe('constructor', () => {
    it('creates an AIWorker instance', () => {
      const worker = new AIWorker();
      expect(worker).toBeDefined();
    });
  });

  // -------------------------------------------------------
  // onStart
  // -------------------------------------------------------
  describe('onStart', () => {
    it('loads AI configuration', async () => {
      const worker = new AIWorker();
      await worker.start();
      expect(mocks.mockLoadAIConfig).toHaveBeenCalled();
    });

    it('logs initialization messages', async () => {
      const worker = new AIWorker();
      await worker.start();
      expect(mocks.mockLoggerInfo).toHaveBeenCalledWith('Initializing AI components...');
    });

    it('logs AI configuration details', async () => {
      const worker = new AIWorker();
      await worker.start();
      expect(mocks.mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai',
          model: 'gpt-4-turbo-preview',
          costTrackingEnabled: true,
          cacheEnabled: true,
        }),
        'AI configuration loaded'
      );
    });

    it('logs cost tracker initialization', async () => {
      const worker = new AIWorker();
      await worker.start();
      expect(mocks.mockLoggerInfo).toHaveBeenCalledWith('Cost tracker initialized');
    });

    it('logs ready message with queue names', async () => {
      const worker = new AIWorker();
      await worker.start();
      expect(mocks.mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          queues: ['ai-scoring', 'ai-prediction', 'ai-insights'],
        }),
        'AI Worker ready to process jobs'
      );
    });
  });

  // -------------------------------------------------------
  // onStop
  // -------------------------------------------------------
  describe('onStop', () => {
    it('generates and logs final cost report', async () => {
      const worker = new AIWorker();
      await worker.start();

      mocks.mockLoggerInfo.mockClear();
      await worker.stop();

      expect(mocks.mockLoggerInfo).toHaveBeenCalledWith('Shutting down AI Worker...');
      expect(mocks.mockGenerateReport).toHaveBeenCalled();
      expect(mocks.mockLoggerInfo).toHaveBeenCalledWith('AI Worker shutdown complete');
    });

    it('logs the cost report string', async () => {
      const worker = new AIWorker();
      await worker.start();

      mocks.mockLoggerInfo.mockClear();
      await worker.stop();

      expect(mocks.mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('Cost Report'));
    });
  });

  // -------------------------------------------------------
  // processJob
  // -------------------------------------------------------
  describe('processJob', () => {
    it('routes scoring queue to processScoringJob', async () => {
      const worker = new AIWorker();
      const job = { queueName: 'ai-scoring', data: { leadId: '123' } } as any;

      // Access protected method
      const result = await (worker as any).processJob(job);
      expect(mocks.mockProcessScoringJob).toHaveBeenCalledWith(job);
      expect(result).toEqual({ score: 85 });
    });

    it('routes prediction queue to processPredictionJob', async () => {
      const worker = new AIWorker();
      const job = { queueName: 'ai-prediction', data: { type: 'churn' } } as any;

      const result = await (worker as any).processJob(job);
      expect(mocks.mockProcessPredictionJob).toHaveBeenCalledWith(job);
      expect(result).toEqual({ prediction: 'high' });
    });

    it('throws error for unknown queue name', async () => {
      const worker = new AIWorker();
      const job = { queueName: 'unknown-queue', data: {} } as any;

      await expect((worker as any).processJob(job)).rejects.toThrow('Unknown queue: unknown-queue');
    });
  });

  // -------------------------------------------------------
  // getDependencyHealth
  // -------------------------------------------------------
  describe('getDependencyHealth', () => {
    it('reports config as ok after start', async () => {
      const worker = new AIWorker();
      await worker.start();

      const health = await (worker as any).getDependencyHealth();
      expect(health.ai_config).toBeDefined();
      expect(health.ai_config.status).toBe('ok');
      expect(health.ai_config.lastCheck).toBeDefined();
    });

    it('reports config as error before start', async () => {
      const worker = new AIWorker();
      // Do not call start - configLoaded is false

      const health = await (worker as any).getDependencyHealth();
      expect(health.ai_config.status).toBe('error');
    });

    it('includes cost tracker health', async () => {
      const worker = new AIWorker();
      await worker.start();

      const health = await (worker as any).getDependencyHealth();
      expect(health.cost_tracker).toBeDefined();
      expect(health.cost_tracker.status).toBe('ok');
      expect(health.cost_tracker.message).toContain('ops=10');
      expect(health.cost_tracker.message).toContain('cost=$1.50');
    });

    it('handles getStatistics error gracefully', async () => {
      mocks.mockGetStatistics.mockImplementationOnce(() => {
        throw new Error('Stats unavailable');
      });

      const worker = new AIWorker();
      await worker.start();

      const health = await (worker as any).getDependencyHealth();
      expect(health.ai_provider).toBeDefined();
      expect(health.ai_provider.status).toBe('error');
      expect(health.ai_provider.message).toBe('Stats unavailable');
    });

    it('handles non-Error thrown in dependency check', async () => {
      mocks.mockGetStatistics.mockImplementationOnce(() => {
        throw 'string error';
      });

      const worker = new AIWorker();
      await worker.start();

      const health = await (worker as any).getDependencyHealth();
      expect(health.ai_provider).toBeDefined();
      expect(health.ai_provider.status).toBe('error');
      expect(health.ai_provider.message).toBe('string error');
    });
  });

  // -------------------------------------------------------
  // createAIWorker factory
  // -------------------------------------------------------
  describe('createAIWorker', () => {
    it('creates and starts an AIWorker instance', async () => {
      const worker = await createAIWorker();
      expect(worker).toBeInstanceOf(AIWorker);
      expect(mocks.mockStart).toHaveBeenCalled();
    });

    it('loads config during creation', async () => {
      await createAIWorker();
      expect(mocks.mockLoadAIConfig).toHaveBeenCalled();
    });
  });
});
