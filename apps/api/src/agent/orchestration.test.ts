/**
 * Agent Orchestration Integration Tests
 *
 * Task: IFC-021 - PHASE-011: CrewAI Agent Framework
 *
 * Tests the API-level orchestration of AI agents including:
 * - Agent workflow coordination
 * - Multi-agent task delegation
 * - Result aggregation and validation
 * - Human-in-the-loop checkpoints
 * - Error handling and recovery
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { z } from 'zod';

/**
 * Orchestration request schema for API calls
 */
export const orchestrationRequestSchema = z.object({
  workflowId: z.string(),
  taskType: z.enum(['lead_qualification', 'email_generation', 'followup_strategy', 'full_pipeline']),
  input: z.record(z.unknown()),
  options: z
    .object({
      executionMode: z.enum(['sequential', 'parallel', 'hierarchical']).default('sequential'),
      humanCheckpointThreshold: z.number().min(0).max(1).default(0.5),
      maxRetries: z.number().int().min(0).max(5).default(2),
      timeout: z.number().int().min(1000).max(300000).default(60000),
    })
    .partial()
    .optional(),
  context: z
    .object({
      userId: z.string().optional(),
      sessionId: z.string().optional(),
      tenantId: z.string().optional(),
    })
    .optional(),
});

export type OrchestrationRequest = z.infer<typeof orchestrationRequestSchema>;

/**
 * Orchestration response schema
 */
export const orchestrationResponseSchema = z.object({
  workflowId: z.string(),
  status: z.enum(['completed', 'pending_review', 'failed', 'timeout']),
  results: z.record(
    z.object({
      agentName: z.string(),
      success: z.boolean(),
      output: z.unknown().optional(),
      confidence: z.number().min(0).max(1),
      duration: z.number(),
      error: z.string().optional(),
    })
  ),
  aggregatedOutput: z.unknown().optional(),
  requiresHumanReview: z.boolean(),
  lowConfidenceAgents: z.array(z.string()).optional(),
  totalDuration: z.number(),
  metadata: z.record(z.unknown()).optional(),
});

export type OrchestrationResponse = z.infer<typeof orchestrationResponseSchema>;

/**
 * Mock agent result for testing
 */
interface MockAgentResult {
  success: boolean;
  output: unknown;
  confidence: number;
  duration: number;
  error?: string;
}

/**
 * Mock orchestration service for testing
 */
class MockOrchestrationService {
  private agentResults: Map<string, MockAgentResult> = new Map();
  private executionCount = 0;

  setAgentResult(agentName: string, result: MockAgentResult): void {
    this.agentResults.set(agentName, result);
  }

  async executeWorkflow(request: OrchestrationRequest): Promise<OrchestrationResponse> {
    this.executionCount++;
    const startTime = Date.now();
    const results: Record<string, { agentName: string; success: boolean; output?: unknown; confidence: number; duration: number; error?: string }> = {};
    const lowConfidenceAgents: string[] = [];
    const threshold = request.options?.humanCheckpointThreshold ?? 0.5;

    // Simulate agent execution based on task type
    const agents = this.getAgentsForTaskType(request.taskType);

    for (const agentName of agents) {
      const mockResult = this.agentResults.get(agentName) ?? {
        success: true,
        output: { processed: true, agentName },
        confidence: 0.85,
        duration: 100,
      };

      results[agentName] = {
        agentName,
        ...mockResult,
      };

      if (mockResult.confidence < threshold) {
        lowConfidenceAgents.push(agentName);
      }
    }

    const allSucceeded = Object.values(results).every((r) => r.success);
    const requiresHumanReview = lowConfidenceAgents.length > 0;

    return {
      workflowId: request.workflowId,
      status: allSucceeded ? (requiresHumanReview ? 'pending_review' : 'completed') : 'failed',
      results,
      aggregatedOutput: this.aggregateResults(results),
      requiresHumanReview,
      lowConfidenceAgents: requiresHumanReview ? lowConfidenceAgents : undefined,
      totalDuration: Date.now() - startTime,
      metadata: {
        executionCount: this.executionCount,
        taskType: request.taskType,
        executionMode: request.options?.executionMode ?? 'sequential',
      },
    };
  }

