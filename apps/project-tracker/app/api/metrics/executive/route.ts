import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { access, readdir } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { normalizeStatus, STATUS_GROUPS } from '@/lib/csv-parser';
import { PATHS, MONOREPO_ROOT } from '@/lib/paths';
import { NO_CACHE_HEADERS } from '@/lib/api-types';

export const dynamic = 'force-dynamic';

interface CsvTask {
  'Task ID': string;
  Section: string;
  Description: string;
  Owner: string;
  Status: string;
  'Target Sprint': string;
  Dependencies: string;
  'Artifacts To Track': string;
  KPIs: string;
}

// Detail types for expandable metrics - using snake_case for API consistency
interface MismatchDetail {
  task_id: string;
  description: string;
  missing_artifacts: string[];
}

interface UntrackedArtifactDetail {
  path: string;
  type: 'package' | 'app' | 'infra';
}

interface ForwardDependencyDetail {
  task_id: string;
  task_description: string;
  task_sprint: number;
  depends_on: string;
  dep_sprint: number;
}

interface BottleneckDetail {
  sprint: number;
  dependency_count: number;
  blocked_tasks: string[];
}

interface TaskRequiringRevert {
  task_id: string;
  description: string;
  current_status: string;
  missing_artifacts: string[];
  missing_evidence: string[];
}

interface ContextGapDetail {
  task_id: string;
  description: string;
  missing_pack: boolean;
  missing_ack: boolean;
}

interface PlanGapDetail {
  task_id: string;
  description: string;
  plan_path: string;
  total_files: number;
  verified_files: number;
  missing_files: string[];
  checkbox_total: number;
  checkbox_checked: number;
}

interface HashMismatchDetail {
  task_id: string;
  description: string;
  mismatched_files: string[];
  total_files: number;
  matched_count: number;
}

interface CompletionIntegrityDetail {
  task_id: string;
  description: string;
  issues: string[];
  checkbox_pct: number | null;
  has_attestation: boolean;
  attestation_verdict: string | null;
  validation_count: number;
}

interface ExecutiveMetrics {
  total_tasks: number;
  completed: { count: number; percentage: number };
  in_progress: { count: number; percentage: number };
  backlog: { count: number; percentage: number };
  plan_vs_code_mismatches: number;
  plan_vs_code_mismatches_details: MismatchDetail[];
  tasks_requiring_revert: number;
  tasks_requiring_revert_details: TaskRequiringRevert[];
  untracked_code_artifacts: number;
  untracked_code_artifacts_details: UntrackedArtifactDetail[];
  forward_dependencies: number;
  forward_dependencies_details: ForwardDependencyDetail[];
  sprint_bottlenecks: string;
  sprint_bottlenecks_details: BottleneckDetail[];
  missing_context_tasks: number;
  missing_context_tasks_details: ContextGapDetail[];
  incomplete_plan_deliverables: number;
  incomplete_plan_deliverables_details: PlanGapDetail[];
  context_hash_mismatches: number;
  context_hash_mismatches_details: HashMismatchDetail[];
  completion_integrity_failures: number;
  completion_integrity_details: CompletionIntegrityDetail[];
  generated_at: string;
}

function parseDependencies(deps: string): string[] {
  if (!deps || deps.trim() === '' || deps === '-' || deps === 'N/A') {
    return [];
  }
  return deps
    .split(/[,;\n]+/)
    .map((d) => d.trim())
    .filter((d) => d.length > 0 && d !== '-');
}

// Prefixes that represent file paths to validate
const PATH_PREFIXES = ['ARTIFACT:', 'EVIDENCE:', 'SPEC:', 'PLAN:', 'CONTEXT:', 'PRD:'] as const;
// Prefixes that are metadata/commands, not file paths
const METADATA_PREFIXES = ['VALIDATE:', 'GATE:', 'AUDIT:', 'FILE:', 'ENV:', 'POLICY:'] as const;

interface ParsedArtifacts {
  artifacts: string[]; // ARTIFACT: paths (code/config files)
  evidence: string[]; // EVIDENCE: paths (attestation files)
  specs: string[]; // SPEC: paths (specification files)
  plans: string[]; // PLAN: paths (planning files)
  contexts: string[]; // CONTEXT: paths (hydrated context files)
  prds: string[]; // PRD: paths (product requirement documents)
  raw: string[]; // All items for backward compatibility
}

