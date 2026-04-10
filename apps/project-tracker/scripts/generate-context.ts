#!/usr/bin/env ts-node

/**
 * Session Context Snapshot CLI
 *
 * Writes `docs/SESSION_CONTEXT.md` from the current state of the metrics tree.
 * Mirrors `scripts/sync-metrics.ts` ergonomics: resolves paths relative to this
 * script's location so invocation from any cwd works.
 *
 * Usage:
 *   npx tsx apps/project-tracker/scripts/generate-context.ts
 *   (or)  cd apps/project-tracker && npx tsx scripts/generate-context.ts
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateContextSnapshot } from '../lib/context-snapshot';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectTrackerRoot = join(__dirname, '..');
const monorepoRoot = join(projectTrackerRoot, '..', '..');

const metricsDir = join(projectTrackerRoot, 'docs', 'metrics');
const outputPath = join(monorepoRoot, 'docs', 'SESSION_CONTEXT.md');

if (!existsSync(metricsDir)) {
  console.error(`❌ Metrics directory not found: ${metricsDir}`);
  process.exit(1);
}

const outputDir = dirname(outputPath);
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

const result = generateContextSnapshot(metricsDir, monorepoRoot);
writeFileSync(outputPath, result.markdown, 'utf-8');

console.log(`✓ Wrote ${outputPath} (${result.markdown.length} bytes)`);
console.log(`  Sources: ${result.sourceFiles.length} files`);
process.exit(0);
