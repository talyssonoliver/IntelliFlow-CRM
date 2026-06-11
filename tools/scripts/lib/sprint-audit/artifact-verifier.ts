/**
 * Artifact Verification Module
 *
 * Verifies that task artifacts exist, have real content (not stubs),
 * and generates SHA256 hashes for integrity tracking.
 *
 * @module tools/scripts/lib/sprint-audit/artifact-verifier
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import { createHash } from 'crypto';
import type { ArtifactVerification, ArtifactStatus } from './types';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Minimum file size in bytes to consider non-empty (adjustable per file type)
 */
const MIN_FILE_SIZES: Record<string, number> = {
  '.ts': 50, // TypeScript
  '.tsx': 50, // TypeScript React
  '.js': 50, // JavaScript
  '.jsx': 50, // JavaScript React
  '.json': 20, // JSON (can be small like {})
  '.md': 100, // Markdown (should have some content)
  '.yml': 20, // YAML
  '.yaml': 20, // YAML
  '.csv': 50, // CSV (header + some data)
  '.sql': 30, // SQL
  '.sh': 30, // Shell scripts
  '.py': 50, // Python
  default: 10, // Default minimum
};

/**
 * Patterns that indicate stub/placeholder content in files
 */
const STUB_CONTENT_PATTERNS = [
  // Empty exports
  /^export[ \t]*\{[ \t]*\}[ \t]*(?:;[ \t]*)?$/m,
  // Single placeholder comment
  /^\/\/[ \t]*(TODO|PLACEHOLDER|STUB)[ \t]*$/m,
  // Empty default export
  /export[ \t]+default[ \t]+\{[ \t]*\}/,
  // Empty function body only
  /^(?:export[ \t]+)?(?:async[ \t]+)?function[ \t]+\w+[ \t]*\([^)]*\)[ \t]*\{[ \t]*\}[ \t]*$/m,
  // "Not implemented" content
  /^[ \t]*throw[ \t]+new[ \t]+Error[ \t]*\([ \t]*['"`]Not implemented/m,
  // Empty JSON objects/arrays
  /^[ \t]*(?:\{[ \t]*\}|\[[ \t]*\])[ \t]*$/,
  // Template file markers
  /<<REPLACE|<<TODO|<<INSERT/i,
  // Placeholder strings only
  /^['"`](?:placeholder|todo|fixme|stub|implement)['"`][ \t]*(?:;[ \t]*)?$/im,
];

/**
 * File extensions that should be checked for stub content
 */
const CHECK_STUB_CONTENT_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.py',
  '.sh',
];

// =============================================================================
// SHA256 Hashing (local implementation to avoid circular deps)
// =============================================================================

/**
 * Calculate SHA256 hash of a file
 */
function sha256File(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

// =============================================================================
// File Resolution
// =============================================================================

/**
 * Resolves artifact paths, expanding glob patterns
 */
export async function resolveArtifactPaths(
  artifactSpec: string,
  repoRoot: string
): Promise<string[]> {
  // Handle glob patterns
  if (artifactSpec.includes('*')) {
    const matches = await glob(artifactSpec, {
      cwd: repoRoot,
      absolute: false,
      nodir: true,
    });
    return matches;
  }

  // Handle directory paths (check if directory exists)
  const absolutePath = path.join(repoRoot, artifactSpec);
  if (fs.existsSync(absolutePath)) {
    const stats = fs.statSync(absolutePath);
    if (stats.isDirectory()) {
      // Return directory contents
      const files = await glob('**/*', {
        cwd: absolutePath,
        absolute: false,
        nodir: true,
      });
      return files.map((f) => path.join(artifactSpec, f));
    }
  }

  // Return as-is for single file
  return [artifactSpec];
}

/**
 * Parses artifact specs from CSV (handles multiple artifacts)
 */
export function parseArtifactSpec(artifactsToTrack: string): string[] {
  if (!artifactsToTrack || artifactsToTrack.trim() === '') {
    return [];
  }

  // Split by common delimiters
  const artifacts = artifactsToTrack
    .split(/[,;\n]/)
    .map((a) => a.trim())
    .filter((a) => a.length > 0)
    // Remove ARTIFACT:/EVIDENCE:/SPEC:/PLAN:/CONTEXT: prefixes
    .map((a) => a.replace(/^(?:ARTIFACT|EVIDENCE|SPEC|PLAN|CONTEXT):\s*/i, ''));

  return artifacts;
}

// =============================================================================
// Content Analysis
// =============================================================================

/**
 * Checks if file content appears to be a stub/placeholder
 */
function isStubContent(content: string, extension: string): boolean {
  // Only check certain file types for stub content
  if (!CHECK_STUB_CONTENT_EXTENSIONS.includes(extension)) {
    return false;
  }

  // Check against stub patterns
  for (const pattern of STUB_CONTENT_PATTERNS) {
    if (pattern.test(content)) {
      return true;
    }
  }

  return false;
}

/**
 * Gets minimum expected file size for extension
 */
function getMinFileSize(extension: string): number {
  return MIN_FILE_SIZES[extension] || MIN_FILE_SIZES.default;
}

// =============================================================================
// Single Artifact Verification
// =============================================================================

/**
 * Attempts to find an evidence file at alternative sprint paths when the
 * declared sprint path doesn't match the actual execution sprint.
 * Returns the resolved path (relative to repoRoot) if found, or null.
 */
function findAlternativeSprintPath(artifactPath: string, repoRoot: string): string | null {
  // Only applies to .specify/sprints/sprint-N/ paths
  const sprintPathMatch = artifactPath.match(/^(\.specify\/sprints\/)sprint-(\d+)(\/.*)/);
  if (!sprintPathMatch) return null;

  const prefix = sprintPathMatch[1]; // .specify/sprints/
  const suffix = sprintPathMatch[3]; // /attestations/TASK-ID/file.json

  // Also try plain filename if prefixed (e.g. IFC-021-context_ack.json → context_ack.json)
  const filename = path.basename(suffix);
  const plainFilename = filename.replace(/^[A-Z]+-\d+-/, '');
  const altSuffix = plainFilename !== filename ? suffix.replaceAll(filename, plainFilename) : null;

  // Scan existing sprint directories
  const sprintsDir = path.join(repoRoot, prefix);
  if (!fs.existsSync(sprintsDir)) return null;

  const sprintDirs = fs
    .readdirSync(sprintsDir)
    .filter((d) => /^sprint-\d+$/.test(d))
    .sort((a, b) => {
      const numA = Number.parseInt(a.replaceAll('sprint-', ''), 10);
      const numB = Number.parseInt(b.replaceAll('sprint-', ''), 10);
      return numB - numA; // newest first
    });

  for (const dir of sprintDirs) {
    // Try exact suffix
    const candidate = path.join(repoRoot, prefix, dir, suffix.slice(1));
    if (fs.existsSync(candidate)) {
      return path.join(prefix, dir, suffix.slice(1)).replaceAll(/\\/g, '/');
    }
    // Try plain filename variant
    if (altSuffix) {
      const altCandidate = path.join(repoRoot, prefix, dir, altSuffix.slice(1));
      if (fs.existsSync(altCandidate)) {
        return path.join(prefix, dir, altSuffix.slice(1)).replaceAll(/\\/g, '/');
      }
    }
  }

  return null;
}

/**
 * Resolves the artifact path, trying alternative sprint paths if needed.
 * Returns the resolved relative path plus any path-mismatch issue message,
 * or null if the file cannot be located at all.
 */
function resolveArtifactPath(
  artifactPath: string,
  absolutePath: string,
  repoRoot: string
): { resolvedPath: string; mismatchMessage: string | null } | null {
  if (fs.existsSync(absolutePath)) {
    return { resolvedPath: artifactPath, mismatchMessage: null };
  }

  const altPath = findAlternativeSprintPath(artifactPath, repoRoot);
  if (!altPath) {
    return null;
  }

  const message =
    `Sprint path mismatch: CSV declares ${artifactPath}, found at ${altPath}. ` +
    `Update CSV "Artifacts To Track" to match.`;
  return { resolvedPath: altPath, mismatchMessage: message };
}

/**
 * Checks file size constraints and returns any size-related issue message.
 */
function checkFileSize(
  size: number,
  extension: string
): { status: ArtifactStatus | null; issue: string | null } {
  if (size === 0) {
    return { status: 'empty', issue: 'File is empty (0 bytes)' };
  }

  const minSize = getMinFileSize(extension);
  if (size < minSize) {
    return {
      status: null,
      issue: `File is very small (${size} bytes, expected ≥${minSize} for ${extension})`,
    };
  }

  return { status: null, issue: null };
}

/**
 * Analyses JSON content and appends issues found.
 */
function analyseJsonContent(content: string, issues: string[]): ArtifactStatus {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length === 0) {
      issues.push('JSON file contains empty object');
      return 'stub';
    }
  } catch {
    issues.push('JSON file has invalid syntax');
  }
  return 'found';
}

