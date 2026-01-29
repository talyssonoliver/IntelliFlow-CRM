#!/usr/bin/env node
/**
 * Generate a pnpm audit JSON report without failing the calling script.
 *
 * Why: `pnpm audit ... || true` is not cross-platform, and shell redirection
 * differs between bash/cmd/powershell. This script writes a report and always
 * exits 0 (unless pnpm cannot be spawned).
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const outputPath = path.join(process.cwd(), 'artifacts', 'reports', 'audit-report.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const result = spawnSync('pnpm', ['audit', '--audit-level=moderate', '--json'], {
  encoding: 'utf8',
  shell: true,
});

if (result.error) {
  console.error('Failed to run pnpm audit');
  console.error(result.error instanceof Error ? result.error.message : String(result.error));
  process.exit(1);
}

const stdout = typeof result.stdout === 'string' ? result.stdout : '';
const stderr = typeof result.stderr === 'string' ? result.stderr : '';
const payload = stdout.trim() ? stdout : stderr.trim() ? stderr : '{}';

fs.writeFileSync(outputPath, payload, { encoding: 'utf8' });
console.log(`Wrote audit report: ${outputPath}`);

const code = typeof result.status === 'number' ? result.status : 0;
if (code !== 0) {
  console.warn(`[WARN] pnpm audit exited with code ${code} (report saved, exit ignored)`);
}

process.exit(0);

