#!/usr/bin/env node
/**
 * test-quality-report (#1216 item 5)
 *
 * Counts the test-quality warnings across every test file, per rule and per file, so the
 * warn phase is measured before any rule becomes an error. Runs on demand:
 *
 *   pnpm run test-quality:report            # writes artifacts/reports/test-quality.json
 *   pnpm run test-quality:report -- --top 30
 *
 * The JSON is local output (gitignored), never committed: it changes with every test edit.
 * Only the test-quality rules run, with the TypeScript parser, so the numbers don't depend on
 * the rest of the lint configuration.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import testQuality, { testQualityRules } from '../../eslint-rules/test-quality.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'artifacts/reports/test-quality.json');
const PATTERNS = [
  'apps/*/src/**/*.{test,spec}.{ts,tsx}',
  'packages/*/src/**/*.{test,spec}.{ts,tsx}',
  'tests/**/*.test.ts',
  'tools/**/*.test.ts',
  'scripts/**/*.test.ts',
];

/** Totals per rule and the files with the most warnings, from ESLint results. */
export function summarise(results, top = 20) {
  const perRule = Object.fromEntries(Object.keys(testQualityRules).map((r) => [r, 0]));
  const perFile = [];
  for (const result of results) {
    let count = 0;
    for (const message of result.messages) {
      const rule = message.ruleId?.replace(/^test-quality\//, '');
      if (rule && rule in perRule) {
        perRule[rule]++;
        count++;
      }
    }
    if (count > 0)
      perFile.push({
        file: path.relative(ROOT, result.filePath).replaceAll('\\', '/'),
        warnings: count,
      });
  }
  perFile.sort((a, b) => b.warnings - a.warnings || a.file.localeCompare(b.file));
  return {
    filesChecked: results.length,
    filesWithWarnings: perFile.length,
    warnings: Object.values(perRule).reduce((a, b) => a + b, 0),
    perRule,
    topFiles: perFile.slice(0, top),
  };
}

/** The number after `--top`, 20 when it is missing or not a positive whole number. */
export function topFrom(argv) {
  const at = argv.indexOf('--top');
  const n = at === -1 ? Number.NaN : Number(argv[at + 1]);
  return Number.isInteger(n) && n > 0 ? n : 20;
}

/** ESLint with only the test-quality rules, as warnings, parsing TypeScript and TSX. */
export function createLinter(cwd = ROOT) {
  return new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
          parser: tsParser,
          parserOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            ecmaFeatures: { jsx: true },
          },
        },
        plugins: { 'test-quality': testQuality },
        rules: Object.fromEntries(
          Object.keys(testQualityRules).map((r) => [`test-quality/${r}`, 'warn'])
        ),
      },
      { ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**'] },
    ],
  });
}

/** Writes the summary JSON to `out`; returns the lines to print. */
export function writeReport(results, { out = OUT, top = 20, now = new Date() } = {}) {
  const summary = { generatedAt: now.toISOString(), ...summarise(results, top) };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(summary, null, 2) + '\n');
  const rules = Object.entries(summary.perRule)
    .map(([r, n]) => `${r} ${n}`)
    .join(', ');
  return [
    `test-quality: ${summary.warnings} warnings in ${summary.filesWithWarnings}/${summary.filesChecked} test files (${rules})`,
    `  details: ${path.relative(ROOT, out).replaceAll('\\', '/')}`,
  ];
}

async function main() {
  const results = await createLinter().lintFiles(PATTERNS);
  for (const line of writeReport(results, { top: topFrom(process.argv) })) console.log(line);
}

// CLI entry point guard: importing this module from a test must not run main().
if (process.argv[1]?.replaceAll('\\', '/').endsWith('tools/scripts/test-quality-report.mjs')) {
  main().catch((err) => {
    console.error('test-quality: FAILED', err);
    process.exitCode = 1;
  });
}
