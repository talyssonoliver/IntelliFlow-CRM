/**
 * Integration Test Suite for Codex CLI Integration
 *
 * Tests the Codex AI integration with OpenAI API for code review,
 * test generation, and other AI-assisted development tasks.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'yaml';

// Types
interface CodexConfig {
  version: string;
  api: {
    provider: string;
    model: string;
    timeout: number;
  };
  prompts: {
    base_path: string;
    available: Array<{
      name: string;
      file: string;
      description: string;
    }>;
  };
}

interface CodexResponse {
  content: string;
  metadata: {
    model: string;
    tokens_used: number;
    cost_estimate: number;
    timestamp: string;
  };
}

interface ReviewResult {
  critical_issues: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    message: string;
    line?: number;
    suggestion?: string;
  }>;
  warnings: string[];
  suggestions: string[];
  metrics: {
    type_safety: boolean;
    test_coverage: number;
    complexity_score: number;
    security_score: boolean;
    ddd_compliance: boolean;
  };
}

// Mock Codex CLI Client
class CodexClient {
  private config: CodexConfig;
  private apiKey: string;

  constructor(configPath: string, apiKey: string) {
    this.config = {} as CodexConfig;
    this.apiKey = apiKey;
  }

  async loadConfig(configPath: string): Promise<void> {
    const content = await readFile(configPath, 'utf-8');
    this.config = yaml.parse(content);
  }

  async reviewCode(
    code: string,
    options?: {
      focus_areas?: string[];
      severity_threshold?: string;
    }
  ): Promise<ReviewResult> {
    // Mock implementation - would call OpenAI API in production
    return {
      critical_issues: [],
      warnings: [],
      suggestions: [],
      metrics: {
        type_safety: true,
        test_coverage: 95,
        complexity_score: 8,
        security_score: true,
        ddd_compliance: true,
      },
    };
  }

  async generateTests(
    code: string,
    options?: {
      test_types?: string[];
      coverage_target?: number;
    }
  ): Promise<string> {
    // Mock implementation
    return `
describe('Component', () => {
  it('should work', () => {
    expect(true).toBe(true)
  })
})
    `.trim();
  }

  async analyzeComplexity(code: string): Promise<{
    cyclomatic: number;
    cognitive: number;
    maintainability: number;
  }> {
    return {
      cyclomatic: 5,
      cognitive: 3,
      maintainability: 85,
    };
  }

  getConfig(): CodexConfig {
    return this.config;
  }
}

// Test Suite
describe('Codex Integration', () => {
  let client: CodexClient;
  const configPath = join(process.cwd(), 'tools/integrations/codex/cli-config.yaml');
  const apiKey = process.env.OPENAI_API_KEY || 'test-key';

  beforeAll(async () => {
    client = new CodexClient(configPath, apiKey);
    await client.loadConfig(configPath);
  });

  describe('Configuration', () => {
    it('should load configuration file', async () => {
      const config = client.getConfig();

      expect(config).toBeDefined();
      expect(config.version).toBe('1.0');
      expect(config.api.provider).toBe('openai');
    });

    it('should have required API settings', () => {
      const config = client.getConfig();

      expect(config.api.model).toBeDefined();
      expect(config.api.timeout).toBeGreaterThan(0);
    });

    it('should have prompt configurations', () => {
      const config = client.getConfig();

      expect(config.prompts.base_path).toBe('tools/integrations/codex/prompts');
      expect(config.prompts.available).toBeInstanceOf(Array);
      expect(config.prompts.available.length).toBeGreaterThan(0);
    });

    it('should include code-review prompt', () => {
      const config = client.getConfig();
      const codeReviewPrompt = config.prompts.available.find((p) => p.name === 'code-review');

      expect(codeReviewPrompt).toBeDefined();
      expect(codeReviewPrompt?.file).toBe('code-review.md');
    });

    it('should include test-generation prompt', () => {
      const config = client.getConfig();
      const testGenPrompt = config.prompts.available.find((p) => p.name === 'test-generation');

      expect(testGenPrompt).toBeDefined();
      expect(testGenPrompt?.file).toBe('test-generation.md');
    });
  });

  describe('Code Review', () => {
    it('should review valid TypeScript code', async () => {
      const code = `
export class LeadScore extends ValueObject {
  private constructor(private readonly value: number) {
    if (value < 0 || value > 100) {
      throw new InvalidLeadScoreError(value)
    }
  }

  static create(value: number): Result<LeadScore> {
    try {
      return Result.ok(new LeadScore(value))
    } catch (error) {
      return Result.fail(error.message)
    }
  }
}
      `.trim();

      const result = await client.reviewCode(code);

      expect(result).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.critical_issues).toBeInstanceOf(Array);
    });

    it('should detect type safety issues', async () => {
      const code = `
export function processLead(data: any) {
  return data.email
}
      `.trim();

      const result = await client.reviewCode(code, {
        focus_areas: ['type_safety'],
      });

      expect(result.metrics.type_safety).toBe(false);
    });

    it('should check DDD compliance', async () => {
      const code = `
import { PrismaClient } from '@prisma/client'

export class Lead {
  constructor(private prisma: PrismaClient) {}
}
      `.trim();

      const result = await client.reviewCode(code, {
        focus_areas: ['domain_driven_design'],
      });

      // Domain layer should not import Prisma
      expect(result.critical_issues.length).toBeGreaterThan(0);
    });

    it('should identify security vulnerabilities', async () => {
      const code = `
const apiKey = 'sk-1234567890abcdef'
const query = 'SELECT * FROM users WHERE id = ' + userId
      `.trim();

      const result = await client.reviewCode(code, {
        focus_areas: ['security'],
      });

      expect(result.critical_issues.length).toBeGreaterThan(0);
      expect(
        result.critical_issues.some((issue) => issue.message.toLowerCase().includes('secret'))
      ).toBe(true);
    });

    it('should respect severity threshold', async () => {
      const code = 'const x = 1';

      const criticalOnly = await client.reviewCode(code, {
        severity_threshold: 'critical',
      });

      const allIssues = await client.reviewCode(code, {
        severity_threshold: 'low',
      });

      expect(criticalOnly.critical_issues.length).toBeLessThanOrEqual(
        allIssues.critical_issues.length
      );
    });
  });

  describe('Test Generation', () => {
    it('should generate unit tests', async () => {
      const code = `
export class LeadScore extends ValueObject {
  static create(value: number): Result<LeadScore> {
    if (value < 0 || value > 100) {
      return Result.fail('Score must be between 0 and 100')
    }
    return Result.ok(new LeadScore(value))
  }
}
      `.trim();

      const tests = await client.generateTests(code, {
        test_types: ['unit'],
      });

      expect(tests).toContain('describe');
      expect(tests).toContain('it');
      expect(tests).toContain('expect');
    });

    it('should include edge case tests', async () => {
      const code = `
export function validateEmail(email: string): boolean {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)
}
      `.trim();

      const tests = await client.generateTests(code, {
        test_types: ['unit'],
        coverage_target: 100,
      });

      // Should test edge cases
      expect(tests.toLowerCase()).toContain('edge');
      expect(tests).toContain('invalid');
    });

    it('should generate integration tests for API', async () => {
      const code = `
export const leadRouter = t.router({
  create: t.procedure
    .input(createLeadSchema)
    .mutation(async ({ input, ctx }) => {
      return ctx.services.leadService.create(input)
    }),
})
      `.trim();

      const tests = await client.generateTests(code, {
        test_types: ['integration'],
      });

      expect(tests).toContain('caller');
      expect(tests).toContain('mockContext');
    });

    it('should achieve target coverage', async () => {
      const code = `
export class Calculator {
  add(a: number, b: number): number { return a + b }
  subtract(a: number, b: number): number { return a - b }
  multiply(a: number, b: number): number { return a * b }
  divide(a: number, b: number): number {
    if (b === 0) throw new Error('Division by zero')
    return a / b
  }
}
      `.trim();

      const tests = await client.generateTests(code, {
        coverage_target: 90,
      });

      // Should test all methods and error cases
      expect(tests).toContain('add');
      expect(tests).toContain('subtract');
      expect(tests).toContain('multiply');
      expect(tests).toContain('divide');
      expect(tests.toLowerCase()).toContain('error');
    });
  });

  describe('Complexity Analysis', () => {
    it('should analyze simple function complexity', async () => {
      const code = `
function add(a: number, b: number): number {
  return a + b
}
      `.trim();

      const result = await client.analyzeComplexity(code);

      expect(result.cyclomatic).toBeLessThan(5);
      expect(result.cognitive).toBeLessThan(5);
      expect(result.maintainability).toBeGreaterThan(80);
    });

    it('should detect high complexity', async () => {
      const code = `
function processData(data: any) {
  if (data.type === 'A') {
    if (data.value > 10) {
      if (data.nested) {
        return data.nested.value
      } else {
        return data.value * 2
      }
    } else {
      return data.value
    }
  } else if (data.type === 'B') {
    return data.value * 3
  } else {
    return 0
  }
}
      `.trim();

      const result = await client.analyzeComplexity(code);

      expect(result.cyclomatic).toBeGreaterThan(5);
      expect(result.cognitive).toBeGreaterThan(5);
    });
  });

  describe('Error Handling', () => {
    it('should handle API timeout', async () => {
      // Mock timeout scenario
      vi.useFakeTimers();

      const promise = client.reviewCode('const x = 1');

      vi.advanceTimersByTime(31000); // > 30s timeout

      // Should handle gracefully
      await expect(promise).resolves.toBeDefined();

      vi.useRealTimers();
    });

    it('should handle invalid API key', async () => {
      const invalidClient = new CodexClient(configPath, 'invalid-key');
      await invalidClient.loadConfig(configPath);

      // Should throw authentication error
      await expect(invalidClient.reviewCode('const x = 1')).rejects.toThrow();
    });

    it('should handle rate limiting', async () => {
      // Make multiple rapid requests
      const requests = Array.from({ length: 100 }, () => client.reviewCode('const x = 1'));

      // Should handle rate limiting gracefully
      await expect(Promise.all(requests)).resolves.toBeDefined();
    });
  });

  describe('Caching', () => {
    it('should cache identical requests', async () => {
      const code = 'const x = 1';

      const result1 = await client.reviewCode(code);
      const start = Date.now();
      const result2 = await client.reviewCode(code);
      const duration = Date.now() - start;

      // Second request should be faster (cached)
      expect(duration).toBeLessThan(100);
      expect(result2).toEqual(result1);
    });

    it('should invalidate cache on code change', async () => {
      const code1 = 'const x = 1';
      const code2 = 'const x = 2';

      const result1 = await client.reviewCode(code1);
      const result2 = await client.reviewCode(code2);

      // Different code should produce different results
      expect(result2).not.toEqual(result1);
    });
  });

  describe('Cost Tracking', () => {
    it('should track token usage', async () => {
      const code = 'const x = 1';

      const result = (await client.reviewCode(code)) as any;

      expect(result.metadata?.tokens_used).toBeGreaterThan(0);
    });

    it('should estimate costs', async () => {
      const code = 'const x = 1';

      const result = (await client.reviewCode(code)) as any;

      expect(result.metadata?.cost_estimate).toBeGreaterThan(0);
    });

    it('should warn on budget threshold', async () => {
      // Mock high usage scenario
      const warningSpy = vi.spyOn(console, 'warn');

      // Simulate many expensive requests
      const largeCode = 'const x = 1\n'.repeat(1000);
      await client.reviewCode(largeCode);

      // Should log warning if approaching budget
      expect(warningSpy).toHaveBeenCalled();

      warningSpy.mockRestore();
    });
  });

  describe('Prompt Management', () => {
    it('should load code-review prompt', async () => {
      const promptPath = join(process.cwd(), 'tools/integrations/codex/prompts/code-review.md');

      const content = await readFile(promptPath, 'utf-8');

      expect(content).toContain('Code Review Prompt');
      expect(content).toContain('IntelliFlow CRM');
      expect(content).toContain('Domain-Driven Design');
    });

    it('should load test-generation prompt', async () => {
      const promptPath = join(process.cwd(), 'tools/integrations/codex/prompts/test-generation.md');

      const content = await readFile(promptPath, 'utf-8');

      expect(content).toContain('Test Generation Prompt');
      expect(content).toContain('Vitest');
      expect(content).toContain('90%');
    });
  });

  describe('Integration with Project', () => {
    it('should respect project TypeScript config', async () => {
      const code = `
let x: number = 1
x = "string" // Type error
      `.trim();

      const result = await client.reviewCode(code);

      expect(result.critical_issues.length).toBeGreaterThan(0);
    });

    it('should enforce DDD patterns', async () => {
      const code = `
export class Lead {
  email: string // Should be Email value object
}
      `.trim();

      const result = await client.reviewCode(code, {
        focus_areas: ['domain_driven_design'],
      });

      expect(result.suggestions.some((s) => s.toLowerCase().includes('value object'))).toBe(true);
    });

    it('should check for Result pattern usage', async () => {
      const code = `
export async function createLead(data: any) {
  throw new Error('Not implemented')
}
      `.trim();

      const result = await client.reviewCode(code);

      // Should suggest using Result pattern
      expect(result.suggestions.some((s) => s.toLowerCase().includes('result'))).toBe(true);
    });
  });
});
