#!/usr/bin/env tsx

/**
 * Sprint Validation Script for IntelliFlow CRM
 *
 * This script validates sprint readiness across multiple gates:
 * - Baseline Structure: monorepo, packages, config files
 * - Sprint Completion: Sprint_plan.csv marks all sprint tasks Done/Completed (status-only)
 * - Evidence Integrity: DONE tasks have dependencies satisfied, validations recorded, no missing artifacts
 * - Docs Hygiene: no runtime artifacts under docs
 * - Metrics Tracked State: no untracked files under docs/metrics
 * - Canonical Uniqueness: single source-of-truth for key files (FAIL always)
 *
 * Exit Codes:
 * - 0: All gates passed (or only WARNs in default mode)
 * - 1: Any gate failed (or WARNs in strict mode)
 *
 * Usage:
 *   pnpm run validate:sprint                      # Default mode, Sprint 0
 *   pnpm run validate:sprint -- --sprint 1        # Default mode, Sprint 1
 *   pnpm run validate:sprint -- --strict          # Strict mode, Sprint 0
 *   pnpm run validate:sprint -- --strict --sprint 1   # Strict mode, Sprint 1
 *   pnpm run validate:sprint0                     # Back-compat alias (same behavior)
 *   VALIDATION_STRICT=1 pnpm run validate:sprint0      # Strict via env
 *
 * @module tools/scripts/sprint-validation
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  log,
  logSection,
  logHeader,
  logGate,
  isStrictMode,
  effectiveSeverity,
  resolveSprintPlanPath,
  listGitTrackedFilesInPath,
  listGitUntrackedFiles,
  parseSprintCsv,
  checkSprintCompletion,
  findIgnoredRuntimeArtifacts,
  getHygieneAllowlist,
  isAllowedByHygieneAllowlist,
  checkCanonicalUniqueness,
  createSummary,
  printSummary,
  getExitCode,
  findRepoRoot,
  type GateResult,
} from './lib/validation-utils.js';

// ============================================================================
// Configuration
// ============================================================================

const repoRoot = findRepoRoot();

function getArgValue(names: string[]): string | undefined {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (!current) continue;

    for (const name of names) {
      if (current === name) return args[index + 1];
      if (current.startsWith(`${name}=`)) return current.slice(name.length + 1);
    }
  }
  return undefined;
}

function resolveTargetSprint(): { sprint: string; error?: string } {
  const raw = getArgValue(['--sprint']);
  if (!raw) return { sprint: '0' };

  const trimmed = raw.trim();
  const withoutPrefix = trimmed.startsWith('sprint-') ? trimmed.slice('sprint-'.length) : trimmed;
  if (!/^\d+$/.test(withoutPrefix)) {
    return {
      sprint: '0',
      error: `Invalid --sprint "${raw}" (expected an integer like 0, 1, 2...)`,
    };
  }
  return { sprint: withoutPrefix };
}

interface BaselineCheck {
  name: string;
  path: string;
  type: 'file' | 'dir';
  category: string;
}

const BASELINE_CHECKS: BaselineCheck[] = [
  // Monorepo structure
  { name: 'Root package.json', path: 'package.json', type: 'file', category: 'monorepo' },
  { name: 'pnpm-workspace.yaml', path: 'pnpm-workspace.yaml', type: 'file', category: 'monorepo' },
  { name: 'turbo.json', path: 'turbo.json', type: 'file', category: 'monorepo' },
  { name: 'Apps directory', path: 'apps', type: 'dir', category: 'monorepo' },
  { name: 'Packages directory', path: 'packages', type: 'dir', category: 'monorepo' },
  { name: 'Tests directory', path: 'tests', type: 'dir', category: 'monorepo' },

  // Configuration files
  { name: 'tsconfig.json', path: 'tsconfig.json', type: 'file', category: 'config' },
  { name: 'vitest.config.ts', path: 'vitest.config.ts', type: 'file', category: 'config' },
  { name: 'playwright.config.ts', path: 'playwright.config.ts', type: 'file', category: 'config' },
  { name: '.gitignore', path: '.gitignore', type: 'file', category: 'config' },
  { name: '.env.example', path: '.env.example', type: 'file', category: 'config' },

  // Artifact directories
  { name: 'artifacts/', path: 'artifacts', type: 'dir', category: 'artifacts' },
  { name: 'artifacts/logs/', path: 'artifacts/logs', type: 'dir', category: 'artifacts' },
  { name: 'artifacts/reports/', path: 'artifacts/reports', type: 'dir', category: 'artifacts' },

  // Core packages
  { name: 'packages/domain', path: 'packages/domain', type: 'dir', category: 'packages' },
  { name: 'packages/validators', path: 'packages/validators', type: 'dir', category: 'packages' },
  { name: 'packages/db', path: 'packages/db', type: 'dir', category: 'packages' },

  // Documentation
  { name: 'README.md', path: 'README.md', type: 'file', category: 'docs' },
  { name: 'CLAUDE.md', path: 'CLAUDE.md', type: 'file', category: 'docs' },

  // Sprint tracking
  { name: 'Project tracker app', path: 'apps/project-tracker', type: 'dir', category: 'metrics' },
  {
    name: 'Metrics directory',
    path: 'apps/project-tracker/docs/metrics',
    type: 'dir',
    category: 'metrics',
  },
];

// ============================================================================
// Gate: Baseline Structure
// ============================================================================

function runBaselineGate(): GateResult[] {
  logSection('Gate 1: Baseline Structure');

  const results: GateResult[] = [];

  for (const check of BASELINE_CHECKS) {
    const fullPath = path.join(repoRoot, check.path);
    let exists = false;

    try {
      if (check.type === 'file') {
        exists = fs.existsSync(fullPath) && fs.statSync(fullPath).isFile();
      } else {
        exists = fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
      }
    } catch {
      exists = false;
    }

    const result: GateResult = {
      name: `Baseline: ${check.name}`,
      severity: exists ? 'PASS' : 'FAIL',
      message: exists ? 'Exists' : 'Missing',
    };

    results.push(result);
    logGate(result);
  }

  return results;
}

// ============================================================================
// Gate: Sprint Completion
// ============================================================================

function runCompletionGate(targetSprint: string): GateResult[] {
  logSection(`Gate 2: Sprint ${targetSprint} Completion (CSV status only)`);

  const csvPath = resolveSprintPlanPath(repoRoot);

  if (!csvPath) {
    const result: GateResult = {
      name: 'Sprint Completion',
      severity: 'FAIL',
      message: 'Sprint_plan.csv not found in any expected location',
      details: [
        'Checked: SPRINT_PLAN_PATH env',
        'Checked: apps/project-tracker/docs/metrics/_global/Sprint_plan.csv',
        'Checked: Sprint_plan.csv (repo root)',
      ],
    };
    logGate(result);
    return [result];
  }

  log(`Resolved CSV: ${csvPath}`, 'gray');

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const { tasks, errors } = parseSprintCsv(csvContent);

  if (errors.length > 0) {
    const result: GateResult = {
      name: 'Sprint Completion',
      severity: 'FAIL',
      message: 'CSV parsing errors',
      details: errors,
    };
    logGate(result);
    return [result];
  }

  const completion = checkSprintCompletion(tasks, targetSprint);

  if (completion.totalTasks === 0) {
    const result: GateResult = {
      name: 'Sprint Completion',
      severity: 'WARN',
      message: `No Sprint ${targetSprint} tasks found in CSV`,
    };
    logGate(result);
    return [result];
  }

  const details: string[] = [
    `Total Sprint ${targetSprint} tasks: ${completion.totalTasks}`,
    `Completed: ${completion.completedTasks}`,
    `Incomplete: ${completion.incompleteTasks.length}`,
  ];

  // Show up to 5 incomplete tasks
  if (completion.incompleteTasks.length > 0) {
    details.push('');
    details.push('Incomplete tasks:');
    for (const task of completion.incompleteTasks.slice(0, 5)) {
      const title = (task['Title'] || task.Description || '').trim() || 'No title';
      const shortTitle = title.length > 60 ? `${title.slice(0, 57)}...` : title;
      details.push(`  ${task['Task ID']} [${task.Status}] ${shortTitle}`);
    }
    if (completion.incompleteTasks.length > 5) {
      details.push(`  ... and ${completion.incompleteTasks.length - 5} more`);
    }
  }

  let result: GateResult;
  if (completion.isComplete) {
    result = {
      name: 'Sprint Completion',
      severity: 'PASS',
      message: `Sprint_plan.csv marks all ${completion.totalTasks} Sprint ${targetSprint} tasks Done/Completed (status-only)`,
      details,
    };
  } else {
    result = {
      name: 'Sprint Completion',
      severity: 'WARN', // WARN in default mode, FAIL in strict
      message: `${completion.incompleteTasks.length}/${completion.totalTasks} tasks NOT complete`,
      details,
    };
  }

  logGate(result);
  return [result];
}

// ============================================================================
// Gate: Evidence Integrity (DONE semantics)
// ============================================================================

type ValidationYamlCounts = { required: number; total: number };

function parseValidationYamlCounts(yamlContent: string): Map<string, ValidationYamlCounts> {
  const counts = new Map<string, ValidationYamlCounts>();
  const lines = yamlContent.split(/\r?\n/);

  let currentTaskId: string | null = null;
  let inValidationCommands = false;
  let validationCommandsIndent: number | null = null;

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;

    const topTaskMatch = rawLine.match(/^([A-Z][A-Z0-9-]+):\s*$/);
    if (topTaskMatch) {
      currentTaskId = topTaskMatch[1];
      inValidationCommands = false;
      validationCommandsIndent = null;
      if (!counts.has(currentTaskId)) counts.set(currentTaskId, { required: 0, total: 0 });
      continue;
    }

    // If we hit a new top-level non-task key, stop attributing lines to the prior task.
    if (rawLine.match(/^[A-Za-z0-9_-]+:\s*$/) && !rawLine.match(/^[A-Z][A-Z0-9-]+:\s*$/)) {
      currentTaskId = null;
      inValidationCommands = false;
      validationCommandsIndent = null;
      continue;
    }

    if (!currentTaskId) continue;

    const vcMatch = rawLine.match(/^(\s+)validation_commands:\s*$/);
    if (vcMatch) {
      inValidationCommands = true;
      validationCommandsIndent = vcMatch[1].length;
      continue;
    }

    if (inValidationCommands) {
      const indent = rawLine.match(/^(\s*)/)?.[1].length ?? 0;
      if (
        validationCommandsIndent !== null &&
        indent <= validationCommandsIndent &&
        !rawLine.match(/^\s*-/)
      ) {
        inValidationCommands = false;
        validationCommandsIndent = null;
      }
    }

    if (!inValidationCommands) continue;

    if (rawLine.match(/^\s*-\s*command:\s*/)) {
      counts.get(currentTaskId)!.total += 1;
      continue;
    }

    const requiredMatch = rawLine.match(/^\s*required:\s*(true|false)\s*$/);
    if (requiredMatch && requiredMatch[1] === 'true') {
      counts.get(currentTaskId)!.required += 1;
    }
  }

  return counts;
}

