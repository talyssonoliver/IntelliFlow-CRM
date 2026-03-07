/**
 * Artifact Registry - Full Codebase File Tracking
 *
 * Scans ALL project directories and provides:
 * - Task accountability (link files to Sprint_plan.csv tasks)
 * - Codebase overview (file counts, health metrics)
 * - Cleanup assistant (orphan detection, size analysis)
 */

import { readdirSync, statSync, existsSync, type Dirent } from 'node:fs';
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

const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo', '.git', '.pnpm', 'dist', '.cache']);

// Directories to skip only at root or top-level app/package paths (not nested API routes)
const SKIP_DIRS_TOP_LEVEL = new Set(['build']);

const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db', '.gitkeep']);

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
  const regexPattern = normalizedPath
    .replaceAll('.', String.raw`\.`)
    .replaceAll('**', '.*')
    .replaceAll('*', '[^/]*');
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
          .replace('.test.ts', '.ts')
          .replace('.test.tsx', '.tsx')
          .replace('.spec.ts', '.ts')
          .replace('.spec.tsx', '.tsx')
          .replace('__tests__/', '')
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

function parseGitLogLine(line: string): { hash: string; date: string; author: string; subject: string } | null {
  const parts = line.split('|');
  if (parts.length < 4) return null;
  return {
    hash: parts[0] || '',
    date: parts[1] || '',
    author: parts[2] || '',
    subject: parts.slice(3).join('|') || '',
  };
}

function applyCreationInfo(history: NonNullable<FileEntry['gitHistory']>, relativePath: string): void {
  const output = runGitLog([
    'log', '--follow', '--diff-filter=A', '--format=%H|%aI|%an|%s', '--', relativePath,
  ]);
  if (!output) return;
  const lines = output.split('\n');
  const parsed = parseGitLogLine(lines.at(-1));
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
export type ArtifactCategory = FileCategory; // NOSONAR typescript:S6564 — backward-compatible re-export alias used by other modules

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

  // 2. Build task-file map
  const taskMap = buildTaskFileMap(tasks);

  // 3. Link files to tasks
  let linkedFiles = linkFilesToTasks(rawFiles, taskMap);

  // 4. Add test coverage info
  linkedFiles = addTestCoverage(linkedFiles);

  // 5. Find missing files
  const missing = findMissingFiles(linkedFiles, taskMap);

  // 6. Generate health metrics
  const health = generateCodebaseHealth(linkedFiles, missing);

  // 7. Generate cleanup suggestions
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
