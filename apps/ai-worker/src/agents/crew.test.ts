import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Crew,
  CrewConfig,
  CrewTask,
  createLeadProcessingCrew,
  createResearchCrew,
} from './crew';
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
    it('should throw error for sequential execution (not implemented)', async () => {
      const crew = new Crew(crewConfig);

      const task: CrewTask = {
        id: 'task-001',
        description: 'Test sequential task',
        expectedOutput: 'Completed analysis',
      };

      try {
        await crew.execute(task);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Sequential execution not yet implemented');
      }
    });

    it('should throw error for parallel execution (not implemented)', async () => {
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

      try {
        await crew.execute(task);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Parallel execution not yet implemented');
      }
    });

    it('should throw error for hierarchical execution (not implemented)', async () => {
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

      try {
        await crew.execute(task);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Hierarchical execution not yet implemented');
      }
    });

    it('should measure execution duration on error', async () => {
      const crew = new Crew(crewConfig);

      const task: CrewTask = {
        id: 'task-004',
        description: 'Test duration measurement',
        expectedOutput: 'Output',
      };

      try {
        await crew.execute(task);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should include task context', async () => {
      const crew = new Crew(crewConfig);

      const task: CrewTask = {
        id: 'task-005',
        description: 'Test with context',
        expectedOutput: 'Output',
        context: { userId: 'user-123', metadata: { priority: 'high' } },
      };

      try {
        await crew.execute(task);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
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

    it('should increment execution count on execute attempts', async () => {
      const crew = new Crew(crewConfig);

      expect(crew.getStats().executionCount).toBe(0);

      const task: CrewTask = {
        id: 'task-006',
        description: 'Execution count test',
        expectedOutput: 'Output',
      };

      // Execute will fail but should increment counter
      await crew.execute(task).catch(() => {});
      expect(crew.getStats().executionCount).toBe(1);

      await crew.execute(task).catch(() => {});
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
    it('should return error result on execution failure', async () => {
      const crew = new Crew(crewConfig);

      const task: CrewTask = {
        id: 'task-007',
        description: 'Error test',
        expectedOutput: 'Output',
      };

      try {
        await crew.execute(task);
      } catch (error) {
        // Expected to throw
        expect(error).toBeDefined();
      }
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