function runEvidenceIntegrityGate(targetSprint: string): GateResult[] {
  logSection(`Gate 3: Evidence Integrity (Sprint ${targetSprint} DONE semantics)`);

  const results: GateResult[] = [];

  const csvPath = resolveSprintPlanPath(repoRoot);
  if (!csvPath) {
    const result: GateResult = {
      name: 'Evidence Integrity',
      severity: 'SKIP',
      message: 'Sprint_plan.csv not found; cannot validate evidence integrity',
    };
    logGate(result);
    return [result];
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const { tasks, errors } = parseSprintCsv(csvContent);
  if (errors.length > 0) {
    const result: GateResult = {
      name: 'Evidence Integrity',
      severity: 'FAIL',
      message: 'CSV parsing errors; cannot validate evidence integrity',
      details: errors,
    };
    logGate(result);
    return [result];
  }

  const sprintTasks = tasks.filter((t) => String(t['Target Sprint']) === targetSprint);
  const doneTasks = sprintTasks.filter((t) => t.Status === 'Done' || t.Status === 'Completed');
  const sprintTaskIds = new Set(sprintTasks.map((t) => t['Task ID']));

  // Load validation.yaml (optional) to measure "required validations" vs task JSON evidence.
  let validationCounts: Map<string, ValidationYamlCounts> = new Map();
  const validationYamlPath = path.join(
    repoRoot,
    'apps/project-tracker/docs/metrics/validation.yaml'
  );
  if (fs.existsSync(validationYamlPath)) {
    try {
      validationCounts = parseValidationYamlCounts(fs.readFileSync(validationYamlPath, 'utf-8'));
    } catch {
      // Non-fatal; treat as missing optional metadata
      validationCounts = new Map();
    }
  }

  // Use tracked task JSON files as source of truth (prevents local-only untracked data from giving green output).
  const sprintTracked = listGitTrackedFilesInPath(
    repoRoot,
    `apps/project-tracker/docs/metrics/sprint-${targetSprint}`
  );
  if (sprintTracked.error) {
    const result: GateResult = {
      name: 'Evidence: Task JSON Coverage',
      severity: 'WARN',
      message: `Could not list tracked task JSON files for sprint-${targetSprint} (git ls-files failed)`,
      details: [sprintTracked.error],
    };
    results.push(result);
    logGate(result);
    return results;
  }

  const trackedTaskJsonFiles = sprintTracked.files
    .filter((f) => f.endsWith('.json'))
    .filter((f) => !path.posix.basename(f).startsWith('_'));

  const parseErrors: string[] = [];
  const missingTaskId: string[] = [];
  const duplicateTaskId: string[] = [];
  const tasksById = new Map<string, { file: string; data: any }>();

  for (const repoRel of trackedTaskJsonFiles) {
    const fullPath = path.join(repoRoot, repoRel);
    try {
      const raw = fs.readFileSync(fullPath, 'utf-8');
      const data = JSON.parse(raw);
      const taskId: unknown = data?.task_id ?? data?.taskId;

      if (typeof taskId !== 'string' || taskId.trim().length === 0) {
        missingTaskId.push(repoRel);
        continue;
      }

      if (tasksById.has(taskId)) {
        duplicateTaskId.push(taskId);
        continue;
      }

      tasksById.set(taskId, { file: repoRel, data });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      parseErrors.push(`${repoRel}: ${msg}`);
    }
  }

  const missingJsonForDone = doneTasks
    .map((t) => t['Task ID'])
    .filter((taskId) => !tasksById.has(taskId));

  const orphanedTrackedJson = [...tasksById.keys()].filter((taskId) => !sprintTaskIds.has(taskId));

  if (parseErrors.length > 0) {
    const result: GateResult = {
      name: 'Evidence: Task JSON Parse',
      severity: 'FAIL',
      message: `Failed to parse ${parseErrors.length} tracked sprint-${targetSprint} task JSON file(s)`,
      details: parseErrors,
    };
    results.push(result);
    logGate(result);
  }

  if (duplicateTaskId.length > 0) {
    const result: GateResult = {
      name: 'Evidence: Task ID Uniqueness (JSON)',
      severity: 'FAIL',
      message: `Duplicate task_id found in tracked sprint-${targetSprint} task JSON files (${duplicateTaskId.length})`,
      details: duplicateTaskId,
    };
    results.push(result);
    logGate(result);
  }

  if (missingTaskId.length > 0) {
    const result: GateResult = {
      name: 'Evidence: Task ID Presence (JSON)',
      severity: 'FAIL',
      message: `Missing task_id in ${missingTaskId.length} tracked sprint-${targetSprint} task JSON file(s)`,
      details: missingTaskId,
    };
    results.push(result);
    logGate(result);
  }

  {
    let result: GateResult;
    if (missingJsonForDone.length === 0 && orphanedTrackedJson.length === 0) {
      result = {
        name: 'Evidence: Task JSON Coverage',
        severity: 'PASS',
        message: `All ${doneTasks.length} DONE sprint-${targetSprint} tasks have tracked task JSON files`,
      };
    } else {
      const details: string[] = [];
      if (missingJsonForDone.length > 0) {
        details.push(
          `Missing tracked JSON for DONE tasks in sprint-${targetSprint} (${missingJsonForDone.length}):`
        );
        details.push(...missingJsonForDone.slice(0, 10).map((id) => `  ${id}`));
      }
      if (orphanedTrackedJson.length > 0) {
        if (details.length > 0) details.push('');
        details.push(
          `Orphaned tracked task JSONs not in sprint-${targetSprint} CSV (${orphanedTrackedJson.length}):`
        );
        details.push(...orphanedTrackedJson.slice(0, 10).map((id) => `  ${id}`));
      }

      result = {
        name: 'Evidence: Task JSON Coverage',
        severity: 'WARN',
        message: `sprint-${targetSprint} task JSON coverage mismatch (missing=${missingJsonForDone.length}, orphaned=${orphanedTrackedJson.length})`,
        details,
      };
    }
    results.push(result);
    logGate(result);
  }

  const depsUnsatisfied: string[] = [];
  const depsUnknown: string[] = [];

  const missingValidations: string[] = [];
  const failedValidations: string[] = [];

  const artifactsMissing: string[] = [];

  for (const task of doneTasks) {
    const taskId = task['Task ID'];
    const entry = tasksById.get(taskId);
    if (!entry) continue;

    const data = entry.data;

    const deps = data?.dependencies;
    const allSatisfied = deps?.all_satisfied;
    if (typeof allSatisfied === 'boolean') {
      if (!allSatisfied)
        depsUnsatisfied.push(`${taskId}: dependencies.all_satisfied=false (${entry.file})`);
    } else {
      depsUnknown.push(`${taskId}: dependencies.all_satisfied missing (${entry.file})`);
    }

    const validations = Array.isArray(data?.validations) ? data.validations : [];
    if (validations.length === 0) {
      const req = validationCounts.get(taskId)?.required ?? 0;
      missingValidations.push(
        req > 0
          ? `${taskId}: 0 validations recorded (validation.yaml requires ${req})`
          : `${taskId}: 0 validations recorded`
      );
    } else {
      for (const v of validations) {
        const passed = v?.passed;
        const exitCode = v?.exit_code;
        if (passed === false || (typeof exitCode === 'number' && exitCode !== 0)) {
          const name = typeof v?.name === 'string' ? v.name : 'unknown';
          failedValidations.push(`${taskId}: validation failed (${name})`);
        }
      }
    }

    const missing = Array.isArray(data?.artifacts?.missing) ? data.artifacts.missing : [];
    if (missing.length > 0) {
      artifactsMissing.push(`${taskId}: ${missing.length} missing artifact(s)`);
    }
  }

  {
    const result: GateResult =
      depsUnsatisfied.length === 0 && depsUnknown.length === 0
        ? {
            name: 'Evidence: Dependencies Satisfied',
            severity: 'PASS',
            message: `All DONE sprint-${targetSprint} tasks have dependencies satisfied`,
          }
        : {
            name: 'Evidence: Dependencies Satisfied',
            severity: 'WARN',
            message: `DONE tasks with unmet/unknown dependencies: ${depsUnsatisfied.length + depsUnknown.length}`,
            details: [...depsUnsatisfied, ...depsUnknown],
          };
    results.push(result);
    logGate(result);
  }

  {
    let result: GateResult;
    if (failedValidations.length > 0) {
      result = {
        name: 'Evidence: Validations Recorded',
        severity: 'FAIL',
        message: `Found ${failedValidations.length} failed validation(s) recorded in task JSONs`,
        details: failedValidations,
      };
    } else if (missingValidations.length > 0) {
      result = {
        name: 'Evidence: Validations Recorded',
        severity: 'WARN',
        message: `DONE tasks missing validations evidence: ${missingValidations.length}`,
        details: missingValidations,
      };
    } else {
      result = {
        name: 'Evidence: Validations Recorded',
        severity: 'PASS',
        message: `All DONE sprint-${targetSprint} tasks have validation evidence recorded`,
      };
    }
    results.push(result);
    logGate(result);
  }

  {
    const result: GateResult =
      artifactsMissing.length === 0
        ? {
            name: 'Evidence: Artifacts Complete',
            severity: 'PASS',
            message: `No missing artifacts recorded for DONE sprint-${targetSprint} tasks`,
          }
        : {
            name: 'Evidence: Artifacts Complete',
            severity: 'WARN',
            message: `DONE tasks with missing artifacts recorded: ${artifactsMissing.length}`,
            details: artifactsMissing,
          };
    results.push(result);
    logGate(result);
  }

  return results;
}

// ============================================================================
// Gate: Docs Hygiene
// ============================================================================

function runHygieneGate(): GateResult[] {
  logSection('Gate 4: Docs Hygiene (no runtime artifacts)');

  const docsPath = 'apps/project-tracker/docs';
  const forbiddenPatterns = ['.locks', '.status', 'logs', 'backups', 'artifacts'];
  const allowlist = getHygieneAllowlist(repoRoot);

  const ignoredResult = findIgnoredRuntimeArtifacts(repoRoot, docsPath, forbiddenPatterns);

  let result: GateResult;
  if (ignoredResult.error) {
    result = {
      name: 'Docs Hygiene',
      severity: 'WARN', // WARN in default mode, FAIL in strict
      message: 'Hygiene check NOT RUN (git ls-files failed)',
      details: [ignoredResult.error],
    };
  } else {
    // Filter out allowed paths
    const violations = ignoredResult.files.filter(
      (f) => !isAllowedByHygieneAllowlist(f, allowlist)
    );

    if (violations.length === 0) {
      result = {
        name: 'Docs Hygiene',
        severity: 'PASS',
        message: 'No forbidden docs runtime artifacts detected (tracked/ignored/untracked)',
      };
    } else {
      result = {
        name: 'Docs Hygiene',
        severity: 'WARN', // WARN in default mode, FAIL in strict
        message: `Found ${violations.length} forbidden docs runtime artifact(s) (tracked/ignored/untracked)`,
        details: violations.slice(0, 10),
      };
    }
  }

  logGate(result);
  return [result];
}

// ============================================================================
// Gate: Metrics Tracked State (no untracked metrics files)
// ============================================================================

function runMetricsTrackedStateGate(): GateResult[] {
  logSection('Gate 5: Metrics Tracked State (no untracked files)');

  const metricsPath = 'apps/project-tracker/docs/metrics';
  const untracked = listGitUntrackedFiles(repoRoot, metricsPath);

  let result: GateResult;
  if (untracked.error) {
    result = {
      name: 'Metrics Tracked State',
      severity: 'WARN', // WARN in default mode, FAIL in strict
      message: 'Could not check untracked files under docs/metrics (git ls-files failed)',
      details: [untracked.error],
    };
  } else if (untracked.files.length === 0) {
    result = {
      name: 'Metrics Tracked State',
      severity: 'PASS',
      message: 'No untracked files under docs/metrics',
    };
  } else {
    result = {
      name: 'Metrics Tracked State',
      severity: 'WARN', // WARN in default mode, FAIL in strict
      message: `Found ${untracked.files.length} untracked file(s) under docs/metrics`,
      details: untracked.files.slice(0, 10),
    };
  }

  logGate(result);
  return [result];
}

// ============================================================================
// Gate: Canonical Uniqueness
// ============================================================================

function runUniquenessGate(): GateResult[] {
  logSection('Gate 6: Canonical Uniqueness');

  const results = checkCanonicalUniqueness(repoRoot);

  for (const result of results) {
    logGate(result);
  }

  return results;
}

// ============================================================================
// Gate: Root-Level Artifact Containment
// ============================================================================

/**
 * Runtime artifacts that MUST NOT exist at repo root.
 * These should be in artifacts/ subdirectories.
 */
const FORBIDDEN_ROOT_PATTERNS: RegExp[] = [
  /^gitleaks-report\.json$/,
  /^tree_.*\.txt$/,
  /^sonar-reports$/,
  /\.log$/,
  /^coverage$/,
  /^test-results$/,
  /^playwright-report$/,
  /^\.scannerwork$/,
];

/**
 * Allowed files that look like artifacts but are legitimate at root.
 */
const ROOT_ALLOWLIST = [
  'package.json',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'turbo.json',
  'vitest.config.ts',
  'playwright.config.ts',
  'knip.json',
  'sonar-project.properties',
  '.env.example',
  '.gitignore',
  '.prettierrc',
  '.eslintrc.js',
  'README.md',
  'CLAUDE.md',
  'PLANNING_ANALYSIS.md',
  'audit-matrix.yml',
];

function runArtifactContainmentGate(): GateResult[] {
  logSection('Gate 7: Root-Level Artifact Containment');

  const results: GateResult[] = [];

  try {
    const entries = fs.readdirSync(repoRoot);
    const violations: string[] = [];

    for (const entry of entries) {
      // Skip allowed files
      if (ROOT_ALLOWLIST.includes(entry)) continue;

      // Skip directories that are expected at root
      const entryPath = path.join(repoRoot, entry);
      const stat = fs.statSync(entryPath);
      if (stat.isDirectory()) {
        // Check for forbidden directory patterns
        if (FORBIDDEN_ROOT_PATTERNS.some((p) => p.test(entry))) {
          violations.push(`${entry}/ (directory should be in artifacts/)`);
        }
        continue;
      }

      // Check files against forbidden patterns
      if (FORBIDDEN_ROOT_PATTERNS.some((p) => p.test(entry))) {
        violations.push(`${entry} (should be in artifacts/)`);
      }
    }

    if (violations.length === 0) {
      results.push({
        name: 'Artifact Containment',
        severity: 'PASS',
        message: 'No misplaced runtime artifacts at repo root',
      });
    } else {
      results.push({
        name: 'Artifact Containment',
        severity: 'WARN',
        message: `Found ${violations.length} misplaced artifact(s) at repo root`,
        details: violations,
      });
    }
  } catch (error) {
    results.push({
      name: 'Artifact Containment',
      severity: 'WARN',
      message: `Could not check root directory: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  for (const result of results) {
    logGate(result);
  }

  return results;
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  logHeader('IntelliFlow CRM - Sprint Validation');

  const sprintArg = resolveTargetSprint();
  if (sprintArg.error) {
    log(`\n[FAIL] ${sprintArg.error}`, 'red');
    process.exit(1);
  }

  const mode = isStrictMode() ? 'STRICT' : 'DEFAULT';
  log(`\nMode: ${mode}`, isStrictMode() ? 'yellow' : 'blue');
  log(`Repo: ${repoRoot}`, 'gray');
  log(`Sprint: ${sprintArg.sprint}`, 'gray');

  // Run all gates
  const baselineResults = runBaselineGate();
  const completionResults = runCompletionGate(sprintArg.sprint);
  const evidenceResults = runEvidenceIntegrityGate(sprintArg.sprint);
  const hygieneResults = runHygieneGate();
  const metricsTrackedResults = runMetricsTrackedStateGate();
  const uniquenessResults = runUniquenessGate();
  const containmentResults = runArtifactContainmentGate();

  const allResults: GateResult[] = [
    ...baselineResults,
    ...completionResults,
    ...evidenceResults,
    ...hygieneResults,
    ...metricsTrackedResults,
    ...uniquenessResults,
    ...containmentResults,
  ];

  // High-level gate summary (separate from per-check results)
  const summarizeGate = (name: string, results: GateResult[], message?: string): GateResult => {
    let hasWarn = false;
    for (const r of results) {
      const sev = effectiveSeverity(r.severity);
      if (sev === 'FAIL') {
        return { name, severity: 'FAIL', message: message ?? 'FAIL' };
      }
      if (sev === 'WARN') hasWarn = true;
    }
    return {
      name,
      severity: hasWarn ? 'WARN' : 'PASS',
      message: message ?? (hasWarn ? 'WARN' : 'PASS'),
    };
  };

  logSection('Gate Summary');
  logGate(
    summarizeGate(
      'Baseline Structure',
      baselineResults,
      baselineResults.some((r) => r.severity === 'FAIL')
        ? `FAIL (${baselineResults.filter((r) => r.severity === 'FAIL').length}/${baselineResults.length} missing)`
        : `PASS (${baselineResults.length} checks)`
    )
  );
  logGate(
    summarizeGate(
      'Sprint Completion',
      completionResults,
      completionResults[0]?.message ?? 'NOT RUN'
    )
  );
  logGate(
    summarizeGate(
      'Evidence Integrity',
      evidenceResults,
      `Evidence checks (${evidenceResults.length} check(s))`
    )
  );
  logGate(summarizeGate('Docs Hygiene', hygieneResults, hygieneResults[0]?.message ?? 'NOT RUN'));
  logGate(
    summarizeGate(
      'Metrics Tracked State',
      metricsTrackedResults,
      metricsTrackedResults[0]?.message ?? 'NOT RUN'
    )
  );
  logGate(
    summarizeGate(
      'Canonical Uniqueness',
      uniquenessResults,
      uniquenessResults.some((r) => effectiveSeverity(r.severity) === 'FAIL')
        ? `FAIL (${uniquenessResults.filter((r) => effectiveSeverity(r.severity) === 'FAIL').length} issue(s))`
        : `PASS (${uniquenessResults.length} artifact(s))`
    )
  );
  logGate(
    summarizeGate(
      'Artifact Containment',
      containmentResults,
      containmentResults[0]?.message ?? 'NOT RUN'
    )
  );

  // Summary
  const summary = createSummary(allResults);
  printSummary(summary);

  // Final message - truthful messaging that doesn't confuse WARN with PASS
  const exitCode = getExitCode(summary);

  if (exitCode === 0) {
    if (summary.warnCount > 0) {
      log(`\n[WARN] Sprint ${sprintArg.sprint} validation completed with ${summary.warnCount} warning(s).`, 'yellow');
      log('       Status: INCOMPLETE - Issues detected that require attention.', 'yellow');
      log('       Run with --strict to treat warnings as failures.', 'gray');
    } else if (summary.passCount > 0 && summary.failCount === 0) {
      log(`\n[PASS] Sprint ${sprintArg.sprint} validations passed.`, 'green');
      log('       Status: All gates verified successfully.', 'green');
    } else {
      log(`\n[INFO] Sprint ${sprintArg.sprint} validation completed.`, 'blue');
    }
  } else {
    log(`\n[FAIL] Sprint ${sprintArg.sprint} validation failed with ${summary.failCount} error(s).`, 'red');
    log('       Status: BLOCKED - Fix errors before proceeding.', 'red');
  }

  log('\nScope:', 'gray');
  log('      - Baseline readiness (files/dirs): YES', 'gray');
  log('      - Sprint completion (CSV status only): YES', 'gray');
  log('      - Evidence integrity (task JSON semantics): YES', 'gray');
  log('      - Docs hygiene (runtime artifacts under docs): YES', 'gray');
  log('      - Metrics tracked state (untracked files under docs/metrics): YES', 'gray');
  log('      - Canonical uniqueness (tracked files): YES', 'gray');
  log('      - Artifact containment (root-level runtime artifacts): YES', 'gray');
  log('      - Tests/typecheck/lint: NO', 'gray');

  process.exit(exitCode);
}

main();
