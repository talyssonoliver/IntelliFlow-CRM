import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the aiConfig to use mock provider before importing agents
vi.mock('../config/ai.config', () => ({
  aiConfig: {
    provider: 'mock',
    openai: {
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      maxTokens: 2000,
      timeout: 30000,
      apiKey: 'test-key',
    },
    ollama: {
      baseUrl: 'http://localhost:11434',
      model: 'mistral',
      temperature: 0.7,
      timeout: 60000,
    },
    costTracking: {
      enabled: false,
      warningThreshold: 10,
    },
    performance: {
      cacheEnabled: false,
      cacheTTL: 3600,
      rateLimitPerMinute: 60,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    features: {
      enableChainLogging: false,
      enableConfidenceScores: true,
      enableStructuredOutputs: true,
      enableMultiAgentWorkflows: false,
    },
  },
  loadAIConfig: () => ({}),
  AIProviderSchema: { parse: (v: unknown) => v },
  MODEL_PRICING: {},
  calculateCost: () => 0,
}));

import { Crew, CrewConfig, CrewTask, createLeadProcessingCrew, createResearchCrew } from './crew';
import { BaseAgent, AgentTask, BaseAgentConfig } from './base.agent';

// Mock agents for testing
class MockAgent extends BaseAgent<any, any> {
  protected async executeTask(task: AgentTask<any, any>): Promise<any> {
    return { result: `Processed by ${this.config.name}` };
  }
}

describe('Crew', () => {
  let mockAgents: BaseAgent[];
  let crewConfig: CrewConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock agents
    mockAgents = [
      new MockAgent({
        name: 'Agent 1',
        role: 'Researcher',
        goal: 'Research data',
        backstory: 'Expert researcher',
      }),
      new MockAgent({
        name: 'Agent 2',
        role: 'Analyst',
        goal: 'Analyze data',
        backstory: 'Expert analyst',
      }),
      new MockAgent({
        name: 'Agent 3',
        role: 'Writer',
        goal: 'Write reports',
        backstory: 'Expert writer',
      }),
    ];

    crewConfig = {
      name: 'Test Crew',
      description: 'Test crew for unit testing',
      agents: mockAgents,
      process: 'sequential',
      verbose: true,
    };
  });

  describe('constructor', () => {
    it('should initialize crew with config', () => {
      const crew = new Crew(crewConfig);

      expect(crew).toBeDefined();

      const stats = crew.getStats();
      expect(stats.name).toBe('Test Crew');
      expect(stats.agentCount).toBe(3);
      expect(stats.process).toBe('sequential');
      expect(stats.executionCount).toBe(0);
    });

    it('should apply default verbose value', () => {
      const config: CrewConfig = {
        name: 'Quiet Crew',
        description: 'Non-verbose crew',
        agents: mockAgents,
        process: 'parallel',
      };

      const crew = new Crew(config);
      expect(crew).toBeDefined();
    });

    it('should handle empty agent list', () => {
      const config: CrewConfig = {
        name: 'Empty Crew',
        description: 'Crew with no agents',
        agents: [],
        process: 'sequential',
      };

      const crew = new Crew(config);
      const stats = crew.getStats();

      expect(stats.agentCount).toBe(0);
    });
  });

  describe('execute', () => {
    it('should execute sequential tasks successfully', async () => {
      const crew = new Crew(crewConfig);

      const task: CrewTask = {
        id: 'task-001',
        description: 'Test sequential task',
        expectedOutput: 'Completed analysis',
      };

      const result = await crew.execute(task);

      expect(result.success).toBe(true);
      expect(result.agentResults.size).toBe(3);
      expect(result.totalDuration).toBeGreaterThanOrEqual(0);
      expect(result.errors).toBeUndefined();
    });

    it('should execute parallel tasks successfully', async () => {
      const config: CrewConfig = {
        ...crewConfig,
        process: 'parallel',
      };

      const crew = new Crew(config);

      const task: CrewTask = {
        id: 'task-002',
        description: 'Test parallel task',
        expectedOutput: 'Combined results',
      };

      const result = await crew.execute(task);

      expect(result.success).toBe(true);
      expect(result.agentResults.size).toBe(3);
      expect(result.totalDuration).toBeGreaterThanOrEqual(0);
    });

    it('should execute hierarchical tasks successfully', async () => {
      const config: CrewConfig = {
        ...crewConfig,
        process: 'hierarchical',
      };

      const crew = new Crew(config);

      const task: CrewTask = {
        id: 'task-003',
        description: 'Test hierarchical task',
        expectedOutput: 'Manager-coordinated results',
      };

      const result = await crew.execute(task);

      expect(result.success).toBe(true);
      expect(result.agentResults.size).toBe(3); // manager + 2 workers
      expect(result.totalDuration).toBeGreaterThanOrEqual(0);
    });

    it('should measure execution duration', async () => {
      const crew = new Crew(crewConfig);

      const task: CrewTask = {
        id: 'task-004',
        description: 'Test duration measurement',
        expectedOutput: 'Output',
      };

      const result = await crew.execute(task);

      expect(result.success).toBe(true);
      expect(result.totalDuration).toBeGreaterThanOrEqual(0);
    });

    it('should include task context in execution', async () => {
      const crew = new Crew(crewConfig);

      const task: CrewTask = {
        id: 'task-005',
        description: 'Test with context',
        expectedOutput: 'Output',
        context: { userId: 'user-123', metadata: { priority: 'high' } },
      };

      const result = await crew.execute(task);

      expect(result.success).toBe(true);
      expect(result.agentResults.size).toBe(3);
    });

    it('should pass output between sequential agents', async () => {
      const crew = new Crew(crewConfig);

      const task: CrewTask = {
        id: 'task-seq-001',
        description: 'Test sequential output passing',
        expectedOutput: 'Chained output',
        context: { initialData: 'start' },
      };

      const result = await crew.execute(task);

      expect(result.success).toBe(true);
      // Each agent should have processed
      expect(result.agentResults.has('Agent 1')).toBe(true);
      expect(result.agentResults.has('Agent 2')).toBe(true);
      expect(result.agentResults.has('Agent 3')).toBe(true);
    });

    it('should handle empty agent list in sequential mode', async () => {
      const config: CrewConfig = {
        name: 'Empty Crew',
        description: 'Crew with no agents',
        agents: [],
        process: 'sequential',
      };

      const crew = new Crew(config);
      const task: CrewTask = {
        id: 'task-empty-001',
        description: 'Test empty crew',
        expectedOutput: 'Nothing',
      };

      const result = await crew.execute(task);

      expect(result.success).toBe(true);
      expect(result.agentResults.size).toBe(0);
    });

    it('should handle empty agent list in hierarchical mode', async () => {
      const config: CrewConfig = {
        name: 'Empty Crew',
        description: 'Crew with no agents',
        agents: [],
        process: 'hierarchical',
      };

      const crew = new Crew(config);
      const task: CrewTask = {
        id: 'task-empty-002',
        description: 'Test empty hierarchical crew',
        expectedOutput: 'Nothing',
      };

      const result = await crew.execute(task);

      expect(result.success).toBe(true);
      expect(result.agentResults.size).toBe(0);
    });

    it('should execute hierarchical with only manager (no workers)', async () => {
      const config: CrewConfig = {
        name: 'Manager Only Crew',
        description: 'Crew with only one agent (manager)',
        agents: [mockAgents[0]],
        process: 'hierarchical',
      };

      const crew = new Crew(config);
      const task: CrewTask = {
        id: 'task-manager-001',
        description: 'Test manager only',
        expectedOutput: 'Manager output',
      };

      const result = await crew.execute(task);

      expect(result.success).toBe(true);
      expect(result.agentResults.size).toBe(1);
      expect(result.agentResults.has('Agent 1')).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return crew statistics', () => {
      const crew = new Crew(crewConfig);
      const stats = crew.getStats();

      expect(stats).toHaveProperty('name');
      expect(stats).toHaveProperty('executionCount');
      expect(stats).toHaveProperty('agentCount');
      expect(stats).toHaveProperty('process');
      expect(stats.name).toBe('Test Crew');
      expect(stats.executionCount).toBe(0);
      expect(stats.agentCount).toBe(3);
      expect(stats.process).toBe('sequential');
    });

    it('should increment execution count on execute', async () => {
      const crew = new Crew(crewConfig);

      expect(crew.getStats().executionCount).toBe(0);

      const task: CrewTask = {
        id: 'task-006',
        description: 'Execution count test',
        expectedOutput: 'Output',
      };

      await crew.execute(task);
      expect(crew.getStats().executionCount).toBe(1);

      await crew.execute(task);
      expect(crew.getStats().executionCount).toBe(2);
    });
  });

  describe('createLeadProcessingCrew', () => {
    it('should create lead processing crew with correct config', () => {
      const crew = createLeadProcessingCrew(mockAgents);
      const stats = crew.getStats();

      expect(stats.name).toBe('Lead Processing Crew');
      expect(stats.process).toBe('sequential');
      expect(stats.agentCount).toBe(3);
    });

    it('should handle empty agent list', () => {
      const crew = createLeadProcessingCrew([]);
      const stats = crew.getStats();

      expect(stats.agentCount).toBe(0);
    });
  });

  describe('createResearchCrew', () => {
    it('should create research crew with correct config', () => {
      const crew = createResearchCrew(mockAgents);
      const stats = crew.getStats();

      expect(stats.name).toBe('Research Crew');
      expect(stats.process).toBe('parallel');
      expect(stats.agentCount).toBe(3);
    });

    it('should handle single agent', () => {
      const crew = createResearchCrew([mockAgents[0]]);
      const stats = crew.getStats();

      expect(stats.agentCount).toBe(1);
    });
  });

  describe('CrewResult', () => {
    it('should return successful result with all agent results', async () => {
      const crew = new Crew(crewConfig);

      const task: CrewTask = {
        id: 'task-007',
        description: 'Result test',
        expectedOutput: 'Output',
      };

      const result = await crew.execute(task);

      expect(result.success).toBe(true);
      expect(result.agentResults).toBeInstanceOf(Map);
      expect(result.totalDuration).toBeGreaterThanOrEqual(0);
      expect(result.errors).toBeUndefined();
    });

    it('should handle agent failure and return error result', async () => {
      // Create a failing agent
      class FailingAgent extends BaseAgent<any, any> {
        protected async executeTask(): Promise<any> {
          throw new Error('Agent execution failed');
        }
      }

      const failingAgents = [
        new FailingAgent({
          name: 'Failing Agent',
          role: 'Failer',
          goal: 'Fail',
          backstory: 'Always fails',
        }),
      ];

      const config: CrewConfig = {
        name: 'Failing Crew',
        description: 'Crew that fails',
        agents: failingAgents,
        process: 'sequential',
      };

      const crew = new Crew(config);

      const task: CrewTask = {
        id: 'task-fail-001',
        description: 'Failure test',
        expectedOutput: 'Never reached',
      };

      const result = await crew.execute(task);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });
  });

  describe('Different process types', () => {
    it('should support sequential process type', () => {
      const config: CrewConfig = {
        ...crewConfig,
        process: 'sequential',
      };

      const crew = new Crew(config);
      expect(crew.getStats().process).toBe('sequential');
    });

    it('should support parallel process type', () => {
      const config: CrewConfig = {
        ...crewConfig,
        process: 'parallel',
      };

      const crew = new Crew(config);
      expect(crew.getStats().process).toBe('parallel');
    });

    it('should support hierarchical process type', () => {
      const config: CrewConfig = {
        ...crewConfig,
        process: 'hierarchical',
      };

      const crew = new Crew(config);
      expect(crew.getStats().process).toBe('hierarchical');
    });
  });
});
