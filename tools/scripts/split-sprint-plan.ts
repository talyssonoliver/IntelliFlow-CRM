/**
 * Split Sprint_plan.csv into Claude Code-readable parts
 *
 * Source of Truth: Sprint_plan.csv (NEVER edit the split files directly)
 * Generated Files: Sprint_plan_A.csv, Sprint_plan_B.csv, Sprint_plan_C.csv, Sprint_plan_D.csv
 *
 * This script is called automatically by data-sync when the source CSV changes.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve METRICS_DIR robustly - handles both direct execution and bundled imports
function resolveMetricsDir(): string {
  // Try direct path from tools/scripts/
  const fromTools = join(__dirname, '../../apps/project-tracker/docs/metrics/_global');
  if (existsSync(join(fromTools, 'Sprint_plan.csv'))) {
    return fromTools;
  }

  // Try from apps/project-tracker/lib/ (when imported by data-sync.ts)
  const fromLib = join(__dirname, '../docs/metrics/_global');
  if (existsSync(join(fromLib, 'Sprint_plan.csv'))) {
    return fromLib;
  }

  // Try from apps/project-tracker/ (when running in that context)
  const fromProjectTracker = join(process.cwd(), 'docs/metrics/_global');
  if (existsSync(join(fromProjectTracker, 'Sprint_plan.csv'))) {
    return fromProjectTracker;
  }

  // Try from monorepo root
  const fromRoot = join(process.cwd(), 'apps/project-tracker/docs/metrics/_global');
  if (existsSync(join(fromRoot, 'Sprint_plan.csv'))) {
    return fromRoot;
  }

  // Fallback to original path (will fail if none work)
  return fromTools;
}

const METRICS_DIR = resolveMetricsDir();
const SOURCE_CSV = join(METRICS_DIR, 'Sprint_plan.csv');

// Target: <25000 tokens per file
// ~267 tokens per row average, so max ~90 rows per file
const ROWS_PER_FILE = 90;

const PART_NAMES = ['A', 'B', 'C', 'D', 'E', 'F']; // Support up to 6 parts if needed

interface PartInfo {
  name: string;
  path: string;
  rows: number;
  startRow: number;
  endRow: number;
}

interface SplitResult {
  success: boolean;
  sourceRows: number;
  parts: PartInfo[];
  error?: string;
}

export function splitSprintPlan(): SplitResult {
  try {
    const content = readFileSync(SOURCE_CSV, 'utf-8');
    const lines = content.split('\n');

    const header = lines[0];
    const dataLines = lines.slice(1).filter((line) => line.trim().length > 0);

    // Calculate number of parts needed
    const numParts = Math.ceil(dataLines.length / ROWS_PER_FILE);

    if (numParts > PART_NAMES.length) {
      throw new Error(
        `File too large: needs ${numParts} parts but only ${PART_NAMES.length} supported`
      );
    }

    const parts: PartInfo[] = [];

    // Generate each part
    for (let i = 0; i < numParts; i++) {
      const partName = PART_NAMES[i];
      const partPath = join(METRICS_DIR, `Sprint_plan_${partName}.csv`);

      const startIdx = i * ROWS_PER_FILE;
      const endIdx = Math.min((i + 1) * ROWS_PER_FILE, dataLines.length);
      const partData = dataLines.slice(startIdx, endIdx);

      // Write part file
      const partContent = header + '\n' + partData.join('\n');
      writeFileSync(partPath, partContent, 'utf-8');

      parts.push({
        name: partName,
        path: partPath,
        rows: partData.length,
        startRow: startIdx + 1, // 1-indexed for human readability
        endRow: endIdx,
      });
    }

    // Clean up unused part files (if file got smaller)
    for (let i = numParts; i < PART_NAMES.length; i++) {
      const unusedPath = join(METRICS_DIR, `Sprint_plan_${PART_NAMES[i]}.csv`);
      if (existsSync(unusedPath)) {
        unlinkSync(unusedPath);
      }
    }

    // Print summary
    console.log('='.repeat(70));
    console.log('SPRINT PLAN SPLIT COMPLETE');
    console.log('='.repeat(70));
    console.log(`Source: Sprint_plan.csv (${dataLines.length} rows)`);
    console.log('');
    console.log('Generated Parts:');
    for (const part of parts) {
      console.log(
        `  Sprint_plan_${part.name}.csv: rows ${part.startRow}-${part.endRow} (${part.rows} rows)`
      );
    }
    console.log('');
    console.log('IMPORTANT: Sprint_plan.csv is the source of truth.');
    console.log('           Edit ONLY Sprint_plan.csv, then run this script to regenerate parts.');
    console.log('='.repeat(70));

    return {
      success: true,
      sourceRows: dataLines.length,
      parts,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`Failed to split Sprint_plan.csv: ${error}`);
    return {
      success: false,
      sourceRows: 0,
      parts: [],
      error,
    };
  }
}

// Run if called directly
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('split-sprint-plan.ts')
) {
  splitSprintPlan();
}
