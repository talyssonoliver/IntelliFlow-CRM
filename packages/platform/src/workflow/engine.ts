/**
 * Workflow Engine Wrapper for IntelliFlow CRM
 *
 * Provides a unified interface for workflow orchestration across:
 * - Temporal (durable business workflows)
 * - LangGraph (AI agent workflows)
 * - BullMQ (background jobs)
 *
 * @module @intelliflow/platform/workflow
 */

import { z } from 'zod';
import {
  CASE_EVENT_WORKFLOW_ROUTING,
  type CaseEventType,
} from '@intelliflow/domain';

// ============================================================================
// Types and Schemas
// ============================================================================

/**
 * Supported workflow engine types
 */
export type WorkflowEngineType = 'temporal' | 'langgraph' | 'bullmq';

/**
 * Workflow execution status
 */
export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'waiting_for_input';

/**
 * Workflow definition schema
 */
export const workflowDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().default('1.0.0'),
  engine: z.enum(['temporal', 'langgraph', 'bullmq']),
  description: z.string().optional(),
  timeout: z.number().optional(), // in milliseconds
  retryPolicy: z
    .object({
      maxAttempts: z.number().min(1).default(3),
      initialInterval: z.number().default(1000),
      maxInterval: z.number().default(30000),
      backoffCoefficient: z.number().default(2),
    })
    .optional(),
});

export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

/**
 * Workflow instance (running or completed workflow)
 */