  private getAgentsForTaskType(taskType: OrchestrationRequest['taskType']): string[] {
    switch (taskType) {
      case 'lead_qualification':
        return ['Lead Qualification Specialist'];
      case 'email_generation':
        return ['Email Writer Specialist'];
      case 'followup_strategy':
        return ['Follow-up Strategy Specialist'];
      case 'full_pipeline':
        return ['Lead Qualification Specialist', 'Email Writer Specialist', 'Follow-up Strategy Specialist'];
    }
  }

  private aggregateResults(results: Record<string, { output?: unknown }>): unknown {
    const aggregated: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(results)) {
      aggregated[key] = value.output;
    }
    return aggregated;
  }

  getExecutionCount(): number {
    return this.executionCount;
  }

  reset(): void {
    this.agentResults.clear();
    this.executionCount = 0;
  }
}

describe('Agent Orchestration Integration Tests', () => {
  let orchestrationService: MockOrchestrationService;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrationService = new MockOrchestrationService();
  });

  afterEach(() => {
    orchestrationService.reset();
  });

  describe('Request Validation', () => {
    it('should validate a valid orchestration request', () => {
      const request: OrchestrationRequest = {
        workflowId: 'wf-001',
        taskType: 'lead_qualification',
        input: { leadId: 'lead-123', email: 'test@example.com' },
      };

      const result = orchestrationRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should reject invalid task types', () => {
      const request = {
        workflowId: 'wf-001',
        taskType: 'invalid_type',
        input: {},
      };

      const result = orchestrationRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should apply default options when not provided', () => {
      const request: OrchestrationRequest = {
        workflowId: 'wf-001',
        taskType: 'email_generation',
        input: {},
      };

      expect(request.options).toBeUndefined();

      // Defaults should be applied during execution
      const withDefaults = {
        ...request,
        options: {
          executionMode: 'sequential' as const,
          humanCheckpointThreshold: 0.5,
          maxRetries: 2,
          timeout: 60000,
        },
      };

      const result = orchestrationRequestSchema.safeParse(withDefaults);
      expect(result.success).toBe(true);
    });

    it('should validate context fields', () => {
      const request: OrchestrationRequest = {
        workflowId: 'wf-001',
        taskType: 'followup_strategy',
        input: {},
        context: {
          userId: 'user-123',
          sessionId: 'session-456',
          tenantId: 'tenant-789',
        },
      };

      const result = orchestrationRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });
  });

  describe('Workflow Execution', () => {
    it('should execute a single-agent workflow', async () => {
      const request: OrchestrationRequest = {
        workflowId: 'wf-single-001',
        taskType: 'lead_qualification',
        input: { leadId: 'lead-123' },
      };

      const response = await orchestrationService.executeWorkflow(request);

      expect(response.workflowId).toBe('wf-single-001');
      expect(response.status).toBe('completed');
      expect(Object.keys(response.results)).toHaveLength(1);
      expect(response.results['Lead Qualification Specialist']).toBeDefined();
    });

    it('should execute a full pipeline workflow', async () => {
      const request: OrchestrationRequest = {
        workflowId: 'wf-pipeline-001',
        taskType: 'full_pipeline',
        input: { leadId: 'lead-456' },
      };

      const response = await orchestrationService.executeWorkflow(request);

      expect(response.status).toBe('completed');
      expect(Object.keys(response.results)).toHaveLength(3);
      expect(response.results['Lead Qualification Specialist']).toBeDefined();
      expect(response.results['Email Writer Specialist']).toBeDefined();
      expect(response.results['Follow-up Strategy Specialist']).toBeDefined();
    });

    it('should track execution count', async () => {
      expect(orchestrationService.getExecutionCount()).toBe(0);

      await orchestrationService.executeWorkflow({
        workflowId: 'wf-001',
        taskType: 'lead_qualification',
        input: {},
      });

      await orchestrationService.executeWorkflow({
        workflowId: 'wf-002',
        taskType: 'email_generation',
        input: {},
      });

      expect(orchestrationService.getExecutionCount()).toBe(2);
    });
  });

  describe('Human-in-the-Loop Checkpoints', () => {
    it('should flag low confidence results for human review', async () => {
      orchestrationService.setAgentResult('Lead Qualification Specialist', {
        success: true,
        output: { qualified: false },
        confidence: 0.3, // Below default threshold of 0.5
        duration: 150,
      });

      const request: OrchestrationRequest = {
        workflowId: 'wf-low-conf-001',
        taskType: 'lead_qualification',
        input: {},
      };

      const response = await orchestrationService.executeWorkflow(request);

      expect(response.status).toBe('pending_review');
      expect(response.requiresHumanReview).toBe(true);
      expect(response.lowConfidenceAgents).toContain('Lead Qualification Specialist');
    });

    it('should not require review for high confidence results', async () => {
      orchestrationService.setAgentResult('Lead Qualification Specialist', {
        success: true,
        output: { qualified: true },
        confidence: 0.95,
        duration: 100,
      });

      const request: OrchestrationRequest = {
        workflowId: 'wf-high-conf-001',
        taskType: 'lead_qualification',
        input: {},
      };

      const response = await orchestrationService.executeWorkflow(request);

      expect(response.status).toBe('completed');
      expect(response.requiresHumanReview).toBe(false);
      expect(response.lowConfidenceAgents).toBeUndefined();
    });

    it('should respect custom checkpoint threshold', async () => {
      orchestrationService.setAgentResult('Email Writer Specialist', {
        success: true,
        output: { email: 'content' },
        confidence: 0.6, // Above 0.5 but below 0.7
        duration: 200,
      });

      const request: OrchestrationRequest = {
        workflowId: 'wf-custom-threshold-001',
        taskType: 'email_generation',
        input: {},
        options: {
          humanCheckpointThreshold: 0.7,
        },
      };

      const response = await orchestrationService.executeWorkflow(request);

      expect(response.requiresHumanReview).toBe(true);
      expect(response.lowConfidenceAgents).toContain('Email Writer Specialist');
    });
  });

  describe('Error Handling', () => {
    it('should handle agent failures gracefully', async () => {
      orchestrationService.setAgentResult('Lead Qualification Specialist', {
        success: false,
        output: undefined,
        confidence: 0,
        duration: 50,
        error: 'LLM invocation timeout',
      });

      const request: OrchestrationRequest = {
        workflowId: 'wf-failure-001',
        taskType: 'lead_qualification',
        input: {},
      };

      const response = await orchestrationService.executeWorkflow(request);

      expect(response.status).toBe('failed');
      expect(response.results['Lead Qualification Specialist'].success).toBe(false);
      expect(response.results['Lead Qualification Specialist'].error).toBe('LLM invocation timeout');
    });

    it('should continue pipeline on partial failures', async () => {
      orchestrationService.setAgentResult('Lead Qualification Specialist', {
        success: true,
        output: { qualified: true },
        confidence: 0.9,
        duration: 100,
      });

      orchestrationService.setAgentResult('Email Writer Specialist', {
        success: false,
        output: undefined,
        confidence: 0,
        duration: 50,
        error: 'Template not found',
      });

      orchestrationService.setAgentResult('Follow-up Strategy Specialist', {
        success: true,
        output: { action: 'schedule_call' },
        confidence: 0.85,
        duration: 120,
      });

      const request: OrchestrationRequest = {
        workflowId: 'wf-partial-001',
        taskType: 'full_pipeline',
        input: {},
      };

      const response = await orchestrationService.executeWorkflow(request);

      // Pipeline fails because one agent failed
      expect(response.status).toBe('failed');
      // But we still have results from all agents
      expect(Object.keys(response.results)).toHaveLength(3);
      expect(response.results['Lead Qualification Specialist'].success).toBe(true);
      expect(response.results['Email Writer Specialist'].success).toBe(false);
      expect(response.results['Follow-up Strategy Specialist'].success).toBe(true);
    });
  });

  describe('Response Validation', () => {
    it('should produce valid response schema', async () => {
      const request: OrchestrationRequest = {
        workflowId: 'wf-schema-001',
        taskType: 'lead_qualification',
        input: { leadId: 'lead-test' },
      };

      const response = await orchestrationService.executeWorkflow(request);

      const result = orchestrationResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should include all required response fields', async () => {
      const request: OrchestrationRequest = {
        workflowId: 'wf-fields-001',
        taskType: 'email_generation',
        input: {},
      };

      const response = await orchestrationService.executeWorkflow(request);

      expect(response).toHaveProperty('workflowId');
      expect(response).toHaveProperty('status');
      expect(response).toHaveProperty('results');
      expect(response).toHaveProperty('requiresHumanReview');
      expect(response).toHaveProperty('totalDuration');
    });

    it('should include metadata with execution details', async () => {
      const request: OrchestrationRequest = {
        workflowId: 'wf-metadata-001',
        taskType: 'followup_strategy',
        input: {},
        options: {
          executionMode: 'parallel',
        },
      };

      const response = await orchestrationService.executeWorkflow(request);

      expect(response.metadata).toBeDefined();
      expect(response.metadata?.taskType).toBe('followup_strategy');
      expect(response.metadata?.executionMode).toBe('parallel');
    });
  });

  describe('Aggregation', () => {
    it('should aggregate outputs from all agents', async () => {
      orchestrationService.setAgentResult('Lead Qualification Specialist', {
        success: true,
        output: { qualified: true, score: 85 },
        confidence: 0.9,
        duration: 100,
      });

      orchestrationService.setAgentResult('Email Writer Specialist', {
        success: true,
        output: { subject: 'Hello', body: 'Content...' },
        confidence: 0.88,
        duration: 150,
      });

      orchestrationService.setAgentResult('Follow-up Strategy Specialist', {
        success: true,
        output: { action: 'send_email', timing: '2_days' },
        confidence: 0.92,
        duration: 80,
      });

      const request: OrchestrationRequest = {
        workflowId: 'wf-aggregate-001',
        taskType: 'full_pipeline',
        input: {},
      };

      const response = await orchestrationService.executeWorkflow(request);

      expect(response.aggregatedOutput).toBeDefined();
      const aggregated = response.aggregatedOutput as Record<string, unknown>;
      expect(aggregated['Lead Qualification Specialist']).toEqual({ qualified: true, score: 85 });
      expect(aggregated['Email Writer Specialist']).toEqual({ subject: 'Hello', body: 'Content...' });
      expect(aggregated['Follow-up Strategy Specialist']).toEqual({ action: 'send_email', timing: '2_days' });
    });
  });

  describe('Service Reset', () => {
    it('should reset service state', async () => {
      await orchestrationService.executeWorkflow({
        workflowId: 'wf-001',
        taskType: 'lead_qualification',
        input: {},
      });

      expect(orchestrationService.getExecutionCount()).toBe(1);

      orchestrationService.reset();

      expect(orchestrationService.getExecutionCount()).toBe(0);
    });

    it('should clear custom agent results on reset', async () => {
      orchestrationService.setAgentResult('Lead Qualification Specialist', {
        success: false,
        output: undefined,
        confidence: 0,
        duration: 0,
        error: 'Custom error',
      });

      orchestrationService.reset();

      const response = await orchestrationService.executeWorkflow({
        workflowId: 'wf-post-reset-001',
        taskType: 'lead_qualification',
        input: {},
      });

      // Should use default mock result after reset
      expect(response.results['Lead Qualification Specialist'].success).toBe(true);
      expect(response.results['Lead Qualification Specialist'].error).toBeUndefined();
    });
  });
});

describe('Orchestration Schema Exports', () => {
  it('should export request schema', () => {
    expect(orchestrationRequestSchema).toBeDefined();
    expect(typeof orchestrationRequestSchema.parse).toBe('function');
  });

  it('should export response schema', () => {
    expect(orchestrationResponseSchema).toBeDefined();
    expect(typeof orchestrationResponseSchema.parse).toBe('function');
  });

  it('should export OrchestrationRequest type', () => {
    const request: OrchestrationRequest = {
      workflowId: 'test',
      taskType: 'lead_qualification',
      input: {},
    };
    expect(request.workflowId).toBe('test');
  });

  it('should export OrchestrationResponse type', () => {
    const response: OrchestrationResponse = {
      workflowId: 'test',
      status: 'completed',
      results: {},
      requiresHumanReview: false,
      totalDuration: 100,
    };
    expect(response.status).toBe('completed');
  });
});
