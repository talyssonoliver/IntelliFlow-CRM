/**
 * CLI wrapper for buildContextPack()
 *
 * Usage: npx tsx tools/scripts/build-context-pack-cli.ts <taskId> [runId]
 *
 * Generates context_pack.md and context_pack.manifest.json for a task
 * by reading its FILE: prerequisites from Sprint_plan.csv.
 *
 * If runId is not provided, one is auto-generated.
 */
import { buildContextPack, generateRunId } from './lib/context-pack-builder.js';

const taskId = process.argv[2];
const runId = process.argv[3] || generateRunId(taskId || 'UNKNOWN');

if (!taskId) {
  console.error('Usage: npx tsx tools/scripts/build-context-pack-cli.ts <taskId> [runId]');
  process.exit(1);
}

console.log(`Building context pack for ${taskId} (run: ${runId})...`);

const result = buildContextPack(taskId, runId);

if (result.success) {
  console.log(`  context_pack.md    → ${result.packPath}`);
  console.log(`  manifest.json      → ${result.manifestPath}`);
  console.log(
    `  Files included: ${result.manifest.files.filter((f) => f.included).length}/${result.manifest.files.length}`
  );
  if (result.warnings.length > 0) {
    console.log(`  Warnings: ${result.warnings.join(', ')}`);
  }
} else {
  console.error(`  FAILED: ${result.errors.join(', ')}`);
  process.exit(1);
}
