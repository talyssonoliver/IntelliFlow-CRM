/**
 * Context Pack Builder for IntelliFlow CRM
 *
 * Generates context packs from task FILE: prerequisites.
 * Embeds bounded excerpts into artifacts/attestations/<task_id>/context_pack.md
 * Creates manifest with SHA256 hashes: context_pack.manifest.json
 *
 * Bounded size rules (hardcoded):
 * - Excerpt limit: 120 lines per file maximum
 * - If file exceeds 120 lines: first 60 + last 60 with marker
 * - Total context pack size: 50KB max (warn if exceeded)
 *
 * @module tools/scripts/lib/context-pack-builder
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { parseTaskContract, getFilePrerequisites, getDirPrerequisites } from './contract-parser.js';
import {
  findRepoRoot,
  resolveSprintPlanPath,
  parseSprintCsv,
  type SprintTask,
} from './validation-utils.js';

// ============================================================================
// Constants
// ============================================================================

const EXCERPT_LINE_LIMIT = 120;
const HALF_EXCERPT_LIMIT = 60;
const MAX_PACK_SIZE_BYTES = 50 * 1024; // 50KB

// ============================================================================
// Types
// ============================================================================

export interface FileExcerpt {
  path: string;
  relativePath: string;
  sha256: string;
  totalLines: number;
  excerptLines: number;
  truncated: boolean;
  content: string;
  error?: string;
}

export interface ContextPackManifest {
  taskId: string;
  runId: string;
  createdAt: string;
  repoRoot: string;
  files: FileManifestEntry[];
  totalSizeBytes: number;
  truncatedDueToSize: boolean;
}

export interface FileManifestEntry {
  path: string;
  sha256: string;
  totalLines: number;
  excerptLines: number;
  truncated: boolean;
  included: boolean;
  excludeReason?: string;
}

export interface ContextPackResult {
  success: boolean;
  packPath: string;
  manifestPath: string;
  manifest: ContextPackManifest;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// SHA256 Hashing
// ============================================================================

/**
 * Compute SHA256 hash of content.
 */
export function computeSha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Compute SHA256 hash of a file.
 */
export function computeFileSha256(filePath: string): string | null {
  try {
    const content = readFileSync(filePath);
    return computeSha256(content);
  } catch {
    return null;
  }
}

// ============================================================================
// File Excerpt Generation
// ============================================================================

/**
 * Generate a bounded excerpt from a file.
 * If file exceeds EXCERPT_LINE_LIMIT lines, includes first 60 + last 60 with marker.
 */
