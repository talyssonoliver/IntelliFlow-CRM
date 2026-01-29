/**
 * Context Hydration Layer
 *
 * Automatically gathers comprehensive context before agent discussion:
 * 1. Task metadata from Sprint_plan.csv
 * 2. Dependency artifacts (spec, plan, delivery, code)
 * 3. Codebase patterns (relevant existing code)
 * 4. Project knowledge (CLAUDE.md, architecture docs)
 *
 * @module tools/scripts/lib/stoa/context-hydration
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, relative, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { findRepoRoot, resolveSprintPlanPath } from '../validation-utils.js';
import { loadAllTasks, type TaskRecord } from './attestation.js';
import { sha256 } from './evidence.js';
import {
  getContextDir as getContextDirNew,
  getSpecPath,
  getPlanPath,
  getAttestationsDir,
  getEvidenceDir,
  getLegacySpecPath,
  getLegacyPlanPath,
  getLegacyFlatContextDir,
  getLegacyAttestationsDir,
  getLegacyContextDir,
} from './paths.js';
import type {
  Task,
  HydratedContext,
  HydrationSource,
  DependencyArtifact,
  CodebasePattern,
  ProjectKnowledge,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

const MAX_CODEBASE_PATTERNS = 20;
const MAX_SNIPPET_LINES = 30;
const MAX_FILE_READ_SIZE = 50000; // 50KB max per file

// Directories to scan for codebase patterns
const CODEBASE_SCAN_DIRS = [
  'packages/domain/src',
  'packages/application/src',
  'packages/adapters/src',
  'packages/validators/src',
  'apps/api/src',
  'apps/web/src',
];

// Project knowledge files
const PROJECT_KNOWLEDGE_FILES = {
  claudeMd: 'CLAUDE.md',
  adrDir: 'docs/planning/adr',
  domainDir: 'packages/domain/src',
  schemasDir: 'packages/validators/src',
};

// ============================================================================
// Task Metadata Extraction
// ============================================================================

/**
 * Extract task metadata from Sprint_plan.csv
 */
export function extractTaskMetadata(taskId: string, repoRoot: string): Task | null {
  const allTasks = loadAllTasks(repoRoot);
  const taskRecord = allTasks.find((t) => t.taskId === taskId);

  if (!taskRecord) {
    return null;
  }

  return {
    taskId: taskRecord.taskId,
    section: taskRecord.section,
    description: taskRecord.description,
    owner: taskRecord.owner,
    status: taskRecord.status,
    dependencies: taskRecord.dependencies,
    definitionOfDone: taskRecord.definitionOfDone,
    targetSprint: taskRecord.targetSprint,
    affectedPaths: taskRecord.artifactsToTrack,
  };
}

/**
 * Get full task record with all CSV fields
 */
export function getFullTaskRecord(taskId: string, repoRoot: string): TaskRecord | null {
  const allTasks = loadAllTasks(repoRoot);
  return allTasks.find((t) => t.taskId === taskId) || null;
}

// ============================================================================
// Dependency Artifact Resolution
// ============================================================================

/**
 * Resolve artifacts from completed dependency tasks
 * Uses new unified path structure first, falls back to legacy paths
 */
