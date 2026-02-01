/**
 * Gate 2 Validation Script: TypeScript Compilation
 *
 * Purpose: Validates that typecheck passes across all packages.
 * This is a T2 condition for Gate 2 investment release.
 *
 * Expected behavior:
 * - EXIT 0: Typecheck passes (T2 condition met)
 * - EXIT 1: Typecheck fails (T2 condition not met)
 *
 * Usage: npx tsx tools/scripts/gate-2/validate-typecheck.ts
 *
 * @see .specify/sprints/sprint-15/specifications/IFC-027-spec.md AC-002
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

interface ValidationResult {
  gate: 'typecheck';
  passed: boolean;
  exitCode: number;
  timestamp: string;
  details: {
    command: string;
    errorOutput?: string;
    duration_ms: number;
  };
}

function validateTypecheck(): ValidationResult {
  const startTime = Date.now();
  const command = 'pnpm run typecheck';

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Gate 2 Validation: TypeScript Compilation                   ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Command: ${command.padEnd(50)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    execSync(command, {
      stdio: 'pipe',
      encoding: 'utf-8',
      cwd: process.cwd(),
    });

    const duration = Date.now() - startTime;

    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  ✓ PASS: TypeScript compilation successful                  │');
    console.log(`│  Duration: ${(duration / 1000).toFixed(2)}s`.padEnd(62) + '│');
    console.log('│  T2 Condition: MET                                          │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    return {
      gate: 'typecheck',
      passed: true,
      exitCode: 0,
      timestamp: new Date().toISOString(),
      details: {
        command,
        duration_ms: duration,
      },
    };
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const execError = error as { stderr?: Buffer | string; message?: string };
    const errorOutput = execError.stderr?.toString() || execError.message || String(error);

    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  ✗ FAIL: TypeScript compilation failed                      │');
    console.log(`│  Duration: ${(duration / 1000).toFixed(2)}s`.padEnd(62) + '│');
    console.log('│  T2 Condition: NOT MET                                      │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log('');
    console.log('Error details (first 500 chars):');
    console.log(errorOutput.substring(0, 500));

    return {
      gate: 'typecheck',
      passed: false,
      exitCode: 1,
      timestamp: new Date().toISOString(),
      details: {
        command,
        errorOutput: errorOutput.substring(0, 2000),
        duration_ms: duration,
      },
    };
  }
}

// Main execution
const result = validateTypecheck();

// Save result to artifacts
const artifactsDir = join(process.cwd(), 'artifacts', 'gate-2');
if (!existsSync(artifactsDir)) {
  mkdirSync(artifactsDir, { recursive: true });
}

writeFileSync(join(artifactsDir, 'typecheck-validation.json'), JSON.stringify(result, null, 2));

console.log('');
console.log(`Result saved to: artifacts/gate-2/typecheck-validation.json`);

process.exit(result.passed ? 0 : 1);