function parseArtifactsWithPrefixes(artifactsStr: string): ParsedArtifacts {
  const result: ParsedArtifacts = {
    artifacts: [],
    evidence: [],
    specs: [],
    plans: [],
    contexts: [],
    prds: [],
    raw: [],
  };

  if (
    !artifactsStr ||
    artifactsStr.trim() === '' ||
    artifactsStr === '-' ||
    artifactsStr === 'N/A'
  ) {
    return result;
  }

  const items = artifactsStr
    .split(/[,;\n]+/)
    .map((a) => a.trim())
    .filter((a) => a.length > 0 && a !== '-');

  for (const item of items) {
    result.raw.push(item);

    // Check for path prefixes (ARTIFACT:, EVIDENCE:, SPEC:, PLAN:)
    const pathPrefix = PATH_PREFIXES.find((prefix) => item.startsWith(prefix));
    if (pathPrefix) {
      const path = item.slice(pathPrefix.length).trim();
      if (path) {
        if (pathPrefix === 'ARTIFACT:') {
          result.artifacts.push(path);
        } else if (pathPrefix === 'EVIDENCE:') {
          result.evidence.push(path);
        } else if (pathPrefix === 'SPEC:') {
          result.specs.push(path);
        } else if (pathPrefix === 'PLAN:') {
          result.plans.push(path);
        } else if (pathPrefix === 'CONTEXT:') {
          result.contexts.push(path);
        } else if (pathPrefix === 'PRD:') {
          result.prds.push(path);
        }
      }
    }
    // Skip metadata prefixes (VALIDATE:, GATE:, AUDIT:, etc.)
    else if (METADATA_PREFIXES.some((prefix) => item.startsWith(prefix))) {
      // Intentionally skip - these are not file paths
    }
    // Legacy: items without prefix are treated as artifact paths
    else {
      result.artifacts.push(item);
    }
  }

  return result;
}

function getSprintNumber(sprint: string): number | null {
  if (!sprint || sprint === 'Continuous' || sprint === '-') {
    return null;
  }
  const num = parseInt(sprint, 10);
  return isNaN(num) ? null : num;
}

async function checkArtifactExists(artifactPath: string): Promise<boolean> {
  try {
    // Handle glob patterns by checking if any matching file exists
    if (artifactPath.includes('*')) {
      // For patterns, just check if parent directory exists
      const parentDir = artifactPath.split('*')[0].replace(/\/+$/, '');
      if (parentDir) {
        await access(join(process.cwd(), '..', '..', parentDir));
        return true;
      }
      return false;
    }
    await access(join(process.cwd(), '..', '..', artifactPath));
    return true;
  } catch {
    return false;
  }
}