export function resolveDependencyArtifacts(
  dependencies: string[],
  repoRoot: string,
  specifyDir: string = '.specify'
): DependencyArtifact[] {
  const allTasks = loadAllTasks(repoRoot);
  const artifacts: DependencyArtifact[] = [];
  const fullSpecifyDir = join(repoRoot, specifyDir);

  for (const depId of dependencies) {
    if (!depId || depId.trim() === '') continue;

    const depTask = allTasks.find((t) => t.taskId === depId);
    const depSprint = parseInt(depTask?.targetSprint || '0', 10);

    const artifact: DependencyArtifact = {
      taskId: depId,
      status: depTask?.status,
      codeFiles: [],
      interfaces: [],
      patterns: [],
    };

    // Check for spec file (new sprint-based path first, then legacy fallbacks)
    const specPathNew = getSpecPath(fullSpecifyDir, depSprint, depId);
    const specPathLegacy = getLegacySpecPath(fullSpecifyDir, depId);
    const specPathLegacyOld = join(repoRoot, specifyDir, 'specifications', `${depId}.md`);

    if (existsSync(specPathNew)) {
      artifact.specPath = relative(repoRoot, specPathNew);
    } else if (existsSync(specPathLegacy)) {
      artifact.specPath = relative(repoRoot, specPathLegacy);
    } else if (existsSync(specPathLegacyOld)) {
      artifact.specPath = relative(repoRoot, specPathLegacyOld);
    }

    // Check for plan file (new sprint-based path first, then legacy fallbacks)
    const planPathNew = getPlanPath(fullSpecifyDir, depSprint, depId);
    const planPathLegacy = getLegacyPlanPath(fullSpecifyDir, depId);
    const planPathLegacyOld = join(repoRoot, specifyDir, 'planning', `${depId}.md`);

    if (existsSync(planPathNew)) {
      artifact.planPath = relative(repoRoot, planPathNew);
    } else if (existsSync(planPathLegacy)) {
      artifact.planPath = relative(repoRoot, planPathLegacy);
    } else if (existsSync(planPathLegacyOld)) {
      artifact.planPath = relative(repoRoot, planPathLegacyOld);
    }

    // Check for attestation folder (new sprint-based path first, then legacy)
    const attestationPathNew = getAttestationsDir(fullSpecifyDir, depSprint, depId);
    const attestationPathLegacy = getLegacyAttestationsDir(repoRoot, depId);

    let attestationPath: string | null = null;
    if (existsSync(attestationPathNew)) {
      attestationPath = attestationPathNew;
      artifact.attestationPath = relative(repoRoot, attestationPathNew);
    } else if (existsSync(attestationPathLegacy)) {
      attestationPath = attestationPathLegacy;
      artifact.attestationPath = relative(repoRoot, attestationPathLegacy);
    }

    // Look for context_pack.md for patterns
    if (attestationPath) {
      const contextPackPath = join(attestationPath, 'context_pack.md');
      if (existsSync(contextPackPath)) {
        try {
          const content = readFileSync(contextPackPath, 'utf-8');
          // Extract file references from context pack
          const fileMatches = content.match(/FILE:\s*([^\n]+)/g);
          if (fileMatches) {
            artifact.codeFiles.push(
              ...fileMatches.map((m) => m.replace('FILE:', '').trim()).filter(Boolean)
            );
          }
        } catch {
          // Ignore read errors
        }
      }
    }

    // Check for evidence directory (new sprint-based path first)
    const evidencePathNew = getEvidenceDir(fullSpecifyDir, depSprint, depId);
    if (existsSync(evidencePathNew)) {
      artifact.deliveryPath = relative(repoRoot, evidencePathNew);
    } else if (depTask?.status === 'Completed' || depTask?.status === 'Done') {
      // Fallback: Look for delivery artifacts in legacy system-audit location
      const deliveryPath = join(repoRoot, 'artifacts', 'reports', 'system-audit');

      if (existsSync(deliveryPath)) {
        try {
          const runs = readdirSync(deliveryPath)
            .filter((f) => {
              const summaryPath = join(deliveryPath, f, 'summary.json');
              if (!existsSync(summaryPath)) return false;
              try {
                const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
                return summary.taskId === depId;
              } catch {
                return false;
              }
            })
            .sort()
            .reverse();

          if (runs.length > 0) {
            artifact.deliveryPath = relative(repoRoot, join(deliveryPath, runs[0]));
          }
        } catch {
          // Ignore errors
        }
      }
    }

    artifacts.push(artifact);
  }

  return artifacts;
}

// ============================================================================
// Codebase Pattern Discovery
// ============================================================================

/**
 * Extract keywords from task description for pattern matching
 */
function extractKeywords(task: Task): string[] {
  const text = `${task.description || ''} ${task.definitionOfDone || ''} ${task.section || ''}`;

  // Extract meaningful words (3+ chars, not common words)
  const commonWords = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'are', 'was',
    'will', 'can', 'all', 'should', 'must', 'when', 'where', 'what', 'which',
    'create', 'implement', 'add', 'update', 'ensure', 'make', 'use', 'set',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !commonWords.has(w));

  // Deduplicate and return top keywords
  return Array.from(new Set(words)).slice(0, 10);
}