export function generateFileExcerpt(absolutePath: string, repoRoot: string): FileExcerpt {
  const relativePath = relative(repoRoot, absolutePath).replace(/\\/g, '/');

  if (!existsSync(absolutePath)) {
    return {
      path: absolutePath,
      relativePath,
      sha256: '',
      totalLines: 0,
      excerptLines: 0,
      truncated: false,
      content: '',
      error: `File not found: ${relativePath}`,
    };
  }

  try {
    const rawContent = readFileSync(absolutePath, 'utf-8');
    const sha256 = computeSha256(rawContent);
    const lines = rawContent.split(/\r?\n/);
    const totalLines = lines.length;

    let excerptContent: string;
    let excerptLines: number;
    let truncated = false;

    if (totalLines <= EXCERPT_LINE_LIMIT) {
      excerptContent = rawContent;
      excerptLines = totalLines;
    } else {
      // Take first 60 and last 60 lines
      const firstPart = lines.slice(0, HALF_EXCERPT_LIMIT);
      const lastPart = lines.slice(-HALF_EXCERPT_LIMIT);
      const omittedCount = totalLines - EXCERPT_LINE_LIMIT;
      const marker = `\n[... ${omittedCount} lines omitted ...]\n`;

      excerptContent = firstPart.join('\n') + marker + lastPart.join('\n');
      excerptLines = EXCERPT_LINE_LIMIT;
      truncated = true;
    }

    return {
      path: absolutePath,
      relativePath,
      sha256,
      totalLines,
      excerptLines,
      truncated,
      content: excerptContent,
    };
  } catch (error) {
    return {
      path: absolutePath,
      relativePath,
      sha256: '',
      totalLines: 0,
      excerptLines: 0,
      truncated: false,
      content: '',
      error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Context Pack Generation
// ============================================================================

/**
 * Build a context pack for a task.
 *
 * @param taskId - The task ID (e.g., "IFC-006")
 * @param runId - The run ID (e.g., "20251225-143022-IFC-006-a3f7")
 * @param repoRoot - Optional repo root path (auto-detected if not provided)
 */
export function buildContextPack(
  taskId: string,
  runId: string,
  repoRoot?: string
): ContextPackResult {
  const root = repoRoot || findRepoRoot();
  const errors: string[] = [];
  const warnings: string[] = [];

  // Resolve CSV and find task
  const csvPath = resolveSprintPlanPath(root);
  if (!csvPath) {
    return {
      success: false,
      packPath: '',
      manifestPath: '',
      manifest: createEmptyManifest(taskId, runId, root),
      errors: ['Sprint_plan.csv not found'],
      warnings: [],
    };
  }

  const csvContent = readFileSync(csvPath, 'utf-8');
  const { tasks, errors: csvErrors } = parseSprintCsv(csvContent);

  if (csvErrors.length > 0) {
    return {
      success: false,
      packPath: '',
      manifestPath: '',
      manifest: createEmptyManifest(taskId, runId, root),
      errors: csvErrors,
      warnings: [],
    };
  }

  // Find the specific task
  const task = tasks.find((t) => t['Task ID'] === taskId);
  if (!task) {
    return {
      success: false,
      packPath: '',
      manifestPath: '',
      manifest: createEmptyManifest(taskId, runId, root),
      errors: [`Task ${taskId} not found in Sprint_plan.csv`],
      warnings: [],
    };
  }

  // Parse contract to get FILE: prerequisites
  const prerequisites = task['Pre-requisites'] || '';
  const artifactsToTrack = task['Artifacts To Track'] || '';
  const validationMethod = task['Validation Method'] || '';

  const contract = parseTaskContract(prerequisites, artifactsToTrack, validationMethod);
  const filePaths = getFilePrerequisites(contract);
  const dirPaths = getDirPrerequisites(contract);

  // Create output directory - sprint-based structure: .specify/sprints/sprint-{N}/attestations/{taskId}/
  const sprintNumber = parseInt(task['Target Sprint'] || '0', 10);
  const outputDir = join(root, '.specify', 'sprints', `sprint-${sprintNumber}`, 'attestations', taskId);
  mkdirSync(outputDir, { recursive: true });

  const packPath = join(outputDir, 'context_pack.md');
  const manifestPath = join(outputDir, 'context_pack.manifest.json');

  // Generate excerpts for all FILE: prerequisites
  const excerpts: FileExcerpt[] = [];
  const manifestEntries: FileManifestEntry[] = [];

  for (const filePath of filePaths) {
    // Handle glob patterns by resolving them
    const resolvedPaths = resolveFilePath(filePath, root);

    for (const resolvedPath of resolvedPaths) {
      const excerpt = generateFileExcerpt(resolvedPath, root);
      excerpts.push(excerpt);

      manifestEntries.push({
        path: excerpt.relativePath,
        sha256: excerpt.sha256,
        totalLines: excerpt.totalLines,
        excerptLines: excerpt.excerptLines,
        truncated: excerpt.truncated,
        included: !excerpt.error,
        excludeReason: excerpt.error,
      });

      if (excerpt.error) {
        warnings.push(excerpt.error);
      }
    }
  }

  // Build context pack markdown
  let packContent = generateContextPackMarkdown(taskId, runId, excerpts, task);

  // Check size and truncate if needed
  let truncatedDueToSize = false;
  const packSizeBytes = Buffer.byteLength(packContent, 'utf-8');

  if (packSizeBytes > MAX_PACK_SIZE_BYTES) {
    warnings.push(
      `Context pack size (${packSizeBytes} bytes) exceeds ${MAX_PACK_SIZE_BYTES} bytes limit. Truncating oldest files.`
    );
    truncatedDueToSize = true;

    // Truncate by removing files from the end until within limit
    while (excerpts.length > 0 && Buffer.byteLength(packContent, 'utf-8') > MAX_PACK_SIZE_BYTES) {
      const removed = excerpts.pop();
      if (removed) {
        const entry = manifestEntries.find((e) => e.path === removed.relativePath);
        if (entry) {
          entry.included = false;
          entry.excludeReason = 'Excluded due to size limit';
        }
      }
      packContent = generateContextPackMarkdown(taskId, runId, excerpts, task);
    }
  }

  // Create manifest
  const manifest: ContextPackManifest = {
    taskId,
    runId,
    createdAt: new Date().toISOString(),
    repoRoot: root,
    files: manifestEntries,
    totalSizeBytes: Buffer.byteLength(packContent, 'utf-8'),
    truncatedDueToSize,
  };

  // Write files
  try {
    writeFileSync(packPath, packContent, 'utf-8');
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  } catch (error) {
    errors.push(
      `Failed to write context pack: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      success: false,
      packPath,
      manifestPath,
      manifest,
      errors,
      warnings,
    };
  }

  return {
    success: true,
    packPath,
    manifestPath,
    manifest,
    errors,
    warnings,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Resolve a file path, handling simple glob patterns.
 * For now, handles basic patterns like "packages/db/*" or "apps/api/src/modules/**"
 */
function resolveFilePath(pattern: string, repoRoot: string): string[] {
  // If it's a simple path without wildcards, return as-is
  if (!pattern.includes('*')) {
    return [join(repoRoot, pattern)];
  }

  // For wildcard patterns, we return an empty array and note it
  // In a full implementation, we'd use glob to resolve these
  // For now, just handle the base path if it exists
  const basePath = pattern.split('*')[0];
  const resolvedBase = join(repoRoot, basePath);

  if (existsSync(resolvedBase)) {
    // Just return the base path for now - glob expansion would go here
    return [];
  }

  return [];
}

/**
 * Generate the context pack markdown content.
 */
function generateContextPackMarkdown(
  taskId: string,
  runId: string,
  excerpts: FileExcerpt[],
  task: SprintTask
): string {
  const lines: string[] = [];

  lines.push(`# Context Pack: ${taskId}`);
  lines.push('');
  lines.push(`**Run ID:** ${runId}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Task Details');
  lines.push('');
  lines.push(`- **Section:** ${task.Section || 'N/A'}`);
  lines.push(`- **Description:** ${task.Description || 'N/A'}`);
  lines.push(`- **Status:** ${task.Status}`);
  lines.push(`- **Target Sprint:** ${task['Target Sprint']}`);
  lines.push('');
  lines.push('## File Excerpts');
  lines.push('');

  if (excerpts.length === 0) {
    lines.push('*No FILE: prerequisites found or all files excluded.*');
    lines.push('');
  } else {
    for (const excerpt of excerpts) {
      if (excerpt.error) {
        lines.push(`### ❌ ${excerpt.relativePath}`);
        lines.push('');
        lines.push(`**Error:** ${excerpt.error}`);
        lines.push('');
      } else {
        const truncatedNote = excerpt.truncated
          ? ` (truncated: ${excerpt.excerptLines}/${excerpt.totalLines} lines)`
          : '';
        lines.push(`### 📄 ${excerpt.relativePath}${truncatedNote}`);
        lines.push('');
        lines.push(`**SHA256:** \`${excerpt.sha256}\``);
        lines.push('');
        lines.push('```');
        lines.push(excerpt.content);
        lines.push('```');
        lines.push('');
      }
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('*This context pack was auto-generated for agent context acknowledgement.*');

  return lines.join('\n');
}

/**
 * Create an empty manifest for error cases.
 */
function createEmptyManifest(taskId: string, runId: string, repoRoot: string): ContextPackManifest {
  return {
    taskId,
    runId,
    createdAt: new Date().toISOString(),
    repoRoot,
    files: [],
    totalSizeBytes: 0,
    truncatedDueToSize: false,
  };
}

// ============================================================================
// Run ID Generation
// ============================================================================

/**
 * Generate a run ID in the format: YYYYMMDD-HHMMSS-<task_id>-<random_4_hex>
 */
export function generateRunId(taskId: string): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const randomHex = Math.random().toString(16).slice(2, 6);

  return `${datePart}-${timePart}-${taskId}-${randomHex}`;
}
