import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseAgent, AgentTask, BaseAgentConfig, AgentResult } from './base.agent';
import { z } from 'zod';

// Mock hallucinationChecker so L4 confidence tests are deterministic
vi.mock('../monitoring/hallucination-checker.js', () => ({
  hallucinationChecker: {
    get lastCheck() {
      return null; // default: no hallucination detected
    },
  },
}));

// Pattern A: mock the factory — BaseAgent calls createLLM internally
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

// Mock the ai.config
vi.mock('../config/ai.config', () => ({
  aiConfig: {
    provider: 'litellm',
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

    it('should initialize with Ollama provider config', async () => {
      // After B2b the agent delegates provider selection to the factory.
      // We only need to verify the agent initializes without error when
      // aiConfig.provider = 'ollama'. The factory is already mocked at the
      // top of this file — no module reset needed.
      vi.resetModules();

      vi.doMock('../lib/llm-factory.js', () => ({
        createLLM: vi.fn(() => ({
          invoke: vi.fn().mockResolvedValue({ content: 'Mocked Ollama response' }),
          withStructuredOutput: vi.fn(() => ({
            invoke: vi.fn().mockResolvedValue({ content: 'Mocked Ollama response' }),
          })),
        })),
        createEmbeddings: vi.fn(() => ({
          embedQuery: vi.fn().mockResolvedValue([]),
          embedDocuments: vi.fn().mockResolvedValue([]),
        })),
      }));

      vi.doMock('../config/ai.config', () => ({
        aiConfig: {
          provider: 'ollama',
          ollama: {
            baseUrl: 'http://localhost:11434',
            model: 'mistral',
            temperature: 0.7,
            timeout: 60000,
          },
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

      // Dynamically import the module with the new mock
      const { BaseAgent: BaseAgentWithOllama } = await import('./base.agent');

      // Create a test class that extends the newly imported BaseAgent
      class OllamaTestAgent extends BaseAgentWithOllama<{ message: string }, { response: string }> {
        protected async executeTask(): Promise<{ response: string }> {
          return { response: 'test' };
        }
      }

      const ollamaAgent = new OllamaTestAgent(config);
      expect(ollamaAgent).toBeDefined();
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
    it('valid payload, no schema, no hallucination → 0.5 + 0.2 + 0.1 = 0.8', async () => {
      const task: AgentTask<{ message: string }, { response: string }> = {
        id: 'test-task-6',
        description: 'Confidence test',
        input: { message: 'Hello' },
        // no expectedOutput schema
      };

      // Output text with a token count in [10, 1500]
      const output = {
        response:
          'This is a normal response with enough tokens to fall inside the expected range for confidence scoring.',
      };

      const confidence = await agent.testCalculateConfidence(task, output);

      // baseline 0.5 + schema bonus 0.2 (no schema = treated as valid) + token bonus 0.1
      expect(confidence).toBeCloseTo(0.8, 5);
    });

    it('output passes Zod schema → includes +0.2 schema bonus', async () => {
      const task: AgentTask<{ message: string }, { response: string }> = {
        id: 'test-task-conf-schema',
        description: 'Schema validation test',
        input: { message: 'Hello' },
        expectedOutput: z.object({ response: z.string() }),
      };
      const output = {
        response:
          'Valid response text that has enough content to stay within the expected token range.',
      };

      const confidence = await agent.testCalculateConfidence(task, output);

      // 0.5 + 0.2 (schema pass) + 0.1 (token range) = 0.8
      expect(confidence).toBeCloseTo(0.8, 5);
    });

    it('output fails Zod schema → no schema bonus', async () => {
      const task: AgentTask<{ message: string }, { response: string }> = {
        id: 'test-task-conf-schema-fail',
        description: 'Schema failure test',
        input: { message: 'Hello' },
        expectedOutput: z.object({ response: z.number() }), // expects number, gets string
      };
      const output = {
        response: 'This is a string, not a number — schema validation should fail for this output.',
      } as unknown as { response: string };

      const confidence = await agent.testCalculateConfidence(task, output);

      // 0.5 + 0 (schema fail) + 0.1 (token range) = 0.6
      expect(confidence).toBeCloseTo(0.6, 5);
    });

    it('hallucination detected → -0.3 applied', async () => {
      // Override the mock for this test only
      const { hallucinationChecker: hc } = await import('../monitoring/hallucination-checker.js');
      vi.spyOn(hc, 'lastCheck', 'get').mockReturnValue({
        id: 'fake',
        timestamp: new Date(),
        model: 'gpt-4',
        inputContext: '',
        output: '',
        hallucinated: true,
        confidence: 0.9,
        hallucinationTypes: ['factual_error' as any],
        evidence: [],
        groundTruthSources: [],
        score: 0.9,
      });

      const task: AgentTask<{ message: string }, { response: string }> = {
        id: 'test-task-conf-hallucination',
        description: 'Hallucination penalty test',
        input: { message: 'Hello' },
      };
      const output = {
        response: 'Response that triggered a hallucination flag from the checker service.',
      };

      const confidence = await agent.testCalculateConfidence(task, output);

      // 0.5 + 0.2 (no schema) - 0.3 (hallucination) + 0.1 (token range) = 0.5
      expect(confidence).toBeCloseTo(0.5, 5);

      vi.restoreAllMocks();
    });

    it('suspiciously short output → no token bonus', async () => {
      const task: AgentTask<{ message: string }, { response: string }> = {
        id: 'test-task-conf-short',
        description: 'Short output test',
        input: { message: 'Hi' },
      };
      // Very short — fewer than 10 tokens
      const output = { response: 'OK' };

      const confidence = await agent.testCalculateConfidence(task, output);

      // 0.5 + 0.2 (no schema) + 0 (too short) = 0.7
      expect(confidence).toBeCloseTo(0.7, 5);
    });

    it('confidence is clamped to [0, 1]', async () => {
      const { hallucinationChecker: hc } = await import('../monitoring/hallucination-checker.js');
      // Force hallucinated=true to push score low
      vi.spyOn(hc, 'lastCheck', 'get').mockReturnValue({
        id: 'fake2',
        timestamp: new Date(),
        model: 'gpt-4',
        inputContext: '',
        output: '',
        hallucinated: true,
        confidence: 0.95,
        hallucinationTypes: [] as any,
        evidence: [],
        groundTruthSources: [],
        score: 0.95,
      });

      // schema fail + hallucination + short output = 0.5 - 0.3 = 0.2 (no bonuses)
      const task: AgentTask<{ message: string }, { response: string }> = {
        id: 'test-task-conf-clamp',
        description: 'Clamp test',
        input: { message: 'Hi' },
        expectedOutput: z.object({ response: z.number() }), // will fail
      };
      const output = { response: 'ok' } as unknown as { response: string };

      const confidence = await agent.testCalculateConfidence(task, output);

      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);

      vi.restoreAllMocks();
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
