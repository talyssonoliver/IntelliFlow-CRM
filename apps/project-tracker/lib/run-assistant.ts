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

/**
 * Parses user input into a structured RunRequest
 * @throws Error if input is invalid, unsafe, or too long
 */
export function parseRunInput(input: string): RunRequest {
  // Validate input
  if (!input || input.trim() === '') {
    throw new Error('Please specify what you want to run');
  }

  if (input.length > MAX_INPUT_LENGTH) {
    throw new Error(`Input too long (max ${MAX_INPUT_LENGTH} characters)`);
  }

  const trimmed = input.trim();

  // Check for unsafe patterns
  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new Error('Unsafe command detected: command chaining or injection not allowed');
    }
  }

  // Parse different request types
  const lowerInput = trimmed.toLowerCase();

  // Build process
  if (lowerInput.includes('build process') || lowerInput === 'build') {
    return {
      kind: 'build',
      command: 'pnpm run build',
      description: 'Build all packages',
    };
  }

  // Tests for a package
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

  // Database migrations
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

  // Development server
  if (lowerInput.includes('development server') || lowerInput.includes('dev server')) {
    return {
      kind: 'dev',
      command: 'pnpm run dev',
      description: 'Start development server',
    };
  }

  // Custom/something else
  if (lowerInput.startsWith('something else:')) {
    const customCmd = trimmed.slice('something else:'.length).trim();
    // Re-validate the custom command
    for (const pattern of UNSAFE_PATTERNS) {
      if (pattern.test(customCmd)) {
        throw new Error('Unsafe command detected in custom request');
      }
    }
    return {
      kind: 'custom',
      command: customCmd,
      description: 'Custom command',
    };
  }

  // Default: treat as specific command
  return {
    kind: 'command',
    command: trimmed,
    description: 'Execute specific command',
  };
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