/**
 * Analyses TypeScript/TSX content and appends issues found.
 */
function analyseTypeScriptContent(content: string, issues: string[]): void {
  const hasExport = /export\s+(?!type\s)/.test(content);
  const hasOnlyTypeExports = /export\s+type/.test(content) && !hasExport;
  const lines = content.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));

  if (lines.length < 3 && !hasExport) {
    issues.push('TypeScript file has minimal content with no exports');
  }
  if (hasOnlyTypeExports && lines.length < 5) {
    issues.push('TypeScript file only exports types with minimal content');
  }
}

/**
 * Verifies a single artifact file
 */
export async function verifyArtifact(
  artifactPath: string,
  taskId: string,
  repoRoot: string
): Promise<ArtifactVerification> {
  const absolutePath = path.join(repoRoot, artifactPath);
  const issues: string[] = [];

  const resolved = resolveArtifactPath(artifactPath, absolutePath, repoRoot);
  if (!resolved) {
    return {
      path: artifactPath,
      expectedBy: taskId,
      status: 'missing',
      size: null,
      sha256: null,
      issues: [`Artifact not found: ${artifactPath}`],
    };
  }

  const { resolvedPath, mismatchMessage } = resolved;
  if (mismatchMessage) {
    issues.push(mismatchMessage);
  }

  const resolvedAbsolutePath = path.join(repoRoot, resolvedPath);

  try {
    const stats = fs.statSync(resolvedAbsolutePath);

    if (stats.isDirectory()) {
      return {
        path: artifactPath,
        expectedBy: taskId,
        status: 'found',
        size: null,
        sha256: null,
        issues: ['Path is a directory, not a file'],
      };
    }

    const extension = path.extname(resolvedPath).toLowerCase();
    const sizeCheck = checkFileSize(stats.size, extension);

    if (sizeCheck.status === 'empty') {
      return {
        path: artifactPath,
        expectedBy: taskId,
        status: 'empty',
        size: 0,
        sha256: null,
        issues: [sizeCheck.issue as string],
      };
    }

    if (sizeCheck.issue) {
      issues.push(sizeCheck.issue);
    }

    const content = fs.readFileSync(resolvedAbsolutePath, 'utf-8');
    let status: ArtifactStatus = 'found';

    if (isStubContent(content, extension)) {
      status = 'stub';
      issues.push('File appears to contain placeholder/stub content');
    }

    const sha256 = sha256File(resolvedAbsolutePath);

    if (extension === '.json') {
      const jsonStatus = analyseJsonContent(content, issues);
      if (jsonStatus === 'stub') {
        status = 'stub';
      }
    }

    if (extension === '.ts' || extension === '.tsx') {
      analyseTypeScriptContent(content, issues);
    }

    return {
      path: artifactPath,
      expectedBy: taskId,
      status,
      size: stats.size,
      sha256,
      issues,
    };
  } catch (error) {
    return {
      path: artifactPath,
      expectedBy: taskId,
      status: 'missing',
      size: null,
      sha256: null,
      issues: [`Error reading artifact: ${error}`],
    };
  }
}

