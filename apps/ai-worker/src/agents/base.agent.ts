import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { aiConfig } from '../config/ai.config';
import { costTracker } from '../utils/cost-tracker';
import { countMessagesTokens, countTokens } from '../utils/token-counter';
import { ConversationRecordCallbackHandler } from '../callbacks/conversation-record.handler';
import { createLLM, type LLMPurpose } from '../lib/llm-factory';
import { hallucinationChecker } from '../monitoring/hallucination-checker';
import pino from 'pino';

/** Expected output-token range for a "normal" response. */
const OUTPUT_TOKEN_MIN = 10;
const OUTPUT_TOKEN_MAX = 1500;

/** Confidence threshold below which reflect() issues a retry verdict. */
const DEFAULT_CONFIDENCE_THRESHOLD = 0.3;

/**
 * Interface for LLM model invocation
 * Supports both real LangChain models and mock implementations
 */
interface LLMModel {
  invoke(input: BaseMessage[] | string): Promise<{ content: string | unknown[] }>;
}

const logger = pino({
  name: 'base-agent',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Agent execution context
 */
export interface AgentContext {
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  // Crew-specific context properties
  crewTask?: string;
  expectedOutput?: string;
  role?: 'manager' | 'worker';
  workers?: string[];
  managerOutput?: unknown;
}

/**
 * Agent task definition
 */
export interface AgentTask<TInput = unknown, TOutput = unknown> {
  id: string;
  description: string;
  input: TInput;
  expectedOutput?: z.ZodSchema<TOutput>;
  context?: AgentContext;
}

/**
 * Agent result with confidence and metadata
 */
export interface AgentResult<TOutput = unknown> {
  success: boolean;
  output?: TOutput;
  confidence: number;
  reasoning?: string;
  metadata?: Record<string, unknown>;
  error?: string;
  timestamp: Date;
  duration: number;
}

/**
 * ADR-049: Typed plan produced by the plan() phase.
 */
export interface AgentPlan {
  intent: string;
  toolsToCall: string[];
  estimatedConfidence: number;
}

/**
 * ADR-049: Typed verdict produced by the reflect() phase.
 * Replaces the hardcoded 0.8 confidence constant with a first-class output.
 */
export interface AgentReflection {
  action: 'approve' | 'retry' | 'reject';
  reason?: string;
  confidence: number;
}

/**
 * ADR-049: Error thrown when reflect() returns action='reject'.
 * Propagates to BullMQ job handlers so they can enqueue the output to ADR-037.
 */
export class OutputRejectedError extends Error {
  constructor(
    public readonly reason: string,
    public readonly output?: unknown
  ) {
    super(`Agent output rejected: ${reason}`);
    this.name = 'OutputRejectedError';
  }
}

/** Sentinel plan used when usesPlanning is false. */
const DEFAULT_PLAN: AgentPlan = {
  intent: 'execute',
  toolsToCall: [],
  estimatedConfidence: 0.7,
};

/**
 * Base Agent Configuration
 */
export interface BaseAgentConfig {
  name: string;
  role: string;
  goal: string;
  backstory: string;
  maxIterations?: number;
  allowDelegation?: boolean;
  verbose?: boolean;
  /** LLM purpose — determines model routing via factory. Defaults to 'reasoning'. */
  purpose?: LLMPurpose;
  /** ADR-049: enable planning phase before execute (default false). */
  usesPlanning?: boolean;
  /** ADR-049: enable reflection phase after execute (default false). */
  usesReflection?: boolean;
  /** ADR-049: max retries on reflect 'retry' verdict (default 1). */
  maxRetries?: number;
  /** ADR-049: confidence threshold below which reflect issues retry (default 0.3). */
  confidenceThreshold?: number;
}

/**
 * Base Agent Class
 * Foundation for all AI agents in the system
 * Provides common functionality for agent execution, error handling, and monitoring
 */
export abstract class BaseAgent<TInput = unknown, TOutput = unknown> {
  protected model: LLMModel;
  protected readonly purpose: LLMPurpose;
  protected config: BaseAgentConfig;
  protected executionCount: number = 0;

  /** Optional callback handler for recording LLM calls to the database. */
  private conversationCallback?: ConversationRecordCallbackHandler;

  constructor(config: BaseAgentConfig) {
    this.config = {
      maxIterations: 5,
      allowDelegation: false,
      verbose: false,
      usesPlanning: false,
      usesReflection: false,
      maxRetries: 1,
      confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
      ...config,
    };

    // Purpose defaults to 'reasoning' if not specified by subclass
    this.purpose = config.purpose ?? 'reasoning';

    // Initialize LLM via factory — provider/tier routing handled centrally
    this.model = createLLM(this.purpose, 'free', {
      temperature: aiConfig.openai.temperature,
      maxTokens: aiConfig.openai.maxTokens,
      timeout: aiConfig.openai.timeout,
    });

    logger.info(
      {
        agentName: this.config.name,
        role: this.config.role,
        provider: aiConfig.provider,
      },
      'Agent initialized'
    );
  }

  /**
   * ADR-049 Phase 1: Planning hook.
   * Default no-op — returns a sentinel plan without an LLM call.
   * Subclasses override to perform LLM-based decomposition.
   */
  protected async plan(_task: AgentTask<TInput, TOutput>): Promise<AgentPlan> {
    return { intent: 'execute', toolsToCall: [], estimatedConfidence: 0.7 };
  }

  /**
   * ADR-049 Phase 3: Reflection hook.
   * Default rule-based implementation — zero LLM cost.
   *
   * Rules (applied in order):
   *   1. Schema mismatch  → reject
   *   2. Hallucination detected → reject
   *   3. Confidence below threshold and attempt 0 → retry
   *   4. Otherwise → approve
   *
   * The `attempt` parameter is threaded from execute() to let the reflection
   * policy escalate from retry→reject on the second pass.
   */
  protected async reflect(
    output: TOutput,
    plan: AgentPlan,
    task: AgentTask<TInput, TOutput>,
    attempt: number = 0
  ): Promise<AgentReflection> {
    const threshold = this.config.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

    // Rule 1 — schema match
    if (task.expectedOutput) {
      const result = task.expectedOutput.safeParse(output);
      if (!result.success) {
        return {
          action: 'reject',
          reason: `Schema validation failed: ${result.error.message}`,
          confidence: 0,
        };
      }
    }

    // Rule 2 — hallucination gate (blocking — ADR-049 M11 fix)
    const lastHallucination = hallucinationChecker.lastCheck;
    if (lastHallucination?.hallucinated === true) {
      return {
        action: 'reject',
        reason: `Hallucination detected: types=${lastHallucination.hallucinationTypes.join(', ')}`,
        confidence: 0,
      };
    }

    // Rule 3 — confidence threshold
    const confidence = plan.estimatedConfidence;
    if (confidence < threshold) {
      if (attempt < (this.config.maxRetries ?? 1)) {
        return {
          action: 'retry',
          reason: `Confidence ${confidence.toFixed(2)} below threshold ${threshold}`,
          confidence,
        };
      }
      // Second pass still below threshold → reject
      return {
        action: 'reject',
        reason: `Confidence ${confidence.toFixed(2)} below threshold after retry`,
        confidence,
      };
    }

    // All clear
    return { action: 'approve', confidence };
  }

  /**
   * Enqueue a rejected output to the ADR-037 AIOutputReview queue.
   * Uses a dynamic Prisma import to avoid circular deps (same pattern as jobs/).
   * Fails gracefully — rejection is still propagated via OutputRejectedError.
   */
  private async enqueueForReview(
    task: AgentTask<TInput, TOutput>,
    output: TOutput,
    verdict: AgentReflection
  ): Promise<void> {
    try {
      const { prisma } = await import('@intelliflow/db');
      const tenantId = (task.context?.metadata?.tenantId as string | undefined) ?? null;

      if (!tenantId) {
        logger.warn(
          { taskId: task.id, agentName: this.config.name },
          'enqueueForReview: no tenantId in task context — skipping AIOutputReview creation'
        );
        return;
      }

      await (prisma as any).aIOutputReview.create({
        data: {
          tenantId,
          outputType: 'LEAD_SCORING', // default; subclasses can override enqueueForReview()
          outputPayload: { taskId: task.id, output, rejectReason: verdict.reason },
          confidence: verdict.confidence,
          slaDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h SLA
        },
      });

      logger.warn(
        {
          taskId: task.id,
          agentName: this.config.name,
          reason: verdict.reason,
        },
        'Rejected output enqueued to AIOutputReview queue'
      );
    } catch (err) {
      logger.error(
        {
          taskId: task.id,
          agentName: this.config.name,
          error: err instanceof Error ? err.message : String(err),
        },
        'Failed to enqueue rejected output — Prisma unavailable'
      );
    }
  }

  /**
   * Emit an AIMonitoringEvent with eventType='phase_transition' for ADR-043.
   * Fails gracefully — monitoring must never break the task execution path.
   */
  private emitPhaseTransition(
    phase: 'plan' | 'execute' | 'reflect' | 'finalize',
    task: AgentTask<TInput, TOutput>,
    extra?: Record<string, unknown>
  ): void {
    const tenantId = (task.context?.metadata?.tenantId as string | undefined) ?? null;
    import('@intelliflow/db')
      .then(({ prisma }) =>
        (prisma as any).aIMonitoringEvent.create({
          data: {
            eventType: 'phase_transition',
            metric: phase,
            flagged: false,
            tenantId,
            payload: {
              phase,
              agentName: this.config.name,
              taskId: task.id,
              tenantId,
              ...extra,
            },
          },
        })
      )
      .catch((err: unknown) => {
        logger.debug(
          {
            phase,
            taskId: task.id,
            error: err instanceof Error ? err.message : String(err),
          },
          'Phase transition event not persisted (Prisma unavailable)'
        );
      });
  }

  /**
   * Execute a task with the agent.
   *
   * ADR-049 3-phase state machine:
   *   Phase 1 — plan()       (skipped when usesPlanning=false)
   *   Phase 2 — executeTask() (always runs)
   *   Phase 3 — reflect()    (skipped when usesReflection=false)
   *
   * When usesPlanning=false AND usesReflection=false, behavior is identical
   * to the pre-ADR-049 implementation — zero regression for existing subclasses.
   */
  async execute(task: AgentTask<TInput, TOutput>, attempt = 0): Promise<AgentResult<TOutput>> {
    const startTime = Date.now();
    // Only increment executionCount on the first attempt (not on retries)
    if (attempt === 0) {
      this.executionCount++;
    }

    logger.info(
      {
        agentName: this.config.name,
        taskId: task.id,
        taskDescription: task.description,
        attempt,
      },
      'Agent task started'
    );

    // ── Finalize tracking ─────────────────────────────────────────────────
    // ADR-049: finalize-phase emission must fire whether the agent returns
    // cleanly, retries, rejects, or throws. We collect the outcome inside the
    // try block and let the finally block do the emission + logging.
    let finalizeOutcome: 'success' | 'rejected' | 'error' | 'retry' = 'error';
    let finalizeError: string | undefined;
    let finalizeConfidence: number | undefined;

    try {
      // ── Phase 1: Plan ─────────────────────────────────────────────────────
      const plan = this.config.usesPlanning ? await this.plan(task) : DEFAULT_PLAN;
      this.emitPhaseTransition('plan', task, { usesPlanning: this.config.usesPlanning ?? false });

      // ── Phase 2: Execute ──────────────────────────────────────────────────
      // Validate input if schema provided
      if (task.expectedOutput) {
        // Input validation would go here if we had input schemas
      }

      // Execute the agent's specific logic
      const output = await this.executeTask(task);

      this.emitPhaseTransition('execute', task);

      // ── Phase 3: Reflect ──────────────────────────────────────────────────
      if (!this.config.usesReflection) {
        const { result, confidence } = await this.finalizeWithoutReflection(
          task,
          output,
          startTime
        );
        finalizeOutcome = 'success';
        finalizeConfidence = confidence;
        return result;
      }

      // Reflection path — blocking quality gate
      const verdict = await this.reflect(output, plan, task, attempt);
      this.emitPhaseTransition('reflect', task, {
        action: verdict.action,
        confidence: verdict.confidence,
        reason: verdict.reason,
        attempt,
      });

      if (verdict.action === 'retry' && attempt < (this.config.maxRetries ?? 1)) {
        logger.info(
          { agentName: this.config.name, taskId: task.id, attempt, reason: verdict.reason },
          'Reflection requested retry'
        );
        finalizeOutcome = 'retry';
        return this.execute(task, attempt + 1);
      }

      if (verdict.action === 'reject') {
        await this.enqueueForReview(task, output, verdict);
        finalizeOutcome = 'rejected';
        finalizeConfidence = verdict.confidence;
        throw new OutputRejectedError(verdict.reason ?? 'reflection rejected', output);
      }

      // Approved
      const result = this.buildReflectApprovedResult(task, output, verdict, startTime);
      finalizeOutcome = 'success';
      finalizeConfidence = verdict.confidence;
      return result;
    } catch (error) {
      // Do not swallow OutputRejectedError — it must propagate to the job handler
      if (error instanceof OutputRejectedError) {
        finalizeOutcome = 'rejected';
        finalizeError = error.message;
        throw error;
      }

      const { result, errorMessage } = this.buildExecutionErrorResult(error, task, startTime);
      finalizeOutcome = 'error';
      finalizeError = errorMessage;
      return result;
    } finally {
      // ADR-049 Finalize phase — always fires, even on retry/reject/error.
      // Emission is fire-and-forget; emitPhaseTransition swallows its own errors.
      this.emitPhaseTransition('finalize', task, {
        outcome: finalizeOutcome,
        attempt,
        durationMs: Date.now() - startTime,
        ...(finalizeConfidence !== undefined ? { confidence: finalizeConfidence } : {}),
        ...(finalizeError !== undefined ? { error: finalizeError } : {}),
      });
    }
  }

  /**
   * Build the success result for the reflection-approved path. Extracted from
   * execute() to keep its cognitive complexity under 15.
   */
  private buildReflectApprovedResult(
    task: AgentTask<TInput, TOutput>,
    output: TOutput,
    verdict: AgentReflection,
    startTime: number
  ): AgentResult<TOutput> {
    const duration = Date.now() - startTime;
    const result: AgentResult<TOutput> = {
      success: true,
      output,
      confidence: verdict.confidence,
      timestamp: new Date(),
      duration,
      metadata: {
        agentName: this.config.name,
        executionCount: this.executionCount,
        taskId: task.id,
        reflectVerdict: verdict.action,
      },
    };

    logger.info(
      { agentName: this.config.name, taskId: task.id, confidence: verdict.confidence, duration },
      'Agent task completed successfully (reflect approved)'
    );

    return result;
  }

  /**
   * Build the error fallback result and derived error message from a caught
   * throwable. Extracted from execute() so the two error-coercion ternaries do
   * not inflate execute()'s cognitive complexity.
   */
  private buildExecutionErrorResult(
    error: unknown,
    task: AgentTask<TInput, TOutput>,
    startTime: number
  ): { result: AgentResult<TOutput>; errorMessage: string } {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      { agentName: this.config.name, taskId: task.id, error: errorMessage },
      'Agent task failed'
    );

    const result: AgentResult<TOutput> = {
      success: false,
      confidence: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
      duration,
      metadata: {
        agentName: this.config.name,
        executionCount: this.executionCount,
        taskId: task.id,
      },
    };

    return { result, errorMessage };
  }

  /**
   * Legacy (no-reflection) finalization path — validate output against the
   * task schema, compute confidence, and build the success result envelope.
   * Extracted from execute() to keep its cognitive complexity under 15.
   */
  private async finalizeWithoutReflection(
    task: AgentTask<TInput, TOutput>,
    output: TOutput,
    startTime: number
  ): Promise<{ result: AgentResult<TOutput>; confidence: number }> {
    if (task.expectedOutput) {
      task.expectedOutput.parse(output);
    }

    const duration = Date.now() - startTime;
    const confidence = await this.calculateConfidence(task, output);

    const result: AgentResult<TOutput> = {
      success: true,
      output,
      confidence,
      timestamp: new Date(),
      duration,
      metadata: {
        agentName: this.config.name,
        executionCount: this.executionCount,
        taskId: task.id,
      },
    };

    logger.info(
      { agentName: this.config.name, taskId: task.id, confidence, duration },
      'Agent task completed successfully'
    );

    return { result, confidence };
  }

  /**
   * Execute the agent-specific task logic
   * Must be implemented by subclasses
   */
  protected abstract executeTask(task: AgentTask<TInput, TOutput>): Promise<TOutput>;

  /**
   * Calculate confidence score for the result (L4 rule-based default).
   *
   * Formula:
   *   baseline          = 0.5
   *   +0.2  if output validated against Zod schema without violations
   *   -0.3  if hallucinationChecker.lastCheck reports hallucinated === true
   *   +0.1  if output token count is in the expected range [OUTPUT_TOKEN_MIN, OUTPUT_TOKEN_MAX]
   *   clamped to [0, 1]
   *
   * Subclasses that override this method retain their own implementation.
   */
  protected async calculateConfidence(
    task: AgentTask<TInput, TOutput>,
    output: TOutput
  ): Promise<number> {
    let score = 0.5;

    // +0.2 if output passes schema validation (no violations)
    if (task.expectedOutput) {
      const result = task.expectedOutput.safeParse(output);
      if (result.success) {
        score += 0.2;
      }
    } else {
      // No schema provided — treat as validated (no violations found)
      score += 0.2;
    }

    // -0.3 if the most recent hallucination check flagged the output
    const lastHallucination = hallucinationChecker.lastCheck;
    if (lastHallucination?.hallucinated === true) {
      score -= 0.3;
    }

    // +0.1 if output token count is in the expected range
    const outputText = typeof output === 'string' ? output : JSON.stringify(output);
    const outputTokens = countTokens(outputText);
    if (outputTokens >= OUTPUT_TOKEN_MIN && outputTokens <= OUTPUT_TOKEN_MAX) {
      score += 0.1;
    }

    // Clamp to [0, 1]
    return Math.min(1, Math.max(0, score));
  }

  /**
   * Generate system prompt for the agent
   */
  protected generateSystemPrompt(): string {
    return `You are ${this.config.name}, ${this.config.role}.

Your Goal: ${this.config.goal}

Backstory: ${this.config.backstory}

You MUST:
1. Follow the task instructions precisely
2. Provide clear, structured responses
3. Include reasoning for your decisions
4. Stay within your role and expertise
5. Ask for clarification if the task is unclear

You MUST NOT:
1. Provide information outside your expertise
2. Make assumptions without stating them
3. Skip required output fields
4. Provide unstructured responses when structure is required`;
  }

  /**
   * Attach a conversation-record callback handler so LLM calls are
   * persisted to the database for the Agent Logs page.
   *
   * Called by AIWorker.processJob() when agent-status context is available.
   */
  public attachConversationRecording(options: {
    sessionId: string;
    tenantId: string;
    model?: string;
  }): void {
    this.conversationCallback = new ConversationRecordCallbackHandler(options);
  }

  /**
   * Invoke the LLM with messages
   */
  protected async invokeLLM(messages: BaseMessage[]): Promise<string> {
    const startTime = Date.now();

    // Notify callback handler of LLM start (input messages)
    if (this.conversationCallback) {
      const prompt = messages.map((m) => `[${m._getType()}] ${m.content}`).join('\n');
      await this.conversationCallback
        .handleLLMStart(
          { id: ['langchain', 'llms', this.config.name], lc: 1, type: 'not_implemented' },
          [prompt],
          `run-${Date.now()}`
        )
        .catch(() => {});
    }

    try {
      const response = await this.model.invoke(messages);
      const duration = Date.now() - startTime;
      const responseText = response.content as string;

      // Track costs for all providers — LiteLLM returns OpenAI-compatible token counts
      // regardless of the underlying provider (Groq, Anthropic, Mistral, etc.).
      // ADR-048: provider is now 'litellm' by default; gate on provider===openai was wrong.
      if (aiConfig.costTracking.enabled) {
        // Logical model name: e.g. "reasoning-free" (resolved by LiteLLM proxy at runtime)
        const modelName = `${this.purpose}-free`;
        const inputTokens = countMessagesTokens(messages, modelName);
        const outputTokens = countTokens(responseText, modelName);

        costTracker.recordUsage({
          model: modelName,
          inputTokens,
          outputTokens,
          operationType: `agent:${this.config.name}`,
          metadata: {
            duration,
          },
        });
      }

      // Notify callback handler of LLM end (response)
      if (this.conversationCallback) {
        await this.conversationCallback
          .handleLLMEnd({ generations: [[{ text: responseText }]] }, `run-${Date.now()}`)
          .catch(() => {});
      }

      return responseText;
    } catch (error) {
      // Notify callback handler of LLM error
      if (this.conversationCallback && error instanceof Error) {
        await this.conversationCallback.handleLLMError(error, `run-${Date.now()}`).catch(() => {});
      }

      logger.error(
        {
          agentName: this.config.name,
          error: error instanceof Error ? error.message : String(error),
        },
        'LLM invocation failed'
      );
      throw error;
    }
  }

  /**
   * Create a human message
   */
  protected createHumanMessage(content: string): HumanMessage {
    return new HumanMessage(content);
  }

  /**
   * Create a system message
   */
  protected createSystemMessage(content: string): SystemMessage {
    return new SystemMessage(content);
  }

  /**
   * Get agent statistics
   */
  getStats(): {
    name: string;
    role: string;
    executionCount: number;
    config: BaseAgentConfig;
  } {
    return {
      name: this.config.name,
      role: this.config.role,
      executionCount: this.executionCount,
      config: this.config,
    };
  }

  /**
   * Reset agent state
   */
  reset(): void {
    this.executionCount = 0;
    logger.info({ agentName: this.config.name }, 'Agent state reset');
  }
}

/**
 * Utility type for extracting task input type
 */
export type TaskInput<T> = T extends BaseAgent<infer I, any> ? I : never;

/**
 * Utility type for extracting task output type
 */
export type TaskOutput<T> = T extends BaseAgent<any, infer O> ? O : never;
