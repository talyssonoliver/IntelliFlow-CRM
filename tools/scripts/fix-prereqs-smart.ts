/**
 * Smart Pre-requisites Fix
 *
 * Strategy:
 * 1. Parse original plain-text pre-requisites → POLICY: or ENV: tags
 * 2. For each dependency, inherit its PRIMARY output file (first non-wildcard artifact)
 * 3. Add mandatory governance files
 * 4. Limit to max 5 inherited files to avoid context overflow
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { parse } from 'csv-parse/sync';
import { join } from 'node:path';

const CSV_PATH = join(process.cwd(), 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');

// Mandatory governance files (always included)
const GOVERNANCE_FILES = [
  'artifacts/sprint0/codex-run/Framework.md',
  'audit-matrix.yml',
];

// Maximum inherited files per task (to avoid overflow)
const MAX_INHERITED_FILES = 5;

// ============================================================================
// ORIGINAL PRE-REQUISITES MAPPING
// ============================================================================

interface OriginalTask {
  taskId: string;
  originalPrereqs: string;
  dependencies: string[];
  artifacts: string[];
}

/**
 * Classify a plain-text requirement into POLICY:, ENV:, or FILE:
 */
function classifyRequirement(
  req: string
): { type: 'POLICY' | 'ENV' | 'FILE'; value: string } | null {
  const lower = req.toLowerCase().trim();
  if (!lower) return null;

  // Known software/tool names that should NOT be treated as files
  const knownTools = ['node.js', 'next.js', 'vue.js', 'react.js', 'nuxt.js', 'express.js'];
  for (const tool of knownTools) {
    if (lower.includes(tool)) {
      return { type: 'ENV', value: req.trim() };
    }
  }

  // File references - must have path separator OR be a config file extension
  // AND must look like a path (contain / or start with a typical path pattern)
  if (
    lower.includes('/') ||
    lower.includes('\\') ||
    (lower.includes('.') &&
      /^[a-z0-9_-]+\.(json|yaml|yml|md|ts|js|prisma|toml|config|txt)$/i.test(lower))
  ) {
    // Extract file path - must contain a slash or be a root config file
    const fileMatch = req.match(/([a-zA-Z0-9_./-]+\/[a-zA-Z0-9_./-]+\.[a-z]{2,5})/);
    if (fileMatch) {
      return { type: 'FILE', value: fileMatch[1] };
    }
    // Root config files
    const rootConfigMatch = req.match(/^([a-z0-9_-]+\.(json|yaml|yml|toml|config\.js))$/i);
    if (rootConfigMatch) {
      return { type: 'FILE', value: rootConfigMatch[1] };
    }
  }

  // Environment/Access requirements
  if (
    lower.includes('access') ||
    lower.includes('account') ||
    lower.includes('key') ||
    lower.includes('license') ||
    lower.includes('api key') ||
    lower.includes('installed') ||
    lower.includes('configured') ||
    lower.includes('setup') ||
    lower.includes('ready') ||
    lower.includes('provisioned') ||
    lower.includes('credentials')
  ) {
    return { type: 'ENV', value: req.trim() };
  }

  // Policy/Approval requirements
  if (
    lower.includes('approved') ||
    lower.includes('complete') ||
    lower.includes('defined') ||
    lower.includes('identified') ||
    lower.includes('evaluated') ||
    lower.includes('selected') ||
    lower.includes('strategy') ||
    lower.includes('vision') ||
    lower.includes('alignment') ||
    lower.includes('requirements') ||
    lower.includes('checklist') ||
    lower.includes('mapped')
  ) {
    return { type: 'POLICY', value: req.trim() };
  }

  // Default to ENV for ambiguous requirements
  return { type: 'ENV', value: req.trim() };
}

/**
 * Parse comma-separated requirements into typed tags
 */
function parseOriginalPrereqs(prereqs: string): string[] {
  if (!prereqs || prereqs.trim() === '') return [];

  const parts = prereqs
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p);
  const tags: string[] = [];

  for (const part of parts) {
    const classified = classifyRequirement(part);
    if (classified) {
      tags.push(`${classified.type}:${classified.value}`);
    }
  }

  return tags;
}

