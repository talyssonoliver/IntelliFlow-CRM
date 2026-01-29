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

// Token-based splitting configuration
// Target: <20000 tokens per file (leaves headroom below 25000 limit)
// Estimate: ~4 characters per token (conservative for CSV data with special chars)
const CHARS_PER_TOKEN = 4;
const MAX_TOKENS_PER_FILE = 18000; // Conservative limit to stay well under 25000
const MAX_CHARS_PER_FILE = MAX_TOKENS_PER_FILE * CHARS_PER_TOKEN; // ~72000 chars

const PART_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']; // Support up to 8 parts if needed

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

/**
 * Estimate token count for a string.
 * Uses conservative estimate of ~4 chars per token for CSV data.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function splitSprintPlan(): SplitResult {
  try {
    const content = readFileSync(SOURCE_CSV, 'utf-8');
    const lines = content.split('\n');

    const header = lines[0];
    const headerChars = header.length + 1; // +1 for newline
    const dataLines = lines.slice(1).filter((line) => line.trim().length > 0);

    // Token-based splitting: accumulate rows until we approach the limit
    const parts: PartInfo[] = [];
    let currentPartLines: string[] = [];
    let currentPartChars = headerChars; // Start with header size
    let currentStartRow = 1;
    let partIndex = 0;

    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      const lineChars = line.length + 1; // +1 for newline

      // Check if adding this line would exceed the limit
      // (but always add at least one line per part)
      if (currentPartLines.length > 0 && currentPartChars + lineChars > MAX_CHARS_PER_FILE) {
        // Save current part
        if (partIndex >= PART_NAMES.length) {
          throw new Error(
            `File too large: needs more than ${PART_NAMES.length} parts. ` +
              `Consider increasing MAX_TOKENS_PER_FILE or adding more PART_NAMES.`
          );
        }

        const partName = PART_NAMES[partIndex];
        const partPath = join(METRICS_DIR, `Sprint_plan_${partName}.csv`);
        const partContent = header + '\n' + currentPartLines.join('\n');
        writeFileSync(partPath, partContent, 'utf-8');

        parts.push({
          name: partName,
          path: partPath,
          rows: currentPartLines.length,
          startRow: currentStartRow,
          endRow: currentStartRow + currentPartLines.length - 1,
        });

        // Start new part
        partIndex++;
        currentStartRow = i + 1; // 1-indexed
        currentPartLines = [];
        currentPartChars = headerChars;
      }

      // Add line to current part
      currentPartLines.push(line);
      currentPartChars += lineChars;
    }

    // Save final part if there are remaining lines
    if (currentPartLines.length > 0) {
      if (partIndex >= PART_NAMES.length) {
        throw new Error(
          `File too large: needs more than ${PART_NAMES.length} parts. ` +
            `Consider increasing MAX_TOKENS_PER_FILE or adding more PART_NAMES.`
        );
      }

      const partName = PART_NAMES[partIndex];
      const partPath = join(METRICS_DIR, `Sprint_plan_${partName}.csv`);
      const partContent = header + '\n' + currentPartLines.join('\n');
      writeFileSync(partPath, partContent, 'utf-8');

      parts.push({
        name: partName,
        path: partPath,
        rows: currentPartLines.length,
        startRow: currentStartRow,
        endRow: currentStartRow + currentPartLines.length - 1,
      });

      partIndex++;
    }

    // Clean up unused part files (if file got smaller or split changed)
    for (let i = partIndex; i < PART_NAMES.length; i++) {
      const unusedPath = join(METRICS_DIR, `Sprint_plan_${PART_NAMES[i]}.csv`);
      if (existsSync(unusedPath)) {
        unlinkSync(unusedPath);
      }
    }

    // Print summary with token estimates
    console.log('='.repeat(70));
    console.log('SPRINT PLAN SPLIT COMPLETE (Token-Based)');
    console.log('='.repeat(70));
    console.log(`Source: Sprint_plan.csv (${dataLines.length} rows)`);
    console.log(`Token limit per file: ~${MAX_TOKENS_PER_FILE} tokens (~${MAX_CHARS_PER_FILE} chars)`);
    console.log('');
    console.log('Generated Parts:');
    for (const part of parts) {
      const partContent = readFileSync(part.path, 'utf-8');
      const estTokens = estimateTokens(partContent);
      console.log(
        `  Sprint_plan_${part.name}.csv: rows ${part.startRow}-${part.endRow} ` +
          `(${part.rows} rows, ~${estTokens} tokens, ${partContent.length} chars)`
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
