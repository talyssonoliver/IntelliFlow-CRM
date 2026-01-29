import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseAgent, AgentTask, BaseAgentConfig, AgentResult } from './base.agent';
import { z } from 'zod';

// Mock the ChatOpenAI with a proper class
vi.mock('@langchain/openai', () => {
  return {
    ChatOpenAI: class MockChatOpenAI {
      constructor(config: unknown) {
        // Store config for potential inspection
      }
      async invoke(messages: unknown[]): Promise<{ content: string }> {
        return { content: 'Mocked LLM response' };
      }
    },
  };
});

// Mock the ai.config
vi.mock('../config/ai.config', () => ({
  aiConfig: {
    provider: 'openai',
    openai: {
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      maxTokens: 2000,
      timeout: 30000,
      apiKey: 'test-api-key',
    },
    costTracking: {
      enabled: true,
    },
  },
}));

// Mock cost tracker with proper function implementation
vi.mock('../utils/cost-tracker', () => ({
  costTracker: {
    recordUsage: function mockRecordUsage() {},
  },
}));

// Concrete implementation for testing
class TestAgent extends BaseAgent<{ message: string }, { response: string }> {
  protected async executeTask(
    task: AgentTask<{ message: string }, { response: string }>
  ): Promise<{ response: string }> {
    const messages = [
      this.createSystemMessage(this.generateSystemPrompt()),
      this.createHumanMessage(task.input.message),
    ];

    const result = await this.invokeLLM(messages);

    return { response: result };
  }

  public async testCalculateConfidence(
    task: AgentTask<{ message: string }, { response: string }>,
    output: { response: string }
  ): Promise<number> {
    return this.calculateConfidence(task, output);
  }

  public testGenerateSystemPrompt(): string {
    return this.generateSystemPrompt();
  }
}

