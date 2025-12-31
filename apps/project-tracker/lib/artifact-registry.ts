/**
 * Artifact Registry - Full Codebase File Tracking
 *
 * Scans ALL project directories and provides:
 * - Task accountability (link files to Sprint_plan.csv tasks)
 * - Codebase overview (file counts, health metrics)
 * - Cleanup assistant (orphan detection, size analysis)
 */

import { readdirSync, statSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { execSync } from 'child_process';
import { PATHS, MONOREPO_ROOT } from './paths';

// =============================================================================
// TYPES
// =============================================================================

/**
 * File categories for the entire codebase
 */
export type FileCategory =
  // Source code
  | 'app-source'      // apps/**/*.ts(x)
  | 'package-source'  // packages/**/*.ts(x)
  | 'test-source'     // **/*.test.ts, tests/**
  // Generated/Build outputs
  | 'attestation'     // artifacts/attestations/**
  | 'benchmark'       // artifacts/benchmarks/**
  | 'coverage'        // artifacts/coverage/**
  | 'report'          // artifacts/reports/**
  | 'metric'          // artifacts/metrics/**
  | 'log'             // artifacts/logs/**
  | 'generated'       // Other generated files
  // Configuration
  | 'ci-config'       // .github/workflows/**
  | 'infra-config'    // infra/**
  | 'tool-config'     // Root config files (*.json, *.yml)
  | 'claude-config'   // .claude/**
  // Documentation
  | 'docs'            // docs/**
  | 'readme'          // README.md, *.md in root
  // Tools/Scripts
  | 'tool'            // tools/**
  | 'script'          // scripts/**
  // Other
  | 'misc';           // Everything else

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
  path: string;           // Relative to monorepo root
  absolutePath: string;
  exists: boolean;
  type: 'file' | 'directory';
  size: number;
  lastModified: string;   // ISO timestamp
  linkedTasks: string[];  // Task IDs referencing this file
  isOrphan: boolean;      // Not linked to any task
  category: FileCategory;
  directory: DirectoryType;
  extension: string;
  isTestFile: boolean;
  hasTest: boolean;       // For source files, whether a test exists
  // Git history metadata (populated by enrichWithGitHistory)
  gitHistory?: {
    createdAt: string | null;        // ISO timestamp from git
    createdBy: string | null;        // Git author name
    createdCommit: string | null;    // Commit hash
    createdPurpose: string | null;   // Commit message (why it was created)
    createdTaskId: string | null;    // Extracted task ID from commit
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
  testCoverage?: number;  // Percentage of source files with tests
}

export interface CodebaseHealth {
  totalFiles: number;
  totalSize: number;
  linkedFiles: number;
  orphanFiles: number;
  missingFiles: number;
  documentationCoverage: number;  // % of packages with README
  testCoverage: number;           // % of source files with tests
  byDirectory: DirectorySummary[];
  byCategory: Record<FileCategory, number>;
  byExtension: Record<string, number>;
  lastScanAt: string;
}

export interface MissingFile {
  path: string;
  expectedBy: string[];
  prefix: 'ARTIFACT' | 'EVIDENCE' | 'FILE';
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
// SKIP PATTERNS
// =============================================================================

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  '.git',
  '.pnpm',
  'dist',
  'build',
  '.cache',
]);

const SKIP_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
  '.gitkeep',
]);

// =============================================================================
// CATEGORY DETECTION
// =============================================================================

function detectDirectory(relativePath: string): DirectoryType {
  const firstPart = relativePath.split(/[/\\]/)[0];

  if (firstPart === 'apps') return 'apps';
  if (firstPart === 'packages') return 'packages';
  if (firstPart === 'docs') return 'docs';
  if (firstPart === 'infra') return 'infra';
  if (firstPart === 'scripts') return 'scripts';
  if (firstPart === 'tools') return 'tools';
  if (firstPart === 'artifacts') return 'artifacts';
  if (firstPart === 'tests') return 'tests';
  if (firstPart === '.claude') return '.claude';
  if (firstPart === '.github') return '.github';
  if (firstPart === '.specify') return '.specify';

  return 'root';
}