export const workflowInstanceSchema = z.object({
  id: z.string().uuid(),
  definitionId: z.string(),
  status: z.enum([
    'pending',
    'running',
    'completed',
    'failed',
    'cancelled',
    'waiting_for_input',
  ]),
  input: z.record(z.unknown()).optional(),
  output: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type WorkflowInstance = z.infer<typeof workflowInstanceSchema>;

/**
 * Workflow execution options
 */
export interface WorkflowExecutionOptions {
  taskQueue?: string;
  timeout?: number;
  retryPolicy?: {
    maxAttempts: number;
    initialInterval: number;
    maxInterval: number;
    backoffCoefficient: number;
  };
  searchAttributes?: Record<string, unknown>;
  memo?: Record<string, unknown>;
}

/**
 * Signal to send to a running workflow
 */
export interface WorkflowSignal {
  signalName: string;
  payload?: unknown;
}

/**
 * Query to send to a running workflow
 */
export interface WorkflowQuery {
  queryName: string;
  args?: unknown[];
}

// ============================================================================
// Workflow Engine Interface
// ============================================================================

/**
 * Abstract workflow engine interface
 * Implementations provided for Temporal, LangGraph, and BullMQ
 */
export interface IWorkflowEngine {
  /**
   * Engine type identifier
   */
  readonly engineType: WorkflowEngineType;

  /**
   * Start a new workflow execution
   */
  startWorkflow<TInput, TOutput>(
    workflowId: string,
    workflowName: string,
    input: TInput,
    options?: WorkflowExecutionOptions
  ): Promise<WorkflowHandle<TOutput>>;

  /**
   * Get handle to an existing workflow
   */
  getWorkflowHandle<TOutput>(
    workflowId: string
  ): Promise<WorkflowHandle<TOutput> | null>;

  /**
   * List workflows matching criteria
   */
  listWorkflows(query?: {
    status?: WorkflowStatus;
    workflowType?: string;
    limit?: number;
    offset?: number;
  }): Promise<WorkflowInstance[]>;

  /**
   * Health check for the engine
   */
  healthCheck(): Promise<{ healthy: boolean; details?: Record<string, unknown> }>;

  /**
   * Shutdown the engine gracefully
   */
  shutdown(): Promise<void>;
}

/**
 * Handle to a workflow execution
 */
export interface WorkflowHandle<TOutput> {
  /**
   * Workflow execution ID
   */
  readonly workflowId: string;

  /**
   * Get the current status
   */
  getStatus(): Promise<WorkflowStatus>;

  /**
   * Wait for workflow completion and get result
   */
  result(): Promise<TOutput>;

  /**
   * Send a signal to the workflow
   */
  signal(signal: WorkflowSignal): Promise<void>;

  /**
   * Query the workflow state
   */
  query<TResult>(query: WorkflowQuery): Promise<TResult>;

  /**
   * Cancel the workflow
   */
  cancel(): Promise<void>;

  /**
   * Terminate the workflow immediately
   */
  terminate(reason?: string): Promise<void>;
}

// ============================================================================
// Temporal Engine Implementation
// ============================================================================

/**
 * Temporal workflow engine configuration
 */
export interface TemporalEngineConfig {
  address: string;
  namespace: string;
  taskQueue: string;
  tls?: {
    clientCertPath?: string;
    clientKeyPath?: string;
    serverRootCACertPath?: string;
  };
}

/**
 * Temporal workflow engine implementation
 * Uses Temporal SDK for durable workflow execution
 */
export class TemporalWorkflowEngine implements IWorkflowEngine {
  readonly engineType: WorkflowEngineType = 'temporal';
  private config: TemporalEngineConfig;
  private client: TemporalClientAdapter | null = null;

  constructor(config: TemporalEngineConfig) {
    this.config = config;
  }

  /**
   * Initialize the Temporal client connection
   */
  async initialize(): Promise<void> {
    // In production, this would initialize the actual Temporal client
    // For now, we create a mock adapter
    this.client = new TemporalClientAdapter(this.config);
    await this.client.connect();
  }

  async startWorkflow<TInput, TOutput>(
    workflowId: string,
    workflowName: string,
    input: TInput,
    options?: WorkflowExecutionOptions
  ): Promise<WorkflowHandle<TOutput>> {
    if (!this.client) {
      throw new Error('Temporal client not initialized. Call initialize() first.');
    }

    const handle = await this.client.startWorkflow(workflowId, workflowName, input, {
      taskQueue: options?.taskQueue ?? this.config.taskQueue,
      ...options,
    });

    return new TemporalWorkflowHandle<TOutput>(handle);
  }

  async getWorkflowHandle<TOutput>(
    workflowId: string
  ): Promise<WorkflowHandle<TOutput> | null> {
    if (!this.client) {
      throw new Error('Temporal client not initialized');
    }

    const handle = await this.client.getHandle(workflowId);
    if (!handle) return null;

    return new TemporalWorkflowHandle<TOutput>(handle);
  }

  async listWorkflows(query?: {
    status?: WorkflowStatus;
    workflowType?: string;
    limit?: number;
    offset?: number;
  }): Promise<WorkflowInstance[]> {
    if (!this.client) {
      throw new Error('Temporal client not initialized');
    }

    return this.client.listWorkflows(query);
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: Record<string, unknown> }> {
    if (!this.client) {
      return { healthy: false, details: { error: 'Client not initialized' } };
    }

    try {
      const healthy = await this.client.isHealthy();
      return {
        healthy,
        details: {
          address: this.config.address,
          namespace: this.config.namespace,
          taskQueue: this.config.taskQueue,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: String(error) },
      };
    }
  }

  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}

/**
 * Temporal workflow handle implementation
 */
class TemporalWorkflowHandle<TOutput> implements WorkflowHandle<TOutput> {
  readonly workflowId: string;
  private handle: InternalTemporalHandle;

  constructor(handle: InternalTemporalHandle) {
    this.workflowId = handle.workflowId;
    this.handle = handle;
  }

  async getStatus(): Promise<WorkflowStatus> {
    return this.handle.getStatus();
  }

  async result(): Promise<TOutput> {
    return this.handle.result() as Promise<TOutput>;
  }

  async signal(signal: WorkflowSignal): Promise<void> {
    await this.handle.signal(signal.signalName, signal.payload);
  }

  async query<TResult>(query: WorkflowQuery): Promise<TResult> {
    return this.handle.query(query.queryName, ...(query.args ?? [])) as Promise<TResult>;
  }

  async cancel(): Promise<void> {
    await this.handle.cancel();
  }

  async terminate(reason?: string): Promise<void> {
    await this.handle.terminate(reason);
  }
}

// ============================================================================
// Internal Adapters (Abstract Temporal SDK Details)
// ============================================================================

/**
 * Internal Temporal client adapter
 * Abstracts the actual Temporal SDK to allow testing and gradual integration
 */
class TemporalClientAdapter {
  private config: TemporalEngineConfig;
  private connected = false;
  private workflows = new Map<string, InternalTemporalHandle>();

  constructor(config: TemporalEngineConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    // In production: Connection.connect({ address: this.config.address })
    this.connected = true;
  }

  async close(): Promise<void> {
    this.connected = false;
  }

  async isHealthy(): Promise<boolean> {
    return this.connected;
  }

  async startWorkflow(
    workflowId: string,
    workflowName: string,
    input: unknown,
    options: WorkflowExecutionOptions
  ): Promise<InternalTemporalHandle> {
    const handle = new InternalTemporalHandle(workflowId, workflowName, input);
    this.workflows.set(workflowId, handle);
    return handle;
  }

  async getHandle(workflowId: string): Promise<InternalTemporalHandle | null> {
    return this.workflows.get(workflowId) ?? null;
  }

  async listWorkflows(query?: {
    status?: WorkflowStatus;
    limit?: number;
    offset?: number;
  }): Promise<WorkflowInstance[]> {
    const instances: WorkflowInstance[] = [];
    for (const [id, handle] of this.workflows) {
      const status = await handle.getStatus();
      if (!query?.status || status === query.status) {
        instances.push({
          id,
          definitionId: handle.workflowName,
          status,
          startedAt: handle.startedAt,
        });
      }
    }
    return instances.slice(query?.offset ?? 0, (query?.offset ?? 0) + (query?.limit ?? 100));
  }
}

/**
 * Internal Temporal handle representation
 */
class InternalTemporalHandle {
  readonly workflowId: string;
  readonly workflowName: string;
  readonly startedAt: Date;
  private input: unknown;
  private status: WorkflowStatus = 'running';
  private _result: unknown = null;
  private signals: Array<{ name: string; payload: unknown }> = [];

  constructor(workflowId: string, workflowName: string, input: unknown) {
    this.workflowId = workflowId;
    this.workflowName = workflowName;
    this.input = input;
    this.startedAt = new Date();
  }

  async getStatus(): Promise<WorkflowStatus> {
    return this.status;
  }

  async result(): Promise<unknown> {
    // In production: await actual workflow completion
    return this._result;
  }

  async signal(signalName: string, payload?: unknown): Promise<void> {
    this.signals.push({ name: signalName, payload });
  }

  async query(queryName: string, ...args: unknown[]): Promise<unknown> {
    // In production: Execute actual query
    return { queryName, args };
  }

  async cancel(): Promise<void> {
    this.status = 'cancelled';
  }

  async terminate(reason?: string): Promise<void> {
    this.status = 'cancelled';
  }

  // Test helper to complete workflow
  _setResult(result: unknown): void {
    this._result = result;
    this.status = 'completed';
  }
}

// ============================================================================
// Workflow Engine Factory
// ============================================================================

/**
 * Factory for creating workflow engines
 */
export class WorkflowEngineFactory {
  private static engines = new Map<WorkflowEngineType, IWorkflowEngine>();

  /**
   * Create or get a Temporal engine instance
   */
  static async createTemporalEngine(
    config: TemporalEngineConfig
  ): Promise<TemporalWorkflowEngine> {
    const existingEngine = this.engines.get('temporal');
    if (existingEngine) {
      return existingEngine as TemporalWorkflowEngine;
    }

    const engine = new TemporalWorkflowEngine(config);
    await engine.initialize();
    this.engines.set('temporal', engine);
    return engine;
  }

  /**
   * Get an engine by type
   */
  static getEngine(type: WorkflowEngineType): IWorkflowEngine | undefined {
    return this.engines.get(type);
  }

  /**
   * Shutdown all engines
   */
  static async shutdownAll(): Promise<void> {
    for (const engine of this.engines.values()) {
      await engine.shutdown();
    }
    this.engines.clear();
  }
}

// ============================================================================
// Workflow Router
// ============================================================================

/**
 * Routes events to appropriate workflow engines based on configuration
 */
export class WorkflowRouter {
  private routes: Map<
    string,
    { engine: WorkflowEngineType; workflowName: string }
  > = new Map();

  /**
   * Register a route from event type to workflow
   */
  registerRoute(
    eventType: string,
    engine: WorkflowEngineType,
    workflowName: string
  ): void {
    this.routes.set(eventType, { engine, workflowName });
  }

  /**
   * Get the workflow configuration for an event type
   */
  getRoute(
    eventType: string
  ): { engine: WorkflowEngineType; workflowName: string } | undefined {
    return this.routes.get(eventType);
  }

  /**
   * Get all registered routes
   */
  getAllRoutes(): Array<{
    eventType: string;
    engine: WorkflowEngineType;
    workflowName: string;
  }> {
    return Array.from(this.routes.entries()).map(([eventType, config]) => ({
      eventType,
      ...config,
    }));
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default Temporal configuration for local development
 */
export const DEFAULT_TEMPORAL_CONFIG: TemporalEngineConfig = {
  address: 'localhost:7233',
  namespace: 'intelliflow-crm',
  taskQueue: 'intelliflow-workflows',
};

/**
 * Generate workflow name from event type
 * Converts 'case.created' -> 'caseCreatedWorkflow'
 */
function eventTypeToWorkflowName(eventType: string): string {
  const parts = eventType.split('.');
  const camelCase = parts
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
  return `${camelCase}Workflow`;
}

/**
 * Create default workflow router with standard routes
 * Uses CASE_EVENT_WORKFLOW_ROUTING map from domain events for case events
 */
export function createDefaultWorkflowRouter(): WorkflowRouter {
  const router = new WorkflowRouter();

  // Register case event routes from the domain routing map
  for (const [eventType, engine] of Object.entries(CASE_EVENT_WORKFLOW_ROUTING)) {
    // Skip 'rules' engine as it's handled synchronously, not via workflow
    if (engine === 'rules') continue;

    const workflowName = eventTypeToWorkflowName(eventType);
    router.registerRoute(eventType, engine as WorkflowEngineType, workflowName);
  }

  // Lead workflows -> LangGraph (AI)
  router.registerRoute('lead.created', 'langgraph', 'leadQualificationWorkflow');
  router.registerRoute('lead.scored', 'langgraph', 'leadNurturingWorkflow');

  // Simple notifications -> BullMQ (background)
  router.registerRoute('notification.requested', 'bullmq', 'sendNotificationJob');
  router.registerRoute('email.requested', 'bullmq', 'sendEmailJob');

  return router;
}

/**
 * Get the recommended workflow engine for a case event type
 * Uses the domain routing configuration
 */
export function getCaseEventWorkflowEngine(
  eventType: CaseEventType
): 'temporal' | 'langgraph' | 'bullmq' | 'rules' {
  return CASE_EVENT_WORKFLOW_ROUTING[eventType];
}

/**
 * Check if a case event should use the rules engine (synchronous)
 */
export function isRulesEngineEvent(eventType: CaseEventType): boolean {
  return CASE_EVENT_WORKFLOW_ROUTING[eventType] === 'rules';
}

// ============================================================================
// Exports
// ============================================================================

export {
  TemporalClientAdapter,
  InternalTemporalHandle,
};
