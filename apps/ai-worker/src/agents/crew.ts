/**
 * @deprecated Unused skeleton — kept for reference.
 * ADR-049 (Plan/Reflect phases) supersedes this orchestration pattern.
 * Replacement: BaseAgent.plan() → execute() → reflect() inside individual agents.
 *
 * Remove when all 4 agents have adopted ADR-049 phases.
 */

/**
 * CrewAI Multi-Agent Workflow Skeleton
 *
 * This file provides a foundation for implementing CrewAI-style
 * multi-agent workflows for complex tasks that require collaboration
 * between multiple specialized agents.
 *
 * Note: This is a skeleton implementation. Full CrewAI integration
 * would require additional dependencies and implementation.
 */

import { BaseAgent, AgentResult, AgentTask } from './base.agent';
import {
  markAgentActive,
  markAgentIdle,
  markAgentError,
  type AgentStatusContext,
} from '../services/agent-status';
import pino from 'pino';

const logger = pino({
  name: 'crew',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Crew configuration
 */
export interface CrewConfig {
  name: string;
  description: string;
  agents: BaseAgent[];
  process: 'sequential' | 'hierarchical' | 'parallel';
  verbose?: boolean;
}

/**
 * Crew task that involves multiple agents
 */
export interface CrewTask {
  id: string;
  description: string;
  expectedOutput: string;
  context?: unknown;
  /** Tenant ID for agent-status tracking on the Active Agents dashboard */
  tenantId?: string;
  /** User ID for agent-status tracking on the Active Agents dashboard */
  userId?: string;
}

/**
 * Result from crew execution
 */
export interface CrewResult {
  success: boolean;
  output?: unknown;
  agentResults: Map<string, AgentResult>;
  totalDuration: number;
  errors?: string[];
}

/**
 * Crew - Multi-Agent Collaboration System
 *
 * Orchestrates multiple agents to work together on complex tasks
 * Supports different execution strategies (sequential, hierarchical, parallel)
 */
export class Crew {
  private readonly config: CrewConfig;
  private executionCount: number = 0;

  constructor(config: CrewConfig) {
    this.config = {
      verbose: false,
      ...config,
    };

    logger.info(
      {
        crewName: this.config.name,
        agentCount: this.config.agents.length,
        process: this.config.process,
      },
      'Crew initialized'
    );
  }

  /**
   * Execute a crew task
   *
   * NOTE: This is a skeleton implementation
   * Full implementation would include:
   * - Agent delegation
   * - Context sharing between agents
   * - Result aggregation
   * - Error handling and retry logic
   * - Human-in-the-loop checkpoints
   */
  async execute(task: CrewTask): Promise<CrewResult> {
    const startTime = Date.now();
    this.executionCount++;

    // Agent-status tracking (requires tenantId + userId)
    let statusCtx: AgentStatusContext | null = null;
    if (task.tenantId && task.userId) {
      statusCtx = {
        tenantId: task.tenantId,
        userId: task.userId,
        agentType: 'crew',
        taskDescription: `${this.config.name}: ${task.description}`.slice(0, 200),
      };
      await markAgentActive(statusCtx);
    }

    logger.info(
      {
        crewName: this.config.name,
        taskId: task.id,
        process: this.config.process,
      },
      'Starting crew task execution'
    );

    const agentResults = new Map<string, AgentResult>();
    const errors: string[] = [];

    try {
      switch (this.config.process) {
        case 'sequential':
          await this.executeSequential(task, agentResults);
          break;
        case 'parallel':
          await this.executeParallel(task, agentResults);
          break;
        case 'hierarchical':
          await this.executeHierarchical(task, agentResults);
          break;
      }

      const duration = Date.now() - startTime;

      logger.info(
        {
          crewName: this.config.name,
          taskId: task.id,
          duration,
          agentCount: agentResults.size,
        },
        'Crew task completed'
      );

      if (statusCtx) {
        await markAgentIdle(statusCtx, undefined, {
          durationMs: duration,
          result: { agentCount: agentResults.size, process: this.config.process },
        });
      }

      return {
        success: true,
        agentResults,
        totalDuration: duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error(
        {
          crewName: this.config.name,
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Crew task failed'
      );

      errors.push(error instanceof Error ? error.message : 'Unknown error');

      if (statusCtx) {
        await markAgentError(statusCtx, errors[0], duration);
      }

      return {
        success: false,
        agentResults,
        totalDuration: duration,
        errors,
      };
    }
  }

  /**
   * Execute agents sequentially
   * Each agent builds upon the previous agent's output
   */
  private async executeSequential(
    task: CrewTask,
    results: Map<string, AgentResult>
  ): Promise<void> {
    logger.info('Executing agents sequentially');

    let previousOutput: unknown = task.context;

    for (const agent of this.config.agents) {
      const agentName = agent.getStats().name;
      const agentTask: AgentTask = {
        id: `${task.id}-${agentName}`,
        description: task.description,
        input: previousOutput,
        context: { crewTask: task.id, expectedOutput: task.expectedOutput },
      };

      const result = await agent.execute(agentTask);
      results.set(agentName, result);

      if (!result.success) {
        throw new Error(`Agent ${agentName} failed: ${result.error}`);
      }

      // Pass this agent's output to the next agent
      previousOutput = result.output;
    }
  }

  /**
   * Execute agents in parallel
   * All agents work on the same input simultaneously
   */
  private async executeParallel(task: CrewTask, results: Map<string, AgentResult>): Promise<void> {
    logger.info('Executing agents in parallel');

    const promises = this.config.agents.map(async (agent) => {
      const agentName = agent.getStats().name;
      const agentTask: AgentTask = {
        id: `${task.id}-${agentName}`,
        description: task.description,
        input: task.context,
        context: { crewTask: task.id, expectedOutput: task.expectedOutput },
      };

      const result = await agent.execute(agentTask);
      return { name: agentName, result };
    });

    const outcomes = await Promise.all(promises);
    outcomes.forEach(({ name, result }) => results.set(name, result));

    // Check if any agent failed
    const failures = outcomes.filter(({ result }) => !result.success);
    if (failures.length > 0) {
      const failedNames = failures.map(({ name }) => name).join(', ');
      throw new Error(`Agents failed: ${failedNames}`);
    }
  }

  /**
   * Execute agents hierarchically
   * Manager agent delegates tasks to worker agents
   */
  private async executeHierarchical(
    task: CrewTask,
    results: Map<string, AgentResult>
  ): Promise<void> {
    logger.info('Executing agents hierarchically');

    if (this.config.agents.length === 0) {
      return;
    }

    // First agent is the manager, rest are workers
    const [manager, ...workers] = this.config.agents;
    const managerName = manager.getStats().name;

    // Manager analyzes the task and coordinates workers
    const managerTask: AgentTask = {
      id: `${task.id}-manager-${managerName}`,
      description: `Coordinate task: ${task.description}`,
      input: task.context,
      context: {
        role: 'manager',
        crewTask: task.id,
        expectedOutput: task.expectedOutput,
        workers: workers.map((w) => w.getStats().name),
      },
    };

    const managerResult = await manager.execute(managerTask);
    results.set(managerName, managerResult);

    if (!managerResult.success) {
      throw new Error(`Manager ${managerName} failed: ${managerResult.error}`);
    }

    // If no workers, we're done
    if (workers.length === 0) {
      return;
    }

    // Workers execute in parallel with manager's output as context
    const workerPromises = workers.map(async (worker) => {
      const workerName = worker.getStats().name;
      const workerTask: AgentTask = {
        id: `${task.id}-worker-${workerName}`,
        description: task.description,
        input: managerResult.output,
        context: {
          role: 'worker',
          crewTask: task.id,
          expectedOutput: task.expectedOutput,
          managerOutput: managerResult.output,
        },
      };

      const result = await worker.execute(workerTask);
      return { name: workerName, result };
    });

    const workerOutcomes = await Promise.all(workerPromises);
    workerOutcomes.forEach(({ name, result }) => results.set(name, result));

    // Check if any worker failed
    const failures = workerOutcomes.filter(({ result }) => !result.success);
    if (failures.length > 0) {
      const failedNames = failures.map(({ name }) => name).join(', ');
      logger.warn({ failedWorkers: failedNames }, 'Some workers failed');
      // Don't throw for worker failures in hierarchical mode - manager succeeded
    }
  }

  /**
   * Get crew statistics
   */
  getStats(): {
    name: string;
    executionCount: number;
    agentCount: number;
    process: string;
  } {
    return {
      name: this.config.name,
      executionCount: this.executionCount,
      agentCount: this.config.agents.length,
      process: this.config.process,
    };
  }
}

/**
 * Example: Lead Processing Crew
 *
 * This would orchestrate multiple agents to:
 * 1. Score the lead
 * 2. Qualify the lead
 * 3. Enrich lead data
 * 4. Generate personalized email
 * 5. Schedule follow-up
 */
export function createLeadProcessingCrew(agents: BaseAgent[]): Crew {
  return new Crew({
    name: 'Lead Processing Crew',
    description: 'Comprehensive lead processing pipeline with multiple specialized agents',
    agents,
    process: 'sequential',
    verbose: true,
  });
}

/**
 * Example: Research Crew
 *
 * Multiple agents work in parallel to gather information:
 * - Company research agent
 * - Industry analysis agent
 * - Competitor analysis agent
 * - News and trends agent
 */
export function createResearchCrew(agents: BaseAgent[]): Crew {
  return new Crew({
    name: 'Research Crew',
    description: 'Parallel research agents for comprehensive market intelligence',
    agents,
    process: 'parallel',
    verbose: true,
  });
}
