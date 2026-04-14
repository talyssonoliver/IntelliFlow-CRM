/**
 * Artifact Registry - Full Codebase File Tracking
 *
 * Scans ALL project directories and provides:
 * - Task accountability (link files to Sprint_plan.csv tasks)
 * - Codebase overview (file counts, health metrics)
 * - Cleanup assistant (orphan detection, size analysis)
 */

import { readdirSync, readFileSync, statSync, existsSync, type Dirent } from 'node:fs';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { MONOREPO_ROOT } from './paths';

// =============================================================================
// TYPES
// =============================================================================

/**
 * File categories for the entire codebase
 */
export type FileCategory =
  // Source code
  | 'app-source' // apps/**/*.ts(x)
  | 'package-source' // packages/**/*.ts(x)
  | 'test-source' // **/*.test.ts, tests/**
  // Generated/Build outputs
  | 'attestation' // artifacts/attestations/**
  | 'benchmark' // artifacts/benchmarks/**
  | 'coverage' // artifacts/coverage/**
  | 'report' // artifacts/reports/**
  | 'metric' // artifacts/metrics/**
  | 'log' // artifacts/logs/**
  | 'generated' // Other generated files
  // Configuration
  | 'ci-config' // .github/workflows/**
  | 'infra-config' // infra/**
  | 'tool-config' // Root config files (*.json, *.yml)
  | 'claude-config' // .claude/**
  // Documentation
  | 'docs' // docs/**
  | 'readme' // README.md, *.md in root
  // Tools/Scripts
  | 'tool' // tools/**
  | 'script' // scripts/**
  // Other
  | 'misc'; // Everything else

/**
 * Top-level directory types
 */
export type DirectoryType =
  | 'apps'
  | 'packages'
  | 'docs'
  | 'infra'
  | 'scripts'
  | 'tools'
  | 'artifacts'
  | 'tests'
  | '.claude'
  | '.github'
  | '.specify'
  | 'root';

export interface FileEntry {
  path: string; // Relative to monorepo root
  absolutePath: string;
  exists: boolean;
  type: 'file' | 'directory';
  size: number;
  lastModified: string; // ISO timestamp
  linkedTasks: string[]; // Task IDs referencing this file
  isOrphan: boolean; // Not linked to any task
  category: FileCategory;
  directory: DirectoryType;
  extension: string;
  isTestFile: boolean;
  hasTest: boolean; // For source files, whether a test exists
  // Audit signals for orphan quality analysis (populated by computeAuditSignals)
  auditSignals?: {
    hasAttestation: boolean; // Path found in any attestation artifact_hashes
    isImported: boolean; // Referenced by at least one linked source file
    duplicateNames: string[]; // Other files in the codebase with identical filename
    daysSinceModified: number; // Days since last modification
  };
  // Git history metadata (populated by enrichWithGitHistory)
  gitHistory?: {
    createdAt: string | null; // ISO timestamp from git
    createdBy: string | null; // Git author name
    createdCommit: string | null; // Commit hash
    createdPurpose: string | null; // Commit message (why it was created)
    createdTaskId: string | null; // Extracted task ID from commit
    lastModifiedBy: string | null;
    lastModifiedCommit: string | null;
    lastModifiedMessage: string | null;
    daysSinceModified: number | null;
    isStale: boolean;
    staleReason: string | null;
  };
}

export interface DirectorySummary {
  directory: DirectoryType;
  fileCount: number;
  totalSize: number;
  linkedCount: number;
  orphanCount: number;
  byExtension: Record<string, number>;
  testCoverage?: number; // Percentage of source files with tests
}

export interface CodebaseHealth {
  totalFiles: number;
  totalSize: number;
  linkedFiles: number;
  orphanFiles: number;
  missingFiles: number;
  documentationCoverage: number; // % of packages with README
  testCoverage: number; // % of source files with tests
  byDirectory: DirectorySummary[];
  byCategory: Record<FileCategory, number>;
  byExtension: Record<string, number>;
  lastScanAt: string;
}

export interface MissingFile {
  path: string;
  expectedBy: string[];
  prefix: 'ARTIFACT' | 'EVIDENCE' | 'FILE' | 'CONTEXT' | 'PLAN' | 'SPEC' | 'ATTESTATION';
}

export interface CleanupSuggestion {
  path: string;
  reason: string;
  category: 'orphan' | 'large-file' | 'stale' | 'duplicate-name';
  size: number;
  lastModified: string;
  priority: 'high' | 'medium' | 'low';
}

// =============================================================================
// CONTENT VALIDATION - Detect placeholders, mocks, and fabricated data
// =============================================================================

export type ContentIssueType =
  | 'placeholder' // File explicitly says it's a placeholder
  | 'mock_data' // Data labeled as mock/fake/dummy
  | 'wrong_format' // Expected .mp4 but got .md, etc.
  | 'empty_stub' // File exists but has no real content
  | 'pending_status' // Content indicates pending/incomplete status
  | 'fabricated'; // Generated test data with no real execution

export interface ContentValidationResult {
  path: string;
  isValid: boolean;
  issues: Array<{
    type: ContentIssueType;
    message: string;
    evidence: string; // Line or pattern that triggered the issue
  }>;
}

/**
 * Patterns that indicate placeholder/mock/fabricated content
 */