/**
 * Extract primary output file from artifacts (first non-wildcard file)
 */
function getPrimaryArtifact(artifacts: string): string | null {
  if (!artifacts) return null;

  const parts = artifacts
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p);

  for (const part of parts) {
    // Skip wildcards
    if (part.includes('*')) continue;

    // Must have an extension or be a known config file
    if (part.includes('.') || part === 'turbo.json' || part === 'pnpm-workspace.yaml') {
      // Clean up any ARTIFACT: prefix if already tagged
      const clean = part.replace(/^ARTIFACT:/, '');
      return clean;
    }
  }

  return null;
}

// ============================================================================
// DEPENDENCY GRAPH BUILDING
// ============================================================================

interface TaskData {
  taskId: string;
  originalPrereqs: string;
  dependencies: string[];
  primaryArtifact: string | null;
  convertedPrereqs: string;
}

function buildTaskMap(tasks: Record<string, string>[]): Map<string, TaskData> {
  const taskMap = new Map<string, TaskData>();

  for (const task of tasks) {
    const taskId = task['Task ID'];
    const deps = (task['Dependencies'] || '')
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d);

    taskMap.set(taskId, {
      taskId,
      originalPrereqs: task['Pre-requisites'] || '',
      dependencies: deps,
      primaryArtifact: getPrimaryArtifact(task['Artifacts To Track'] || ''),
      convertedPrereqs: '',
    });
  }

  return taskMap;
}

/**
 * Get inherited files from dependencies (max depth 1, limited count)
 */
function getInheritedFiles(
  taskId: string,
  taskMap: Map<string, TaskData>,
  maxFiles: number = MAX_INHERITED_FILES
): string[] {
  const task = taskMap.get(taskId);
  if (!task) return [];

  const inheritedFiles: string[] = [];

  for (const depId of task.dependencies) {
    const depTask = taskMap.get(depId);
    if (depTask && depTask.primaryArtifact) {
      inheritedFiles.push(depTask.primaryArtifact);
    }

    // Stop if we have enough
    if (inheritedFiles.length >= maxFiles) break;
  }

  return inheritedFiles.slice(0, maxFiles);
}

/**
 * Build smart pre-requisites for a task
 */
function buildSmartPrereqs(taskId: string, taskMap: Map<string, TaskData>): string {
  const task = taskMap.get(taskId);
  if (!task) return '';

  const tags: string[] = [];

  // 1. Always add mandatory governance files
  for (const file of GOVERNANCE_FILES) {
    tags.push(`FILE:${file}`);
  }

  // 2. Convert original plain-text requirements
  const originalTags = parseOriginalPrereqs(task.originalPrereqs);
  tags.push(...originalTags);

  // 3. Inherit primary files from dependencies
  const inheritedFiles = getInheritedFiles(taskId, taskMap);
  for (const file of inheritedFiles) {
    tags.push(`FILE:${file}`);
  }

  // Deduplicate
  const unique = [...new Set(tags)];

  return unique.join(';');
}

// ============================================================================
// CSV PROCESSING
// ============================================================================