/**
 * Scan codebase for patterns matching task keywords
 */
export function scanCodebasePatterns(
  task: Task,
  repoRoot: string,
  maxPatterns: number = MAX_CODEBASE_PATTERNS
): CodebasePattern[] {
  const keywords = extractKeywords(task);
  const patterns: CodebasePattern[] = [];

  if (keywords.length === 0) {
    return patterns;
  }

  for (const scanDir of CODEBASE_SCAN_DIRS) {
    const fullDir = join(repoRoot, scanDir);
    if (!existsSync(fullDir)) continue;

    try {
      // Use grep to find matching files efficiently
      for (const keyword of keywords) {
        if (patterns.length >= maxPatterns) break;

        try {
          // Search for keyword in TypeScript files
          const result = execSync(
            `grep -r -n -l --include="*.ts" --include="*.tsx" "${keyword}" "${fullDir}" 2>/dev/null || true`,
            { encoding: 'utf-8', maxBuffer: 1024 * 1024 }
          );

          const files = result.trim().split('\n').filter(Boolean).slice(0, 3);

          for (const filePath of files) {
            if (patterns.length >= maxPatterns) break;

            try {
              // Get matching lines with context
              const grepResult = execSync(
                `grep -n -B2 -A2 "${keyword}" "${filePath}" 2>/dev/null | head -${MAX_SNIPPET_LINES}`,
                { encoding: 'utf-8', maxBuffer: 1024 * 1024 }
              );

              if (grepResult.trim()) {
                // Extract line number from first match
                const lineMatch = grepResult.match(/^(\d+)[:-]/);
                const lineNumber = lineMatch ? parseInt(lineMatch[1], 10) : 1;

                patterns.push({
                  keyword,
                  filePath: relative(repoRoot, filePath),
                  snippet: grepResult.trim().slice(0, 500),
                  lineNumber,
                  relevanceScore: calculateRelevanceScore(keyword, grepResult, task),
                });
              }
            } catch {
              // Skip files that fail to read
            }
          }
        } catch {
          // Skip keywords that fail to search
        }
      }
    } catch {
      // Skip directories that fail to scan
    }
  }

  // Sort by relevance and return top patterns
  return patterns.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, maxPatterns);
}

/**
 * Calculate relevance score for a pattern match
 */
function calculateRelevanceScore(keyword: string, content: string, task: Task): number {
  let score = 0;

  // Base score for having a match
  score += 10;

  // Bonus for multiple occurrences
  const occurrences = (content.match(new RegExp(keyword, 'gi')) || []).length;
  score += Math.min(occurrences * 2, 10);

  // Bonus for being in a relevant directory
  if (content.includes('domain')) score += 5;
  if (content.includes('application')) score += 5;
  if (content.includes('api')) score += 3;

  // Bonus for interface/type definitions
  if (content.includes('interface ') || content.includes('type ')) score += 5;
  if (content.includes('export ')) score += 3;

  return score;
}

// ============================================================================
// Project Knowledge Loading
// ============================================================================

/**
 * Load project knowledge files
 */