async function getUntrackedArtifactsWithDetails(
  trackedArtifacts: Set<string>
): Promise<{ count: number; details: UntrackedArtifactDetail[] }> {
  const keyDirs: Array<{ dir: string; type: 'package' | 'app' | 'infra' }> = [
    { dir: 'packages', type: 'package' },
    { dir: 'apps', type: 'app' },
    { dir: 'infra', type: 'infra' },
  ];
  const details: UntrackedArtifactDetail[] = [];

  for (const { dir, type } of keyDirs) {
    try {
      const dirPath = join(process.cwd(), '..', '..', dir);
      await access(dirPath);

      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const srcPath = `${dir}/${entry.name}/src`;
          const packagePath = `${dir}/${entry.name}`;

          // Check if this package/app is tracked
          let isTracked = false;
          for (const tracked of trackedArtifacts) {
            if (tracked.startsWith(packagePath) || tracked.startsWith(srcPath)) {
              isTracked = true;
              break;
            }
          }

          if (!isTracked) {
            try {
              await access(join(process.cwd(), '..', '..', srcPath));
              details.push({ path: packagePath, type });
            } catch {
              // src doesn't exist, skip
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  return { count: details.length, details };
}

// --- Context & Plan deliverable helpers ---

function getAttestationDirs(taskId: string, sprintNumber: number | null, allSprintDirs: string[]): string[] {
  const dirs: string[] = [];
  const root = join(MONOREPO_ROOT, '.specify', 'sprints');

  // 1. Try CSV sprint first (most likely location)
  if (sprintNumber !== null) {
    dirs.push(join(root, `sprint-${sprintNumber}`, 'attestations', taskId));
  }

  // 2. Scan all other sprint dirs for cross-sprint matches
  for (const sd of allSprintDirs) {
    const dir = join(root, sd, 'attestations', taskId);
    if (!dirs.includes(dir) && existsSync(dir)) {
      dirs.push(dir);
    }
  }

  // 3. Legacy location
  dirs.push(join(MONOREPO_ROOT, 'artifacts', 'attestations', taskId));

  return dirs;
}

function checkContextExists(taskId: string, sprintNumber: number | null, allSprintDirs: string[]): { hasPack: boolean; hasAck: boolean } {
  const dirs = getAttestationDirs(taskId, sprintNumber, allSprintDirs);

  let hasPack = false;
  let hasAck = false;

  for (const dir of dirs) {
    if (!hasPack) {
      if (existsSync(join(dir, 'context_pack.manifest.json')) ||
          existsSync(join(dir, `${taskId}-context_pack.manifest.json`))) {
        hasPack = true;
      }
    }
    if (!hasAck) {
      // Check attestation.json OR {taskId}-attestation.json for context_acknowledgment section
      const attestNames = ['attestation.json', `${taskId}-attestation.json`];
      for (const attestName of attestNames) {
        if (hasAck) break;
        const attestPath = join(dir, attestName);
        if (existsSync(attestPath)) {
          try {
            const content = readFileSync(attestPath, 'utf-8');
            const parsed = JSON.parse(content);
            if (parsed.context_acknowledgment) {
              hasAck = true;
            }
          } catch { /* invalid JSON */ }
        }
      }
      // Also check standalone context_ack.json OR {taskId}-context_ack.json
      if (!hasAck && (existsSync(join(dir, 'context_ack.json')) ||
                      existsSync(join(dir, `${taskId}-context_ack.json`)))) {
        hasAck = true;
      }
    }
    if (hasPack && hasAck) break;
  }

  return { hasPack, hasAck };
}

function checkPlanDeliverables(
  taskId: string,
  sprintNumber: number | null,
  allSprintDirs: string[]
): { planExists: boolean; planPath: string; total: number; verified: number; missingFiles: string[]; checkboxTotal: number; checkboxChecked: number; checkboxPct: number | null } {
  const result = { planExists: false, planPath: '', total: 0, verified: 0, missingFiles: [] as string[], checkboxTotal: 0, checkboxChecked: 0, checkboxPct: null as number | null };

  // Look for plan file in sprint-based planning dir and legacy locations
  const root = join(MONOREPO_ROOT, '.specify', 'sprints');
  const candidates: string[] = [];
  if (sprintNumber !== null) {
    candidates.push(join(root, `sprint-${sprintNumber}`, 'planning', `${taskId}-plan.md`));
  }
  // Scan all sprint dirs for cross-sprint plan files
  for (const sd of allSprintDirs) {
    const candidate = join(root, sd, 'planning', `${taskId}-plan.md`);
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }
  candidates.push(join(MONOREPO_ROOT, '.specify', taskId, `${taskId}-plan.md`));

  let planContent: string | null = null;
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        planContent = readFileSync(candidate, 'utf-8');
        result.planPath = candidate.replace(MONOREPO_ROOT + '/', '').replace(MONOREPO_ROOT + '\\', '');
        result.planExists = true;
        break;
      } catch { /* can't read */ }
    }
  }

  if (!planContent) return result;

  // Count plan checkboxes (same regex as validation-summary API)
  const checkboxRegex = /^(\s*)-\s*\[([ xX])\]\s*(.+)$/;
  for (const line of planContent.split('\n')) {
    const match = line.replace(/\r$/, '').match(checkboxRegex);
    if (match) {
      result.checkboxTotal++;
      if (match[2].toLowerCase() === 'x') result.checkboxChecked++;
    }
  }
  result.checkboxPct = result.checkboxTotal > 0
    ? Math.round((result.checkboxChecked / result.checkboxTotal) * 1000) / 10
    : null;

  // Extract files from "Files to Create:" and "Files to Modify:" sections
  // Only take the FIRST backtick-wrapped string per list item (the file path).
  // Subsequent backticks on the same line are descriptions/annotations (e.g., `contactId`).
  const fileRegex = /\*\*Files to (?:Create|Modify):\*\*\s*\n((?:\s*-\s*`[^`]+`.*\n?)*)/gi;
  const linePathRegex = /^\s*-\s*`([^`]+)`/;
  const filePaths: string[] = [];

  let sectionMatch;
  while ((sectionMatch = fileRegex.exec(planContent)) !== null) {
    const section = sectionMatch[1];
    const lines = section.split('\n');
    for (const line of lines) {
      const lineMatch = line.match(linePathRegex);
      if (lineMatch) {
        filePaths.push(lineMatch[1]);
      }
    }
  }

  result.total = filePaths.length;
  for (const fp of filePaths) {
    if (existsSync(join(MONOREPO_ROOT, fp))) {
      result.verified++;
    } else {
      // Check extension variants: .ts↔.tsx, .js↔.jsx (plans sometimes list wrong extension)
      const extVariant = fp.endsWith('.ts') && !fp.endsWith('.tsx')
        ? fp + 'x'
        : fp.endsWith('.tsx')
          ? fp.slice(0, -1)
          : fp.endsWith('.js') && !fp.endsWith('.jsx')
            ? fp + 'x'
            : fp.endsWith('.jsx')
              ? fp.slice(0, -1)
              : null;
      if (extVariant && existsSync(join(MONOREPO_ROOT, extVariant))) {
        result.verified++;
      } else {
        result.missingFiles.push(fp);
      }
    }
  }

  return result;
}

function checkAttestationIntegrity(
  taskId: string,
  sprintNumber: number | null,
  allSprintDirs: string[]
): { exists: boolean; verdict: string | null; validationCount: number } {
  const dirs = getAttestationDirs(taskId, sprintNumber, allSprintDirs);
  const attestNames = ['attestation.json', `${taskId}-attestation.json`];

  for (const dir of dirs) {
    for (const name of attestNames) {
      const attestPath = join(dir, name);
      if (existsSync(attestPath)) {
        try {
          const raw = JSON.parse(readFileSync(attestPath, 'utf-8'));
          const validationCount = Array.isArray(raw.validation_results) ? raw.validation_results.length : 0;
          const verdict = raw.verdict ?? raw.status ?? null;
          return { exists: true, verdict, validationCount };
        } catch { /* invalid JSON */ }
      }
    }
  }

  return { exists: false, verdict: null, validationCount: 0 };
}

function checkContextHashes(
  taskId: string,
  sprintNumber: number | null,
  allSprintDirs: string[]
): { hasBoth: boolean; mismatched: string[]; total: number; matched: number } {
  const result = { hasBoth: false, mismatched: [] as string[], total: 0, matched: 0 };

  const dirs = getAttestationDirs(taskId, sprintNumber, allSprintDirs);

  let manifestFiles: Array<{ path: string; sha256: string }> | null = null;
  let ackFiles: Array<{ path: string; sha256: string }> | null = null;

  for (const dir of dirs) {
    // Load manifest (check both unprefixed and prefixed names)
    if (!manifestFiles) {
      const manifestNames = ['context_pack.manifest.json', `${taskId}-context_pack.manifest.json`];
      for (const name of manifestNames) {
        if (manifestFiles) break;
        const manifestPath = join(dir, name);
        if (existsSync(manifestPath)) {
          try {
            const raw = JSON.parse(readFileSync(manifestPath, 'utf-8'));
            manifestFiles = (raw.files || []).map((f: { path: string; sha256?: string; hash?: string }) => ({
              path: f.path,
              sha256: f.sha256 || f.hash || '',
            }));
          } catch { /* invalid */ }
        }
      }
    }

    // Load ack (check attestation.json and prefixed variant)
    if (!ackFiles) {
      const attestNames = ['attestation.json', `${taskId}-attestation.json`];
      for (const name of attestNames) {
        if (ackFiles) break;
        const attestPath = join(dir, name);
        if (existsSync(attestPath)) {
          try {
            const raw = JSON.parse(readFileSync(attestPath, 'utf-8'));
            if (raw.context_acknowledgment?.files_read) {
              ackFiles = raw.context_acknowledgment.files_read.map((f: { path: string; sha256?: string; hash?: string }) => ({
                path: f.path,
                sha256: f.sha256 || f.hash || '',
              }));
            }
          } catch { /* invalid */ }
        }
      }
      // Check standalone context_ack.json and prefixed variant
      if (!ackFiles) {
        const ackNames = ['context_ack.json', `${taskId}-context_ack.json`];
        for (const name of ackNames) {
          if (ackFiles) break;
          const ackPath = join(dir, name);
          if (existsSync(ackPath)) {
            try {
              const raw = JSON.parse(readFileSync(ackPath, 'utf-8'));
              ackFiles = (raw.files_read || []).map((f: { path: string; sha256?: string; hash?: string }) => ({
                path: f.path,
                sha256: f.sha256 || f.hash || '',
              }));
            } catch { /* invalid */ }
          }
        }
      }
    }

    if (manifestFiles && ackFiles) break;
  }

  if (!manifestFiles || !ackFiles) return result;

  result.hasBoth = true;
  const ackMap = new Map(ackFiles.map((f) => [f.path, f.sha256]));

  for (const mf of manifestFiles) {
    if (!mf.sha256) continue; // Skip files without hashes
    result.total++;
    const ackHash = ackMap.get(mf.path);
    if (ackHash && ackHash === mf.sha256) {
      result.matched++;
    } else if (ackHash && ackHash !== mf.sha256) {
      result.mismatched.push(mf.path);
    }
    // If ackHash is undefined (file not in ack), it's not a "mismatch" per se, just missing
  }

  return result;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sprintParam = searchParams.get('sprint');

    const csvPath = PATHS.sprintTracking.SPRINT_PLAN_CSV;
    const csvContent = await readFile(csvPath, 'utf-8');
    let tasks = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
      bom: true,
    }) as CsvTask[];

    // Filter by sprint if specified (not 'all')
    if (sprintParam && sprintParam !== 'all') {
      if (sprintParam === 'continuous') {
        tasks = tasks.filter((t) => t['Target Sprint']?.toLowerCase() === 'continuous');
      } else {
        const sprintNum = parseInt(sprintParam, 10);
        if (!isNaN(sprintNum)) {
          tasks = tasks.filter((t) => getSprintNumber(t['Target Sprint']) === sprintNum);
        }
      }
    }

    // Count statuses using shared normalizeStatus
    let completed = 0;
    let inProgress = 0;
    let backlog = 0;
    const total = tasks.length;

    for (const task of tasks) {
      const status = normalizeStatus(task.Status || '');
      if (STATUS_GROUPS.completed.includes(status)) {
        completed++;
      } else if (STATUS_GROUPS.active.includes(status)) {
        inProgress++;
      } else {
        backlog++;
      }
    }

    // Build task maps for lookups
    const taskSprintMap = new Map<string, number | null>();
    const taskDescriptionMap = new Map<string, string>();

    for (const task of tasks) {
      taskSprintMap.set(task['Task ID'], getSprintNumber(task['Target Sprint']));
      taskDescriptionMap.set(task['Task ID'], task.Description || '');
    }

    // Calculate forward dependencies with details
    const forwardDepsDetails: ForwardDependencyDetail[] = [];

    for (const task of tasks) {
      const taskSprint = getSprintNumber(task['Target Sprint']);
      if (taskSprint === null) continue;

      const deps = parseDependencies(task.Dependencies);
      for (const depId of deps) {
        const depSprint = taskSprintMap.get(depId);
        if (depSprint !== null && depSprint !== undefined && depSprint > taskSprint) {
          forwardDepsDetails.push({
            task_id: task['Task ID'],
            task_description: task.Description?.substring(0, 50) + '...' || '',
            task_sprint: taskSprint,
            depends_on: depId,
            dep_sprint: depSprint,
          });
        }
      }
    }

    // Calculate plan-vs-code mismatches with details
    const mismatchDetails: MismatchDetail[] = [];
    const tasksRequiringRevertDetails: TaskRequiringRevert[] = [];
    const trackedArtifacts = new Set<string>();

    for (const task of tasks) {
      const parsed = parseArtifactsWithPrefixes(task['Artifacts To Track']);
      const status = (task.Status || '').toLowerCase().trim();
      const isCompleted = status === 'completed' || status === 'done';

      // Track all artifact paths for untracked detection
      for (const artifact of parsed.artifacts) {
        trackedArtifacts.add(artifact);
      }

      // Only check completed tasks for mismatches
      const hasPathsToCheck =
        parsed.artifacts.length > 0 ||
        parsed.evidence.length > 0 ||
        parsed.specs.length > 0 ||
        parsed.plans.length > 0 ||
        parsed.contexts.length > 0 ||
        parsed.prds.length > 0;
      if (isCompleted && hasPathsToCheck) {
        const missingArtifacts: string[] = [];
        const missingEvidence: string[] = [];

        // Check ARTIFACT: paths
        for (const artifact of parsed.artifacts) {
          const exists = await checkArtifactExists(artifact);
          if (!exists) {
            missingArtifacts.push(artifact);
          }
        }

        // Check EVIDENCE: paths
        for (const evidence of parsed.evidence) {
          const exists = await checkArtifactExists(evidence);
          if (!exists) {
            missingEvidence.push(`EVIDENCE:${evidence}`);
          }
        }

        // Check SPEC: paths
        for (const spec of parsed.specs) {
          const exists = await checkArtifactExists(spec);
          if (!exists) {
            missingArtifacts.push(`SPEC:${spec}`);
          }
        }

        // Check PLAN: paths
        for (const plan of parsed.plans) {
          const exists = await checkArtifactExists(plan);
          if (!exists) {
            missingArtifacts.push(`PLAN:${plan}`);
          }
        }

        // Check CONTEXT: paths
        for (const context of parsed.contexts) {
          const exists = await checkArtifactExists(context);
          if (!exists) {
            missingArtifacts.push(`CONTEXT:${context}`);
          }
        }

        // Check PRD: paths
        for (const prd of parsed.prds) {
          const exists = await checkArtifactExists(prd);
          if (!exists) {
            missingArtifacts.push(`PRD:${prd}`);
          }
        }

        // If any artifacts or evidence missing, track as mismatch
        if (missingArtifacts.length > 0 || missingEvidence.length > 0) {
          // Add to mismatch details (for backward compatibility)
          mismatchDetails.push({
            task_id: task['Task ID'],
            description: task.Description?.substring(0, 50) + '...' || '',
            missing_artifacts: [...missingArtifacts, ...missingEvidence],
          });

          // Add to tasks requiring revert (new governance feature)
          tasksRequiringRevertDetails.push({
            task_id: task['Task ID'],
            description: task.Description?.substring(0, 50) + '...' || '',
            current_status: task.Status,
            missing_artifacts: missingArtifacts.filter(
              (a) => !a.startsWith('SPEC:') && !a.startsWith('PLAN:')
            ),
            missing_evidence: missingEvidence,
          });
        }
      }
    }

    // --- New context, plan deliverables, and hash checks ---
    // Cache all sprint attestation dirs for cross-sprint lookup
    const sprintAttestationRoot = join(MONOREPO_ROOT, '.specify', 'sprints');
    let allSprintDirs: string[] = [];
    try {
      const entries = readdirSync(sprintAttestationRoot, { withFileTypes: true });
      allSprintDirs = entries
        .filter(e => e.isDirectory() && e.name.startsWith('sprint-'))
        .map(e => e.name);
    } catch { /* .specify/sprints/ doesn't exist */ }

    // Only check tasks that have EVIDENCE: artifacts (went through formal attestation workflow).
    // Tasks without EVIDENCE: are legacy/simple tasks that predate the context pack system.
    const contextGapDetails: ContextGapDetail[] = [];
    const planGapDetails: PlanGapDetail[] = [];
    const hashMismatchDetails: HashMismatchDetail[] = [];

    for (const task of tasks) {
      const status = (task.Status || '').toLowerCase().trim();
      const isCompleted = status === 'completed' || status === 'done';
      if (!isCompleted) continue;

      const parsed = parseArtifactsWithPrefixes(task['Artifacts To Track']);
      const hasEvidenceArtifacts = parsed.evidence.length > 0;

      const taskId = task['Task ID'];
      const sprintNum = taskSprintMap.get(taskId) ?? null;
      const desc = (task.Description || '').substring(0, 50) + '...';

      // a) Context Pack & Acknowledgment Check — only for tasks with EVIDENCE: artifacts
      //    Missing ack = no attestation ceremony (always flagged).
      //    Missing pack only = hydration skipped (only flagged for sprint >= 5 where
      //    the hydration workflow was established; older tasks predate it).
      const PACK_REQUIRED_FROM_SPRINT = 5;
      if (hasEvidenceArtifacts) {
        const ctx = checkContextExists(taskId, sprintNum, allSprintDirs);
        if (!ctx.hasAck) {
          // Missing ack = no attestation ceremony at all — always flag
          contextGapDetails.push({
            task_id: taskId,
            description: desc,
            missing_pack: !ctx.hasPack,
            missing_ack: true,
          });
        } else if (!ctx.hasPack && sprintNum !== null && sprintNum >= PACK_REQUIRED_FROM_SPRINT) {
          // Has ack but no pack — only flag for recent sprints where hydration is expected
          contextGapDetails.push({
            task_id: taskId,
            description: desc,
            missing_pack: true,
            missing_ack: false,
          });
        }
      }

      // b) Plan Deliverables Check — any completed task with a plan file
      //    Flags both missing files AND unchecked steps
      const plan = checkPlanDeliverables(taskId, sprintNum, allSprintDirs);
      if (plan.planExists) {
        const hasMissingFiles = plan.total > 0 && plan.verified < plan.total;
        const hasUncheckedSteps = plan.checkboxTotal > 0 && plan.checkboxChecked < plan.checkboxTotal;
        if (hasMissingFiles || hasUncheckedSteps) {
          planGapDetails.push({
            task_id: taskId,
            description: desc,
            plan_path: plan.planPath,
            total_files: plan.total,
            verified_files: plan.verified,
            missing_files: plan.missingFiles.slice(0, 5),
            checkbox_total: plan.checkboxTotal,
            checkbox_checked: plan.checkboxChecked,
          });
        }
      }

      // c) Context Hash Verification — only for tasks with EVIDENCE: artifacts
      if (hasEvidenceArtifacts) {
        const hashes = checkContextHashes(taskId, sprintNum, allSprintDirs);
        if (hashes.hasBoth && hashes.mismatched.length > 0) {
          hashMismatchDetails.push({
            task_id: taskId,
            description: desc,
            mismatched_files: hashes.mismatched.slice(0, 5),
            total_files: hashes.total,
            matched_count: hashes.matched,
          });
        }
      }
    }

    // --- Completion Integrity Sweep ---
    // Catch "Completed" tasks that are missing attestation, have low checkbox completion,
    // or lack the required 4 validations (TypeScript, Tests, Lint, Build).
    const integrityFailures: CompletionIntegrityDetail[] = [];

    for (const task of tasks) {
      const status = (task.Status || '').toLowerCase().trim();
      if (status !== 'completed' && status !== 'done') continue;

      const taskId = task['Task ID']?.trim();
      if (!taskId) continue;

      const sprintNum = taskSprintMap.get(taskId) ?? null;
      const issues: string[] = [];

      // Reuse the plan check we already computed above (avoids double-reading)
      const planResult = checkPlanDeliverables(taskId, sprintNum, allSprintDirs);

      // Check 1: Plan checkbox completion — completed tasks must have 100%
      if (planResult.planExists && planResult.checkboxTotal > 0 && planResult.checkboxChecked < planResult.checkboxTotal) {
        issues.push(
          `Plan steps: ${planResult.checkboxChecked}/${planResult.checkboxTotal} checked (${planResult.checkboxPct}%) — must be 100% for completed tasks`
        );
      }

      // Check 2: Plan deliverables — files listed in plan but missing on disk
      if (planResult.planExists && planResult.total > 0 && planResult.verified < planResult.total) {
        const missingCount = planResult.total - planResult.verified;
        const sample = planResult.missingFiles.slice(0, 3).map(f => f.split('/').pop()).join(', ');
        issues.push(
          `Plan deliverables: ${planResult.verified}/${planResult.total} files exist on disk (missing: ${sample}${missingCount > 3 ? ` +${missingCount - 3} more` : ''})`
        );
      }

      // Check 3: Attestation existence and completeness
      const attestResult = checkAttestationIntegrity(taskId, sprintNum, allSprintDirs);
      if (!attestResult.exists) {
        issues.push('Missing attestation.json');
      } else {
        if (attestResult.verdict && attestResult.verdict !== 'COMPLETE' && attestResult.verdict !== 'PASS') {
          issues.push(`Attestation verdict: ${attestResult.verdict} (expected COMPLETE)`);
        }
        if (attestResult.validationCount < 4) {
          issues.push(
            `Only ${attestResult.validationCount}/4 validations recorded (need TypeScript, Tests, Lint, Build)`
          );
        }
      }

      if (issues.length > 0) {
        integrityFailures.push({
          task_id: taskId,
          description: (task.Description || '').substring(0, 80),
          issues,
          checkbox_pct: planResult.checkboxPct ?? null,
          has_attestation: attestResult.exists,
          attestation_verdict: attestResult.verdict,
          validation_count: attestResult.validationCount,
        });
      }
    }

    // Calculate untracked artifacts with details
    const untrackedResult = await getUntrackedArtifactsWithDetails(trackedArtifacts);

    // Calculate sprint bottlenecks with details
    const sprintDepCounts = new Map<number, { count: number; tasks: string[] }>();

    for (const task of tasks) {
      const deps = parseDependencies(task.Dependencies);
      for (const depId of deps) {
        const depSprint = taskSprintMap.get(depId);
        if (depSprint !== null && depSprint !== undefined) {
          const current = sprintDepCounts.get(depSprint) || { count: 0, tasks: [] };
          current.count++;
          if (!current.tasks.includes(task['Task ID'])) {
            current.tasks.push(task['Task ID']);
          }
          sprintDepCounts.set(depSprint, current);
        }
      }
    }

    // Sort and get top bottleneck sprints
    const sortedBottlenecks = Array.from(sprintDepCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);

    const bottleneckDetails: BottleneckDetail[] = sortedBottlenecks.map(([sprint, data]) => ({
      sprint,
      dependency_count: data.count,
      blocked_tasks: data.tasks.slice(0, 10), // Limit to first 10 tasks
    }));

    const bottleneckStr =
      sortedBottlenecks.length > 0
        ? sortedBottlenecks.map(([sprint]) => sprint).join(', ')
        : 'None';

    const metrics: ExecutiveMetrics = {
      total_tasks: total,
      completed: {
        count: completed,
        percentage: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
      },
      in_progress: {
        count: inProgress,
        percentage: total > 0 ? Math.round((inProgress / total) * 1000) / 10 : 0,
      },
      backlog: {
        count: backlog,
        percentage: total > 0 ? Math.round((backlog / total) * 1000) / 10 : 0,
      },
      plan_vs_code_mismatches: mismatchDetails.length,
      plan_vs_code_mismatches_details: mismatchDetails,
      tasks_requiring_revert: tasksRequiringRevertDetails.length,
      tasks_requiring_revert_details: tasksRequiringRevertDetails,
      untracked_code_artifacts: untrackedResult.count,
      untracked_code_artifacts_details: untrackedResult.details,
      forward_dependencies: forwardDepsDetails.length,
      forward_dependencies_details: forwardDepsDetails,
      sprint_bottlenecks: bottleneckStr,
      sprint_bottlenecks_details: bottleneckDetails,
      missing_context_tasks: contextGapDetails.length,
      missing_context_tasks_details: contextGapDetails,
      incomplete_plan_deliverables: planGapDetails.length,
      incomplete_plan_deliverables_details: planGapDetails,
      context_hash_mismatches: hashMismatchDetails.length,
      context_hash_mismatches_details: hashMismatchDetails,
      completion_integrity_failures: integrityFailures.length,
      completion_integrity_details: integrityFailures,
      generated_at: new Date().toISOString(),
    };

    return NextResponse.json(metrics, {
      headers: NO_CACHE_HEADERS,
    });
  } catch (error) {
    console.error('Error calculating executive metrics:', error);
    return NextResponse.json({ error: 'Failed to calculate executive metrics' }, { status: 500 });
  }
}
