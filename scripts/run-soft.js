#!/usr/bin/env node
/**
 * Run a command and always exit 0 (unless the command cannot be spawned).
 *
 * Why: package.json scripts like `cmd || true` are not cross-platform (cmd.exe).
 *
 * Usage:
 *   node scripts/run-soft.js <command> [...args]
 *
 * Example:
 *   node scripts/run-soft.js depcheck --ignores="@types/*,eslint-*,prettier"
 */

const { spawnSync } = require('node:child_process');

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error('Usage: node scripts/run-soft.js <command> [...args]');
  process.exit(1);
}

const [command, ...args] = argv;
const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: true,
});

if (result.error) {
  console.error(`Failed to run command: ${command}`);
  console.error(result.error instanceof Error ? result.error.message : String(result.error));
  process.exit(1);
}

const code = typeof result.status === 'number' ? result.status : 0;
if (code !== 0) {
  console.warn(`[WARN] Ignoring non-zero exit code (${code}) from: ${command} ${args.join(' ')}`.trim());
}

process.exit(0);