export function loadProjectKnowledge(repoRoot: string): ProjectKnowledge {
  const knowledge: ProjectKnowledge = {
    claudeMd: '',
    architectureDocs: [],
    domainModels: [],
    schemas: [],
  };

  // Load CLAUDE.md
  const claudeMdPath = join(repoRoot, PROJECT_KNOWLEDGE_FILES.claudeMd);
  if (existsSync(claudeMdPath)) {
    try {
      const content = readFileSync(claudeMdPath, 'utf-8');
      // Truncate if too large
      knowledge.claudeMd = content.slice(0, MAX_FILE_READ_SIZE);
    } catch {
      // Ignore read errors
    }
  }

  // Load ADR files
  const adrDir = join(repoRoot, PROJECT_KNOWLEDGE_FILES.adrDir);
  if (existsSync(adrDir)) {
    try {
      const files = readdirSync(adrDir)
        .filter((f) => f.endsWith('.md'))
        .slice(0, 10); // Limit to 10 ADRs

      for (const file of files) {
        knowledge.architectureDocs.push(join(PROJECT_KNOWLEDGE_FILES.adrDir, file));
      }
    } catch {
      // Ignore errors
    }
  }

  // Load domain model files
  const domainDir = join(repoRoot, PROJECT_KNOWLEDGE_FILES.domainDir);
  if (existsSync(domainDir)) {
    try {
      const modelFiles = findTypeScriptFiles(domainDir, 5);
      knowledge.domainModels = modelFiles.map((f) => relative(repoRoot, f));
    } catch {
      // Ignore errors
    }
  }

  // Load schema files
  const schemasDir = join(repoRoot, PROJECT_KNOWLEDGE_FILES.schemasDir);
  if (existsSync(schemasDir)) {
    try {
      const schemaFiles = findTypeScriptFiles(schemasDir, 5);
      knowledge.schemas = schemaFiles.map((f) => relative(repoRoot, f));
    } catch {
      // Ignore errors
    }
  }

  return knowledge;
}

/**
 * Find TypeScript files in a directory (limited depth)
 */
