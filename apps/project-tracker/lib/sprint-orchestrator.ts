/**
 * Sprint Orchestrator Core Library
 *
 * Coordinates SWARM (implementation) and MATOP (validation) execution
 * across sprint phases with parallel stream support.
 */

import type {
  ExecutionPhase,
  TaskPhaseEntry,
  SprintExecutionState,
  SubAgentInfo,
  SprintOrchestratorConfig,
  SprintEvent,
  SprintEventType,
} from '../../../tools/scripts/lib/sprint/types';

// Default configuration
const DEFAULT_CONFIG: SprintOrchestratorConfig = {
  maxParallelAgents: 4,
  taskTimeoutMinutes: 30,
  phaseTimeoutMinutes: 120,
  autoRetryOnFailure: true,
  maxRetries: 2,
  swarmConfig: {
    orchestratorPath: 'scripts/swarm/orchestrator.sh',
    phases: ['architect', 'enforcer', 'builder', 'gatekeeper', 'auditor'],
    qualitativeReviewPath: 'artifacts/qualitative-reviews',
    blockersPath: 'artifacts/blockers.json',
  },
  matopConfig: {
    executorPath: 'tools/stoa/matop-execute.ts',
    stoaAgents: ['foundation', 'domain', 'security', 'quality', 'intelligence', 'automation'],
    evidencePath: 'artifacts/evidence',
    attestationPath: 'artifacts/reports/attestation',
  },
};

export class SprintOrchestrator {
  private config: SprintOrchestratorConfig;
  private state: SprintExecutionState | null = null;
  private eventHandlers: Map<SprintEventType, ((event: SprintEvent) => void)[]> = new Map();
  private baseUrl: string;

