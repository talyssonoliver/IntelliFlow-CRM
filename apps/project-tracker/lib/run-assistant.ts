/**
 * Run Assistant Module
 * Provides helpers for parsing and executing run commands safely
 *
 * @module run-assistant
 */

export type RunRequestKind = 'command' | 'build' | 'test' | 'migrate' | 'dev' | 'custom';

export interface RunRequest {
  kind: RunRequestKind;
  command: string;
  description: string;
  package?: string;
}

export interface ExecutionResult {
  success: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

export interface ExecuteOptions {
  runner?: (cmd: string) => Promise<{ code: number; stdout: string; stderr: string }>;
  timeoutMs?: number;
}

// Unsafe patterns that should be rejected
const UNSAFE_PATTERNS = [
  /rm\s+(-rf?|--recursive)/i,
  /&&/,
  /\|\|/,
  /;/,
  /\|/,
  /`/,
  /\$\(/,
  />\s*\//,
  /\/etc\//,
  /\/root/,
  /sudo/i,
  /chmod\s+777/,
  /mkfs/i,
  /dd\s+if=/i,
];

const MAX_INPUT_LENGTH = 1000;

/**
 * Returns the run assistant prompt with available options
 */
export function getRunPrompt(): string {
  return `I'll help you run something, but I need to know what you'd like me to run.

Could you please specify what you want to execute?

- A specific command (e.g., \`pnpm run dev\`, \`pnpm run test\`)
- A build process
- Tests for a particular package
- Database migrations
- The development server
- Something else?

Please let me know what you'd like to run, and I'll execute it for you!`;
}

function validateInput(input: string): void {
  if (!input || input.trim() === '') {
    throw new Error('Please specify what you want to run');
  }
  if (input.length > MAX_INPUT_LENGTH) {
    throw new Error(`Input too long (max ${MAX_INPUT_LENGTH} characters)`);
  }
}

function assertSafeCommand(cmd: string, errorMsg: string): void {
  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(cmd)) {
      throw new Error(errorMsg);
    }
  }
}

function matchBuildRequest(lowerInput: string): RunRequest | null {
  if (lowerInput.includes('build process') || lowerInput === 'build') {
    return { kind: 'build', command: 'pnpm run build', description: 'Build all packages' };
  }
  return null;
}

function matchTestRequest(lowerInput: string): RunRequest | null {
  const testMatch = lowerInput.match(
    /tests?\s+(?:for\s+)?(?:a\s+)?(?:particular\s+)?(?:package\s+)?(\w+)/i
  );
  if (testMatch || lowerInput.includes('test')) {
    const pkg = testMatch?.[1];
    return {
      kind: 'test',
      command: pkg ? `pnpm --filter ${pkg} run test` : 'pnpm run test',
      description: pkg ? `Run tests for ${pkg}` : 'Run all tests',
      package: pkg,
    };
  }
  return null;
}

function matchMigrateRequest(lowerInput: string): RunRequest | null {
  if (
    lowerInput.includes('database') ||
    lowerInput.includes('migration') ||
    lowerInput.includes('migrate')
  ) {
    return {
      kind: 'migrate',
      command: 'pnpm run db:migrate',
      description: 'Run database migrations',
    };
  }
  return null;
}

function matchDevRequest(lowerInput: string): RunRequest | null {
  if (lowerInput.includes('development server') || lowerInput.includes('dev server')) {
    return { kind: 'dev', command: 'pnpm run dev', description: 'Start development server' };
  }
  return null;
}

function matchCustomRequest(trimmed: string, lowerInput: string): RunRequest | null {
  if (!lowerInput.startsWith('something else:')) return null;
  const customCmd = trimmed.slice('something else:'.length).trim();
  assertSafeCommand(customCmd, 'Unsafe command detected in custom request');
  return { kind: 'custom', command: customCmd, description: 'Custom command' };
}

/**
 * Parses user input into a structured RunRequest
 * @throws Error if input is invalid, unsafe, or too long
 */
export function parseRunInput(input: string): RunRequest {
  validateInput(input);
  const trimmed = input.trim();
  assertSafeCommand(trimmed, 'Unsafe command detected: command chaining or injection not allowed');

  const lowerInput = trimmed.toLowerCase();

  return (
    matchBuildRequest(lowerInput) ??
    matchTestRequest(lowerInput) ??
    matchMigrateRequest(lowerInput) ??
    matchDevRequest(lowerInput) ??
    matchCustomRequest(trimmed, lowerInput) ?? {
      kind: 'command',
      command: trimmed,
      description: 'Execute specific command',
    }
  );
}

/**
 * Executes a RunRequest with optional runner and timeout
 * @throws Error if command is unsafe or times out
 */
export async function executeRunRequest(
  req: RunRequest,
  opts?: ExecuteOptions
): Promise<ExecutionResult> {
  // Re-validate command safety before execution
  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(req.command)) {
      throw new Error('Unsafe or dangerous command cannot be executed');
    }
  }

  const runner = opts?.runner ?? defaultRunner;
  const timeoutMs = opts?.timeoutMs;

  if (timeoutMs) {
    // Execute with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Command timed out')), timeoutMs);
    });

    const result = await Promise.race([runner(req.command), timeoutPromise]);

    return {
      success: result.code === 0,
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  // Execute without timeout
  const result = await runner(req.command);
  return {
    success: result.code === 0,
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/**
 * Default runner using child_process (placeholder for actual implementation)
 */
async function defaultRunner(
  cmd: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  // In production, this would use child_process.exec or similar
  // For now, return a placeholder response
  console.log(`[run-assistant] Would execute: ${cmd}`);
  return {
    code: 0,
    stdout: `Executed: ${cmd}`,
    stderr: '',
  };
}
