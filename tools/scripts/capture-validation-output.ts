#!/usr/bin/env tsx
/**
 * Capture validation output in a human-readable format.
 *
 * Why: piping ANSI-colored/emoji output into a file on Windows (PowerShell)
 * often produces mojibake and control codes, making logs hard to read.
 *
 * This script runs the validation commands, strips ANSI escape sequences,
 * downlevels common unicode icons to ASCII tokens, and writes a UTF-8 log.
 *
 * Usage:
 *   pnpm run validate:sprint0:report
 *   pnpm tsx tools/scripts/capture-validation-output.ts --output artifacts/reports/validation-output.txt
 *   pnpm tsx tools/scripts/capture-validation-output.ts --sprint 1 --output artifacts/reports/validation/sprint-1.txt
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { EOL } from 'node:os';
import path from 'node:path';

type CommandSpec = {
  label: string;
  command: string;
  args: string[];
};

function getArgValue(names: string[]): string | undefined {
  const argv = process.argv.slice(2);
  let value: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current) continue;
    if (names.includes(current)) {
      value = argv[index + 1];
      continue;
    }

    for (const name of names) {
      if (current.startsWith(`${name}=`)) {
        value = current.slice(name.length + 1);
      }
    }
  }
  return value;
}

function hasFlag(names: string[]): boolean {
  const argv = process.argv.slice(2);
  return argv.some((arg) => names.includes(arg));
}

function resolveTargetSprint(): { sprint: string; error?: string } {
  const raw = getArgValue(['--sprint']);
  if (!raw) return { sprint: '0' };

  const trimmed = raw.trim();
  const withoutPrefix = trimmed.startsWith('sprint-') ? trimmed.slice('sprint-'.length) : trimmed;
  if (!/^\d+$/.test(withoutPrefix)) {
    return {
      sprint: '0',
      error: `Invalid --sprint "${raw}" (expected an integer like 0, 1, 2...)`,
    };
  }
  return { sprint: withoutPrefix };
}

function stripAnsi(input: string): string {
  return (
    input
      // CSI sequences
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
      // OSC sequences
      .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '')
  );
}

function downlevelUnicodeToAscii(input: string): string {
  let output = input;

  // Status icons
  output = output.replace(/✅/g, '[PASS]');
  output = output.replace(/❌/g, '[FAIL]');
  output = output.replace(/⚠️?/g, '[WARN]');
  output = output.replace(/🎉/g, '[OK]');

  // Section icons (remove)
  output = output.replace(/[📦⚙🧪📁📚📖🔧🌳🔷📊🔍📄🎯📋🔄⛔]/g, '');

  // Remove remaining non-ASCII characters (keep CR/LF/TAB)
  output = output.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');

  return output;
}

function normalizeEol(input: string): string {
  return input.replace(/\r\n/g, '\n').replace(/\n/g, EOL);
}

function runCommand(command: string, args: string[]): { code: number; output: string } {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      TERM: 'dumb',
    },
  });

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const status = result.status ?? 1;

  return { code: status, output: stdout + stderr };
}

function formatSection(label: string, code: number, output: string): string {
  const cleaned = downlevelUnicodeToAscii(stripAnsi(output)).trimEnd();
  return [`=== ${label} ===`, `Exit code: ${String(code)}`, '', cleaned, ''].join('\n');
}

function main() {
  const sprintArg = resolveTargetSprint();
  if (sprintArg.error) {
    // Keep output consistent with other validators
    console.error(`[FAIL] ${sprintArg.error}`);
    process.exit(1);
  }

  const strict = hasFlag(['--strict', '-s']);

  const defaultOutput =
    sprintArg.sprint === '0'
      ? 'artifacts/sprint0/codex-run/validation-output.txt'
      : `artifacts/reports/validation/sprint-${sprintArg.sprint}-validation-output.txt`;

  const outputPath = getArgValue(['--output', '--out']) ?? defaultOutput;

  mkdirSync(path.dirname(outputPath), { recursive: true });

  const forwardArgs = ['--', '--sprint', sprintArg.sprint, ...(strict ? ['--strict'] : [])];

  const commands: CommandSpec[] = [
    {
      label: `pnpm run validate:sprint (sprint-${sprintArg.sprint}${strict ? ', strict' : ''})`,
      command: 'pnpm',
      args: ['run', 'validate:sprint', ...forwardArgs],
    },
    {
      label: `pnpm run validate:sprint-data (sprint-${sprintArg.sprint}${strict ? ', strict' : ''})`,
      command: 'pnpm',
      args: ['run', 'validate:sprint-data', ...forwardArgs],
    },
  ];

  const startedAt = new Date().toISOString();
  const sections: string[] = [
    'IntelliFlow CRM - Validation Output (sanitized)',
    `Generated: ${startedAt}`,
    `Repo: ${process.cwd()}`,
    '',
  ];

  let allPassed = true;
  for (const spec of commands) {
    const result = runCommand(spec.command, spec.args);
    if (result.code !== 0) allPassed = false;
    sections.push(formatSection(spec.label, result.code, result.output));
  }

  const normalized = normalizeEol(sections.join('\n'));
  const withTrailingNewline = normalized.endsWith(EOL) ? normalized : normalized + EOL;
  writeFileSync(outputPath, withTrailingNewline, { encoding: 'utf8' });
  process.exit(allPassed ? 0 : 1);
}

main();