function escapeField(value: string): string {
  if (!value) return '""';
  const needsQuotes =
    value.includes(',') || value.includes('"') || value.includes('\n') || value.includes(';');
  const escaped = value.replace(/\"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function stringifyCsv(tasks: Record<string, string>[], headers: string[]): string {
  const headerRow = headers.map(escapeField).join(',');
  const dataRows = tasks.map((task) => headers.map((h) => escapeField(task[h] || '')).join(','));
  return [headerRow, ...dataRows].join('\n');
}

// ============================================================================
// GIT OPERATIONS
// ============================================================================

function getOriginalCsvFromGit(): Record<string, string>[] {
  try {
    const gitOutput = execSync(
      'git show HEAD:"apps/project-tracker/docs/metrics/_global/Sprint_plan.csv"',
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
    return parse(gitOutput, { columns: true, bom: true, relax_quotes: true }) as Record<
      string,
      string
    >[];
  } catch (error) {
    console.error('Failed to get original CSV from git:', error);
    throw error;
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('=== Smart Pre-requisites Fix ===\n');

  // Read current CSV (with correct Artifacts and Owner)
  console.log('Reading current CSV...');
  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const currentTasks = parse(csvContent, {
    columns: true,
    bom: true,
    relax_quotes: true,
  }) as Record<string, string>[];
  console.log(`Found ${currentTasks.length} tasks in current CSV\n`);

  // Get original CSV from git (with original Pre-requisites)
  console.log('Fetching original CSV from git...');
  const originalTasks = getOriginalCsvFromGit();
  console.log(`Found ${originalTasks.length} tasks in original CSV\n`);

  // Build map of original pre-requisites and original artifacts
  const originalMap = new Map<string, { prereqs: string; artifacts: string; deps: string[] }>();
  for (const task of originalTasks) {
    const taskId = task['Task ID'];
    originalMap.set(taskId, {
      prereqs: task['Pre-requisites'] || '',
      artifacts: task['Artifacts To Track'] || '',
      deps: (task['Dependencies'] || '')
        .split(',')
        .map((d) => d.trim())
        .filter((d) => d),
    });
  }

  // Build task map for dependency resolution (using ORIGINAL artifacts for inheritance)
  interface TaskDataForInheritance {
    taskId: string;
    originalPrereqs: string;
    dependencies: string[];
    primaryArtifact: string | null;
  }

  const taskMapForInheritance = new Map<string, TaskDataForInheritance>();
  for (const [taskId, orig] of originalMap.entries()) {
    taskMapForInheritance.set(taskId, {
      taskId,
      originalPrereqs: orig.prereqs,
      dependencies: orig.deps,
      primaryArtifact: getPrimaryArtifact(orig.artifacts),
    });
  }

  // Process each task
  console.log('Processing tasks...\n');
  let updated = 0;

  for (const task of currentTasks) {
    const taskId = task['Task ID'];
    const original = originalMap.get(taskId);

    if (!original) {
      console.log(`  WARN: No original data for ${taskId}`);
      continue;
    }

    // Build smart pre-requisites using original data
    const tags: string[] = [];

    // 1. Always add mandatory governance files
    for (const file of GOVERNANCE_FILES) {
      tags.push(`FILE:${file}`);
    }

    // 2. Convert original plain-text requirements
    const originalTags = parseOriginalPrereqs(original.prereqs);
    tags.push(...originalTags);

    // 3. Inherit primary files from dependencies (using original artifacts)
    const inheritedFiles: string[] = [];
    for (const depId of original.deps) {
      const depData = taskMapForInheritance.get(depId);
      if (depData && depData.primaryArtifact) {
        inheritedFiles.push(depData.primaryArtifact);
      }
      if (inheritedFiles.length >= MAX_INHERITED_FILES) break;
    }
    for (const file of inheritedFiles) {
      tags.push(`FILE:${file}`);
    }

    // Deduplicate
    const unique = [...new Set(tags)];
    const newPrereqs = unique.join(';');

    const oldPrereqs = task['Pre-requisites'];
    if (newPrereqs !== oldPrereqs) {
      task['Pre-requisites'] = newPrereqs;
      updated++;
    }
  }

  console.log(`Updated ${updated} tasks\n`);

  // Write back
  const headers = Object.keys(currentTasks[0]);
  const output = stringifyCsv(currentTasks, headers);
  writeFileSync(CSV_PATH, output, 'utf-8');
  console.log(`Written to: ${CSV_PATH}\n`);

  // Show samples
  console.log('=== Sample Conversions ===\n');
  const sampleIds = [
    'EXC-INIT-001',
    'AI-SETUP-001',
    'ENV-004-AI',
    'ENV-006-AI',
    'IFC-003',
    'IFC-010',
  ];

  for (const id of sampleIds) {
    const task = currentTasks.find((t) => t['Task ID'] === id);
    const orig = originalMap.get(id);
    if (task && orig) {
      console.log(`${id}:`);
      console.log(`  Original: "${orig.prereqs}"`);
      console.log(`  Deps: [${orig.deps.join(', ')}]`);
      console.log(`  New: ${task['Pre-requisites']}`);
      console.log('');
    }
  }
}

main().catch(console.error);
