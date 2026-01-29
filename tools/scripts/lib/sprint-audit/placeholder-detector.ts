/**
 * Placeholder Detection Module
 *
 * Scans source code files for placeholder patterns that indicate
 * incomplete implementations (TODO, FIXME, STUB, empty functions, etc.).
 *
 * @module tools/scripts/lib/sprint-audit/placeholder-detector
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import type {
  PlaceholderFinding,
  PlaceholderPattern,
  PlaceholderScanConfig,
  DEFAULT_SCAN_CONFIG,
} from './types';

// =============================================================================
// Placeholder Pattern Definitions
// =============================================================================

/**
 * Regular expression patterns for detecting placeholder code.
 * Each pattern is mapped to a PlaceholderPattern type.
 */
export const PLACEHOLDER_PATTERNS: Record<PlaceholderPattern, RegExp> = {
  // Comment markers indicating incomplete work
  TODO: /\b(TODO|@TODO)\s*[:(.-]/gi,
  FIXME: /\b(FIXME|@FIXME)\s*[:(.-]/gi,
  PLACEHOLDER: /\bPLACEHOLDER\b/gi,
  STUB: /\bSTUB\b/gi,
  HACK: /\b(HACK|@HACK)\s*[:(.-]/gi,
  XXX: /\bXXX\b/gi,

  // Empty or placeholder implementations
  EMPTY_FUNCTION: /(?:function\s+\w+|\w+\s*[:=]\s*(?:async\s+)?function|\w+\s*[:=]\s*(?:async\s+)?\([^)]*\)\s*=>)\s*\{\s*\}/g,
  THROW_NOT_IMPLEMENTED: /throw\s+(?:new\s+)?(?:Error|NotImplementedError)\s*\(\s*['"`](?:Not implemented|TODO|FIXME|STUB)/gi,

  // Test placeholders
  SKIP_TEST: /\b(?:it|test|describe)\.skip\s*\(/g,
  EMPTY_TEST: /\b(?:it|test)\s*\(\s*['"`][^'"`]+['"`]\s*,\s*(?:async\s+)?\(\s*\)\s*=>\s*\{\s*\}\s*\)/g,
  PENDING_TEST: /\b(?:it|test)\.todo\s*\(/g,

  // Mock returns that may indicate incomplete implementation
  MOCK_RETURN: /return\s+['"`](?:mock|fake|dummy|placeholder|test)[_-]?/gi,

  // Simulated/synthetic data markers (IFC-085: fake benchmark data)
  SIMULATED_DATA: /\b(simulated|mock:.*:v\d|fake[_-]?data|synthetic)\b/gi,

  // Placeholder return values (IFC-157: SMS/Webhook/Push channels)
  PLACEHOLDER_RETURN: /return\s*\{\s*placeholder:\s*true\s*\}/g,

  // Not wired/integrated comments (IFC-099, IFC-117, IFC-144)
  NOT_WIRED_COMMENT: /\/\/\s*(TODO|PLACEHOLDER):\s*(wire|integrate|connect)/gi,

  // Placeholder channel switch cases (IFC-157: notification channels)
  PLACEHOLDER_CHANNEL: /case\s+['"](\w+)['"]\s*:[\s\S]{0,100}placeholder:\s*true/g,

  // Null fallback returns (IFC-020, IFC-155)
  NULL_FALLBACK: /\/\/\s*For now,?\s*return\s*null\s*to\s*fallback|return\s*null\s*;?\s*\/\/\s*(placeholder|TODO|fallback)/gi,

  // Hardcoded AI prediction values (IFC-095)
  HARDCODED_PREDICTION: /\/\/\s*TODO:\s*Implement\s+with\s+real\s+.*chain|return\s*\{\s*(confidence|score|risk|churnProbability):\s*\d+\.?\d*\s*,/gi,

  // Deferred audit logging (IFC-125)
  DEFERRED_AUDIT: /\/\/\s*TODO:?\s*.*audit\s*log/gi,

  // Placeholder demonstration comments (IFC-128)
  DEMONSTRATION_PLACEHOLDER: /\/\/\s*This\s+is\s+a\s+placeholder\s+for\s+demonstration/gi,

  // Simulated benchmark entries (IFC-150)
  SIMULATED_BENCHMARK: /["']name["']\s*:\s*["'][^"']*\(simulated\)["']/gi,

  // Stubbed token counting (IFC-115)
  STUBBED_TOKEN_COUNT: /\/\/\s*Would\s+need\s+actual\s+token\s+counting/gi,
};

/**
 * Additional context patterns that help identify if a placeholder is in production code
 */
const CONTEXT_EXCLUSIONS = {
  // These paths suggest test/mock files where placeholders are acceptable
  testFilePaths: [
    /__tests__/,
    /\.test\./,
    /\.spec\./,
    /\.mock\./,
    /test-utils/,
    /fixtures/,
    /mocks/,
  ],
  // Comments that indicate intentional placeholder (documented technical debt)
  documentedDebt: [
    /\/\/\s*@debt/i,
    /\/\/\s*@technical-debt/i,
    /\/\*\*?\s*@debt/i,
  ],
};

// =============================================================================
// File Discovery
// =============================================================================

/**
 * Discovers files to scan based on configuration
 */
export async function discoverFiles(
  repoRoot: string,
  config: PlaceholderScanConfig
): Promise<string[]> {
  const { extensions, excludeDirs } = config;

  // Build glob pattern for all extensions
  const extPattern =
    extensions.length === 1 ? extensions[0] : `{${extensions.join(',')}}`;

  const pattern = `**/*${extPattern}`;

  const files = await glob(pattern, {
    cwd: repoRoot,
    absolute: true,
    ignore: excludeDirs.map((dir) => `**/${dir}/**`),
    nodir: true,
  });

  // Filter by file size
  const validFiles: string[] = [];
  for (const file of files) {
    try {
      const stats = await fs.promises.stat(file);
      if (stats.size >= config.minFileSize && stats.size <= config.maxFileSize) {
        validFiles.push(file);
      }
    } catch {
      // Skip files we can't stat
    }
  }

  return validFiles;
}

// =============================================================================
// Placeholder Detection
// =============================================================================

/**
 * Scans a single file for placeholder patterns
 */
export async function scanFile(
  filePath: string,
  repoRoot: string
): Promise<PlaceholderFinding[]> {
  const findings: PlaceholderFinding[] = [];

  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const relativePath = path.relative(repoRoot, filePath);

    // Check if this is a test file (findings may be less critical)
    const isTestFile = CONTEXT_EXCLUSIONS.testFilePaths.some((pattern) =>
      pattern.test(relativePath)
    );

    // Scan each line
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;

      // Skip if line is documented technical debt
      const isDocumentedDebt = CONTEXT_EXCLUSIONS.documentedDebt.some((pattern) =>
        pattern.test(line)
      );
      if (isDocumentedDebt) continue;

      // Check each pattern
      for (const [patternName, regex] of Object.entries(PLACEHOLDER_PATTERNS)) {
        // Reset regex state for global patterns
        regex.lastIndex = 0;

        let match;
        while ((match = regex.exec(line)) !== null) {
          // Skip certain patterns in test files
          if (isTestFile && ['SKIP_TEST', 'PENDING_TEST', 'EMPTY_TEST'].includes(patternName)) {
            continue;
          }

          findings.push({
            file: relativePath,
            line: lineNumber,
            column: match.index + 1,
            pattern: patternName as PlaceholderPattern,
            content: truncateContent(line, match.index, 100),
            linkedTaskId: extractLinkedTaskId(line),
          });
        }
      }
    }

    // Check for multi-line empty functions (more complex pattern)
    const emptyFunctionFindings = detectEmptyFunctions(content, relativePath);
    findings.push(...emptyFunctionFindings);
  } catch (error) {
    // Log but don't fail on individual file errors
    console.warn(`Warning: Could not scan ${filePath}: ${error}`);
  }

  return findings;
}

/**
 * Detects empty functions that span multiple lines
 */
function detectEmptyFunctions(
  content: string,
  relativePath: string
): PlaceholderFinding[] {
  const findings: PlaceholderFinding[] = [];

  // Pattern for functions with only whitespace/comments in body
  const multiLineEmptyFunction =
    /(?:function\s+(\w+)|(\w+)\s*[:=]\s*(?:async\s+)?function|\([\w\s,]*\)\s*=>)\s*\{[\s\n]*(?:\/\/[^\n]*\n)*[\s\n]*\}/g;

  let match;
  while ((match = multiLineEmptyFunction.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;

    // Check if function body has any real code (not just comments/whitespace)
    const bodyContent = match[0].substring(match[0].indexOf('{') + 1, match[0].lastIndexOf('}'));
    const hasRealCode = bodyContent.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim().length > 0;

    if (!hasRealCode) {
      findings.push({
        file: relativePath,
        line: lineNumber,
        column: 1,
        pattern: 'EMPTY_FUNCTION',
        content: truncateContent(match[0], 0, 100),
        linkedTaskId: null,
      });
    }
  }

  return findings;
}

/**
 * Truncates content for display, centered around the match position
 */
function truncateContent(line: string, matchIndex: number, maxLength: number): string {
  const trimmed = line.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  const start = Math.max(0, matchIndex - Math.floor(maxLength / 2));
  const end = Math.min(trimmed.length, start + maxLength);
  const truncated = trimmed.substring(start, end);

  return (start > 0 ? '...' : '') + truncated + (end < trimmed.length ? '...' : '');
}

/**
 * Attempts to extract a linked task ID from comment (e.g., "TODO(IFC-123): ...")
 */
function extractLinkedTaskId(line: string): string | null {
  // Match patterns like:
  // TODO(IFC-123), FIXME(ENV-001-AI), TODO: IFC-001, etc.
  const patterns = [
    /(?:TODO|FIXME|STUB|HACK)\s*\(\s*([A-Z]+-\d+(?:-[A-Z]+)?)\s*\)/i,
    /(?:TODO|FIXME|STUB|HACK)\s*:\s*\[?([A-Z]+-\d+(?:-[A-Z]+)?)\]?/i,
    /\b([A-Z]+-\d+(?:-[A-Z]+)?)\b.*(?:TODO|FIXME|STUB|HACK)/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(line);
    if (match) {
      return match[1];
    }
  }

  return null;
}

// =============================================================================
// Main Scanner
// =============================================================================

/**
 * Scans multiple files for placeholder patterns
 *
 * @param files - Array of file paths to scan
 * @param repoRoot - Repository root for relative paths
 * @returns Array of placeholder findings
 */
export async function scanForPlaceholders(
  files: string[],
  repoRoot: string
): Promise<PlaceholderFinding[]> {
  const allFindings: PlaceholderFinding[] = [];

  // Process files in batches for performance
  const batchSize = 50;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((file) => scanFile(file, repoRoot))
    );
    allFindings.push(...batchResults.flat());
  }

  return allFindings;
}

/**
 * Full placeholder scan with file discovery
 *
 * @param repoRoot - Repository root directory
 * @param config - Scan configuration
 * @returns Array of placeholder findings
 */
export async function runPlaceholderScan(
  repoRoot: string,
  config: PlaceholderScanConfig
): Promise<PlaceholderFinding[]> {
  console.log(`Scanning for placeholders in ${repoRoot}...`);

  const files = await discoverFiles(repoRoot, config);
  console.log(`Found ${files.length} files to scan`);

  const findings = await scanForPlaceholders(files, repoRoot);
  console.log(`Found ${findings.length} placeholder(s)`);

  return findings;
}

/**
 * Filters findings to only those related to specific task artifacts
 */
export function filterFindingsByTaskArtifacts(
  findings: PlaceholderFinding[],
  artifactPaths: string[]
): PlaceholderFinding[] {
  // Normalize artifact paths for comparison
  const normalizedArtifacts = artifactPaths.map((p) =>
    p.replace(/\\/g, '/').toLowerCase()
  );

  return findings.filter((finding) => {
    const normalizedFile = finding.file.replace(/\\/g, '/').toLowerCase();
    return normalizedArtifacts.some(
      (artifact) =>
        normalizedFile.includes(artifact) ||
        artifact.includes(normalizedFile) ||
        // Handle glob patterns in artifacts
        (artifact.includes('*') && matchesGlobPattern(normalizedFile, artifact))
    );
  });
}

/**
 * Simple glob pattern matching (supports * and **)
 */
function matchesGlobPattern(filePath: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\*\*/g, '<<<DOUBLESTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<DOUBLESTAR>>>/g, '.*');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

// =============================================================================
// Summary Helpers
// =============================================================================

/**
 * Groups findings by pattern type
 */
export function groupByPattern(
  findings: PlaceholderFinding[]
): Map<PlaceholderPattern, PlaceholderFinding[]> {
  const grouped = new Map<PlaceholderPattern, PlaceholderFinding[]>();

  for (const finding of findings) {
    const existing = grouped.get(finding.pattern) || [];
    existing.push(finding);
    grouped.set(finding.pattern, existing);
  }

  return grouped;
}

/**
 * Groups findings by file
 */
export function groupByFile(
  findings: PlaceholderFinding[]
): Map<string, PlaceholderFinding[]> {
  const grouped = new Map<string, PlaceholderFinding[]>();

  for (const finding of findings) {
    const existing = grouped.get(finding.file) || [];
    existing.push(finding);
    grouped.set(finding.file, existing);
  }

  return grouped;
}

/**
 * Generates a summary of placeholder findings
 */
export function generatePlaceholderSummary(findings: PlaceholderFinding[]): {
  total: number;
  byPattern: Record<string, number>;
  byFile: Record<string, number>;
  criticalCount: number;
} {
  const byPattern: Record<string, number> = {};
  const byFile: Record<string, number> = {};
  let criticalCount = 0;

  // Critical patterns that should block completion
  const criticalPatterns: PlaceholderPattern[] = [
    'THROW_NOT_IMPLEMENTED',
    'EMPTY_FUNCTION',
    'PLACEHOLDER',
    'STUB',
  ];

  for (const finding of findings) {
    byPattern[finding.pattern] = (byPattern[finding.pattern] || 0) + 1;
    byFile[finding.file] = (byFile[finding.file] || 0) + 1;

    if (criticalPatterns.includes(finding.pattern)) {
      criticalCount++;
    }
  }

  return {
    total: findings.length,
    byPattern,
    byFile,
    criticalCount,
  };
}
