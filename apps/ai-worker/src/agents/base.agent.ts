import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { aiConfig } from '../config/ai.config';
import { costTracker } from '../utils/cost-tracker';
import pino from 'pino';

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
}

/**
 * Base Agent Class
 * Foundation for all AI agents in the system
 * Provides common functionality for agent execution, error handling, and monitoring
 */
export abstract class BaseAgent<TInput = unknown, TOutput = unknown> {
  protected model: ChatOpenAI | ChatOllama;
  protected config: BaseAgentConfig;
  protected executionCount: number = 0;

  constructor(config: BaseAgentConfig) {
    this.config = {
      maxIterations: 5,
      allowDelegation: false,
      verbose: false,
      ...config,
    };

    // Initialize the appropriate model
    if (aiConfig.provider === 'openai') {
      this.model = new ChatOpenAI({
        modelName: aiConfig.openai.model,
        temperature: aiConfig.openai.temperature,
        maxTokens: aiConfig.openai.maxTokens,
        timeout: aiConfig.openai.timeout,
        openAIApiKey: aiConfig.openai.apiKey,
      });
    } else {
      this.model = new ChatOllama({
        baseUrl: aiConfig.ollama.baseUrl,
        model: aiConfig.ollama.model,
        temperature: aiConfig.ollama.temperature,
      });
    }

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
   * Execute a task with the agent
   */
  async execute(task: AgentTask<TInput, TOutput>): Promise<AgentResult<TOutput>> {
    const startTime = Date.now();
    this.executionCount++;

    logger.info(
      {
        agentName: this.config.name,
        taskId: task.id,
        taskDescription: task.description,
      },
      'Agent task started'
    );

    try {
      // Validate input if schema provided
      if (task.expectedOutput) {
        // Input validation would go here if we had input schemas
      }

      // Execute the agent's specific logic
      const output = await this.executeTask(task);

      // Validate output if schema provided
      if (task.expectedOutput) {
        task.expectedOutput.parse(output);
      }

      const duration = Date.now() - startTime;

      // Calculate confidence score
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
        {
          agentName: this.config.name,
          taskId: task.id,
          confidence,
          duration,
        },
        'Agent task completed successfully'
      );

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error(
        {
          agentName: this.config.name,
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Agent task failed'
      );

      return {
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
    }
  }

  /**
   * Execute the agent-specific task logic
   * Must be implemented by subclasses
   */
  protected abstract executeTask(task: AgentTask<TInput, TOutput>): Promise<TOutput>;

  /**
   * Calculate confidence score for the result
   * Can be overridden by subclasses for custom confidence calculation
   */
  protected async calculateConfidence(
    task: AgentTask<TInput, TOutput>,
    output: TOutput
  ): Promise<number> {
    // Default confidence calculation
    // Subclasses should override this for more sophisticated confidence scoring
    return 0.8;
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
   * Invoke the LLM with messages
   */
  protected async invokeLLM(messages: BaseMessage[]): Promise<string> {
    const startTime = Date.now();

    try {
      const response = await this.model.invoke(messages);
      const duration = Date.now() - startTime;

      // Track costs for OpenAI
      if (aiConfig.provider === 'openai' && aiConfig.costTracking.enabled) {
        // Note: Token counting would need to be implemented
        // This is a placeholder for demonstration
        costTracker.recordUsage({
          model: aiConfig.openai.model,
          inputTokens: 0, // Would need actual token counting
          outputTokens: 0,
          operationType: `agent:${this.config.name}`,
          metadata: {
            duration,
          },
        });
      }

      return response.content as string;
    } catch (error) {
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