describe('BaseAgent', () => {
  let agent: TestAgent;
  let config: BaseAgentConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      name: 'Test Agent',
      role: 'Test Role',
      goal: 'Test Goal',
      backstory: 'Test Backstory',
      maxIterations: 5,
      allowDelegation: false,
      verbose: true,
    };

    agent = new TestAgent(config);
  });

  describe('constructor', () => {
    it('should initialize agent with config', () => {
      expect(agent).toBeDefined();
      const stats = agent.getStats();
      expect(stats.name).toBe('Test Agent');
      expect(stats.role).toBe('Test Role');
      expect(stats.executionCount).toBe(0);
    });

    it('should apply default config values', () => {
      const minimalConfig: BaseAgentConfig = {
        name: 'Minimal Agent',
        role: 'Minimal Role',
        goal: 'Minimal Goal',
        backstory: 'Minimal Backstory',
      };

      const minimalAgent = new TestAgent(minimalConfig);
      const stats = minimalAgent.getStats();

      expect(stats.config.maxIterations).toBe(5);
      expect(stats.config.allowDelegation).toBe(false);
      expect(stats.config.verbose).toBe(false);
    });

    it('should throw error for Ollama provider', async () => {
      // Reset modules to apply new mock
      vi.resetModules();

      // Mock Ollama provider before importing the module
      vi.doMock('../config/ai.config', () => ({
        aiConfig: {
          provider: 'ollama',
          openai: {
            model: 'gpt-4-turbo-preview',
            temperature: 0.7,
            maxTokens: 2000,
            timeout: 30000,
            apiKey: 'test-api-key',
          },
        },
      }));

      // Dynamically import the module with the new mock
      const { BaseAgent: BaseAgentWithOllama } = await import('./base.agent');

      // Create a test class that extends the newly imported BaseAgent
      class OllamaTestAgent extends BaseAgentWithOllama<{ message: string }, { response: string }> {
        protected async executeTask(): Promise<{ response: string }> {
          return { response: 'test' };
        }
      }

      expect(() => new OllamaTestAgent(config)).toThrow('Ollama support requires dynamic import');

      // Restore original mock
      vi.doMock('../config/ai.config', () => ({
        aiConfig: {
          provider: 'openai',
          openai: {
            model: 'gpt-4-turbo-preview',
            temperature: 0.7,
            maxTokens: 2000,
            timeout: 30000,
            apiKey: 'test-api-key',
          },
          costTracking: {
            enabled: true,
          },
        },
      }));
    });
  });

  describe('execute', () => {
    it('should execute a task successfully', async () => {
      const task: AgentTask<{ message: string }, { response: string }> = {
        id: 'test-task-1',
        description: 'Test task',
        input: { message: 'Hello' },
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.output?.response).toBe('Mocked LLM response');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.agentName).toBe('Test Agent');
      expect(result.metadata?.taskId).toBe('test-task-1');
    });

    it('should increment execution count', async () => {
      const task: AgentTask<{ message: string }, { response: string }> = {
        id: 'test-task-2',
        description: 'Test task 2',
        input: { message: 'Hello' },
      };

      expect(agent.getStats().executionCount).toBe(0);

      await agent.execute(task);
      expect(agent.getStats().executionCount).toBe(1);

      await agent.execute(task);
      expect(agent.getStats().executionCount).toBe(2);
    });

    it('should validate output schema if provided', async () => {
      const outputSchema = z.object({
        response: z.string(),
      });

      const task: AgentTask<{ message: string }, { response: string }> = {
        id: 'test-task-3',
        description: 'Test task with validation',
        input: { message: 'Hello' },
        expectedOutput: outputSchema,
      };

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
    });

    it('should handle execution errors gracefully', async () => {
      const failingAgent = new TestAgent(config);

      // Override executeTask to throw error
      (failingAgent as any).executeTask = vi.fn().mockRejectedValue(new Error('Task failed'));

      const task: AgentTask<{ message: string }, { response: string }> = {
        id: 'test-task-4',
        description: 'Failing task',
        input: { message: 'Hello' },
      };

      const result = await failingAgent.execute(task);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task failed');
      expect(result.confidence).toBe(0);
      expect(result.output).toBeUndefined();
    });

    it('should measure execution duration', async () => {
      const task: AgentTask<{ message: string }, { response: string }> = {
        id: 'test-task-5',
        description: 'Duration test',
        input: { message: 'Hello' },
      };

      const result = await agent.execute(task);

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });
  });

  describe('generateSystemPrompt', () => {
    it('should generate system prompt with config details', () => {
      const prompt = agent.testGenerateSystemPrompt();

      expect(prompt).toContain('Test Agent');
      expect(prompt).toContain('Test Role');
      expect(prompt).toContain('Test Goal');
      expect(prompt).toContain('Test Backstory');
      expect(prompt).toContain('MUST');
      expect(prompt).toContain('MUST NOT');
    });

    it('should include behavioral guidelines', () => {
      const prompt = agent.testGenerateSystemPrompt();

      expect(prompt).toContain('Follow the task instructions precisely');
      expect(prompt).toContain('Provide clear, structured responses');
      expect(prompt).toContain('Include reasoning for your decisions');
    });
  });

  describe('createHumanMessage and createSystemMessage', () => {
    it('should create human message', () => {
      const message = (agent as any).createHumanMessage('Test content');

      expect(message).toBeDefined();
      expect(message.content).toBe('Test content');
    });

    it('should create system message', () => {
      const message = (agent as any).createSystemMessage('System content');

      expect(message).toBeDefined();
      expect(message.content).toBe('System content');
    });
  });

  describe('calculateConfidence', () => {
    it('should return default confidence score', async () => {
      const task: AgentTask<{ message: string }, { response: string }> = {
        id: 'test-task-6',
        description: 'Confidence test',
        input: { message: 'Hello' },
      };

      const output = { response: 'Test response' };

      const confidence = await agent.testCalculateConfidence(task, output);

      expect(confidence).toBe(0.8);
    });
  });

  describe('getStats', () => {
    it('should return agent statistics', () => {
      const stats = agent.getStats();

      expect(stats).toHaveProperty('name');
      expect(stats).toHaveProperty('role');
      expect(stats).toHaveProperty('executionCount');
      expect(stats).toHaveProperty('config');
      expect(stats.name).toBe('Test Agent');
      expect(stats.role).toBe('Test Role');
      expect(stats.executionCount).toBe(0);
    });

    it('should reflect updated execution count', async () => {
      const task: AgentTask<{ message: string }, { response: string }> = {
        id: 'test-task-7',
        description: 'Stats test',
        input: { message: 'Hello' },
      };

      await agent.execute(task);

      const stats = agent.getStats();
      expect(stats.executionCount).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset execution count', async () => {
      const task: AgentTask<{ message: string }, { response: string }> = {
        id: 'test-task-8',
        description: 'Reset test',
        input: { message: 'Hello' },
      };

      await agent.execute(task);
      await agent.execute(task);

      expect(agent.getStats().executionCount).toBe(2);

      agent.reset();

      expect(agent.getStats().executionCount).toBe(0);
    });
  });

  describe('invokeLLM', () => {
    it('should invoke LLM with messages', async () => {
      const messages = [
        (agent as any).createSystemMessage('System prompt'),
        (agent as any).createHumanMessage('User message'),
      ];

      const response = await (agent as any).invokeLLM(messages);

      expect(response).toBe('Mocked LLM response');
    });

    it('should throw error on LLM failure', async () => {
      const failingAgent = new TestAgent(config);

      // Mock LLM to throw error
      (failingAgent as any).model = {
        invoke: vi.fn().mockRejectedValue(new Error('LLM error')),
      };

      const messages = [(failingAgent as any).createHumanMessage('Test')];

      try {
        await (failingAgent as any).invokeLLM(messages);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('LLM error');
      }
    });
  });
});