// =============================================================================
// Batch Artifact Verification
// =============================================================================

/**
 * Verifies all artifacts for a task
 */
export async function verifyTaskArtifacts(
  taskId: string,
  artifactsToTrack: string,
  repoRoot: string
): Promise<ArtifactVerification[]> {
  const results: ArtifactVerification[] = [];

  // Parse artifact specifications
  const artifactSpecs = parseArtifactSpec(artifactsToTrack);

  if (artifactSpecs.length === 0) {
    return results;
  }

  for (const spec of artifactSpecs) {
    // Resolve glob patterns and directories
    const resolvedPaths = await resolveArtifactPaths(spec, repoRoot);

    if (resolvedPaths.length === 0) {
      // No files matched the pattern
      results.push({
        path: spec,
        expectedBy: taskId,
        status: 'missing',
        size: null,
        sha256: null,
        issues: [`No files match pattern: ${spec}`],
      });
      continue;
    }

    // Verify each resolved file
    for (const filePath of resolvedPaths) {
      const verification = await verifyArtifact(filePath, taskId, repoRoot);
      results.push(verification);
    }
  }

  return results;
}

/**
 * Verifies artifacts for multiple tasks
 */
export async function verifyMultipleTasksArtifacts(
  tasks: Array<{ taskId: string; artifactsToTrack: string }>,
  repoRoot: string,
  parallelLimit: number = 4
): Promise<Map<string, ArtifactVerification[]>> {
  const results = new Map<string, ArtifactVerification[]>();

  // Process in batches for performance
  for (let i = 0; i < tasks.length; i += parallelLimit) {
    const batch = tasks.slice(i, i + parallelLimit);
    const batchResults = await Promise.all(
      batch.map(async (task) => ({
        taskId: task.taskId,
        verifications: await verifyTaskArtifacts(task.taskId, task.artifactsToTrack, repoRoot),
      }))
    );

    for (const result of batchResults) {
      results.set(result.taskId, result.verifications);
    }
  }

  return results;
}