function detectCategory(relativePath: string, extension: string): FileCategory {
  const pathLower = relativePath.toLowerCase();
  const dir = detectDirectory(relativePath);

  // Test files
  if (pathLower.includes('.test.') || pathLower.includes('.spec.') || dir === 'tests') {
    return 'test-source';
  }

  // Source code
  if (dir === 'apps' && (extension === '.ts' || extension === '.tsx' || extension === '.js' || extension === '.jsx')) {
    return 'app-source';
  }
  if (dir === 'packages' && (extension === '.ts' || extension === '.tsx' || extension === '.js' || extension === '.jsx')) {
    return 'package-source';
  }

  // Artifacts
  if (dir === 'artifacts') {
    if (pathLower.includes('attestation')) return 'attestation';
    if (pathLower.includes('benchmark')) return 'benchmark';
    if (pathLower.includes('coverage')) return 'coverage';
    if (pathLower.includes('report')) return 'report';
    if (pathLower.includes('metric')) return 'metric';
    if (pathLower.includes('log')) return 'log';
    return 'generated';
  }

  // Configuration
  if (dir === '.github') return 'ci-config';
  if (dir === 'infra') return 'infra-config';
  if (dir === '.claude') return 'claude-config';
  if (dir === 'root' && (extension === '.json' || extension === '.yml' || extension === '.yaml' || extension === '.js')) {
    return 'tool-config';
  }

  // Documentation
  if (dir === 'docs') return 'docs';
  if (extension === '.md') return 'readme';

  // Tools/Scripts
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

function scanDirectoryRecursive(
  dir: string,
  basePath: string = ''
): FileEntry[] {
  const entries: FileEntry[] = [];

  if (!existsSync(dir)) {
    return entries;
  }

  try {
    const items = readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      // Skip ignored directories and files
      if (SKIP_DIRS.has(item.name) || SKIP_FILES.has(item.name)) {
        continue;
      }

      const fullPath = join(dir, item.name);
      const relativePath = basePath ? join(basePath, item.name) : item.name;

      try {
        const stats = statSync(fullPath);

        if (item.isDirectory()) {
          entries.push(...scanDirectoryRecursive(fullPath, relativePath));
        } else if (item.isFile()) {
          const ext = extname(item.name).toLowerCase() || 'none';
          const normalizedPath = relativePath.replace(/\\/g, '/');

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
export function scanAllArtifacts(): FileEntry[] {
  const allFiles = scanAllFiles();
  return allFiles.filter(f => f.directory === 'artifacts');
}

// =============================================================================
// TASK FILE PARSING
// =============================================================================

export function parseTaskFileRefs(
  artifactsField: string,
  prerequisitesField: string,
  validationField: string
): { artifacts: string[]; evidence: string[]; files: string[] } {
  const artifacts: string[] = [];
  const evidence: string[] = [];
  const files: string[] = [];

  // Parse Artifacts To Track field
  if (artifactsField) {
    const lines = artifactsField.split(/[,;\n]/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('ARTIFACT:')) {
        artifacts.push(trimmed.replace('ARTIFACT:', '').trim());
      } else if (trimmed.startsWith('EVIDENCE:')) {
        evidence.push(trimmed.replace('EVIDENCE:', '').trim());
      } else if (trimmed && !trimmed.startsWith('VALIDATE:') && !trimmed.startsWith('GATE:') && !trimmed.startsWith('AUDIT:')) {
        artifacts.push(trimmed);
      }
    }
  }

  // Parse Pre-requisites for FILE: references
  if (prerequisitesField) {
    const lines = prerequisitesField.split(/[,;\n]/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('FILE:')) {
        files.push(trimmed.replace('FILE:', '').trim());
      }
    }
  }

  // Parse Validation Method for EVIDENCE: references
  if (validationField) {
    const lines = validationField.split(/[,;\n]/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('EVIDENCE:')) {
        evidence.push(trimmed.replace('EVIDENCE:', '').trim());
      }
    }
  }

  return { artifacts, evidence, files };
}

// =============================================================================
// FILE-TASK MAPPING
// =============================================================================

export interface TaskFileMap {
  [taskId: string]: {
    expectedArtifacts: string[];
    expectedEvidence: string[];
    requiredFiles: string[];
    status: string;
    section: string;
  };
}

export function buildTaskFileMap(tasks: Array<{
  id: string;
  artifacts: string[];
  prerequisites: string;
  validation: string;
  status: string;
  section: string;
}>): TaskFileMap {
  const map: TaskFileMap = {};

  for (const task of tasks) {
    const { artifacts, evidence, files } = parseTaskFileRefs(
      task.artifacts.join(','),
      task.prerequisites,
      task.validation
    );

    map[task.id] = {
      expectedArtifacts: artifacts,
      expectedEvidence: evidence,
      requiredFiles: files,
      status: task.status,
      section: task.section,
    };
  }

  return map;
}

export function linkFilesToTasks(
  files: FileEntry[],
  taskMap: TaskFileMap
): FileEntry[] {
  const pathToTasks: Record<string, string[]> = {};

  for (const [taskId, data] of Object.entries(taskMap)) {
    const allPaths = [
      ...data.expectedArtifacts,
      ...data.expectedEvidence,
      ...data.requiredFiles,
    ];

    for (const path of allPaths) {
      const normalizedPath = path.replace(/\\/g, '/').toLowerCase();

      if (path.includes('*')) {
        const regexPattern = normalizedPath
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*');
        const regex = new RegExp(`^${regexPattern}$`, 'i');

        for (const file of files) {
          if (regex.test(file.path.toLowerCase())) {
            if (!pathToTasks[file.path]) {
              pathToTasks[file.path] = [];
            }
            if (!pathToTasks[file.path].includes(taskId)) {
              pathToTasks[file.path].push(taskId);
            }
          }
        }
      } else {
        if (!pathToTasks[normalizedPath]) {
          pathToTasks[normalizedPath] = [];
        }
        if (!pathToTasks[normalizedPath].includes(taskId)) {
          pathToTasks[normalizedPath].push(taskId);
        }
      }
    }
  }

  return files.map((file) => {
    const normalizedPath = file.path.toLowerCase();
    const linkedTasks = pathToTasks[normalizedPath] || [];

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
      .filter(f => f.isTestFile)
      .map(f => {
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

  return files.map(file => {
    if (file.category === 'app-source' || file.category === 'package-source') {
      const hasTest = testFiles.has(file.path.toLowerCase()) ||
                      testFiles.has(file.path.replace(/\\/g, '/').toLowerCase());
      return { ...file, hasTest };
    }
    return file;
  });
}

// =============================================================================
// MISSING FILE DETECTION
// =============================================================================

export function findMissingFiles(
  files: FileEntry[],
  taskMap: TaskFileMap
): MissingFile[] {
  const missing: MissingFile[] = [];
  const existingPaths = new Set(files.map(f => f.path.toLowerCase()));

  for (const [taskId, data] of Object.entries(taskMap)) {
    if (!['Completed', 'In Progress', 'Validating'].includes(data.status)) {
      continue;
    }

    const checkPaths = [
      { paths: data.expectedArtifacts, prefix: 'ARTIFACT' as const },
      { paths: data.expectedEvidence, prefix: 'EVIDENCE' as const },
      { paths: data.requiredFiles, prefix: 'FILE' as const },
    ];

    for (const { paths, prefix } of checkPaths) {
      for (const expectedPath of paths) {
        if (expectedPath.includes('*')) continue;

        const normalizedPath = expectedPath.replace(/\\/g, '/').toLowerCase();

        if (!existingPaths.has(normalizedPath)) {
          const existing = missing.find(m => m.path.toLowerCase() === normalizedPath);
          if (existing) {
            if (!existing.expectedBy.includes(taskId)) {
              existing.expectedBy.push(taskId);
            }
          } else {
            missing.push({
              path: expectedPath,
              expectedBy: [taskId],
              prefix,
            });
          }
        }
      }
    }
  }

  return missing;
}

// =============================================================================
// CLEANUP SUGGESTIONS
// =============================================================================

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const LARGE_FILE_THRESHOLD = 1024 * 1024; // 1MB

export function generateCleanupSuggestions(files: FileEntry[]): CleanupSuggestion[] {
  const suggestions: CleanupSuggestion[] = [];
  const now = Date.now();

  for (const file of files) {
    // Skip non-orphans for most suggestions
    if (file.isOrphan) {
      // Large orphan files
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

      // Stale orphan files (not modified in 30+ days)
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

      // Orphan artifacts
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
    }
  }

  // Sort by priority and size
  return suggestions.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return b.size - a.size;
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
    const match = message.match(pattern);
    if (match) {
      return match[1].toUpperCase();
    }
  }
  return null;
}

/**
 * Get git history for a single file
 */
function getGitHistoryForFile(
  relativePath: string,
  staleDays: number = 30
): FileEntry['gitHistory'] {
  const history: FileEntry['gitHistory'] = {
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
    // Get creation commit (first commit that added this file)
    const creationCmd = `git log --follow --diff-filter=A --format="%H|%aI|%an|%s" -- "${relativePath}"`;
    let creationOutput = '';
    try {
      creationOutput = execSync(creationCmd, {
        cwd: MONOREPO_ROOT,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
    } catch {
      // File might not be tracked
    }

    if (creationOutput) {
      const lines = creationOutput.split('\n');
      const lastLine = lines[lines.length - 1]; // Oldest commit
      const parts = lastLine.split('|');
      if (parts.length >= 4) {
        history.createdCommit = parts[0] || null;
        history.createdAt = parts[1] || null;
        history.createdBy = parts[2] || null;
        history.createdPurpose = parts.slice(3).join('|') || null;
        history.createdTaskId = history.createdPurpose
          ? extractTaskIdFromMessage(history.createdPurpose)
          : null;
      }
    }

    // Get last modification commit
    const modifyCmd = `git log -1 --format="%H|%aI|%an|%s" -- "${relativePath}"`;
    let modifyOutput = '';
    try {
      modifyOutput = execSync(modifyCmd, {
        cwd: MONOREPO_ROOT,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
    } catch {
      // File might not be tracked
    }

    if (modifyOutput) {
      const parts = modifyOutput.split('|');
      if (parts.length >= 4) {
        history.lastModifiedCommit = parts[0] || null;
        const modifiedAt = parts[1] || null;
        history.lastModifiedBy = parts[2] || null;
        history.lastModifiedMessage = parts.slice(3).join('|') || null;

        // Calculate days since modified
        if (modifiedAt) {
          const modDate = new Date(modifiedAt);
          const now = new Date();
          const diffMs = now.getTime() - modDate.getTime();
          history.daysSinceModified = Math.floor(diffMs / (1000 * 60 * 60 * 24));

          // Check if stale
          if (history.daysSinceModified > staleDays) {
            history.isStale = true;
            history.staleReason = `Not modified in ${history.daysSinceModified} days`;
          }
        }
      }
    }
  } catch {
    // Git commands failed, leave history as null
  }

  return history;
}

/**
 * Enrich file entries with git history metadata
 * Note: This is expensive - use sparingly (e.g., on filtered results)
 */
export function enrichWithGitHistory(
  files: FileEntry[],
  staleDays: number = 30
): FileEntry[] {
  return files.map((file) => ({
    ...file,
    gitHistory: getGitHistoryForFile(file.path, staleDays),
  }));
}

/**
 * Batch enrich files with git history (more efficient for large sets)
 * Only enriches first N files to avoid timeout
 */
export function enrichWithGitHistoryBatch(
  files: FileEntry[],
  maxFiles: number = 100,
  staleDays: number = 30
): FileEntry[] {
  const toEnrich = files.slice(0, maxFiles);
  const enriched = enrichWithGitHistory(toEnrich, staleDays);

  // Return enriched files + remaining without history
  return [
    ...enriched,
    ...files.slice(maxFiles),
  ];
}

// =============================================================================
// HEALTH METRICS
// =============================================================================

export function generateCodebaseHealth(
  files: FileEntry[],
  missing: MissingFile[]
): CodebaseHealth {
  const byDirectory: Map<DirectoryType, DirectorySummary> = new Map();
  const byCategory: Record<FileCategory, number> = {} as Record<FileCategory, number>;
  const byExtension: Record<string, number> = {};

  let totalSize = 0;
  let linkedCount = 0;
  let orphanCount = 0;

  // Initialize categories
  const allCategories: FileCategory[] = [
    'app-source', 'package-source', 'test-source',
    'attestation', 'benchmark', 'coverage', 'report', 'metric', 'log', 'generated',
    'ci-config', 'infra-config', 'tool-config', 'claude-config',
    'docs', 'readme', 'tool', 'script', 'misc'
  ];
  for (const cat of allCategories) {
    byCategory[cat] = 0;
  }

  for (const file of files) {
    // Global stats
    totalSize += file.size;
    byCategory[file.category] = (byCategory[file.category] || 0) + 1;
    byExtension[file.extension] = (byExtension[file.extension] || 0) + 1;

    if (file.isOrphan) {
      orphanCount++;
    } else {
      linkedCount++;
    }

    // Directory stats
    if (!byDirectory.has(file.directory)) {
      byDirectory.set(file.directory, {
        directory: file.directory,
        fileCount: 0,
        totalSize: 0,
        linkedCount: 0,
        orphanCount: 0,
        byExtension: {},
      });
    }

    const dirSummary = byDirectory.get(file.directory)!;
    dirSummary.fileCount++;
    dirSummary.totalSize += file.size;
    dirSummary.byExtension[file.extension] = (dirSummary.byExtension[file.extension] || 0) + 1;

    if (file.isOrphan) {
      dirSummary.orphanCount++;
    } else {
      dirSummary.linkedCount++;
    }
  }

  // Calculate test coverage
  const sourceFiles = files.filter(f =>
    f.category === 'app-source' || f.category === 'package-source'
  );
  const filesWithTests = sourceFiles.filter(f => f.hasTest);
  const testCoverage = sourceFiles.length > 0
    ? (filesWithTests.length / sourceFiles.length) * 100
    : 0;

  // Calculate documentation coverage (packages with README)
  const packageDirs = new Set(
    files
      .filter(f => f.directory === 'packages')
      .map(f => f.path.split('/').slice(0, 2).join('/'))
  );
  const packageReadmes = files.filter(
    f => f.directory === 'packages' && f.path.toLowerCase().includes('readme.md')
  );
  const documentationCoverage = packageDirs.size > 0
    ? (packageReadmes.length / packageDirs.size) * 100
    : 0;

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
export type ArtifactCategory = FileCategory;

export interface ArtifactRegistryResult {
  artifacts: FileEntry[];
  missing: MissingFile[];
  summary: CodebaseHealth;
}

export function scanFullRegistry(tasks: Array<{
  id: string;
  artifacts: string[];
  prerequisites: string;
  validation: string;
  status: string;
  section: string;
}>): FullRegistryResult {
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
export function scanArtifactRegistry(tasks: Array<{
  id: string;
  artifacts: string[];
  prerequisites: string;
  validation: string;
  status: string;
  section: string;
}>): ArtifactRegistryResult {
  const full = scanFullRegistry(tasks);

  // Filter to artifacts only for backward compatibility
  const artifactFiles = full.files.filter(f => f.directory === 'artifacts');

  return {
    artifacts: artifactFiles,
    missing: full.missing.filter(m => m.path.startsWith('artifacts/')),
    summary: full.health,
  };
}

export function getTaskArtifacts(
  taskId: string,
  registryResult: ArtifactRegistryResult | FullRegistryResult
): {
  linked: FileEntry[];
  missing: MissingFile[];
} {
  const files = 'files' in registryResult ? registryResult.files : registryResult.artifacts;
  const missing = registryResult.missing;

  const linked = files.filter(f => f.linkedTasks.includes(taskId));
  const missingForTask = missing.filter(m => m.expectedBy.includes(taskId));

  return { linked, missing: missingForTask };
}
