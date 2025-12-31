/**
 * Artifact Verification Module
 *
 * Verifies that task artifacts exist, have real content (not stubs),
 * and generates SHA256 hashes for integrity tracking.
 *
 * @module tools/scripts/lib/sprint-audit/artifact-verifier
 */

import * as fs from 'fs';
import * as path from 'path';
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
  '.ts': 50,    // TypeScript
  '.tsx': 50,   // TypeScript React
  '.js': 50,    // JavaScript
  '.jsx': 50,   // JavaScript React
  '.json': 20,  // JSON (can be small like {})
  '.md': 100,   // Markdown (should have some content)
  '.yml': 20,   // YAML
  '.yaml': 20,  // YAML
  '.csv': 50,   // CSV (header + some data)
  '.sql': 30,   // SQL
  '.sh': 30,    // Shell scripts
  '.py': 50,    // Python
  default: 10,  // Default minimum
};

/**
 * Patterns that indicate stub/placeholder content in files
 */
const STUB_CONTENT_PATTERNS = [
  // Empty exports
  /^export\s*\{\s*\}\s*;?\s*$/m,
  // Single placeholder comment
  /^\/\/\s*(TODO|PLACEHOLDER|STUB)\s*$/m,
  // Empty default export
  /export\s+default\s+\{\s*\}/,
  // Empty function body only
  /^(?:export\s+)?(?:async\s+)?function\s+\w+\s*\([^)]*\)\s*\{\s*\}\s*$/m,
  // "Not implemented" content
  /^\s*throw\s+new\s+Error\s*\(\s*['"`]Not implemented/m,
  // Empty JSON objects/arrays
  /^\s*(?:\{\s*\}|\[\s*\])\s*$/,
  // Template file markers
  /<<REPLACE|<<TODO|<<INSERT/i,
  // Placeholder strings only
  /^['"`](?:placeholder|todo|fixme|stub|implement)['"`]\s*;?\s*$/im,
];

/**
 * File extensions that should be checked for stub content
 */
const CHECK_STUB_CONTENT_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.py', '.sh',
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
    // Remove ARTIFACT: prefix if present
    .map((a) => a.replace(/^ARTIFACT:\s*/i, ''));

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
 * Verifies a single artifact file
 */
export async function verifyArtifact(
  artifactPath: string,
  taskId: string,
  repoRoot: string
): Promise<ArtifactVerification> {
  const absolutePath = path.join(repoRoot, artifactPath);
  const issues: string[] = [];
  let status: ArtifactStatus = 'found';
  let size: number | null = null;
  let sha256: string | null = null;

  // Check if file exists
  if (!fs.existsSync(absolutePath)) {
    return {
      path: artifactPath,
      expectedBy: taskId,
      status: 'missing',
      size: null,
      sha256: null,
      issues: [`Artifact not found: ${artifactPath}`],
    };
  }

  try {
    const stats = fs.statSync(absolutePath);

    // Skip directories
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

    size = stats.size;
    const extension = path.extname(artifactPath).toLowerCase();
    const minSize = getMinFileSize(extension);

    // Check for empty file
    if (size === 0) {
      return {
        path: artifactPath,
        expectedBy: taskId,
        status: 'empty',
        size: 0,
        sha256: null,
        issues: ['File is empty (0 bytes)'],
      };
    }

    // Check for suspiciously small file
    if (size < minSize) {
      issues.push(`File is very small (${size} bytes, expected ≥${minSize} for ${extension})`);
    }

    // Read content for deeper analysis
    const content = fs.readFileSync(absolutePath, 'utf-8');

    // Check for stub content
    if (isStubContent(content, extension)) {
      status = 'stub';
      issues.push('File appears to contain placeholder/stub content');
    }

    // Generate hash
    sha256 = sha256File(absolutePath);

    // Additional checks for specific file types
    if (extension === '.json') {
      try {
        const parsed = JSON.parse(content);
        if (typeof parsed === 'object' && Object.keys(parsed).length === 0) {
          status = 'stub';
          issues.push('JSON file contains empty object');
        }
      } catch {
        issues.push('JSON file has invalid syntax');
      }
    }

    if (extension === '.ts' || extension === '.tsx') {
      // Check for files with only imports and no exports
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
  } catch (error) {
    issues.push(`Error reading artifact: ${error}`);
    status = 'missing';
  }

  return {
    path: artifactPath,
    expectedBy: taskId,
    status,
    size,
    sha256,
    issues,
  };
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