function findTypeScriptFiles(dir: string, maxFiles: number): string[] {
  const files: string[] = [];

  function scan(currentDir: string, depth: number) {
    if (depth > 3 || files.length >= maxFiles) return;

    try {
      const entries = readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (files.length >= maxFiles) break;

        const fullPath = join(currentDir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          scan(fullPath, depth + 1);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore errors
    }
  }

  scan(dir, 0);
  return files;
}

// ============================================================================
// Context Hash Generation
// ============================================================================

/**
 * Generate SHA256 hash of the entire context for integrity verification
 */
function generateContextHash(context: Omit<HydratedContext, 'contextHash'>): string {
  const content = JSON.stringify({
    taskId: context.taskId,
    taskMetadata: context.taskMetadata,
    dependencyArtifacts: context.dependencyArtifacts,
    codebasePatterns: context.codebasePatterns,
    projectKnowledge: context.projectKnowledge,
    hydratedAt: context.hydratedAt,
  });

  return createHash('sha256').update(content).digest('hex');
}

// ============================================================================
// Main Hydration Function
// ============================================================================

/**
 * Hydrate complete context for a task
 */
export async function hydrateContext(
  taskId: string,
  repoRoot: string,
  specifyDir: string = '.specify'
): Promise<HydratedContext> {
  const sources: HydrationSource[] = [];
  const now = new Date().toISOString();

  // Step 1: Extract task metadata
  const taskMetadata = extractTaskMetadata(taskId, repoRoot);
  if (!taskMetadata) {
    throw new Error(`Task ${taskId} not found in Sprint_plan.csv`);
  }

  sources.push({
    type: 'task_metadata',
    path: 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv',
    loadedAt: now,
  });

  // Step 2: Resolve dependency artifacts
  const dependencyArtifacts = resolveDependencyArtifacts(
    taskMetadata.dependencies || [],
    repoRoot,
    specifyDir
  );

  for (const dep of dependencyArtifacts) {
    if (dep.specPath) {
      sources.push({
        type: 'dependency_artifact',
        path: dep.specPath,
        loadedAt: now,
      });
    }
    if (dep.planPath) {
      sources.push({
        type: 'dependency_artifact',
        path: dep.planPath,
        loadedAt: now,
      });
    }
  }

  // Step 3: Scan codebase for patterns
  const codebasePatterns = scanCodebasePatterns(taskMetadata, repoRoot);

  for (const pattern of codebasePatterns) {
    sources.push({
      type: 'codebase_pattern',
      path: pattern.filePath,
      loadedAt: now,
    });
  }

  // Step 4: Load project knowledge
  const projectKnowledge = loadProjectKnowledge(repoRoot);

  if (projectKnowledge.claudeMd) {
    sources.push({
      type: 'project_knowledge',
      path: 'CLAUDE.md',
      loadedAt: now,
    });
  }

  for (const doc of projectKnowledge.architectureDocs) {
    sources.push({
      type: 'project_knowledge',
      path: doc,
      loadedAt: now,
    });
  }

  // Step 5: Build hydrated context
  const contextWithoutHash = {
    taskId,
    taskMetadata,
    dependencyArtifacts,
    codebasePatterns,
    projectKnowledge,
    sources,
    hydratedAt: now,
  };

  const contextHash = generateContextHash(contextWithoutHash);

  return {
    ...contextWithoutHash,
    contextHash,
  };
}

// ============================================================================
// Context Output Writers
// ============================================================================

/**
 * Get the context directory for a task
 * Uses new unified structure: .specify/sprints/sprint-{N}/context/{TASK_ID}/
 */
export function getContextDir(specifyDir: string, sprintNumber: number, taskId: string): string {
  // Use new sprint-based path structure
  return getContextDirNew(specifyDir, sprintNumber, taskId);
}

/**
 * Write hydrated context to files
 */
export function writeHydratedContext(
  context: HydratedContext,
  repoRoot: string,
  sprintNumber: number,
  specifyDir: string = '.specify'
): { jsonPath: string; mdPath: string } {
  const contextDir = join(repoRoot, getContextDir(specifyDir, sprintNumber, context.taskId));
  mkdirSync(contextDir, { recursive: true });

  // Write JSON
  const jsonPath = join(contextDir, 'hydrated-context.json');
  writeFileSync(jsonPath, JSON.stringify(context, null, 2));

  // Write Markdown
  const mdPath = join(contextDir, 'hydrated-context.md');
  const md = generateContextMarkdown(context);
  writeFileSync(mdPath, md);

  return {
    jsonPath: relative(repoRoot, jsonPath),
    mdPath: relative(repoRoot, mdPath),
  };
}

/**
 * Load hydrated context from disk
 *
 * Reads a previously hydrated context JSON file and returns the HydratedContext object.
 * Returns null if the file doesn't exist.
 *
 * @param repoRoot - Repository root path
 * @param sprintNumber - Sprint number for the task
 * @param taskId - Task ID to load context for
 * @param specifyDir - Specify directory (default: '.specify')
 * @returns HydratedContext object or null if not found
 */
export function loadHydratedContext(
  repoRoot: string,
  sprintNumber: number,
  taskId: string,
  specifyDir: string = '.specify'
): HydratedContext | null {
  const contextDir = join(repoRoot, getContextDir(specifyDir, sprintNumber, taskId));
  const jsonPath = join(contextDir, 'hydrated-context.json');

  if (!existsSync(jsonPath)) {
    return null;
  }

  try {
    const content = readFileSync(jsonPath, 'utf-8');
    return JSON.parse(content) as HydratedContext;
  } catch (error) {
    console.error(`[Context] Failed to load hydrated context from ${jsonPath}:`, error);
    return null;
  }
}

/**
 * Check if hydrated context exists for a task
 *
 * @param repoRoot - Repository root path
 * @param sprintNumber - Sprint number for the task
 * @param taskId - Task ID to check
 * @param specifyDir - Specify directory (default: '.specify')
 * @returns true if hydrated context exists
 */
export function hasHydratedContext(
  repoRoot: string,
  sprintNumber: number,
  taskId: string,
  specifyDir: string = '.specify'
): boolean {
  const contextDir = join(repoRoot, getContextDir(specifyDir, sprintNumber, taskId));
  const jsonPath = join(contextDir, 'hydrated-context.json');
  return existsSync(jsonPath);
}

/**
 * Generate markdown representation of hydrated context
 */
export function generateContextMarkdown(context: HydratedContext): string {
  let md = `# Hydrated Context: ${context.taskId}

**Generated:** ${context.hydratedAt}
**Context Hash:** ${context.contextHash.slice(0, 12)}...

---

## Task Metadata

| Field | Value |
|-------|-------|
| Task ID | ${context.taskMetadata.taskId} |
| Section | ${context.taskMetadata.section || 'N/A'} |
| Owner | ${context.taskMetadata.owner || 'N/A'} |
| Status | ${context.taskMetadata.status || 'N/A'} |
| Target Sprint | ${context.taskMetadata.targetSprint || 'N/A'} |

### Description

${context.taskMetadata.description || 'No description provided.'}

### Definition of Done

${context.taskMetadata.definitionOfDone || 'No DoD specified.'}

### Dependencies

${context.taskMetadata.dependencies?.length ? context.taskMetadata.dependencies.map((d) => `- ${d}`).join('\n') : 'No dependencies.'}

---

## Dependency Artifacts

`;

  if (context.dependencyArtifacts.length === 0) {
    md += 'No dependency artifacts found.\n';
  } else {
    for (const dep of context.dependencyArtifacts) {
      md += `### ${dep.taskId}

| Artifact | Path |
|----------|------|
| Status | ${dep.status || 'Unknown'} |
| Specification | ${dep.specPath || 'Not found'} |
| Plan | ${dep.planPath || 'Not found'} |
| Delivery | ${dep.deliveryPath || 'Not found'} |
| Attestation | ${dep.attestationPath || 'Not found'} |

`;
    }
  }

  md += `---

## Codebase Patterns

`;

  if (context.codebasePatterns.length === 0) {
    md += 'No relevant codebase patterns found.\n';
  } else {
    for (const pattern of context.codebasePatterns.slice(0, 10)) {
      md += `### ${pattern.keyword} (${pattern.filePath}:${pattern.lineNumber})

**Relevance Score:** ${pattern.relevanceScore}

\`\`\`typescript
${pattern.snippet}
\`\`\`

`;
    }
  }

  md += `---

## Project Knowledge

### CLAUDE.md

${context.projectKnowledge.claudeMd ? `Loaded (${context.projectKnowledge.claudeMd.length} chars)` : 'Not found'}

### Architecture Docs

${context.projectKnowledge.architectureDocs.length ? context.projectKnowledge.architectureDocs.map((d) => `- ${d}`).join('\n') : 'None found.'}

### Domain Models

${context.projectKnowledge.domainModels.length ? context.projectKnowledge.domainModels.map((d) => `- ${d}`).join('\n') : 'None found.'}

### Schemas

${context.projectKnowledge.schemas.length ? context.projectKnowledge.schemas.map((d) => `- ${d}`).join('\n') : 'None found.'}

---

## Sources

| Type | Path | Loaded At |
|------|------|-----------|
${context.sources.map((s) => `| ${s.type} | ${s.path} | ${s.loadedAt} |`).join('\n')}

---

*Context integrity can be verified using hash: \`${context.contextHash}\`*
`;

  return md;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

export async function hydrateContextCli(taskId: string): Promise<void> {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('Error: Could not find repository root');
    process.exit(1);
  }

  console.log(`[Context Hydration] Task: ${taskId}`);
  console.log(`[Context Hydration] Repo root: ${repoRoot}`);

  try {
    // Get task record to determine sprint number
    const taskRecord = getFullTaskRecord(taskId, repoRoot);
    const sprintNumber = parseInt(taskRecord?.targetSprint || '0', 10);
    console.log(`[Context Hydration] Sprint: ${sprintNumber}`);

    const context = await hydrateContext(taskId, repoRoot);

    console.log(`[Context Hydration] Task metadata loaded`);
    console.log(`[Context Hydration] Dependencies: ${context.dependencyArtifacts.length}`);
    console.log(`[Context Hydration] Codebase patterns: ${context.codebasePatterns.length}`);
    console.log(`[Context Hydration] Project knowledge loaded`);

    const { jsonPath, mdPath } = writeHydratedContext(context, repoRoot, sprintNumber);

    console.log(`[Context Hydration] Output:`);
    console.log(`  - JSON: ${jsonPath}`);
    console.log(`  - Markdown: ${mdPath}`);
    console.log(`[Context Hydration] Context hash: ${context.contextHash.slice(0, 12)}...`);
  } catch (error) {
    console.error(`[Context Hydration] Error: ${error}`);
    process.exit(1);
  }
}

// Run CLI if executed directly
if (process.argv[1]?.endsWith('context-hydration.ts') || process.argv[1]?.endsWith('context-hydration.js')) {
  const taskId = process.argv[2];
  if (!taskId) {
    console.error('Usage: tsx context-hydration.ts <TASK_ID>');
    process.exit(1);
  }
  hydrateContextCli(taskId);
}
