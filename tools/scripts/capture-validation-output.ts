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
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type CommandSpec = {
  label: string;
  command: string;
  args: string[];
};

function getArgValue(names: string[]): string | undefined {
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current && names.includes(current)) {
      return argv[index + 1];
    }
  }
  return undefined;
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
  const outputPath =
    getArgValue(['--output', '--out']) ?? 'artifacts/sprint0/codex-run/validation-output.txt';

  mkdirSync(path.dirname(outputPath), { recursive: true });

  const commands: CommandSpec[] = [
    { label: 'pnpm run validate:sprint0', command: 'pnpm', args: ['run', 'validate:sprint0'] },
    {
      label: 'pnpm run validate:sprint-data',
      command: 'pnpm',
      args: ['run', 'validate:sprint-data'],
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

  writeFileSync(outputPath, sections.join('\n'), { encoding: 'utf8' });
  process.exit(allPassed ? 0 : 1);
}

main();