  constructor(baseUrl: string, config?: Partial<SprintOrchestratorConfig>) {
    this.baseUrl = baseUrl;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize a new sprint execution
   */
  async initExecution(
    sprintNumber: number,
    phases: ExecutionPhase[],
    runId: string
  ): Promise<SprintExecutionState> {
    this.state = {
      sprintNumber,
      runId,
      startedAt: new Date().toISOString(),
      status: 'running',
      currentPhase: 0,
      totalPhases: phases.length,
      phaseProgress: phases.map((p) => ({
        phaseNumber: p.phaseNumber,
        name: p.name,
        status: 'pending',
        totalTasks: p.tasks.length,
        completedTasks: 0,
        failedTasks: 0,
        inProgressTasks: 0,
      })),
      activeSubAgents: [],
      completedTasks: [],
      failedTasks: [],
      needsHumanTasks: [],
      blockers: [],
    };

    await this.emitEvent('sprint_started', { phases });
    return this.state;
  }

  /**
   * Execute a phase
   */
  async executePhase(phase: ExecutionPhase): Promise<void> {
    if (!this.state) {
      throw new Error('Orchestrator not initialized');
    }

    this.state.currentPhase = phase.phaseNumber;
    await this.updatePhaseStatus(phase.phaseNumber, 'in_progress');
    await this.emitEvent('phase_started', { phaseNumber: phase.phaseNumber });

    try {
      if (phase.executionType === 'parallel') {
        await this.executeParallelTasks(phase);
      } else {
        await this.executeSequentialTasks(phase);
      }

      await this.updatePhaseStatus(phase.phaseNumber, 'completed');
      await this.emitEvent('phase_completed', { phaseNumber: phase.phaseNumber });
    } catch (error) {
      await this.updatePhaseStatus(phase.phaseNumber, 'failed');
      await this.emitEvent('phase_failed', {
        phaseNumber: phase.phaseNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Execute tasks sequentially
   */
  private async executeSequentialTasks(phase: ExecutionPhase): Promise<void> {
    for (const task of phase.tasks) {
      if (this.state?.status === 'paused') {
        break;
      }

      await this.executeTask(task, phase.phaseNumber);
    }
  }

  /**
   * Execute tasks in parallel streams
   */
  private async executeParallelTasks(phase: ExecutionPhase): Promise<void> {
    // Group tasks by stream
    const streamGroups = new Map<string, TaskPhaseEntry[]>();
    for (const task of phase.tasks) {
      const stream = task.parallelStreamId || 'default';
      if (!streamGroups.has(stream)) {
        streamGroups.set(stream, []);
      }
      streamGroups.get(stream)!.push(task);
    }

    // Execute streams in parallel with max limit
    const streams = Array.from(streamGroups.entries());
    const batches: (typeof streams)[] = [];

    for (let i = 0; i < streams.length; i += this.config.maxParallelAgents) {
      batches.push(streams.slice(i, i + this.config.maxParallelAgents));
    }

    for (const batch of batches) {
      if (this.state?.status === 'paused') {
        break;
      }

      await Promise.all(
        batch.map(async ([streamId, tasks]) => {
          for (const task of tasks) {
            await this.executeTask(task, phase.phaseNumber, streamId);
          }
        })
      );
    }
  }

  /**
   * Execute a single task
   */
  private async executeTask(
    task: TaskPhaseEntry,
    phaseNumber: number,
    streamId?: string
  ): Promise<void> {
    if (!this.state) return;

    await this.emitEvent('task_started', { taskId: task.taskId, phaseNumber });

    // Update in-progress count
    this.state.phaseProgress = this.state.phaseProgress.map((p) =>
      p.phaseNumber === phaseNumber ? { ...p, inProgressTasks: p.inProgressTasks + 1 } : p
    );

    try {
      // Spawn appropriate sub-agent based on execution mode
      const agentId = await this.spawnSubAgent(task, phaseNumber, streamId);

      // Wait for completion (in real implementation, this would be async with callbacks)
      const result = await this.waitForAgentCompletion(agentId);

      if (result.success) {
        this.state.completedTasks.push(task.taskId);
        await this.emitEvent('task_completed', { taskId: task.taskId, phaseNumber });
      } else if (result.needsHuman) {
        this.state.needsHumanTasks.push(task.taskId);
        await this.emitEvent('task_needs_human', {
          taskId: task.taskId,
          phaseNumber,
          reason: result.error,
        });
      } else {
        this.state.failedTasks.push(task.taskId);
        await this.emitEvent('task_failed', {
          taskId: task.taskId,
          phaseNumber,
          error: result.error,
        });
      }

      // Update phase progress
      this.state.phaseProgress = this.state.phaseProgress.map((p) => {
        if (p.phaseNumber !== phaseNumber) return p;

        return {
          ...p,
          inProgressTasks: Math.max(0, p.inProgressTasks - 1),
          completedTasks: result.success ? p.completedTasks + 1 : p.completedTasks,
          failedTasks: !result.success && !result.needsHuman ? p.failedTasks + 1 : p.failedTasks,
        };
      });
    } catch (error) {
      this.state.failedTasks.push(task.taskId);
      await this.emitEvent('task_failed', {
        taskId: task.taskId,
        phaseNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Spawn a sub-agent for task execution
   */
  private async spawnSubAgent(
    task: TaskPhaseEntry,
    phaseNumber: number,
    streamId?: string
  ): Promise<string> {
    const agentId = `agent-${task.taskId}-${Date.now()}`;

    const agentInfo: SubAgentInfo = {
      agentId,
      taskId: task.taskId,
      type: task.executionMode === 'matop' ? 'matop' : 'swarm',
      status: 'spawned',
      phase: phaseNumber,
      streamId,
      spawnedAt: new Date().toISOString(),
    };

    this.state!.activeSubAgents.push(agentInfo);
    await this.emitEvent('subagent_spawned', {
      agentId,
      taskId: task.taskId,
      type: agentInfo.type,
    });

    return agentId;
  }

  /**
   * Wait for agent to complete (placeholder for actual async implementation)
   */
  private async waitForAgentCompletion(
    agentId: string
  ): Promise<{ success: boolean; needsHuman?: boolean; error?: string }> {
    // In a real implementation, this would:
    // 1. Poll the status API
    // 2. Wait for webhook callback
    // 3. Or use a message queue

    // For now, we'll just mark as successful after a simulated delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Update agent status
    this.state!.activeSubAgents = this.state!.activeSubAgents.map((a) =>
      a.agentId === agentId
        ? { ...a, status: 'completed', completedAt: new Date().toISOString() }
        : a
    );

    return { success: true };
  }

  /**
   * Update phase status
   */
  private async updatePhaseStatus(
    phaseNumber: number,
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
  ): Promise<void> {
    if (!this.state) return;

    this.state.phaseProgress = this.state.phaseProgress.map((p) => {
      if (p.phaseNumber !== phaseNumber) return p;

      return {
        ...p,
        status,
        startedAt: status === 'in_progress' ? new Date().toISOString() : p.startedAt,
        completedAt:
          status === 'completed' || status === 'failed' ? new Date().toISOString() : p.completedAt,
      };
    });

    // Sync to status API
    await this.syncStatus();
  }

  /**
   * Sync current state to status API
   */
  private async syncStatus(): Promise<void> {
    if (!this.state) return;

    try {
      await fetch(`${this.baseUrl}/api/sprint/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: this.state.runId,
          update: {
            type: 'sync',
            state: this.state,
          },
        }),
      });
    } catch (error) {
      console.error('Failed to sync status:', error);
    }
  }

  /**
   * Emit an event
   */
  private async emitEvent(type: SprintEventType, details?: Record<string, unknown>): Promise<void> {
    if (!this.state) return;

    const event: SprintEvent = {
      type,
      timestamp: new Date().toISOString(),
      runId: this.state.runId,
      sprintNumber: this.state.sprintNumber,
      phaseNumber: this.state.currentPhase,
      details,
    };

    const handlers = this.eventHandlers.get(type) || [];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        console.error(`Event handler error for ${type}:`, error);
      }
    }
  }

  /**
   * Register an event handler
   */
  on(type: SprintEventType, handler: (event: SprintEvent) => void): void {
    const handlers = this.eventHandlers.get(type) || [];
    handlers.push(handler);
    this.eventHandlers.set(type, handlers);
  }

  /**
   * Pause execution
   */
  async pause(): Promise<void> {
    if (!this.state) return;

    this.state.status = 'paused';
    await this.syncStatus();
  }

  /**
   * Resume execution
   */
  async resume(): Promise<void> {
    if (!this.state) return;

    this.state.status = 'running';
    await this.syncStatus();
  }

  /**
   * Get current state
   */
  getState(): SprintExecutionState | null {
    return this.state;
  }

  /**
   * Generate SWARM command for a task
   */
  generateSwarmCommand(task: TaskPhaseEntry): string {
    return `bash ${this.config.swarmConfig.orchestratorPath} --task-id ${task.taskId} --mode auto`;
  }

  /**
   * Generate MATOP command for a task
   */
  generateMatopCommand(task: TaskPhaseEntry): string {
    return `npx tsx ${this.config.matopConfig.executorPath} ${task.taskId}`;
  }

  /**
   * Generate Claude Code Task tool call for parallel execution
   */
  generateTaskToolCall(streamId: string, tasks: TaskPhaseEntry[]): string {
    const taskList = tasks.map((t) => t.taskId).join(', ');
    const executionMode = tasks[0]?.executionMode || 'swarm';

    return `Task("${streamId}", "Execute ${executionMode.toUpperCase()} tasks: ${taskList}")`;
  }
}

/**
 * Create execution script for Claude Code
 */
export function generateExecutionScript(
  phases: ExecutionPhase[],
  runId: string,
  baseUrl: string
): string {
  const lines: string[] = [];

  lines.push('#!/bin/bash');
  lines.push('# Sprint Execution Script');
  lines.push(`# Run ID: ${runId}`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('set -e');
  lines.push('');
  lines.push('# Status update helper');
  lines.push('update_status() {');
  lines.push(`  curl -X POST ${baseUrl}/api/sprint/status \\`);
  lines.push('    -H "Content-Type: application/json" \\');
  lines.push(`    -d "{\\"runId\\": \\"${runId}\\", \\"update\\": \$1}"`);
  lines.push('}');
  lines.push('');

  for (const phase of phases) {
    lines.push(`# Phase ${phase.phaseNumber}: ${phase.name}`);
    lines.push(`echo "Starting Phase ${phase.phaseNumber}..."`);
    lines.push(`update_status '{"type": "phase_start", "phaseNumber": ${phase.phaseNumber}}'`);
    lines.push('');

    if (phase.executionType === 'parallel') {
      lines.push('# Parallel execution');
      lines.push('(');

      const streams = new Set(phase.tasks.map((t) => t.parallelStreamId).filter(Boolean));
      for (const streamId of streams) {
        const streamTasks = phase.tasks.filter((t) => t.parallelStreamId === streamId);
        for (const task of streamTasks) {
          if (task.executionMode === 'swarm') {
            lines.push(`  bash scripts/swarm/orchestrator.sh --task-id ${task.taskId} &`);
          } else if (task.executionMode === 'matop') {
            lines.push(`  npx tsx tools/stoa/matop-execute.ts ${task.taskId} &`);
          }
        }
      }

      lines.push('  wait');
      lines.push(')');
    } else {
      lines.push('# Sequential execution');
      for (const task of phase.tasks) {
        lines.push(`echo "Executing ${task.taskId}..."`);
        lines.push(
          `update_status '{"type": "task_start", "taskId": "${task.taskId}", "phaseNumber": ${phase.phaseNumber}}'`
        );

        if (task.executionMode === 'swarm') {
          lines.push(`bash scripts/swarm/orchestrator.sh --task-id ${task.taskId}`);
        } else if (task.executionMode === 'matop') {
          lines.push(`npx tsx tools/stoa/matop-execute.ts ${task.taskId}`);
        } else {
          lines.push(`echo "Manual task: ${task.taskId} - requires human intervention"`);
        }

        lines.push(
          `update_status '{"type": "task_complete", "taskId": "${task.taskId}", "phaseNumber": ${phase.phaseNumber}}'`
        );
        lines.push('');
      }
    }

    lines.push(`update_status '{"type": "phase_complete", "phaseNumber": ${phase.phaseNumber}}'`);
    lines.push(`echo "Phase ${phase.phaseNumber} completed."`);
    lines.push('');
  }

  lines.push(`update_status '{"type": "complete"}'`);
  lines.push('echo "Sprint execution completed!"');

  return lines.join('\n');
}
