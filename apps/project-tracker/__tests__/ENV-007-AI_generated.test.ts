// ENV-007: AI-generated unit tests for run assistant prompt/execute behavior
// Runner contract tests using Vitest and strict TypeScript expectations

import { describe, it, expect, vi, beforeEach, expectTypeOf } from 'vitest';

// System under test (to be implemented to satisfy these tests)
// The relative path assumes a module at project-tracker/lib/run-assistant.ts
// providing prompt, parsing, and execution helpers.
import type { RunRequest, ExecutionResult } from '../lib/run-assistant';
import { getRunPrompt, parseRunInput, executeRunRequest } from '../lib/run-assistant';

// Utilities for mocking external execution
type MockExec = (cmd: string) => Promise<{ code: number; stdout: string; stderr: string }>;

describe('ENV-007: Run Assistant Prompt & Execution', () => {
  describe('Prompt content', () => {
    it('returns the exact prompt with options and examples', () => {
      const prompt = getRunPrompt();

      expect(typeof prompt).toBe('string');
      expect(prompt).toContain(
        "I'll help you run something, but I need to know what you'd like me to run."
      );
      expect(prompt).toContain('Could you please specify what you want to execute?');
      // Ensure examples are present
      expect(prompt).toContain('- A specific command (e.g., `pnpm run dev`, `pnpm run test`)');
      expect(prompt).toContain('- A build process');
      expect(prompt).toContain('- Tests for a particular package');
      expect(prompt).toContain('- Database migrations');
      expect(prompt).toContain('- The development server');
      expect(prompt).toContain('- Something else?');
      expect(prompt).toContain(
        "Please let me know what you'd like to run, and I'll execute it for you!"
      );
    });
  });

  describe('Parsing inputs', () => {
    it('parses a specific command verbatim', () => {
      const input = 'pnpm run dev';
      const req = parseRunInput(input);

      expect(req.kind).toBe('command');
      expect(req.command).toBe('pnpm run dev');
      expect(req.description).toMatch(/specific command/i);

      // Type-safety: ensure the shape matches the contract
      expectTypeOf(req).toMatchTypeOf<RunRequest>();
    });

    it('parses a build process request', () => {
      const req = parseRunInput('build process');
      expect(req.kind).toBe('build');
      // Default mapping may be pnpm run build
      expect(req.command).toMatch(/build/);
    });

    it('parses tests for a particular package', () => {
      const req = parseRunInput('tests for a particular package web');
      expect(req.kind).toBe('test');
      expect(req.package).toBe('web');
      // Common mapping for pnpm filter
      expect(req.command).toMatch(/pnpm\s+.*(test|run\s+test)/);
      expect(req.command).toMatch(/--filter\s+web/);
    });

    it('parses database migrations', () => {
      const req = parseRunInput('database migrations');
      expect(req.kind).toBe('migrate');
      expect(req.command).toMatch(/migrate|prisma/);
    });

    it('parses development server request', () => {
      const req = parseRunInput('the development server');
      expect(req.kind).toBe('dev');
      expect(req.command).toMatch(/dev/);
    });

    it('parses custom free-form requests', () => {
      const req = parseRunInput('something else: echo "hello"');
      expect(req.kind).toBe('custom');
      expect(req.command).toBe('echo "hello"');
    });

    it('rejects empty or whitespace-only input', () => {
      expect(() => parseRunInput('')).toThrow(/specify.*run/i);
      expect(() => parseRunInput('   ')).toThrow(/specify.*run/i);
    });

    it('rejects unsafe or destructive commands', () => {
      expect(() => parseRunInput('rm -rf /')).toThrow(/unsafe|disallowed|danger/i);
      expect(() => parseRunInput('pnpm run dev && echo HACKED')).toThrow(
        /unsafe|injection|chaining/i
      );
      expect(() => parseRunInput('echo ok; cat /etc/shadow')).toThrow(/unsafe|injection|chaining/i);
    });

    it('rejects excessively long inputs', () => {
      const long = 'x'.repeat(2000);
      expect(() => parseRunInput(long)).toThrow(/too long|length/i);
    });
  });

  describe('Execution behavior', () => {
    let calls: string[];
    let mockRunner: MockExec;

    beforeEach(() => {
      calls = [];
      mockRunner = vi.fn(async (cmd: string) => {
        calls.push(cmd);
        if (/fail/.test(cmd)) {
          return { code: 1, stdout: '', stderr: 'simulated failure' };
        }
        return { code: 0, stdout: 'simulated ok', stderr: '' };
      });
    });

    it('executes parsed request with injected runner (happy path)', async () => {
      const req = parseRunInput('pnpm run dev');
      const result = await executeRunRequest(req, { runner: mockRunner });

      expect(calls.length).toBe(1);
      expect(calls[0]).toBe(req.command);

      expect(result.success).toBe(true);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('simulated ok');

      // Type-safety: result shape
      expectTypeOf(result).toMatchTypeOf<ExecutionResult>();
    });

    it('propagates non-zero exit codes as failures', async () => {
      const failingReq: RunRequest = {
        kind: 'command',
        command: 'pnpm run fail',
        description: 'simulate failure',
      };

      const result = await executeRunRequest(failingReq, { runner: mockRunner });
      expect(result.success).toBe(false);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('simulated failure');
    });

    it('times out long-running commands when a timeout is provided', async () => {
      const hangingRunner = vi.fn(
        () =>
          new Promise(() => {
            /* never resolve */
          })
      ) as unknown as MockExec;

      const req: RunRequest = {
        kind: 'command',
        command: 'pnpm run long-task',
        description: 'simulate hang',
      };

      await expect(
        executeRunRequest(req, { runner: hangingRunner, timeoutMs: 50 })
      ).rejects.toThrow(/timeout|timed out/i);
    });

    it('refuses to execute unsafe commands even if runner is provided', async () => {
      const bad = () => parseRunInput('rm -rf /');
      expect(bad).toThrow();
      // If an unsafe request somehow reaches execute, it should also reject
      const unsafeReq: RunRequest = { kind: 'command', command: 'rm -rf /', description: 'unsafe' };
      await expect(executeRunRequest(unsafeReq, { runner: mockRunner })).rejects.toThrow(
        /unsafe|danger/i
      );
    });
  });
});