// =============================================================================
// Summary Generation
// =============================================================================

/**
 * Generates a summary of artifact verification results
 */
export function generateArtifactSummary(verifications: ArtifactVerification[]): {
  total: number;
  found: number;
  missing: number;
  empty: number;
  stub: number;
  issueCount: number;
  hashes: Record<string, string>;
} {
  const summary = {
    total: verifications.length,
    found: 0,
    missing: 0,
    empty: 0,
    stub: 0,
    issueCount: 0,
    hashes: {} as Record<string, string>,
  };

  for (const v of verifications) {
    summary[v.status]++;
    summary.issueCount += v.issues.length;

    if (v.sha256) {
      summary.hashes[v.path] = v.sha256;
    }
  }

  return summary;
}

/**
 * Extracts all artifact hashes from verifications
 */
export function extractArtifactHashes(
  verifications: ArtifactVerification[]
): Record<string, string> {
  const hashes: Record<string, string> = {};

  for (const v of verifications) {
    if (v.sha256 && v.status !== 'missing') {
      hashes[v.path] = v.sha256;
    }
  }

  return hashes;
}

/**
 * Checks if all artifacts are valid (no missing, empty, or stubs)
 */
export function allArtifactsValid(verifications: ArtifactVerification[]): boolean {
  return verifications.every((v) => v.status === 'found' && v.issues.length === 0);
}

/**
 * Gets critical artifact issues (missing or stub files)
 */
export function getCriticalArtifactIssues(
  verifications: ArtifactVerification[]
): ArtifactVerification[] {
  return verifications.filter(
    (v) => v.status === 'missing' || v.status === 'stub' || v.status === 'empty'
  );
}
