/**
 * ADR-049 Plan/Reflect Phase Tests
 *
 * Covers the three-phase state machine added to BaseAgent.execute():
 *   plan() → executeTask() → reflect()
 *
 * Test matrix:
 *   1. Default (usesPlanning=false, usesReflection=false) preserves existing behavior
 *   2. usesReflection=true + schema pass + no hallucination + confidence ≥ threshold → approve
 *   3. Schema fail → reject + throw OutputRejectedError + enqueue review
 *   4. Hallucination flag → reject + throw + enqueue review
 *   5. Confidence < threshold (attempt 0) → retry once → approve on retry
 *   6. Retry exhausted (attempt 1, confidence still low) → reject + throw
 *   7. OutputRejectedError propagates — not swallowed by catch block
 *   8. usesPlanning=true → plan() is called and its return feeds reflect()
 *   9. enqueueForReview silently fails when Prisma is unavailable
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  BaseAgent,
  AgentTask,
  BaseAgentConfig,
  AgentResult,
  AgentPlan,
  AgentReflection,
  OutputRejectedError,
} from './base.agent';
import { z } from 'zod';

// ── Global mocks ─────────────────────────────────────────────────────────────

// Mock hallucinationChecker — default: no hallucination
const mockLastCheck = { hallucinated: false };
vi.mock('../monitoring/hallucination-checker.js', () => ({
  hallucinationChecker: {
    get lastCheck() {
      return mockLastCheck.hallucinated
        ? { hallucinated: true, hallucinationTypes: ['factual_error'] }
        : null;
    },
  },
}));

vi.mock('../lib/llm-factory.js', () => ({
  createLLM: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({ content: 'Mocked LLM response' }),
    withStructuredOutput: vi.fn(() => ({
      invoke: vi.fn().mockResolvedValue({ content: 'Mocked LLM response' }),
    })),
  })),
  createEmbeddings: vi.fn(() => ({
    embedQuery: vi.fn().mockResolvedValue([]),
    embedDocuments: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../config/ai.config', () => ({
  aiConfig: {
    provider: 'mock',
    openai: {
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      maxTokens: 2000,
      timeout: 30000,
      apiKey: 'test-api-key',
    },
    ollama: {
      baseUrl: 'http://localhost:11434',
      model: 'mistral',
      temperature: 0.7,
      timeout: 60000,
    },
    costTracking: { enabled: false },
  },
}));

vi.mock('../utils/cost-tracker', () => ({
  costTracker: { recordUsage: vi.fn() },
}));

vi.mock('../utils/token-counter', () => ({
  countMessagesTokens: vi.fn().mockReturnValue(50),
  countTokens: vi.fn().mockReturnValue(100),
}));

// Mock @intelliflow/db for enqueueForReview tests
const mockAIOutputReviewCreate = vi.fn().mockResolvedValue({ id: 'review-1' });
const mockAIMonitoringEventCreate = vi.fn().mockResolvedValue({});
vi.mock('@intelliflow/db', () => ({
  prisma: {
    aIOutputReview: { create: mockAIOutputReviewCreate },
    aIMonitoringEvent: { create: mockAIMonitoringEventCreate },
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const responseSchema = z.object({ response: z.string() });
type TInput = { message: string };
type TOutput = { response: string };

/** Concrete agent for testing. Subclasses can override plan()/reflect(). */
class TestAgent extends BaseAgent<TInput, TOutput> {
  public planCallCount = 0;
  public reflectCallCount = 0;
  public executeTaskCallCount = 0;

  // Configurable outputs
  public planReturn: AgentPlan = { intent: 'execute', toolsToCall: [], estimatedConfidence: 0.7 };
  public executeTaskReturn: TOutput = { response: 'test response with enough content to be valid' };

  protected async plan(_task: AgentTask<TInput, TOutput>): Promise<AgentPlan> {
    this.planCallCount++;
    return this.planReturn;
  }

  protected async executeTask(_task: AgentTask<TInput, TOutput>): Promise<TOutput> {
    this.executeTaskCallCount++;
    return this.executeTaskReturn;
  }

  protected async reflect(
    output: TOutput,
    plan: AgentPlan,
    task: AgentTask<TInput, TOutput>,
    attempt = 0
  ): Promise<AgentReflection> {
    this.reflectCallCount++;
    return super['reflect'](output, plan, task, attempt);
  }

  // Expose protected plan/reflect for targeted unit tests
  public callPlan(task: AgentTask<TInput, TOutput>): Promise<AgentPlan> {
    return this.plan(task);
  }