const CONTENT_ISSUE_PATTERNS: Array<{
  type: ContentIssueType;
  pattern: RegExp;
  message: string;
}> = [
  // Explicit placeholder markers
  {
    type: 'placeholder',
    pattern: /\bPLACEHOLDER\b|\bplaceholder\b/gi,
    message: 'File contains explicit PLACEHOLDER marker',
  },
  {
    type: 'placeholder',
    pattern: /Status:\s*PLACEHOLDER|PLACEHOLDER\s*-\s*video|placeholder.*pending/gi,
    message: 'File marked as placeholder with pending status',
  },
  // Mock data indicators
  {
    type: 'mock_data',
    pattern: /["']?model[_-]?version["']?\s*[:=]\s*["']?mock:/gi,
    message: 'Uses mock model version instead of real AI model',
  },
  {
    type: 'mock_data',
    pattern: /\b(mock|fake|dummy|fabricated)[_-]?(data|result|output|response)\b/gi,
    message: 'Contains mock/fake data markers',
  },
  {
    type: 'mock_data',
    pattern: /["']?executor["']?\s*[:=]\s*["']?mock/gi,
    message: 'Execution attributed to mock executor',
  },
  // Pending/incomplete status
  {
    type: 'pending_status',
    pattern: /\b(Video|Recording|Implementation)\s+(recording\s+)?pending\b/gi,
    message: 'Content indicates feature is pending implementation',
  },
  {
    type: 'pending_status',
    pattern: /\bwill be (recorded|created|implemented|added)\b/gi,
    message: 'Content indicates future work required',
  },
  {
    type: 'pending_status',
    pattern: /\bTODO\s*:\s*[A-Z]/gi,
    message: 'Contains TODO markers indicating incomplete work',
  },
  // Fabricated test results (100% pass rate with suspicious patterns)
  {
    type: 'fabricated',
    pattern: /"passRate"\s*:\s*1\.0\s*,[\s\S]*?"passRate"\s*:\s*1\.0/gi,
    message: 'Suspiciously perfect test results (multiple 100% pass rates)',
  },
  {
    type: 'fabricated',
    pattern:
      /"passed"\s*:\s*true[\s\S]*?"passed"\s*:\s*true[\s\S]*?"passed"\s*:\s*true[\s\S]*?"passed"\s*:\s*true[\s\S]*?"passed"\s*:\s*true/gi,
    message: 'All tests passed with no failures - verify actual execution',
  },
  // Simulated/mock data detection (IFC-085, IFC-099, etc.)
  {
    type: 'mock_data',
    pattern: /["']?model[_-]?version["']?\s*[:=]\s*["']?simulated/gi,
    message: 'Uses simulated model version instead of real execution',
  },
  {
    type: 'placeholder',
    pattern: /placeholder:\s*true/gi,
    message: 'Contains placeholder return value indicating stub implementation',
  },
  {
    type: 'fabricated',
    pattern: /\b(simulated|synthetic|fabricated)[_-]?(benchmark|data|result)\b/gi,
    message: 'Contains simulated/synthetic data markers',
  },
  // Not wired/integrated indicators (IFC-099, IFC-117, IFC-144)
  {
    type: 'pending_status',
    pattern: /\/\/\s*(TODO|PLACEHOLDER):\s*(wire|integrate|connect)/gi,
    message: 'Code marked as needing wiring/integration',
  },
  // Placeholder channel implementations (IFC-157)
  {
    type: 'placeholder',
    pattern: /case\s+['"](\w+)['"]\s*:[\s\S]{0,100}placeholder:\s*true/gi,
    message: 'Channel implementation returns placeholder instead of real delivery',
  },
  // Null fallback returns (IFC-020, IFC-155)
  {
    type: 'placeholder',
    pattern: /\/\/\s*For now,?\s*return\s*null\s*to\s*fallback/gi,
    message: 'Function returns null as fallback instead of real implementation',
  },
  {
    type: 'placeholder',
    pattern:
      /return[ \t]{0,20}null[ \t]{0,20};?[ \t]{0,20}\/\/[ \t]{0,20}(placeholder|TODO|fallback)/gi,
    message: 'Returns null with placeholder/TODO comment',
  },
  // Not yet implemented throws (IFC-086)
  {
    type: 'pending_status',
    pattern: /throw\s+(?:new\s+)?Error\s*\(\s*['"`].*not\s+yet\s+implemented/gi,
    message: 'Throws "not yet implemented" error instead of real implementation',
  },
  // Hardcoded prediction values (IFC-095)
  {
    type: 'mock_data',
    pattern:
      /\/\/[ \t]{0,20}TODO:[ \t]{0,20}Implement[ \t]{1,20}with[ \t]{1,20}real[ \t]{1,20}[^\n]{0,200}chain/gi,
    message: 'Contains TODO for implementing real AI chain',
  },
  {
    type: 'mock_data',
    pattern:
      /return[ \t]{0,20}\{[ \t]{0,20}(confidence|score|risk):[ \t]{0,20}\d{1,20}(?:\.\d{1,20})?[ \t]{0,20},/gi,
    message: 'Returns hardcoded confidence/score value instead of AI prediction',
  },
  // Deferred audit logging (IFC-125)
  {
    type: 'pending_status',
    pattern: /\/\/[ \t]{0,20}TODO:?[ \t]{0,20}[^\n]{0,200}audit[ \t]{0,20}log/gi,
    message: 'Contains deferred TODO for audit logging integration',
  },
  // Placeholder demonstration comments (IFC-128)
  {
    type: 'placeholder',
    pattern: /\/\/\s*This\s+is\s+a\s+placeholder\s+for\s+demonstration/gi,
    message: 'Contains placeholder demonstration comment',
  },
  // Simulated benchmark entries (IFC-150)
  {
    type: 'fabricated',
    pattern: /["']name["']\s*:\s*["'][^"']*\(simulated\)["']/gi,
    message: 'Benchmark entry marked as simulated',
  },
  // Token counting stubs (IFC-115)
  {
    type: 'placeholder',
    pattern: /\/\/\s*Would\s+need\s+actual\s+token\s+counting/gi,
    message: 'Token counting is stubbed/placeholder',
  },
];

/**
 * File format validation - detect wrong file types
 */
const FORMAT_EXPECTATIONS: Record<string, string[]> = {
  '.mp4': ['.md', '.txt', '.json'], // Video expected, got text/json
  '.pdf': ['.md', '.txt'], // PDF expected, got text
  '.xlsx': ['.json', '.csv'], // Excel expected, got data file
  '.png': ['.md', '.txt', '.svg'], // Image expected, got text
  '.jpg': ['.md', '.txt', '.svg'], // Image expected, got text
};

/**
 * Validate content of a single file for placeholder/mock patterns
 */
export function validateFileContent(
  filePath: string,
  content: string,
  expectedExtension?: string
): ContentValidationResult {
  const issues: ContentValidationResult['issues'] = [];

  // Check for wrong file format
  if (expectedExtension) {
    const actualExtension = filePath.substring(filePath.lastIndexOf('.'));
    const wrongFormats = FORMAT_EXPECTATIONS[expectedExtension];

    if (wrongFormats?.includes(actualExtension)) {
      issues.push({
        type: 'wrong_format',
        message: `Expected ${expectedExtension} file but got ${actualExtension}`,
        evidence: `File path: ${filePath}`,
      });
    }
  }

  // Check for empty/stub files
  const trimmedContent = content.trim();
  if (trimmedContent.length === 0) {
    issues.push({
      type: 'empty_stub',
      message: 'File is empty',
      evidence: 'No content',
    });
  } else if (trimmedContent.length < 50 && !filePath.endsWith('.json')) {
    issues.push({
      type: 'empty_stub',
      message: 'File has minimal content (less than 50 characters)',
      evidence: trimmedContent.substring(0, 50),
    });
  }

  // Check for placeholder/mock patterns
  for (const { type, pattern, message } of CONTENT_ISSUE_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;
    const match = pattern.exec(content);

    if (match) {
      issues.push({
        type,
        message,
        evidence: match[0].substring(0, 100),
      });
    }
  }

  return {
    path: filePath,
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Batch validate multiple files
 */
function _validateFilesContent(
  filesToValidate: Array<{ path: string; content: string; expectedExtension?: string }>
): ContentValidationResult[] {
  return filesToValidate.map(({ path, content, expectedExtension }) =>
    validateFileContent(path, content, expectedExtension)
  );
}

/**
 * Quick check if content appears to be fabricated (without full validation)
 */
function _isLikelyFabricated(content: string): boolean {
  // Check for common fabrication indicators
  const fabricationIndicators = [
    /mock:.*:v\d/i, // Mock version strings
    /PLACEHOLDER/i, // Explicit placeholder
    /pending|will be (recorded|created)/i, // Future tense
    /"passed"\s*:\s*true/g, // Count passed tests
  ];

  let suspiciousCount = 0;

  for (const pattern of fabricationIndicators) {
    if (pattern.test(content)) {
      suspiciousCount++;
    }
  }

  // If all tests pass (JSON with many "passed": true), check if it's suspicious
  const passedMatches = content.match(/"passed"\s*:\s*true/g);
  const failedMatches = content.match(/"passed"\s*:\s*false/g);

  if (passedMatches && passedMatches.length > 5 && (!failedMatches || failedMatches.length === 0)) {
    suspiciousCount++;
  }

  return suspiciousCount >= 2;
}

// =============================================================================
// SKIP PATTERNS
// =============================================================================

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  '.git',
  '.pnpm',
  'dist',
  '.cache',
  // Gitignored generated coverage data — not source code
  'coverage-vitest',
  'coverage-parts',
  // Build output caches — not source code, flagged by Knip/Depcheck
  '.tsup',
  'generated',
  // Temp/generated/IDE data — not source code
  '.pytest_cache',
  '.scannerwork',
  '.sonarlint',
  '.vscode',
  'sonar-reports',
  '.lighthouseci',
  // Python caches
  '__pycache__',
]);

// Directories to skip only at root or top-level app/package paths (not nested API routes)
const SKIP_DIRS_TOP_LEVEL = new Set(['build', 'coverage']);

/** Directories to skip ONLY at repo root (depth 1), not nested inside other dirs */
const SKIP_DIRS_ROOT_ONLY = new Set(['logs', 'tmp', 'playwright-report', 'sonar-reports']);

/** Specific path prefixes to skip entirely (gitignored temp data, archived files) */
const SKIP_PATH_PREFIXES = ['supabase/.temp/'];

const SKIP_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
  '.gitkeep',
  'desktop.ini',
  // Sensitive env files — never track
  '.env',
  '.env.local',
  '.env.development',
  '.env.test',
  '.env.local.example',
  // Temp build artifacts
  'build_output.log',
  // TypeScript incremental build cache — generated, not source
  'tsconfig.tsbuildinfo',
]);

// =============================================================================
// CATEGORY DETECTION
// =============================================================================

const DIRECTORY_MAP: Record<string, DirectoryType> = {
  apps: 'apps',
  packages: 'packages',
  docs: 'docs',
  infra: 'infra',
  scripts: 'scripts',
  tools: 'tools',
  artifacts: 'artifacts',
  tests: 'tests',
  '.claude': '.claude',
  '.github': '.github',
  '.specify': '.specify',
};

function detectDirectory(relativePath: string): DirectoryType {
  const firstPart = relativePath.split(/[/\\]/)[0];
  return DIRECTORY_MAP[firstPart] ?? 'root';
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const ARTIFACT_KEYWORD_CATEGORIES: Array<[string, FileCategory]> = [
  ['attestation', 'attestation'],
  ['benchmark', 'benchmark'],
  ['coverage', 'coverage'],
  ['report', 'report'],
  ['metric', 'metric'],
  ['log', 'log'],
];
const TOOL_CONFIG_EXTENSIONS = new Set(['.json', '.yml', '.yaml', '.js']);

function detectArtifactCategory(pathLower: string): FileCategory {
  for (const [keyword, category] of ARTIFACT_KEYWORD_CATEGORIES) {
    if (pathLower.includes(keyword)) return category;
  }
  return 'generated';
}

function detectCategory(relativePath: string, extension: string): FileCategory {
  const pathLower = relativePath.toLowerCase();
  const dir = detectDirectory(relativePath);

  if (pathLower.includes('.test.') || pathLower.includes('.spec.') || dir === 'tests') {
    return 'test-source';
  }

  if (dir === 'apps' && SOURCE_EXTENSIONS.has(extension)) return 'app-source';
  if (dir === 'packages' && SOURCE_EXTENSIONS.has(extension)) return 'package-source';

  if (dir === 'artifacts') return detectArtifactCategory(pathLower);

  if (dir === '.github') return 'ci-config';
  if (dir === 'infra') return 'infra-config';
  if (dir === '.claude') return 'claude-config';
  if (dir === 'root' && TOOL_CONFIG_EXTENSIONS.has(extension)) return 'tool-config';

  if (dir === 'docs') return 'docs';
  if (extension === '.md') return 'readme';

  if (dir === 'tools') return 'tool';
  if (dir === 'scripts') return 'script';

  return 'misc';
}

function isTestFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.includes('.test.') || lower.includes('.spec.') || lower.includes('__tests__');
}

// =============================================================================
// FILE SCANNING
// =============================================================================

function scanItem(
  item: Dirent<string>,
  fullPath: string,
  relativePath: string,
  entries: FileEntry[]
): void {
  try {
    const stats = statSync(fullPath);
    if (item.isDirectory()) {
      const depth = relativePath.split(/[/\\]/).length;
      if (SKIP_DIRS_TOP_LEVEL.has(item.name) && depth <= 3) return;
      if (SKIP_DIRS_ROOT_ONLY.has(item.name) && depth <= 1) return;
      // Skip specific path prefixes (e.g., supabase/.temp/)
      const normalizedDir = relativePath.replaceAll('\\', '/') + '/';
      if (
        SKIP_PATH_PREFIXES.some((p) => normalizedDir.endsWith(p) || normalizedDir.includes('/' + p))
      )
        return;
      entries.push(...scanDirectoryRecursive(fullPath, relativePath));
    } else if (item.isFile()) {
      const ext = extname(item.name).toLowerCase() || 'none';
      const normalizedPath = relativePath.replaceAll('\\', '/');
      entries.push({
        path: normalizedPath,
        absolutePath: fullPath,
        exists: true,
        type: 'file',
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
        linkedTasks: [],
        isOrphan: true,
        category: detectCategory(normalizedPath, ext),
        directory: detectDirectory(normalizedPath),
        extension: ext,
        isTestFile: isTestFile(normalizedPath),
        hasTest: false,
      });
    }
  } catch {
    // Skip files we can't stat
  }
}

function scanDirectoryRecursive(dir: string, basePath: string = ''): FileEntry[] {
  const entries: FileEntry[] = [];

  if (!existsSync(dir)) return entries;

  try {
    const items = readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (SKIP_DIRS.has(item.name) || SKIP_FILES.has(item.name)) continue;
      const fullPath = join(dir, item.name);
      const relativePath = basePath ? join(basePath, item.name) : item.name;
      scanItem(item, fullPath, relativePath, entries);
    }
  } catch {
    // Skip directories we can't read
  }

  return entries;
}

/**
 * Scan all project files (excluding node_modules, .next, etc.)
 */
export function scanAllFiles(): FileEntry[] {
  return scanDirectoryRecursive(MONOREPO_ROOT);
}

/**
 * Scan only artifacts directory (for backward compatibility)
 */
function _scanAllArtifacts(): FileEntry[] {
  const allFiles = scanAllFiles();
  return allFiles.filter((f) => f.directory === 'artifacts');
}

// =============================================================================
// TASK FILE PARSING
// =============================================================================

export interface ParsedTaskFileRefs {
  artifacts: string[];
  evidence: string[];
  files: string[];
  context: string[];
  plan: string[];
  spec: string[];
  attestation: string[];
}

type PrefixKey = 'ARTIFACT:' | 'EVIDENCE:' | 'CONTEXT:' | 'PLAN:' | 'SPEC:' | 'ATTESTATION:';
const SKIP_PREFIXES = ['VALIDATE:', 'GATE:', 'AUDIT:'];

function classifyArtifactLine(trimmed: string, result: ParsedTaskFileRefs): void {
  const prefixMap: Record<PrefixKey, keyof ParsedTaskFileRefs> = {
    'ARTIFACT:': 'artifacts',
    'EVIDENCE:': 'evidence',
    'CONTEXT:': 'context',
    'PLAN:': 'plan',
    'SPEC:': 'spec',
    'ATTESTATION:': 'attestation',
  };

  for (const [prefix, key] of Object.entries(prefixMap) as Array<
    [PrefixKey, keyof ParsedTaskFileRefs]
  >) {
    if (trimmed.startsWith(prefix)) {
      result[key].push(trimmed.slice(prefix.length).trim());
      return;
    }
  }

  const isSkipped = SKIP_PREFIXES.some((p) => trimmed.startsWith(p));
  if (!isSkipped && trimmed) {
    result.artifacts.push(trimmed);
  }
}

export function parseTaskFileRefs(
  artifactsField: string,
  prerequisitesField: string,
  validationField: string
): ParsedTaskFileRefs {
  const result: ParsedTaskFileRefs = {
    artifacts: [],
    evidence: [],
    files: [],
    context: [],
    plan: [],
    spec: [],
    attestation: [],
  };

  if (artifactsField) {
    for (const line of artifactsField.split(/[,;\n]/)) {
      classifyArtifactLine(line.trim(), result);
    }
  }

  if (prerequisitesField) {
    for (const line of prerequisitesField.split(/[,;\n]/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('FILE:')) {
        result.files.push(trimmed.slice('FILE:'.length).trim());
      }
    }
  }

  if (validationField) {
    for (const line of validationField.split(/[,;\n]/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('EVIDENCE:')) {
        result.evidence.push(trimmed.slice('EVIDENCE:'.length).trim());
      }
    }
  }

  return result;
}

// =============================================================================
// EVIDENCE SOURCE ENRICHMENT
// =============================================================================

/**
 * Read and parse a JSON file safely, returning null on any error
 */
function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Ensure a task entry exists in the task map, creating a minimal one if needed
 */
function ensureTaskEntry(taskMap: TaskFileMap, taskId: string): void {
  if (!taskMap[taskId]) {
    taskMap[taskId] = {
      expectedArtifacts: [],
      expectedEvidence: [],
      requiredFiles: [],
      expectedContext: [],
      expectedPlan: [],
      expectedSpec: [],
      expectedAttestation: [],
      status: 'Unknown',
      section: '',
    };
  }
}

/**
 * Check if a string looks like a valid file path (not a JSON key or bare word)
 */
function isValidFilePath(p: string): boolean {
  // Must contain a path separator or file extension
  if (!p.includes('/') && !p.includes('.')) return false;
  // Skip gitignored build output directories
  if (p.includes('/dist/') || p.startsWith('dist/')) return false;
  // Skip node_modules
  if (p.includes('node_modules/')) return false;
  return true;
}

/**
 * Add a path to an array if not already present and looks like a valid file path
 */
function addUniquePath(arr: string[], path: string): void {
  if (path && isValidFilePath(path) && !arr.includes(path)) {
    arr.push(path);
  }
}

/**
 * Extract file paths from attestation.json artifact_hashes
 */
function enrichFromAttestationFile(
  taskMap: TaskFileMap,
  taskId: string,
  attestationPath: string
): void {
  const data = readJsonSafe(attestationPath);
  if (!data) return;

  const hashes = data.artifact_hashes;
  if (hashes && typeof hashes === 'object' && !Array.isArray(hashes)) {
    ensureTaskEntry(taskMap, taskId);
    for (const [filePath, hashValue] of Object.entries(hashes as Record<string, string>)) {
      // Only trust entries with real SHA256 hashes (40-128 hex chars),
      // skip phantom values like "verified", "pending_verification", etc.
      if (typeof hashValue === 'string' && /^[0-9a-fA-F]{40,128}$/.test(hashValue)) {
        addUniquePath(taskMap[taskId].expectedArtifacts, filePath);
      }
    }
  }
}

/**
 * Extract file paths from context_ack.json files_read
 */
function enrichFromContextAck(taskMap: TaskFileMap, taskId: string, contextAckPath: string): void {
  const data = readJsonSafe(contextAckPath);
  if (!data) return;

  const contextAck = data.context_acknowledgment as Record<string, unknown> | undefined;
  const filesRead = (data.files_read ?? contextAck?.files_read) as
    | Array<string | Record<string, string>>
    | undefined;
  if (!Array.isArray(filesRead)) return;

  ensureTaskEntry(taskMap, taskId);
  for (const entry of filesRead) {
    const filePath = typeof entry === 'string' ? entry : entry.path;
    if (filePath) {
      addUniquePath(taskMap[taskId].requiredFiles, filePath);
    }
  }
}

/**
 * Scan .specify/sprints/{N}/attestations/ for attestation and context_ack files
 */
function enrichFromAttestations(taskMap: TaskFileMap): void {
  const specifyDir = join(MONOREPO_ROOT, '.specify', 'sprints');
  if (!existsSync(specifyDir)) return;

  let sprintDirs: Dirent<string>[];
  try {
    sprintDirs = readdirSync(specifyDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const sprintDir of sprintDirs) {
    if (!sprintDir.isDirectory()) continue;
    const attestationsDir = join(specifyDir, sprintDir.name, 'attestations');
    if (!existsSync(attestationsDir)) continue;

    let taskDirs: Dirent<string>[];
    try {
      taskDirs = readdirSync(attestationsDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const taskDir of taskDirs) {
      if (!taskDir.isDirectory()) continue;
      const taskId = taskDir.name;
      const taskPath = join(attestationsDir, taskId);

      enrichFromAttestationFile(taskMap, taskId, join(taskPath, 'attestation.json'));
      enrichFromContextAck(taskMap, taskId, join(taskPath, 'context_ack.json'));
    }
  }
}

/**
 * Extract file paths from a single task metric JSON
 */
function enrichFromMetricJson(taskMap: TaskFileMap, taskId: string, jsonPath: string): void {
  const data = readJsonSafe(jsonPath);
  if (!data?.artifacts) return;

  const artifacts = data.artifacts as Record<string, unknown>;
  ensureTaskEntry(taskMap, taskId);

  // Only read artifacts.created (verified files with hashes), NOT artifacts.expected
  // (which contains planned paths that may never have been created).
  // The CSV Artifacts To Track column already provides expected paths.
  if (Array.isArray(artifacts.created)) {
    for (const item of artifacts.created) {
      const p = typeof item === 'string' ? item : (item as Record<string, string>).path;
      // Skip directory paths (ending with /) — they can't match individual files
      if (p && !p.endsWith('/')) addUniquePath(taskMap[taskId].expectedArtifacts, p);
    }
  }
}

/**
 * Recursively walk metric directories for task JSON files
 */
function walkMetricDir(dir: string, taskMap: TaskFileMap): void {
  let entries: Dirent<string>[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMetricDir(fullPath, taskMap);
    } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('_')) {
      const taskId = entry.name.replace('.json', '');
      enrichFromMetricJson(taskMap, taskId, fullPath);
    }
  }
}

/**
 * Scan metric JSON files for artifact references
 */
function enrichFromMetricJsons(taskMap: TaskFileMap): void {
  const metricsBaseDir = join(MONOREPO_ROOT, 'apps', 'project-tracker', 'docs', 'metrics');
  if (!existsSync(metricsBaseDir)) return;

  let dirs: Dirent<string>[];
  try {
    dirs = readdirSync(metricsBaseDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const dir of dirs) {
    if (dir.isDirectory() && dir.name.startsWith('sprint-')) {
      walkMetricDir(join(metricsBaseDir, dir.name), taskMap);
    }
  }
}

/**
 * Enrich the task file map with references from evidence sources beyond Sprint_plan.csv.
 * Scans attestation JSONs, context ack files, and metric task JSONs.
 */
export function enrichFromEvidenceSources(taskMap: TaskFileMap): void {
  enrichFromAttestations(taskMap);
  enrichFromMetricJsons(taskMap);
}

// =============================================================================
// FILE-TASK MAPPING
// =============================================================================

export interface TaskFileMap {
  [taskId: string]: {
    expectedArtifacts: string[];
    expectedEvidence: string[];
    requiredFiles: string[];
    expectedContext: string[];
    expectedPlan: string[];
    expectedSpec: string[];
    expectedAttestation: string[];
    status: string;
    section: string;
  };
}

export function buildTaskFileMap(
  tasks: Array<{
    id: string;
    artifacts: string[];
    prerequisites: string;
    validation: string;
    status: string;
    section: string;
  }>
): TaskFileMap {
  const map: TaskFileMap = {};

  for (const task of tasks) {
    const { artifacts, evidence, files, context, plan, spec, attestation } = parseTaskFileRefs(
      task.artifacts.join(','),
      task.prerequisites,
      task.validation
    );

    map[task.id] = {
      expectedArtifacts: artifacts,
      expectedEvidence: evidence,
      requiredFiles: files,
      expectedContext: context,
      expectedPlan: plan,
      expectedSpec: spec,
      expectedAttestation: attestation,
      status: task.status,
      section: task.section,
    };
  }

  return map;
}

function addTaskIdToPath(
  pathToTasks: Record<string, string[]>,
  normalizedPath: string,
  taskId: string
): void {
  if (!pathToTasks[normalizedPath]) {
    pathToTasks[normalizedPath] = [];
  }
  if (!pathToTasks[normalizedPath].includes(taskId)) {
    pathToTasks[normalizedPath].push(taskId);
  }
}

function linkGlobPath(
  path: string,
  taskId: string,
  files: FileEntry[],
  pathToTasks: Record<string, string[]>
): void {
  const normalizedPath = path.replaceAll('\\', '/').toLowerCase();
  // Replace ** first with placeholder to avoid single-* replacing the * in .*
  const regexPattern = normalizedPath
    .replaceAll('.', String.raw`\.`)
    .replaceAll('**', '\x00GLOBSTAR\x00')
    .replaceAll('*', '[^/]*')
    .replaceAll('\x00GLOBSTAR\x00', '.*');
  const regex = new RegExp(`^${regexPattern}$`, 'i');

  for (const file of files) {
    if (regex.test(file.path.toLowerCase())) {
      addTaskIdToPath(pathToTasks, file.path, taskId);
    }
  }
}

export function linkFilesToTasks(files: FileEntry[], taskMap: TaskFileMap): FileEntry[] {
  const pathToTasks: Record<string, string[]> = {};

  for (const [taskId, data] of Object.entries(taskMap)) {
    const allPaths = [
      ...data.expectedArtifacts,
      ...data.expectedEvidence,
      ...data.requiredFiles,
      ...data.expectedContext,
      ...data.expectedPlan,
      ...data.expectedSpec,
      ...data.expectedAttestation,
    ];

    for (const path of allPaths) {
      if (path.includes('*')) {
        linkGlobPath(path, taskId, files, pathToTasks);
      } else {
        const normalizedPath = path.replaceAll('\\', '/').toLowerCase();
        addTaskIdToPath(pathToTasks, normalizedPath, taskId);
      }
    }
  }

  return files.map((file) => {
    const linkedTasks = pathToTasks[file.path.toLowerCase()] || [];
    return {
      ...file,
      linkedTasks,
      isOrphan: linkedTasks.length === 0,
    };
  });
}

// =============================================================================
// TEST COVERAGE DETECTION
// =============================================================================

function addTestCoverage(files: FileEntry[]): FileEntry[] {
  const testFiles = new Set(
    files
      .filter((f) => f.isTestFile)
      .map((f) => {
        // Convert test path to source path
        return f.path
          .replaceAll('.test.ts', '.ts')
          .replaceAll('.test.tsx', '.tsx')
          .replaceAll('.spec.ts', '.ts')
          .replaceAll('.spec.tsx', '.tsx')
          .replaceAll('__tests__/', '')
          .toLowerCase();
      })
  );

  return files.map((file) => {
    if (file.category === 'app-source' || file.category === 'package-source') {
      const hasTest =
        testFiles.has(file.path.toLowerCase()) ||
        testFiles.has(file.path.replaceAll('\\', '/').toLowerCase());
      return { ...file, hasTest };
    }
    return file;
  });
}

// =============================================================================
// MISSING FILE DETECTION
// =============================================================================

const ACTIVE_STATUSES = new Set(['Completed', 'In Progress', 'Validating']);

function getTaskCheckPaths(
  data: TaskFileMap[string]
): Array<{ paths: string[]; prefix: MissingFile['prefix'] }> {
  return [
    { paths: data.expectedArtifacts, prefix: 'ARTIFACT' },
    { paths: data.expectedEvidence, prefix: 'EVIDENCE' },
    { paths: data.requiredFiles, prefix: 'FILE' },
    { paths: data.expectedContext, prefix: 'CONTEXT' },
    { paths: data.expectedPlan, prefix: 'PLAN' },
    { paths: data.expectedSpec, prefix: 'SPEC' },
    { paths: data.expectedAttestation, prefix: 'ATTESTATION' },
  ];
}

function recordMissingPath(
  missing: MissingFile[],
  expectedPath: string,
  taskId: string,
  prefix: MissingFile['prefix']
): void {
  const normalizedPath = expectedPath.replaceAll('\\', '/').toLowerCase();
  const existing = missing.find((m) => m.path.toLowerCase() === normalizedPath);
  if (existing) {
    if (!existing.expectedBy.includes(taskId)) {
      existing.expectedBy.push(taskId);
    }
  } else {
    missing.push({ path: expectedPath, expectedBy: [taskId], prefix });
  }
}

function checkPathGroup(
  paths: string[],
  prefix: MissingFile['prefix'],
  taskId: string,
  existingPaths: Set<string>,
  missing: MissingFile[]
): void {
  for (const expectedPath of paths) {
    if (expectedPath.includes('*')) continue;
    const normalizedPath = expectedPath.replaceAll('\\', '/').toLowerCase();
    if (!existingPaths.has(normalizedPath)) {
      recordMissingPath(missing, expectedPath, taskId, prefix);
    }
  }
}

export function findMissingFiles(files: FileEntry[], taskMap: TaskFileMap): MissingFile[] {
  const missing: MissingFile[] = [];
  const existingPaths = new Set(files.map((f) => f.path.toLowerCase()));

  for (const [taskId, data] of Object.entries(taskMap)) {
    if (!ACTIVE_STATUSES.has(data.status)) continue;
    for (const { paths, prefix } of getTaskCheckPaths(data)) {
      checkPathGroup(paths, prefix, taskId, existingPaths, missing);
    }
  }

  return missing;
}

// =============================================================================
// PATH-BASED EVIDENCE FILE LINKING
// =============================================================================

// =============================================================================
// INFRA FILE LINKING — Verified task attribution from attestations/CSV/headers
// =============================================================================

/** Supabase migration files → task IDs (from file headers and attestation hashes) */
const SUPABASE_MIGRATION_TASKS: Record<string, string> = {
  '20250101000000_initial_schema.sql': 'ENV-004-AI',
  '20250122000000_enable_rls.sql': 'IFC-072',
  '20250123000000_rls_helper_functions.sql': 'IFC-072',
  '20250124000000_rls_policies.sql': 'IFC-072',
  '20250125000000_gdpr_rls_policies.sql': 'IFC-058',
  '20250126000000_storage_buckets.sql': 'ENV-004-AI',
  '20260103000000_add_tenant_isolation.sql': 'IFC-127',
  '20260103000001_update_rls_policies.sql': 'IFC-127',
  '20260104000000_conversation_rls.sql': 'IFC-148',
  '20260104000001_case_document_fts_embeddings.sql': 'IFC-136',
  '20260109000000_contact_extended_fields.sql': 'IFC-089',
  '20260122000000_move_vector_to_extensions_schema.sql': 'ENV-004-AI',
  '20260122100000_add_missing_constraints.sql': 'ENV-004-AI',
  '20260126000000_lead_conversion_audit.sql': 'IFC-061',
  '20260204000000_ai_output_review_rls.sql': 'IFC-178',
  '20260204000001_ai_output_review_tables.sql': 'IFC-178',
  '20260204000002_auth_helpers.sql': 'IFC-127',
  '20260214000003_fix_chain_versions_schema_drift.sql': 'ENV-006-AI',
};

function linkSupabaseFile(file: FileEntry): FileEntry {
  const p = file.path;
  const fileName = p.split('/').pop() || '';

  if (p.includes('/migrations/')) {
    const task = SUPABASE_MIGRATION_TASKS[fileName];
    if (task) return { ...file, linkedTasks: [task], isOrphan: false };
    return { ...file, linkedTasks: ['ENV-004-AI'], isOrphan: false };
  }
  if (p.includes('/schema-snapshots/')) {
    return { ...file, linkedTasks: ['ENV-004-AI'], isOrphan: false };
  }
  if (fileName === 'rls-policies.sql') {
    return { ...file, linkedTasks: ['IFC-072', 'IFC-127'], isOrphan: false };
  }
  return { ...file, linkedTasks: ['ENV-004-AI'], isOrphan: false };
}

/** Link an infra/docker/ file — ENV-003-AI for most, IFC-085 for Ollama files. */
function linkInfraDockerFile(file: FileEntry): FileEntry {
  if (file.path.includes('ollama')) {
    return { ...file, linkedTasks: ['IFC-085'], isOrphan: false };
  }
  return { ...file, linkedTasks: ['ENV-003-AI'], isOrphan: false };
}

/** Link an infra/monitoring/ file — IFC-117/163/ENV-008-AI/ENV-015-AI or fallback EP-001-AI. */
function linkInfraMonitoringFile(file: FileEntry): FileEntry {
  const p = file.path;
  if (p.includes('ai-grafana-dashboard') || p.includes('ai-prometheus-rules')) {
    return { ...file, linkedTasks: ['IFC-117'], isOrphan: false };
  }
  if (p.includes('workers.json')) {
    return { ...file, linkedTasks: ['IFC-163'], isOrphan: false };
  }
  if (p.includes('intelliflow-alerts.yaml')) {
    return { ...file, linkedTasks: ['ENV-008-AI'], isOrphan: false };
  }
  if (p.includes('performance-budgets.json')) {
    return { ...file, linkedTasks: ['ENV-015-AI'], isOrphan: false };
  }
  return { ...file, linkedTasks: ['EP-001-AI'], isOrphan: false };
}

/**
 * Link an infra/ file to its verified task owner.
 * Every mapping below is backed by attestation hashes, CSV ARTIFACT entries,
 * or explicit task ID comments in the file headers.
 */
function linkInfraFile(file: FileEntry): FileEntry {
  const p = file.path;

  // terraform/ → IFC-075 (IaC with Terraform — all 20 files)
  if (p.startsWith('infra/terraform/')) {
    return { ...file, linkedTasks: ['IFC-075'], isOrphan: false };
  }
  // tls/ → IFC-113 (Secrets Management & Encryption — file headers say IMPLEMENTS: IFC-113)
  if (p.startsWith('infra/tls/')) {
    return { ...file, linkedTasks: ['IFC-113'], isOrphan: false };
  }
  // easypanel/ → EP-001-AI (EasyPanel Internal Tools Deployment)
  if (p.startsWith('infra/easypanel/')) {
    return { ...file, linkedTasks: ['EP-001-AI'], isOrphan: false };
  }
  // dns/ → IFC-144 (Inbound/Outbound Email — SPF/DKIM/DMARC records)
  if (p.startsWith('infra/dns/')) {
    return { ...file, linkedTasks: ['IFC-144'], isOrphan: false };
  }
  // docker/ → ENV-003-AI (Docker Environment), except Ollama → IFC-085
  if (p.startsWith('infra/docker/')) {
    return linkInfraDockerFile(file);
  }
  // security/ — per-file attribution
  if (p === 'infra/security/trivy.yaml') {
    return { ...file, linkedTasks: ['IFC-134'], isOrphan: false };
  }
  if (p === 'infra/security/dependency-check.yaml') {
    return { ...file, linkedTasks: ['IFC-132'], isOrphan: false };
  }
  if (p === 'infra/security/mtls-config.yaml') {
    return { ...file, linkedTasks: ['IFC-113'], isOrphan: false };
  }
  // monitoring/ — mostly EP-001-AI with specific exceptions
  if (p.startsWith('infra/monitoring/')) {
    return linkInfraMonitoringFile(file);
  }
  // supabase/ — per-migration task attribution
  if (p.startsWith('infra/supabase/')) {
    return linkSupabaseFile(file);
  }

  return file; // unmatched infra file stays orphan
}

// =============================================================================
// ROOT FILE LINKING — Config, docs, and dotfiles at repo root
// =============================================================================

/** Root config files → task attribution */
const ROOT_FILE_TASKS: Record<string, string> = {
  // Monorepo setup — ENV-001-AI
  'package.json': 'ENV-001-AI',
  'pnpm-lock.yaml': 'ENV-001-AI',
  'pnpm-workspace.yaml': 'ENV-001-AI',
  'turbo.json': 'ENV-001-AI',
  'README.md': 'ENV-001-AI',
  'SETUP.md': 'ENV-001-AI',
  'QUICK-START.md': 'ENV-001-AI',
  '.gitignore': 'ENV-001-AI',
  '.env.example': 'ENV-001-AI',

  // Linting/tooling — ENV-002-AI
  'eslint.config.mjs': 'ENV-002-AI',
  'tsconfig.json': 'ENV-002-AI',
  'vitest.config.ts': 'ENV-002-AI',
  '.prettierrc': 'ENV-002-AI',
  '.prettierignore': 'ENV-002-AI',
  '.browserslistrc': 'ENV-002-AI',
  '.depcheckrc': 'ENV-002-AI',
  '.dependency-cruiser.cjs': 'ENV-002-AI',
  'knip.json': 'ENV-002-AI',

  // Docker — ENV-003-AI
  'docker-compose.yml': 'ENV-003-AI',
  'docker-compose.sonarqube.yml': 'ENV-003-AI',
  'docker-compose.ollama.yml': 'IFC-085',

  // Security — EXC-SEC-001
  '.gitguardian.yaml': 'EXC-SEC-001',
  '.gitleaks.toml': 'EXC-SEC-001',
  'SECURITY.md': 'EXC-SEC-001',

  // SonarQube — ENV-009-AI
  'sonar-project.properties': 'ENV-009-AI',
  'sonar-small-rules.json': 'ENV-009-AI',

  // Lighthouse — PG-166
  'lighthouserc.js': 'PG-166',
  'lighthouserc.authenticated.js': 'PG-166',

  // Playwright — PG-164
  'playwright.config.ts': 'PG-164',

  // AI tooling docs
  'AGENTS.md': 'AI-SETUP-001',
  'CLAUDE.md': 'AI-SETUP-001',
  'GEMINI.md': 'AI-SETUP-001',

  // Project documentation
  'TRPC_QUICKSTART.md': 'IFC-004',
  'audit-cutover.yml': 'AUTOMATION-001',
  'audit-matrix.yml': 'AUTOMATION-001',
};

/**
 * Link a root-level file (no directory prefix) to its task.
 */
function linkRootFile(file: FileEntry): FileEntry {
  const fileName = file.path.split('/').pop() || '';
  const task = ROOT_FILE_TASKS[fileName];
  if (task) {
    return { ...file, linkedTasks: [task], isOrphan: false };
  }
  // Remaining root files stay orphan (genuinely untracked: as-unknown-fake-types.txt, etc.)
  return file;
}

/**
 * Link root-level supabase/ files (Supabase CLI local dir).
 * Migrations here mirror infra/supabase/ — use same task mapping.
 */
function linkRootSupabaseFile(file: FileEntry): FileEntry {
  const p = file.path;
  const fileName = p.split('/').pop() || '';

  if (p.includes('/migrations/')) {
    const task = SUPABASE_MIGRATION_TASKS[fileName];
    if (task) return { ...file, linkedTasks: [task], isOrphan: false };
    return { ...file, linkedTasks: ['ENV-004-AI'], isOrphan: false };
  }

  // Config and other supabase CLI files
  return { ...file, linkedTasks: ['ENV-004-AI'], isOrphan: false };
}

/**
 * Link .github/ files to CI/CD tasks.
 */
function linkGitHubFile(file: FileEntry): FileEntry {
  const p = file.path;
  // Workflows → AUTOMATION-001 (AI agent coordination / CI setup)
  if (p.includes('/workflows/')) {
    return { ...file, linkedTasks: ['AUTOMATION-001'], isOrphan: false };
  }
  // Other .github files (CODEOWNERS, PR templates, etc.)
  return { ...file, linkedTasks: ['AUTOMATION-001'], isOrphan: false };
}

/** Convention-enforcement hooks created by IFC-160 (Artifact Path Conventions + CI Lint) */
const IFC160_HOOKS = new Set(['git-destructive-guard.mjs', 'csv-status-guard.mjs']);

/**
 * Link a .claude/ file to the correct task:
 * - ralph-loops/*.local.md → per-task ID extracted from filename
 * - hooks that enforce conventions → IFC-160
 * - everything else → AI-SETUP-001 (created the .claude/ infrastructure)
 */
function linkClaudeFile(file: FileEntry): FileEntry {
  const p = file.path;
  const fileName = p.split('/').pop() || '';

  // ralph-loops/ files have task IDs in their filenames (e.g., IFC-030.local.md)
  if (p.startsWith('.claude/ralph-loops/')) {
    const taskId = extractTaskIdFromMessage(fileName);
    if (taskId) {
      return { ...file, linkedTasks: [taskId], isOrphan: false };
    }
    // Non-task ralph files (e.g., fix-errs.local.md, sonar-fix.local.md)
    return { ...file, linkedTasks: ['AI-SETUP-001'], isOrphan: false };
  }

  // Convention-enforcement hooks → IFC-160
  if (p.startsWith('.claude/hooks/') && IFC160_HOOKS.has(fileName)) {
    return { ...file, linkedTasks: ['IFC-160'], isOrphan: false };
  }

  // All other .claude/ files → AI-SETUP-001 (Phase 1: AI Foundation)
  return { ...file, linkedTasks: ['AI-SETUP-001'], isOrphan: false };
}

/** Link a .specify/ file — extract task ID from path or delegate to infra helper. */
function linkSpecifyFileByPath(file: FileEntry): FileEntry {
  const taskId = extractTaskIdFromMessage(file.path);
  if (taskId) {
    return { ...file, linkedTasks: [taskId], isOrphan: false };
  }
  return linkSpecifyInfraFile(file);
}

/** Link a docs/metrics/sprint-* JSON file by extracting its task ID from the path. */
function linkMetricJsonFile(file: FileEntry): FileEntry {
  const p = file.path;
  if (!p.includes('docs/metrics/sprint-')) return file;
  const fileName = p.split('/').pop() || '';
  if (fileName.startsWith('_')) return file;
  const taskId = extractTaskIdFromMessage(p);
  if (taskId) {
    return { ...file, linkedTasks: [taskId], isOrphan: false };
  }
  return file;
}

/**
 * Link evidence files (.specify/, metric JSONs, .claude/) to tasks by extracting
 * task IDs from their file paths. Runs after linkFilesToTasks() to pick up
 * files not explicitly referenced in Sprint_plan.csv.
 */
export function linkEvidenceFilesByPath(files: FileEntry[]): FileEntry[] {
  return files.map((file) => {
    if (!file.isOrphan) return file;

    const p = file.path;

    // .claude/ → AI-SETUP-001 / per-task ralph-loops / IFC-160 convention hooks
    if (p.startsWith('.claude/')) return linkClaudeFile(file);

    // .agents/skills/ → AI-SETUP-001 (same skills as .claude/skills/, symlinked)
    if (p.startsWith('.agents/')) {
      return { ...file, linkedTasks: ['AI-SETUP-001'], isOrphan: false };
    }

    // .husky/ → ENV-002-AI (linting/tooling git hooks)
    if (p.startsWith('.husky/')) {
      return { ...file, linkedTasks: ['ENV-002-AI'], isOrphan: false };
    }

    // .github/ → linked to CI/CD tasks
    if (p.startsWith('.github/')) return linkGitHubFile(file);

    // infra/ → verified per-file task attribution from attestations and file headers
    if (p.startsWith('infra/')) return linkInfraFile(file);

    // Root-level supabase/ migrations (Supabase CLI local dir, separate from infra/supabase/)
    if (p.startsWith('supabase/')) return linkRootSupabaseFile(file);

    // apps/project-tracker/ → EXP-REPORTS-004 (Sprint Audit System)
    if (p.startsWith('apps/project-tracker/')) {
      return { ...file, linkedTasks: ['EXP-REPORTS-004'], isOrphan: false };
    }

    // Root-level config/doc files
    if (file.directory === 'root' && !p.includes('/')) return linkRootFile(file);

    // .specify/ files — extract task ID or link to infrastructure task
    if (p.startsWith('.specify/')) return linkSpecifyFileByPath(file);

    // Metric JSONs — extract task ID from path
    return linkMetricJsonFile(file);
  });
}

/**
 * Link .specify/ infrastructure files (summaries, codex manifests, reports, memory)
 * that don't have a task ID in their path.
 */
function linkSpecifyInfraFile(file: FileEntry): FileEntry {
  const p = file.path;

  // .specify/memory/ → AI-SETUP-001 (AI tooling memory/context)
  if (p.startsWith('.specify/memory/')) {
    return { ...file, linkedTasks: ['AI-SETUP-001'], isOrphan: false };
  }
  // Sprint summaries → EXP-REPORTS-004 (sprint audit infrastructure)
  if (p.endsWith('_summary.json')) {
    return { ...file, linkedTasks: ['EXP-REPORTS-004'], isOrphan: false };
  }
  // Codex orchestration manifests → AUTOMATION-001
  if (p.includes('/codex-run/') || p.includes('/codex/')) {
    return { ...file, linkedTasks: ['AUTOMATION-001'], isOrphan: false };
  }
  // Code review reports → EXP-REPORTS-004
  if (p.includes('/reports/')) {
    return { ...file, linkedTasks: ['EXP-REPORTS-004'], isOrphan: false };
  }
  // Planning files without task IDs → AUTOMATION-001
  if (p.includes('/planning/')) {
    return { ...file, linkedTasks: ['AUTOMATION-001'], isOrphan: false };
  }
  // Execution logs without task IDs → AUTOMATION-001
  if (p.includes('/execution/')) {
    return { ...file, linkedTasks: ['AUTOMATION-001'], isOrphan: false };
  }

  return file;
}

// =============================================================================
// LINK PROPAGATION — Reduce false-positive orphans
// =============================================================================

/** Next.js App Router convention files that inherit their directory's task links */
const FRAMEWORK_FILES = new Set([
  'layout.tsx',
  'layout.ts',
  'layout.js',
  'loading.tsx',
  'error.tsx',
  'not-found.tsx',
  'template.tsx',
  'default.tsx',
  'global-error.tsx',
  'opengraph-image.tsx',
  'icon.tsx',
  'manifest.ts',
  'robots.ts',
  'sitemap.ts',
]);

/** Package/directory infrastructure files */
const DIR_INFRA_FILES = new Set([
  'package.json',
  'tsconfig.json',
  'tsconfig.build.json',
  'vitest.config.ts',
  'vitest.config.mts',
  'index.ts',
  'index.tsx',
  'index.js',
  'CLAUDE.md',
  'README.md',
  '.eslintrc.js',
  '.eslintrc.cjs',
  'eslint.config.js',
  'eslint.config.mjs',
  'tailwind.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
  'postcss.config.mjs',
  'next.config.ts',
  'next.config.js',
  'next.config.mjs',
]);

/**
 * Build a map of directory -> aggregated task IDs from linked files in that dir
 */
function buildLinkedDirMap(files: FileEntry[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const file of files) {
    if (file.isOrphan || file.linkedTasks.length === 0) continue;
    const dir = file.path.substring(0, file.path.lastIndexOf('/'));
    if (!dir) continue;
    let tasks = map.get(dir);
    if (!tasks) {
      tasks = [];
      map.set(dir, tasks);
    }
    for (const t of file.linkedTasks) {
      if (!tasks.includes(t)) tasks.push(t);
    }
  }
  return map;
}

/**
 * Derive the source file path from a test file path
 */
function deriveSourceFromTest(testPath: string): string {
  return testPath
    .replace(/__tests__\//, '')
    .replace(/\.test\.tsx?$/, (m) => m.replace('.test', ''))
    .replace(/\.spec\.tsx?$/, (m) => m.replace('.spec', ''));
}

/**
 * Propagate REAL task links to genuinely related files:
 * - Co-located Next.js framework files (layout.tsx, loading.tsx, etc.) inherit from dir
 * - Infrastructure files (package.json, tsconfig.json, index.ts) in dirs with linked files
 * - Test files inherit from their source file's task links
 * All propagated links use REAL task IDs — no synthetic labels
 */
export function propagateTaskLinks(files: FileEntry[]): FileEntry[] {
  // Build lookup structures
  const linkedDirTasks = buildLinkedDirMap(files);
  const sourcePathToTasks = new Map<string, string[]>();

  for (const file of files) {
    if (!file.isOrphan && !file.isTestFile) {
      sourcePathToTasks.set(file.path.toLowerCase(), file.linkedTasks);
    }
  }

  // Phase 1: Apply rules per file
  const result = files.map((file) => {
    if (!file.isOrphan) return file;

    const dir = file.path.substring(0, file.path.lastIndexOf('/'));
    const fileName = file.path.substring(file.path.lastIndexOf('/') + 1);
    const dirTasks = linkedDirTasks.get(dir);

    // Rule 1: Co-located framework files inherit directory tasks
    if (dirTasks && FRAMEWORK_FILES.has(fileName)) {
      return { ...file, linkedTasks: dirTasks, isOrphan: false };
    }

    // Rule 4: Infrastructure files in linked directories
    if (dirTasks && DIR_INFRA_FILES.has(fileName)) {
      return { ...file, linkedTasks: dirTasks, isOrphan: false };
    }

    // Rule 5: Test files — inherit from source or parent directory
    if (file.isTestFile) {
      // Try direct source match
      const sourcePath = deriveSourceFromTest(file.path);
      const sourceTasks = sourcePathToTasks.get(sourcePath.toLowerCase());
      if (sourceTasks) {
        return { ...file, linkedTasks: sourceTasks, isOrphan: false };
      }
      // Try parent dir (for __tests__/ subdirectories)
      const parentDir = dir.replace(/\/__tests__$/, '');
      const parentTasks = linkedDirTasks.get(parentDir);
      if (parentTasks) {
        return { ...file, linkedTasks: parentTasks, isOrphan: false };
      }
    }

    return file;
  });

  return result;
}

// =============================================================================
// AUDIT SIGNALS — Orphan quality analysis
// =============================================================================

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const IMPORT_RE = /(?:from|require\()\s*['"]([^'"]+)['"]/g;

/** Add all artifact_hashes keys from one task's attestation.json into `paths`. */
function collectAttestationPathsFromTask(
  attDir: string,
  taskDir: Dirent,
  paths: Set<string>
): void {
  const attFile = join(attDir, taskDir.name, 'attestation.json');
  const data = readJsonSafe(attFile);
  if (!data) return;
  const hashes = data.artifact_hashes;
  if (hashes && typeof hashes === 'object' && !Array.isArray(hashes)) {
    for (const p of Object.keys(hashes as Record<string, string>)) {
      paths.add(p.toLowerCase());
    }
  }
}

/** Add all attestation paths from one sprint directory into `paths`. */
function collectAttestationPathsFromSprint(
  specifyDir: string,
  sprintDir: Dirent,
  paths: Set<string>
): void {
  const attDir = join(specifyDir, sprintDir.name, 'attestations');
  if (!existsSync(attDir)) return;
  for (const taskDir of readdirSync(attDir, { withFileTypes: true })) {
    if (!taskDir.isDirectory()) continue;
    collectAttestationPathsFromTask(attDir, taskDir, paths);
  }
}

/**
 * Build a set of all file paths mentioned in any attestation artifact_hashes.
 * Used to determine if an orphan was created through proper exec pipeline.
 */
function buildAttestationPathSet(): Set<string> {
  const paths = new Set<string>();
  const specifyDir = join(MONOREPO_ROOT, '.specify', 'sprints');
  if (!existsSync(specifyDir)) return paths;

  try {
    for (const sprintDir of readdirSync(specifyDir, { withFileTypes: true })) {
      if (!sprintDir.isDirectory()) continue;
      collectAttestationPathsFromSprint(specifyDir, sprintDir, paths);
    }
  } catch {
    // Skip on read errors
  }
  return paths;
}

/**
 * Build a set of basenames imported by linked source files.
 * Regex-based — covers `import from '...'` and `require('...')`.
 */
function _buildImportedBasenames(files: FileEntry[]): Set<string> {
  const imported = new Set<string>();

  for (const file of files) {
    if (file.isOrphan || !SOURCE_EXTS.has(file.extension)) continue;

    let content: string;
    try {
      content = readFileSync(file.absolutePath, 'utf-8');
    } catch {
      continue;
    }

    IMPORT_RE.lastIndex = 0;
    let match;
    while ((match = IMPORT_RE.exec(content)) !== null) {
      const importPath = match[1];
      // Extract the last segment (basename) of the import path
      const segments = importPath.split('/');
      const basename = segments[segments.length - 1].replace(/\.[jt]sx?$/, ''); // strip extension if present
      if (basename && !basename.startsWith('.')) {
        imported.add(basename.toLowerCase());
      }
      // Also add full last two segments for scoped imports like @intelliflow/domain
      if (segments.length >= 2) {
        imported.add(
          segments
            .slice(-2)
            .join('/')
            .replace(/\.[jt]sx?$/, '')
            .toLowerCase()
        );
      }
    }
  }
  return imported;
}

/**
 * Build a map of filename -> list of full paths for duplicate detection.
 */
function buildDuplicateMap(files: FileEntry[]): Map<string, string[]> {
  const byName = new Map<string, string[]>();
  for (const file of files) {
    const name = file.path.split('/').pop() || '';
    if (
      !name ||
      name === 'index.ts' ||
      name === 'index.tsx' ||
      name === 'page.tsx' ||
      name === 'layout.tsx' ||
      name === 'route.ts' ||
      name === 'README.md' ||
      name === 'package.json' ||
      name === 'tsconfig.json' ||
      name === 'CLAUDE.md'
    ) {
      continue; // Skip ubiquitous filenames
    }
    let list = byName.get(name);
    if (!list) {
      list = [];
      byName.set(name, list);
    }
    list.push(file.path);
  }
  return byName;
}

/**
 * Compute audit signals for all orphan files.
 * Main scan: hasAttestation, duplicateNames, daysSinceModified (cheap).
 * isImported is computed separately via computeImportSignals() to avoid
 * reading thousands of files on every scan.
 */
export function computeAuditSignals(files: FileEntry[]): FileEntry[] {
  const attestedPaths = buildAttestationPathSet();
  const duplicateMap = buildDuplicateMap(files);
  const now = Date.now();

  return files.map((file) => {
    if (!file.isOrphan) return file;

    const fileLower = file.path.toLowerCase();
    const fileName = file.path.split('/').pop() || '';

    const hasAttestation = attestedPaths.has(fileLower);

    const allWithName = duplicateMap.get(fileName) || [];
    const duplicateNames = allWithName.filter((p) => p !== file.path);

    const daysSinceModified = Math.floor(
      (now - new Date(file.lastModified).getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      ...file,
      auditSignals: {
        hasAttestation,
        isImported: false, // Set by computeImportSignals() when requested
        duplicateNames,
        daysSinceModified,
      },
    };
  });
}

/** Collect all directories (and their parents) that contain source orphan files. */
function collectOrphanDirs(files: FileEntry[]): Set<string> {
  const orphanDirs = new Set<string>();
  for (const f of files) {
    if (!f.isOrphan || !SOURCE_EXTS.has(f.extension)) continue;
    const dir = f.path.substring(0, f.path.lastIndexOf('/'));
    orphanDirs.add(dir);
    // Also add parent dir for __tests__/ cases
    const parent = dir.substring(0, dir.lastIndexOf('/'));
    if (parent) orphanDirs.add(parent);
  }
  return orphanDirs;
}

/**
 * Scan linked source files that live in or near orphan directories and collect
 * the basenames they import. Limits file I/O to directories that matter.
 */
function collectImportedBasenamesNearOrphans(
  files: FileEntry[],
  orphanDirs: Set<string>
): Set<string> {
  const importedBasenames = new Set<string>();
  for (const file of files) {
    if (file.isOrphan || !SOURCE_EXTS.has(file.extension)) continue;
    const dir = file.path.substring(0, file.path.lastIndexOf('/'));
    if (!orphanDirs.has(dir)) continue;

    let content: string;
    try {
      content = readFileSync(file.absolutePath, 'utf-8');
    } catch {
      continue;
    }

    IMPORT_RE.lastIndex = 0;
    let match;
    while ((match = IMPORT_RE.exec(content)) !== null) {
      const segments = match[1].split('/');
      const basename = segments[segments.length - 1].replace(/\.[jt]sx?$/, '');
      if (basename) importedBasenames.add(basename.toLowerCase());
    }
  }
  return importedBasenames;
}

/**
 * Compute isImported signal for orphan files by scanning linked source files
 * for import statements. Only reads files in directories that contain orphans
 * to limit I/O. Call separately from the main scan (e.g., on orphan tab load).
 */
export function computeImportSignals(files: FileEntry[]): FileEntry[] {
  const orphanDirs = collectOrphanDirs(files);
  const importedBasenames = collectImportedBasenamesNearOrphans(files, orphanDirs);

  return files.map((file) => {
    if (!file.isOrphan || !file.auditSignals) return file;
    const fileName = file.path.split('/').pop() || '';
    const fileStem = fileName.replace(/\.[^.]+$/, '').toLowerCase();
    const isImported = importedBasenames.has(fileStem);
    return {
      ...file,
      auditSignals: { ...file.auditSignals, isImported },
    };
  });
}

// =============================================================================
// CLEANUP SUGGESTIONS
// =============================================================================

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const LARGE_FILE_THRESHOLD = 1024 * 1024; // 1MB

function buildOrphanSuggestions(file: FileEntry, now: number): CleanupSuggestion[] {
  const suggestions: CleanupSuggestion[] = [];

  if (file.size > LARGE_FILE_THRESHOLD) {
    suggestions.push({
      path: file.path,
      reason: `Large orphan file (${(file.size / 1024 / 1024).toFixed(2)} MB) not linked to any task`,
      category: 'large-file',
      size: file.size,
      lastModified: file.lastModified,
      priority: file.size > LARGE_FILE_THRESHOLD * 10 ? 'high' : 'medium',
    });
  }

  const fileAge = now - new Date(file.lastModified).getTime();
  if (fileAge > ONE_MONTH_MS && file.directory === 'artifacts') {
    suggestions.push({
      path: file.path,
      reason: `Stale artifact not modified in ${Math.floor(fileAge / (24 * 60 * 60 * 1000))} days`,
      category: 'stale',
      size: file.size,
      lastModified: file.lastModified,
      priority: 'low',
    });
  }

  if (file.directory === 'artifacts' && file.size > 0) {
    suggestions.push({
      path: file.path,
      reason: 'Artifact not linked to any task in Sprint_plan.csv',
      category: 'orphan',
      size: file.size,
      lastModified: file.lastModified,
      priority: 'medium',
    });
  }

  return suggestions;
}

export function generateCleanupSuggestions(files: FileEntry[]): CleanupSuggestion[] {
  const suggestions: CleanupSuggestion[] = [];
  const now = Date.now();

  for (const file of files) {
    if (file.isOrphan) {
      suggestions.push(...buildOrphanSuggestions(file, now));
    }
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return suggestions.sort((a, b) => {
    const priDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    return priDiff === 0 ? b.size - a.size : priDiff;
  });
}

// =============================================================================
// GIT HISTORY ENRICHMENT
// =============================================================================

const TASK_ID_PATTERNS = [
  /\b(IFC-\d+)/i,
  /\b(ENV-\d+-AI)/i,
  /\b(EXC-[A-Z]+-\d+)/i,
  /\b(AI-SETUP-\d+)/i,
  /\b(AUTOMATION-\d+)/i,
  /\b(PG-\d+)/i,
  /\b(GOV-\d+)/i,
  /\b(DOC-\d+)/i,
  /\b(BRAND-\d+)/i,
  /\b(GTM-\d+)/i,
  /\b(SALES-\d+)/i,
  /\b(PM-OPS-\d+)/i,
  /\b(ENG-OPS-\d+)/i,
  /\b(ANALYTICS-\d+)/i,
  /\b(EP-\d+-AI)/i,
  /\b(EXP-[A-Z]+-\d+)/i,
  /\b(TRACK-\d+)/i,
];

function extractTaskIdFromMessage(message: string): string | null {
  for (const pattern of TASK_ID_PATTERNS) {
    const match = pattern.exec(message);
    if (match) {
      return match[1].toUpperCase();
    }
  }
  return null;
}

function runGitLog(args: string[]): string {
  try {
    return execFileSync(
      'git', // NOSONAR S4036 — PATH inherited from developer environment, internal tooling only
      args,
      { cwd: MONOREPO_ROOT, encoding: 'utf-8', timeout: 5000 }
    ).trim();
  } catch {
    return '';
  }
}

function parseGitLogLine(
  line: string
): { hash: string; date: string; author: string; subject: string } | null {
  const parts = line.split('|');
  if (parts.length < 4) return null;
  return {
    hash: parts[0] || '',
    date: parts[1] || '',
    author: parts[2] || '',
    subject: parts.slice(3).join('|') || '',
  };
}

function applyCreationInfo(
  history: NonNullable<FileEntry['gitHistory']>,
  relativePath: string
): void {
  const output = runGitLog([
    'log',
    '--follow',
    '--diff-filter=A',
    '--format=%H|%aI|%an|%s',
    '--',
    relativePath,
  ]);
  if (!output) return;
  const lines = output.split('\n');
  const parsed = parseGitLogLine(lines[lines.length - 1]);
  if (!parsed) return;
  history.createdCommit = parsed.hash || null;
  history.createdAt = parsed.date || null;
  history.createdBy = parsed.author || null;
  history.createdPurpose = parsed.subject || null;
  history.createdTaskId = parsed.subject ? extractTaskIdFromMessage(parsed.subject) : null;
}

function applyModificationInfo(
  history: NonNullable<FileEntry['gitHistory']>,
  relativePath: string,
  staleDays: number
): void {
  const output = runGitLog(['log', '-1', '--format=%H|%aI|%an|%s', '--', relativePath]);
  if (!output) return;
  const parsed = parseGitLogLine(output);
  if (!parsed) return;
  history.lastModifiedCommit = parsed.hash || null;
  history.lastModifiedBy = parsed.author || null;
  history.lastModifiedMessage = parsed.subject || null;
  if (parsed.date) {
    const diffMs = Date.now() - new Date(parsed.date).getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    history.daysSinceModified = days;
    if (days > staleDays) {
      history.isStale = true;
      history.staleReason = `Not modified in ${days} days`;
    }
  }
}

/**
 * Get git history for a single file
 */
function getGitHistoryForFile(
  relativePath: string,
  staleDays: number = 30
): FileEntry['gitHistory'] {
  const history: NonNullable<FileEntry['gitHistory']> = {
    createdAt: null,
    createdBy: null,
    createdCommit: null,
    createdPurpose: null,
    createdTaskId: null,
    lastModifiedBy: null,
    lastModifiedCommit: null,
    lastModifiedMessage: null,
    daysSinceModified: null,
    isStale: false,
    staleReason: null,
  };

  try {
    applyCreationInfo(history, relativePath);
    applyModificationInfo(history, relativePath, staleDays);
  } catch {
    // Git commands failed, leave history as null values
  }

  return history;
}

/**
 * Enrich file entries with git history metadata
 * Note: This is expensive - use sparingly (e.g., on filtered results)
 */
export function enrichWithGitHistory(files: FileEntry[], staleDays: number = 30): FileEntry[] {
  return files.map((file) => ({
    ...file,
    gitHistory: getGitHistoryForFile(file.path, staleDays),
  }));
}

/**
 * Batch enrich files with git history (more efficient for large sets)
 * Only enriches first N files to avoid timeout
 */
function _enrichWithGitHistoryBatch(
  files: FileEntry[],
  maxFiles: number = 100,
  staleDays: number = 30
): FileEntry[] {
  const toEnrich = files.slice(0, maxFiles);
  const enriched = enrichWithGitHistory(toEnrich, staleDays);

  // Return enriched files + remaining without history
  return [...enriched, ...files.slice(maxFiles)];
}

// =============================================================================
// HEALTH METRICS
// =============================================================================

const ALL_CATEGORIES: FileCategory[] = [
  'app-source',
  'package-source',
  'test-source',
  'attestation',
  'benchmark',
  'coverage',
  'report',
  'metric',
  'log',
  'generated',
  'ci-config',
  'infra-config',
  'tool-config',
  'claude-config',
  'docs',
  'readme',
  'tool',
  'script',
  'misc',
];

function getOrInitDirSummary(
  byDirectory: Map<DirectoryType, DirectorySummary>,
  dir: DirectoryType
): DirectorySummary {
  if (!byDirectory.has(dir)) {
    byDirectory.set(dir, {
      directory: dir,
      fileCount: 0,
      totalSize: 0,
      linkedCount: 0,
      orphanCount: 0,
      byExtension: {},
    });
  }
  return byDirectory.get(dir)!;
}

function accumulateFileStats(
  file: FileEntry,
  byCategory: Record<FileCategory, number>,
  byExtension: Record<string, number>,
  byDirectory: Map<DirectoryType, DirectorySummary>
): { totalSize: number; linked: number; orphan: number } {
  byCategory[file.category] = (byCategory[file.category] || 0) + 1;
  byExtension[file.extension] = (byExtension[file.extension] || 0) + 1;

  const dirSummary = getOrInitDirSummary(byDirectory, file.directory);
  dirSummary.fileCount++;
  dirSummary.totalSize += file.size;
  dirSummary.byExtension[file.extension] = (dirSummary.byExtension[file.extension] || 0) + 1;

  if (file.isOrphan) {
    dirSummary.orphanCount++;
    return { totalSize: file.size, linked: 0, orphan: 1 };
  } else {
    dirSummary.linkedCount++;
    return { totalSize: file.size, linked: 1, orphan: 0 };
  }
}

export function generateCodebaseHealth(files: FileEntry[], missing: MissingFile[]): CodebaseHealth {
  const byDirectory: Map<DirectoryType, DirectorySummary> = new Map();
  const byCategory: Record<FileCategory, number> = Object.fromEntries(
    ALL_CATEGORIES.map((cat) => [cat, 0])
  ) as Record<FileCategory, number>;
  const byExtension: Record<string, number> = {};

  let totalSize = 0;
  let linkedCount = 0;
  let orphanCount = 0;

  for (const file of files) {
    const stats = accumulateFileStats(file, byCategory, byExtension, byDirectory);
    totalSize += stats.totalSize;
    linkedCount += stats.linked;
    orphanCount += stats.orphan;
  }

  const sourceFiles = files.filter(
    (f) => f.category === 'app-source' || f.category === 'package-source'
  );
  const testCoverage =
    sourceFiles.length > 0
      ? (sourceFiles.filter((f) => f.hasTest).length / sourceFiles.length) * 100
      : 0;

  const packageDirs = new Set(
    files
      .filter((f) => f.directory === 'packages')
      .map((f) => f.path.split('/').slice(0, 2).join('/'))
  );
  const packageReadmes = files.filter(
    (f) => f.directory === 'packages' && f.path.toLowerCase().includes('readme.md')
  );
  const documentationCoverage =
    packageDirs.size > 0 ? (packageReadmes.length / packageDirs.size) * 100 : 0;

  return {
    totalFiles: files.length,
    totalSize,
    linkedFiles: linkedCount,
    orphanFiles: orphanCount,
    missingFiles: missing.length,
    documentationCoverage,
    testCoverage,
    byDirectory: Array.from(byDirectory.values()).sort((a, b) => b.fileCount - a.fileCount),
    byCategory,
    byExtension,
    lastScanAt: new Date().toISOString(),
  };
}

// =============================================================================
// FULL REGISTRY SCAN
// =============================================================================

export interface FullRegistryResult {
  files: FileEntry[];
  missing: MissingFile[];
  health: CodebaseHealth;
  cleanup: CleanupSuggestion[];
}

// For backward compatibility
export type ArtifactEntry = FileEntry;
export type ArtifactSummary = CodebaseHealth;
export type MissingArtifact = MissingFile;
export type { FileCategory as ArtifactCategory };

export interface ArtifactRegistryResult {
  artifacts: FileEntry[];
  missing: MissingFile[];
  summary: CodebaseHealth;
}

export function scanFullRegistry(
  tasks: Array<{
    id: string;
    artifacts: string[];
    prerequisites: string;
    validation: string;
    status: string;
    section: string;
  }>
): FullRegistryResult {
  // 1. Scan all files
  const rawFiles = scanAllFiles();

  // 2. Build task-file map from Sprint_plan.csv
  const taskMap = buildTaskFileMap(tasks);

  // 3. Find missing files (from CSV-defined paths only, before enrichment)
  const missing = findMissingFiles(rawFiles, taskMap);

  // 4. Enrich with evidence sources (attestations, context acks, metric JSONs)
  // This adds file refs for LINKING only — not checked by missing files detection
  enrichFromEvidenceSources(taskMap);

  // 5. Link files to tasks (from CSV + enriched evidence refs)
  let linkedFiles = linkFilesToTasks(rawFiles, taskMap);

  // 5.5. Link evidence files by path structure (.specify/, metric JSONs)
  linkedFiles = linkEvidenceFilesByPath(linkedFiles);

  // 6. Propagate links (tests↔source, framework files, infra dirs, peer linking)
  linkedFiles = propagateTaskLinks(linkedFiles);

  // 7. Add test coverage info
  linkedFiles = addTestCoverage(linkedFiles);

  // 8. Compute audit signals for orphans (attestation, imports, duplicates, staleness)
  linkedFiles = computeAuditSignals(linkedFiles);

  // 9. Generate health metrics
  const health = generateCodebaseHealth(linkedFiles, missing);

  // 8. Generate cleanup suggestions
  const cleanup = generateCleanupSuggestions(linkedFiles);

  return {
    files: linkedFiles,
    missing,
    health,
    cleanup,
  };
}

/**
 * Backward compatible function for artifact-only scanning
 */
export function scanArtifactRegistry(
  tasks: Array<{
    id: string;
    artifacts: string[];
    prerequisites: string;
    validation: string;
    status: string;
    section: string;
  }>
): ArtifactRegistryResult {
  const full = scanFullRegistry(tasks);

  // Filter to artifacts only for backward compatibility
  const artifactFiles = full.files.filter((f) => f.directory === 'artifacts');

  return {
    artifacts: artifactFiles,
    missing: full.missing.filter((m) => m.path.startsWith('artifacts/')),
    summary: full.health,
  };
}

function _getTaskArtifacts(
  taskId: string,
  registryResult: ArtifactRegistryResult | FullRegistryResult
): {
  linked: FileEntry[];
  missing: MissingFile[];
} {
  const files = 'files' in registryResult ? registryResult.files : registryResult.artifacts;
  const missing = registryResult.missing;

  const linked = files.filter((f) => f.linkedTasks.includes(taskId));
  const missingForTask = missing.filter((m) => m.expectedBy.includes(taskId));

  return { linked, missing: missingForTask };
}