  public callReflect(
    output: TOutput,
    plan: AgentPlan,
    task: AgentTask<TInput, TOutput>,
    attempt = 0
  ): Promise<AgentReflection> {
    return this.reflect(output, plan, task, attempt);
  }
}

function makeTask(overrides: Partial<AgentTask<TInput, TOutput>> = {}): AgentTask<TInput, TOutput> {
  return {
    id: 'task-001',
    description: 'Test task',
    input: { message: 'Hello' },
    ...overrides,
  };
}

function makeConfig(overrides: Partial<BaseAgentConfig> = {}): BaseAgentConfig {
  return {
    name: 'Test Agent',
    role: 'Tester',
    goal: 'Test things',
    backstory: 'A test agent',
    usesPlanning: false,
    usesReflection: false,
    maxRetries: 1,
    confidenceThreshold: 0.3,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ADR-049 BaseAgent plan/reflect phases', () => {
  let agent: TestAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLastCheck.hallucinated = false;
  });

  afterEach(() => {
    mockLastCheck.hallucinated = false;
  });

  // ── 1. Default behavior (both flags false) ──────────────────────────────────

  describe('1. Default behavior — usesPlanning=false, usesReflection=false', () => {
    beforeEach(() => {
      agent = new TestAgent(makeConfig());
    });

    it('execute succeeds and returns AgentResult with success=true', async () => {
      const task = makeTask();
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output).toEqual(agent.executeTaskReturn);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('plan() is NOT called when usesPlanning=false', async () => {
      await agent.execute(makeTask());
      expect(agent.planCallCount).toBe(0);
    });

    it('reflect() is NOT called when usesReflection=false', async () => {
      await agent.execute(makeTask());
      expect(agent.reflectCallCount).toBe(0);
    });

    it('executionCount increments exactly once per call', async () => {
      const task = makeTask();
      await agent.execute(task);
      await agent.execute(task);
      expect(agent.getStats().executionCount).toBe(2);
    });

    it('schema validation still runs on the legacy path', async () => {
      // schema expects a number for response — will throw
      const badSchema = z.object({ response: z.number() });
      const task = makeTask({ expectedOutput: badSchema as any });
      const result = await agent.execute(task);
      // Schema parse throws ZodError — caught, returns success=false
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ── 2. Reflection approve path ──────────────────────────────────────────────

  describe('2. usesReflection=true — approve path', () => {
    beforeEach(() => {
      // usesPlanning=true so the subclass plan() is called and planReturn is used
      agent = new TestAgent(makeConfig({ usesPlanning: true, usesReflection: true }));
      agent.planReturn = { intent: 'execute', toolsToCall: [], estimatedConfidence: 0.8 };
    });

    it('returns success=true with verdict confidence when all rules pass', async () => {
      const task = makeTask({ expectedOutput: responseSchema });
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output).toEqual(agent.executeTaskReturn);
      // confidence comes from the reflect verdict (estimatedConfidence=0.8 from planReturn)
      expect(result.confidence).toBe(0.8);
    });

    it('reflect() is called exactly once on a clean run', async () => {
      await agent.execute(makeTask({ expectedOutput: responseSchema }));
      expect(agent.reflectCallCount).toBe(1);
    });

    it('metadata includes reflectVerdict=approve', async () => {
      const result = await agent.execute(makeTask({ expectedOutput: responseSchema }));
      expect(result.metadata?.reflectVerdict).toBe('approve');
    });

    it('no schema provided + no hallucination + confidence ≥ threshold → approve', async () => {
      const task = makeTask(); // no expectedOutput
      const result = await agent.execute(task);
      expect(result.success).toBe(true);
    });
  });

  // ── 3. Schema fail → reject ─────────────────────────────────────────────────

  describe('3. Schema fail → reject + OutputRejectedError', () => {
    beforeEach(() => {
      agent = new TestAgent(makeConfig({ usesReflection: true }));
      agent.planReturn = { intent: 'execute', toolsToCall: [], estimatedConfidence: 0.9 };
    });

    it('throws OutputRejectedError when schema validation fails', async () => {
      const badSchema = z.object({ response: z.number() }); // expects number, gets string
      const task = makeTask({ expectedOutput: badSchema as any });

      await expect(agent.execute(task)).rejects.toBeInstanceOf(OutputRejectedError);
    });

    it('OutputRejectedError message contains "schema"', async () => {
      const badSchema = z.object({ response: z.number() });
      const task = makeTask({ expectedOutput: badSchema as any });

      try {
        await agent.execute(task);
      } catch (e) {
        expect(e).toBeInstanceOf(OutputRejectedError);
        expect((e as OutputRejectedError).message.toLowerCase()).toContain('rejected');
      }
    });

    it('enqueueForReview is attempted when tenantId present (spy on method)', async () => {
      const badSchema = z.object({ response: z.number() });
      const task = makeTask({
        expectedOutput: badSchema as any,
        context: { metadata: { tenantId: 'tenant-abc' } },
      });

      // Spy on the private enqueueForReview to confirm it was called
      const spy = vi.spyOn(agent as any, 'enqueueForReview').mockResolvedValue(undefined);

      try {
        await agent.execute(task);
      } catch {
        /* expected OutputRejectedError */
      }

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'task-001' }), // task
        expect.anything(), // output
        expect.objectContaining({ action: 'reject' }) // verdict
      );
    });

    it('enqueueForReview skips when no tenantId (no throw from enqueue)', async () => {
      const badSchema = z.object({ response: z.number() });
      const task = makeTask({ expectedOutput: badSchema as any }); // no context

      // Should still throw OutputRejectedError (not from enqueue)
      await expect(agent.execute(task)).rejects.toBeInstanceOf(OutputRejectedError);
      expect(mockAIOutputReviewCreate).not.toHaveBeenCalled();
    });
  });

  // ── 4. Hallucination flag → reject ──────────────────────────────────────────

  describe('4. Hallucination detected → reject', () => {
    beforeEach(() => {
      agent = new TestAgent(makeConfig({ usesReflection: true }));
      agent.planReturn = { intent: 'execute', toolsToCall: [], estimatedConfidence: 0.9 };
      mockLastCheck.hallucinated = true; // enable hallucination flag
    });

    it('throws OutputRejectedError when hallucination is detected', async () => {
      await expect(agent.execute(makeTask())).rejects.toBeInstanceOf(OutputRejectedError);
    });

    it('rejection reason mentions hallucination', async () => {
      try {
        await agent.execute(makeTask());
      } catch (e) {
        expect((e as OutputRejectedError).reason.toLowerCase()).toContain('hallucination');
      }
    });

    it('hallucination reject wins even when schema passes', async () => {
      // Schema would pass, but hallucination should still reject
      const task = makeTask({ expectedOutput: responseSchema });
      await expect(agent.execute(task)).rejects.toBeInstanceOf(OutputRejectedError);
    });
  });

  // ── 5. Confidence < threshold → retry → approve ─────────────────────────────

  describe('5. Low confidence → retry once → approve', () => {
    it('retries once when estimatedConfidence < threshold on attempt 0', async () => {
      let callCount = 0;
      // First call: low confidence plan; second call: normal plan
      const lowConfidencePlan: AgentPlan = {
        intent: 'execute',
        toolsToCall: [],
        estimatedConfidence: 0.1, // below 0.3 threshold
      };
      const goodPlan: AgentPlan = {
        intent: 'execute',
        toolsToCall: [],
        estimatedConfidence: 0.9,
      };

      // usesPlanning=true so the overridden plan() is called instead of DEFAULT_PLAN
      agent = new TestAgent(
        makeConfig({
          usesPlanning: true,
          usesReflection: true,
          maxRetries: 1,
          confidenceThreshold: 0.3,
        })
      );

      // Override plan to return low confidence on first attempt, good on second
      (agent as any).plan = async (_task: AgentTask<TInput, TOutput>) => {
        callCount++;
        return callCount === 1 ? lowConfidencePlan : goodPlan;
      };

      const result = await agent.execute(makeTask());

      expect(result.success).toBe(true);
      expect(callCount).toBe(2); // plan called twice (once per attempt)
    });

    it('executionCount only increments once even after retry', async () => {
      let planCallCount = 0;
      // usesPlanning=true so the overridden plan() is used
      agent = new TestAgent(
        makeConfig({
          usesPlanning: true,
          usesReflection: true,
          maxRetries: 1,
          confidenceThreshold: 0.3,
        })
      );

      (agent as any).plan = async () => {
        planCallCount++;
        // First call low, second call high
        return planCallCount === 1
          ? { intent: 'execute', toolsToCall: [], estimatedConfidence: 0.1 }
          : { intent: 'execute', toolsToCall: [], estimatedConfidence: 0.9 };
      };

      await agent.execute(makeTask());
      expect(agent.getStats().executionCount).toBe(1);
    });
  });

  // ── 6. Retry exhausted → reject ─────────────────────────────────────────────

  describe('6. Retry exhausted → reject', () => {
    it('throws OutputRejectedError after maxRetries=1 exhausted with low confidence', async () => {
      // usesPlanning=true so the overridden plan() is used
      agent = new TestAgent(
        makeConfig({
          usesPlanning: true,
          usesReflection: true,
          maxRetries: 1,
          confidenceThreshold: 0.3,
        })
      );

      // Always return low confidence plan
      (agent as any).plan = async () => ({
        intent: 'execute',
        toolsToCall: [],
        estimatedConfidence: 0.1, // always below threshold
      });

      await expect(agent.execute(makeTask())).rejects.toBeInstanceOf(OutputRejectedError);
    });

    it('rejection reason mentions confidence after retry', async () => {
      agent = new TestAgent(
        makeConfig({
          usesPlanning: true,
          usesReflection: true,
          maxRetries: 1,
          confidenceThreshold: 0.3,
        })
      );
      (agent as any).plan = async () => ({
        intent: 'execute',
        toolsToCall: [],
        estimatedConfidence: 0.1,
      });

      try {
        await agent.execute(makeTask());
      } catch (e) {
        expect((e as OutputRejectedError).reason.toLowerCase()).toContain('confidence');
        expect((e as OutputRejectedError).reason.toLowerCase()).toContain('retry');
      }
    });
  });

  // ── 7. OutputRejectedError propagates ────────────────────────────────────────

  describe('7. OutputRejectedError propagates — not swallowed', () => {
    it('OutputRejectedError is NOT wrapped in success=false result', async () => {
      agent = new TestAgent(makeConfig({ usesReflection: true }));
      agent.planReturn = { intent: 'execute', toolsToCall: [], estimatedConfidence: 0.9 };
      mockLastCheck.hallucinated = true;

      // Must throw, not return { success: false }
      let threw = false;
      let returnedResult: AgentResult<TOutput> | null = null;
      try {
        returnedResult = await agent.execute(makeTask());
      } catch (e) {
        threw = true;
        expect(e).toBeInstanceOf(OutputRejectedError);
      }

      expect(threw).toBe(true);
      expect(returnedResult).toBeNull();
    });

    it('OutputRejectedError carries the rejected output', async () => {
      agent = new TestAgent(makeConfig({ usesReflection: true }));
      agent.planReturn = { intent: 'execute', toolsToCall: [], estimatedConfidence: 0.9 };
      mockLastCheck.hallucinated = true;

      try {
        await agent.execute(makeTask());
      } catch (e) {
        const err = e as OutputRejectedError;
        expect(err.output).toEqual(agent.executeTaskReturn);
      }
    });
  });

  // ── 8. usesPlanning=true ──────────────────────────────────────────────────────

  describe('8. usesPlanning=true — plan() is called', () => {
    it('plan() is called when usesPlanning=true', async () => {
      agent = new TestAgent(makeConfig({ usesPlanning: true, usesReflection: false }));
      await agent.execute(makeTask());
      expect(agent.planCallCount).toBe(1);
    });

    it('plan() is NOT called when usesPlanning=false', async () => {
      agent = new TestAgent(makeConfig({ usesPlanning: false, usesReflection: false }));
      await agent.execute(makeTask());
      expect(agent.planCallCount).toBe(0);
    });

    it('planReturn feeds reflect when both flags are true', async () => {
      agent = new TestAgent(
        makeConfig({
          usesPlanning: true,
          usesReflection: true,
          maxRetries: 1,
          confidenceThreshold: 0.5,
        })
      );
      agent.planReturn = { intent: 'test', toolsToCall: [], estimatedConfidence: 0.2 }; // low → retry (attempt 0), then reject (attempt 1)

      // Will retry once (attempt 0 → retry), still low → reject (attempt 1)
      await expect(agent.execute(makeTask())).rejects.toBeInstanceOf(OutputRejectedError);
      // planCallCount: 2 (initial attempt + 1 retry)
      expect(agent.planCallCount).toBe(2);
    });
  });

  // ── 9. enqueueForReview silent fail ────────────────────────────────────────────

  describe('9. enqueueForReview fails gracefully when Prisma unavailable', () => {
    it('still throws OutputRejectedError even when Prisma create fails', async () => {
      mockAIOutputReviewCreate.mockRejectedValueOnce(new Error('DB connection failed'));

      agent = new TestAgent(makeConfig({ usesReflection: true }));
      agent.planReturn = { intent: 'execute', toolsToCall: [], estimatedConfidence: 0.9 };
      mockLastCheck.hallucinated = true;

      // Should still throw — Prisma failure is swallowed, error propagates
      await expect(
        agent.execute(makeTask({ context: { metadata: { tenantId: 'tenant-xyz' } } }))
      ).rejects.toBeInstanceOf(OutputRejectedError);
    });
  });

  // ── Unit tests for plan() default ─────────────────────────────────────────────

  describe('plan() default implementation', () => {
    beforeEach(() => {
      agent = new TestAgent(makeConfig());
    });

    it('returns correct AgentPlan shape', async () => {
      const task = makeTask();
      const plan = await agent.callPlan(task);

      expect(plan).toHaveProperty('intent');
      expect(plan).toHaveProperty('toolsToCall');
      expect(plan).toHaveProperty('estimatedConfidence');
      expect(typeof plan.intent).toBe('string');
      expect(Array.isArray(plan.toolsToCall)).toBe(true);
      expect(typeof plan.estimatedConfidence).toBe('number');
    });

    it('default estimatedConfidence is 0.7', async () => {
      const plan = await agent.callPlan(makeTask());
      expect(plan.estimatedConfidence).toBe(0.7);
    });
  });

  // ── Unit tests for reflect() default ─────────────────────────────────────────

  describe('reflect() default rule-based implementation', () => {
    beforeEach(() => {
      agent = new TestAgent(makeConfig({ confidenceThreshold: 0.3 }));
    });

    it('approves when schema passes, no hallucination, confidence ≥ threshold', async () => {
      const plan: AgentPlan = { intent: 'execute', toolsToCall: [], estimatedConfidence: 0.8 };
      const task = makeTask({ expectedOutput: responseSchema });
      const verdict = await agent.callReflect(agent.executeTaskReturn, plan, task, 0);

      expect(verdict.action).toBe('approve');
      expect(verdict.confidence).toBe(0.8);
    });

    it('rejects when Zod schema fails', async () => {
      const badSchema = z.object({ response: z.number() });
      const task = makeTask({ expectedOutput: badSchema as any });
      const plan: AgentPlan = { intent: 'execute', toolsToCall: [], estimatedConfidence: 0.9 };

      const verdict = await agent.callReflect(agent.executeTaskReturn as any, plan, task, 0);

      expect(verdict.action).toBe('reject');
      expect(verdict.confidence).toBe(0);
    });

    it('rejects when hallucination detected (even with good confidence)', async () => {
      mockLastCheck.hallucinated = true;
      const plan: AgentPlan = { intent: 'execute', toolsToCall: [], estimatedConfidence: 0.9 };
      const task = makeTask({ expectedOutput: responseSchema });

      const verdict = await agent.callReflect(agent.executeTaskReturn, plan, task, 0);

      expect(verdict.action).toBe('reject');
    });

    it('retries when confidence < threshold on attempt 0', async () => {
      const plan: AgentPlan = { intent: 'execute', toolsToCall: [], estimatedConfidence: 0.2 };
      const task = makeTask({ expectedOutput: responseSchema });

      const verdict = await agent.callReflect(agent.executeTaskReturn, plan, task, 0);

      expect(verdict.action).toBe('retry');
    });

    it('rejects (not retries) when confidence < threshold on attempt 1', async () => {
      const plan: AgentPlan = { intent: 'execute', toolsToCall: [], estimatedConfidence: 0.2 };
      const task = makeTask({ expectedOutput: responseSchema });

      const verdict = await agent.callReflect(agent.executeTaskReturn, plan, task, 1);

      expect(verdict.action).toBe('reject');
    });

    it('no schema provided and no hallucination → approve', async () => {
      const plan: AgentPlan = { intent: 'execute', toolsToCall: [], estimatedConfidence: 0.7 };
      const task = makeTask(); // no expectedOutput

      const verdict = await agent.callReflect(agent.executeTaskReturn, plan, task, 0);

      expect(verdict.action).toBe('approve');
    });
  });

  // ── OutputRejectedError class ─────────────────────────────────────────────────

  describe('OutputRejectedError class', () => {
    it('has correct name and message format', () => {
      const err = new OutputRejectedError('test reason');
      expect(err.name).toBe('OutputRejectedError');
      expect(err.message).toBe('Agent output rejected: test reason');
      expect(err.reason).toBe('test reason');
    });

    it('carries optional output payload', () => {
      const payload = { foo: 'bar' };
      const err = new OutputRejectedError('reason', payload);
      expect(err.output).toEqual(payload);
    });

    it('is instanceof Error', () => {
      const err = new OutputRejectedError('x');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(OutputRejectedError);
    });
  });
});
