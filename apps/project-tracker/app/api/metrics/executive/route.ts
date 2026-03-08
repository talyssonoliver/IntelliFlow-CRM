import { NextResponse } from 'next/server';
import { readFile, access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
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

type ArtifactType = 'package' | 'app' | 'infra';

interface UntrackedArtifactDetail {
  path: string;
  type: ArtifactType;
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
  has_attestation: boolean | null;
  attestation_verdict: string | null;
  validation_count: number | null;
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
const PATH_PREFIXES = ['ARTIFACT:', 'EVIDENCE:', 'SPEC:', 'PLAN:', 'CONTEXT:', 'PRD:', 'ATTESTATION:'] as const;
// Prefixes that are metadata/commands, not file paths
const METADATA_PREFIXES = ['VALIDATE:', 'GATE:', 'AUDIT:', 'FILE:', 'ENV:', 'POLICY:'] as const;

interface ParsedArtifacts {
  artifacts: string[]; // ARTIFACT: paths (code/config files)
  evidence: string[]; // EVIDENCE: paths (attestation files)
  specs: string[]; // SPEC: paths (specification files)
  plans: string[]; // PLAN: paths (planning files)
  contexts: string[]; // CONTEXT: paths (hydrated context files)
  prds: string[]; // PRD: paths (product requirement documents)
  attestations: string[]; // ATTESTATION: paths (attestation JSON files)
  raw: string[]; // All items for backward compatibility
}

type PathPrefixKey = (typeof PATH_PREFIXES)[number];
const PREFIX_TO_FIELD: Record<PathPrefixKey, keyof Omit<ParsedArtifacts, 'raw'>> = {
  'ARTIFACT:': 'artifacts',
  'EVIDENCE:': 'evidence',
  'SPEC:': 'specs',
  'PLAN:': 'plans',
  'CONTEXT:': 'contexts',
  'PRD:': 'prds',
  'ATTESTATION:': 'attestations',
};

function isEmptyArtifactsStr(artifactsStr: string): boolean {
  return (
    !artifactsStr || artifactsStr.trim() === '' || artifactsStr === '-' || artifactsStr === 'N/A'
  );
}

function parseArtifactsWithPrefixes(artifactsStr: string): ParsedArtifacts {
  const result: ParsedArtifacts = {
    artifacts: [],
    evidence: [],
    specs: [],
    plans: [],
    contexts: [],
    prds: [],
    attestations: [],
    raw: [],
  };

  if (isEmptyArtifactsStr(artifactsStr)) {
    return result;
  }

  const items = artifactsStr
    .split(/[,;\n]+/)
    .map((a) => a.trim())
    .filter((a) => a.length > 0 && a !== '-');

  for (const item of items) {
    result.raw.push(item);

    const pathPrefix = PATH_PREFIXES.find((prefix) => item.startsWith(prefix));
    if (pathPrefix) {
      const path = item.slice(pathPrefix.length).trim();
      if (path) {
        result[PREFIX_TO_FIELD[pathPrefix]].push(path);
      }
      continue;
    }

    // Skip metadata prefixes (VALIDATE:, GATE:, AUDIT:, etc.)
    if (METADATA_PREFIXES.some((prefix) => item.startsWith(prefix))) {
      continue;
    }

    // Legacy: items without prefix are treated as artifact paths
    result.artifacts.push(item);
  }

  return result;
}

function getSprintNumber(sprint: string): number | null {
  if (!sprint || sprint === 'Continuous' || sprint === '-') {
    return null;
  }
  const num = Number.parseInt(sprint, 10);
  return Number.isNaN(num) ? null : num;
}

async function checkArtifactExists(artifactPath: string): Promise<boolean> {
  try {
    // Handle glob patterns by checking if any matching file exists
    if (artifactPath.includes('*')) {
      // For patterns, just check if parent directory exists
      const parentDir = artifactPath.split('*')[0].replace(/\/{1,100}$/, '');
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

function isPackageTracked(packagePath: string, srcPath: string, trackedArtifacts: Set<string>): boolean {
  for (const tracked of trackedArtifacts) {
    if (tracked.startsWith(packagePath) || tracked.startsWith(srcPath)) return true;
  }
  return false;
}

async function addUntrackedEntriesFromDir(
  dir: string,
  type: 'package' | 'app' | 'infra',
  trackedArtifacts: Set<string>,
  details: UntrackedArtifactDetail[]
): Promise<void> {
  try {
    const dirPath = join(process.cwd(), '..', '..', dir);
    await access(dirPath);
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const srcPath = `${dir}/${entry.name}/src`;
      const packagePath = `${dir}/${entry.name}`;
      if (isPackageTracked(packagePath, srcPath, trackedArtifacts)) continue;
      try {
        await access(join(process.cwd(), '..', '..', srcPath));
        details.push({ path: packagePath, type });
      } catch {
        // src doesn't exist, skip
      }
    }
  } catch {
    // Directory doesn't exist, skip
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
    await addUntrackedEntriesFromDir(dir, type, trackedArtifacts, details);
  }
  return { count: details.length, details };
}

// --- Context & Plan deliverable helpers ---

function getAttestationDirs(
  taskId: string,
  sprintNumber: number | null,
  allSprintDirs: string[]
): string[] {
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

function dirHasPack(dir: string, taskId: string): boolean {
  return (
    existsSync(join(dir, 'context_pack.manifest.json')) ||
    existsSync(join(dir, `${taskId}-context_pack.manifest.json`))
  );
}

function dirHasAckInAttestation(dir: string, taskId: string): boolean {
  const attestNames = ['attestation.json', `${taskId}-attestation.json`];
  for (const attestName of attestNames) {
    const attestPath = join(dir, attestName);
    if (!existsSync(attestPath)) continue;
    try {
      const parsed = JSON.parse(readFileSync(attestPath, 'utf-8'));
      if (parsed.context_acknowledgment) return true;
    } catch {
      /* invalid JSON */
    }
  }
  return false;
}

function dirHasAck(dir: string, taskId: string): boolean {
  if (dirHasAckInAttestation(dir, taskId)) return true;
  return (
    existsSync(join(dir, 'context_ack.json')) ||
    existsSync(join(dir, `${taskId}-context_ack.json`))
  );
}

function checkContextExists(
  taskId: string,
  sprintNumber: number | null,
  allSprintDirs: string[]
): { hasPack: boolean; hasAck: boolean } {
  const dirs = getAttestationDirs(taskId, sprintNumber, allSprintDirs);
  let hasPack = false;
  let hasAck = false;

  for (const dir of dirs) {
    if (!hasPack) hasPack = dirHasPack(dir, taskId);
    if (!hasAck) hasAck = dirHasAck(dir, taskId);
    if (hasPack && hasAck) break;
  }

  return { hasPack, hasAck };
}

function getExtensionVariant(fp: string): string | null {
  if (fp.endsWith('.tsx')) return fp.slice(0, -1);
  if (fp.endsWith('.ts')) return fp + 'x';
  if (fp.endsWith('.jsx')) return fp.slice(0, -1);
  if (fp.endsWith('.js')) return fp + 'x';
  return null;
}

function buildPlanCandidates(taskId: string, sprintNumber: number | null, allSprintDirs: string[]): string[] {
  const root = join(MONOREPO_ROOT, '.specify', 'sprints');
  const candidates: string[] = [];
  if (sprintNumber !== null) {
    candidates.push(join(root, `sprint-${sprintNumber}`, 'planning', `${taskId}-plan.md`));
  }
  for (const sd of allSprintDirs) {
    const candidate = join(root, sd, 'planning', `${taskId}-plan.md`);
    if (!candidates.includes(candidate)) candidates.push(candidate);
  }
  candidates.push(join(MONOREPO_ROOT, '.specify', taskId, `${taskId}-plan.md`));
  return candidates;
}

function readPlanContent(candidates: string[]): { content: string; path: string } | null {
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const content = readFileSync(candidate, 'utf-8');
      const path = candidate.replaceAll(MONOREPO_ROOT + '/', '').replaceAll(MONOREPO_ROOT + '\\', '');
      return { content, path };
    } catch {
      /* can't read */
    }
  }
  return null;
}

function countPlanCheckboxes(planContent: string): { total: number; checked: number; pct: number | null } {
  const checkboxRegex = /^(\s*)-\s*\[([ xX])\]\s*([^\n]{1,500})$/;
  let total = 0;
  let checked = 0;
  for (const line of planContent.split('\n')) {
    const match = checkboxRegex.exec(line.replace(/\r$/, ''));
    if (match) {
      total++;
      if (match[2].toLowerCase() === 'x') checked++;
    }
  }
  const pct = total > 0 ? Math.round((checked / total) * 1000) / 10 : null;
  return { total, checked, pct };
}

function extractPlanFilePaths(planContent: string): string[] {
  const fileRegex =
    /\*\*Files to (?:Create|Modify):\*\*\s*\n((?:[ \t]*-[ \t]*`[^`]+`[^\n]{0,500}\n?){0,200})/gi;
  const linePathRegex = /^\s*-\s*`([^`]+)`/;
  const filePaths: string[] = [];
  let sectionMatch;
  while ((sectionMatch = fileRegex.exec(planContent)) !== null) {
    for (const line of sectionMatch[1].split('\n')) {
      const lineMatch = linePathRegex.exec(line);
      if (lineMatch) filePaths.push(lineMatch[1]);
    }
  }
  return filePaths;
}

function verifyPlanFilePaths(filePaths: string[]): { verified: number; missingFiles: string[] } {
  let verified = 0;
  const missingFiles: string[] = [];
  for (const fp of filePaths) {
    if (existsSync(join(MONOREPO_ROOT, fp))) {
      verified++;
      continue;
    }
    const extVariant = getExtensionVariant(fp);
    if (extVariant && existsSync(join(MONOREPO_ROOT, extVariant))) {
      verified++;
    } else {
      missingFiles.push(fp);
    }
  }
  return { verified, missingFiles };
}

function checkPlanDeliverables(
  taskId: string,
  sprintNumber: number | null,
  allSprintDirs: string[]
): {
  planExists: boolean;
  planPath: string;
  total: number;
  verified: number;
  missingFiles: string[];
  checkboxTotal: number;
  checkboxChecked: number;
  checkboxPct: number | null;
} {
  const empty = {
    planExists: false, planPath: '', total: 0, verified: 0,
    missingFiles: [] as string[], checkboxTotal: 0, checkboxChecked: 0, checkboxPct: null as number | null,
  };

  const candidates = buildPlanCandidates(taskId, sprintNumber, allSprintDirs);
  const found = readPlanContent(candidates);
  if (!found) return empty;

  const { content: planContent, path: planPath } = found;
  const { total: checkboxTotal, checked: checkboxChecked, pct: checkboxPct } = countPlanCheckboxes(planContent);
  const filePaths = extractPlanFilePaths(planContent);
  const { verified, missingFiles } = verifyPlanFilePaths(filePaths);

  return {
    planExists: true, planPath,
    total: filePaths.length, verified, missingFiles,
    checkboxTotal, checkboxChecked, checkboxPct,
  };
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
          const validationCount = Array.isArray(raw.validation_results)
            ? raw.validation_results.length
            : 0;
          const verdict = raw.verdict ?? raw.status ?? null;
          return { exists: true, verdict, validationCount };
        } catch {
          /* invalid JSON */
        }
      }
    }
  }

  return { exists: false, verdict: null, validationCount: 0 };
}

type HashEntry = { path: string; sha256: string };

function normalizeHashEntry(f: { path: string; sha256?: string; hash?: string }): HashEntry {
  return { path: f.path, sha256: f.sha256 || f.hash || '' };
}

function loadManifestFromDir(
  dir: string,
  taskId: string
): HashEntry[] | null {
  const names = ['context_pack.manifest.json', `${taskId}-context_pack.manifest.json`];
  for (const name of names) {
    const p = join(dir, name);
    if (!existsSync(p)) continue;
    try {
      const raw = JSON.parse(readFileSync(p, 'utf-8'));
      return (raw.files || []).map(normalizeHashEntry);
    } catch {
      /* invalid */
    }
  }
  return null;
}

function loadAckFilesFromDir(dir: string, taskId: string): HashEntry[] | null {
  const attestNames = ['attestation.json', `${taskId}-attestation.json`];
  for (const name of attestNames) {
    const p = join(dir, name);
    if (!existsSync(p)) continue;
    try {
      const raw = JSON.parse(readFileSync(p, 'utf-8'));
      if (raw.context_acknowledgment?.files_read) {
        return raw.context_acknowledgment.files_read.map(normalizeHashEntry);
      }
    } catch {
      /* invalid */
    }
  }
  const ackNames = ['context_ack.json', `${taskId}-context_ack.json`];
  for (const name of ackNames) {
    const p = join(dir, name);
    if (!existsSync(p)) continue;
    try {
      const raw = JSON.parse(readFileSync(p, 'utf-8'));
      return (raw.files_read || []).map(normalizeHashEntry);
    } catch {
      /* invalid */
    }
  }
  return null;
}

function isManifestBackfilled(dirs: string[], taskId: string): boolean {
  const names = ['context_pack.manifest.json', `${taskId}-context_pack.manifest.json`];
  for (const dir of dirs) {
    for (const name of names) {
      const p = join(dir, name);
      if (!existsSync(p)) continue;
      try {
        const raw = JSON.parse(readFileSync(p, 'utf-8'));
        if (raw.backfilled === true) return true;
      } catch {
        /* invalid */
      }
      return false; // found manifest but not backfilled
    }
  }
  return false;
}

function checkContextHashes(
  taskId: string,
  sprintNumber: number | null,
  allSprintDirs: string[]
): { hasBoth: boolean; mismatched: string[]; total: number; matched: number } {
  const result = { hasBoth: false, mismatched: [] as string[], total: 0, matched: 0 };
  const dirs = getAttestationDirs(taskId, sprintNumber, allSprintDirs);

  let manifestFiles: HashEntry[] | null = null;
  let ackFiles: HashEntry[] | null = null;

  for (const dir of dirs) {
    manifestFiles ??= loadManifestFromDir(dir, taskId);
    ackFiles ??= loadAckFilesFromDir(dir, taskId);
    if (manifestFiles && ackFiles) break;
  }

  if (!manifestFiles || !ackFiles) return result;

  if (isManifestBackfilled(dirs, taskId)) {
    result.hasBoth = true;
    result.total = manifestFiles.filter((f) => f.sha256).length;
    result.matched = result.total;
    return result;
  }

  result.hasBoth = true;
  const ackMap = new Map(ackFiles.map((f) => [f.path, f.sha256]));

  for (const mf of manifestFiles) {
    if (!mf.sha256) continue;
    result.total++;
    const ackHash = ackMap.get(mf.path);
    if (ackHash === mf.sha256) {
      result.matched++;
    } else if (ackHash !== undefined) {
      result.mismatched.push(mf.path);
    }
  }

  return result;
}

const PACK_REQUIRED_FROM_SPRINT = 5;

function checkContextGap(
  taskId: string, sprintNum: number | null, desc: string, allSprintDirs: string[]
): ContextGapDetail | null {
  const ctx = checkContextExists(taskId, sprintNum, allSprintDirs);
  if (!ctx.hasAck) return { task_id: taskId, description: desc, missing_pack: !ctx.hasPack, missing_ack: true };
  if (!ctx.hasPack && sprintNum !== null && sprintNum >= PACK_REQUIRED_FROM_SPRINT) {
    return { task_id: taskId, description: desc, missing_pack: true, missing_ack: false };
  }
  return null;
}

function checkPlanGap(
  taskId: string, sprintNum: number | null, desc: string, allSprintDirs: string[]
): PlanGapDetail | null {
  const plan = checkPlanDeliverables(taskId, sprintNum, allSprintDirs);
  if (!plan.planExists) return null;
  const hasMissingFiles = plan.total > 0 && plan.verified < plan.total;
  const hasUncheckedSteps = plan.checkboxTotal > 0 && plan.checkboxChecked < plan.checkboxTotal;
  if (!hasMissingFiles && !hasUncheckedSteps) return null;
  return {
    task_id: taskId, description: desc, plan_path: plan.planPath,
    total_files: plan.total, verified_files: plan.verified, missing_files: plan.missingFiles.slice(0, 5),
    checkbox_total: plan.checkboxTotal, checkbox_checked: plan.checkboxChecked,
  };
}

function checkHashMismatch(
  taskId: string, sprintNum: number | null, desc: string, allSprintDirs: string[]
): HashMismatchDetail | null {
  const hashes = checkContextHashes(taskId, sprintNum, allSprintDirs);
  if (!hashes.hasBoth || hashes.mismatched.length === 0) return null;
  return {
    task_id: taskId, description: desc, mismatched_files: hashes.mismatched.slice(0, 5),
    total_files: hashes.total, matched_count: hashes.matched,
  };
}

function processCompletedTaskChecks(
  task: CsvTask,
  taskSprintMap: Map<string, number | null>,
  allSprintDirs: string[],
  contextGapDetails: ContextGapDetail[],
  planGapDetails: PlanGapDetail[],
  hashMismatchDetails: HashMismatchDetail[]
): void {
  const parsed = parseArtifactsWithPrefixes(task['Artifacts To Track']);
  const hasEvidenceArtifacts = parsed.evidence.length > 0;
  const taskId = task['Task ID'];
  const sprintNum = taskSprintMap.get(taskId) ?? null;
  const desc = (task.Description || '').substring(0, 50) + '...';

  if (hasEvidenceArtifacts) {
    const contextGap = checkContextGap(taskId, sprintNum, desc, allSprintDirs);
    if (contextGap) contextGapDetails.push(contextGap);
  }

  const planGap = checkPlanGap(taskId, sprintNum, desc, allSprintDirs);
  if (planGap) planGapDetails.push(planGap);

  if (hasEvidenceArtifacts) {
    const hashMismatch = checkHashMismatch(taskId, sprintNum, desc, allSprintDirs);
    if (hashMismatch) hashMismatchDetails.push(hashMismatch);
  }
}

function collectCompletedTaskChecks(
  tasks: CsvTask[],
  taskSprintMap: Map<string, number | null>,
  allSprintDirs: string[]
): {
  contextGapDetails: ContextGapDetail[];
  planGapDetails: PlanGapDetail[];
  hashMismatchDetails: HashMismatchDetail[];
} {
  const contextGapDetails: ContextGapDetail[] = [];
  const planGapDetails: PlanGapDetail[] = [];
  const hashMismatchDetails: HashMismatchDetail[] = [];

  for (const task of tasks) {
    const status = (task.Status || '').toLowerCase().trim();
    if (status !== 'completed' && status !== 'done') continue;
    processCompletedTaskChecks(task, taskSprintMap, allSprintDirs, contextGapDetails, planGapDetails, hashMismatchDetails);
  }

  return { contextGapDetails, planGapDetails, hashMismatchDetails };
}

function collectAttestationIssues(
  taskId: string,
  sprintNum: number | null,
  targetSprint: string,
  allSprintDirs: string[]
): { issues: string[]; attestExists: boolean | null; attestVerdict: string | null; attestValidationCount: number | null } {
  const ATTESTATION_REQUIRED_FROM_SPRINT = 16;
  const isContinuousTask = (targetSprint || '').toLowerCase() === 'continuous';
  const skipAttestationCheck = isContinuousTask || (sprintNum !== null && sprintNum < ATTESTATION_REQUIRED_FROM_SPRINT);

  if (skipAttestationCheck) {
    return { issues: [], attestExists: null, attestVerdict: null, attestValidationCount: null };
  }

  const attestResult = checkAttestationIntegrity(taskId, sprintNum, allSprintDirs);
  const issues: string[] = [];

  if (attestResult.exists) {
    const badVerdict = attestResult.verdict && attestResult.verdict !== 'COMPLETE' && attestResult.verdict !== 'PASS';
    if (badVerdict) issues.push(`Attestation verdict: ${attestResult.verdict} (expected COMPLETE)`);
    if (attestResult.validationCount < 4) {
      issues.push(`Only ${attestResult.validationCount}/4 validations recorded (need TypeScript, Tests, Lint, Build)`);
    }
  } else {
    issues.push('Missing attestation.json');
  }

  return {
    issues,
    attestExists: attestResult.exists,
    attestVerdict: attestResult.verdict,
    attestValidationCount: attestResult.validationCount,
  };
}

function buildTaskIntegrityIssues(
  taskId: string,
  task: CsvTask,
  sprintNum: number | null,
  allSprintDirs: string[]
): { issues: string[]; planResult: ReturnType<typeof checkPlanDeliverables>; attestInfo: ReturnType<typeof collectAttestationIssues> } {
  const planResult = checkPlanDeliverables(taskId, sprintNum, allSprintDirs);
  const issues: string[] = [];

  if (planResult.planExists && planResult.checkboxTotal > 0 && planResult.checkboxChecked < planResult.checkboxTotal) {
    issues.push(`Plan steps: ${planResult.checkboxChecked}/${planResult.checkboxTotal} checked (${planResult.checkboxPct}%) — must be 100% for completed tasks`);
  }

  if (planResult.planExists && planResult.total > 0 && planResult.verified < planResult.total) {
    const missingCount = planResult.total - planResult.verified;
    const sample = planResult.missingFiles.slice(0, 3).map((f) => f.split('/').pop()).join(', ');
    const missingNote = missingCount > 3 ? ` +${missingCount - 3} more` : '';
    issues.push(`Plan deliverables: ${planResult.verified}/${planResult.total} files exist on disk (missing: ${sample}${missingNote})`);
  }

  const attestInfo = collectAttestationIssues(taskId, sprintNum, task['Target Sprint'], allSprintDirs);
  issues.push(...attestInfo.issues);

  return { issues, planResult, attestInfo };
}

function collectIntegrityFailures(
  tasks: CsvTask[],
  taskSprintMap: Map<string, number | null>,
  allSprintDirs: string[]
): CompletionIntegrityDetail[] {
  const integrityFailures: CompletionIntegrityDetail[] = [];

  for (const task of tasks) {
    const status = (task.Status || '').toLowerCase().trim();
    if (status !== 'completed' && status !== 'done') continue;

    const taskId = task['Task ID']?.trim();
    if (!taskId) continue;

    const sprintNum = taskSprintMap.get(taskId) ?? null;
    const { issues, planResult, attestInfo } = buildTaskIntegrityIssues(taskId, task, sprintNum, allSprintDirs);

    if (issues.length > 0) {
      integrityFailures.push({
        task_id: taskId,
        description: (task.Description || '').substring(0, 80),
        issues,
        checkbox_pct: planResult.checkboxPct ?? null,
        has_attestation: attestInfo.attestExists,
        attestation_verdict: attestInfo.attestVerdict,
        validation_count: attestInfo.attestValidationCount,
      });
    }
  }

  return integrityFailures;
}

async function checkPrefixedPaths(paths: string[], prefix: string): Promise<string[]> {
  const missing: string[] = [];
  for (const p of paths) {
    const exists = await checkArtifactExists(p);
    if (!exists) missing.push(prefix ? `${prefix}${p}` : p);
  }
  return missing;
}

async function collectMissingPaths(
  parsed: ParsedArtifacts
): Promise<{ missingArtifacts: string[]; missingEvidence: string[] }> {
  const [missingArt, missingEv, missingSpec, missingPlan, missingCtx, missingPrd, missingAttest] =
    await Promise.all([
      checkPrefixedPaths(parsed.artifacts, ''),
      checkPrefixedPaths(parsed.evidence, 'EVIDENCE:'),
      checkPrefixedPaths(parsed.specs, 'SPEC:'),
      checkPrefixedPaths(parsed.plans, 'PLAN:'),
      checkPrefixedPaths(parsed.contexts, 'CONTEXT:'),
      checkPrefixedPaths(parsed.prds, 'PRD:'),
      checkPrefixedPaths(parsed.attestations, 'ATTESTATION:'),
    ]);

  return {
    missingArtifacts: [...missingArt, ...missingSpec, ...missingPlan, ...missingCtx, ...missingPrd, ...missingAttest],
    missingEvidence: missingEv,
  };
}

function filterTasksBySprint(tasks: CsvTask[], sprintParam: string | null): CsvTask[] {
  if (!sprintParam || sprintParam === 'all') return tasks;
  if (sprintParam === 'continuous') {
    return tasks.filter((t) => t['Target Sprint']?.toLowerCase() === 'continuous');
  }
  const sprintNum = Number.parseInt(sprintParam, 10);
  if (!Number.isNaN(sprintNum)) {
    return tasks.filter((t) => getSprintNumber(t['Target Sprint']) === sprintNum);
  }
  return tasks;
}

function countTaskStatuses(tasks: CsvTask[]): { completed: number; inProgress: number; backlog: number } {
  let completed = 0;
  let inProgress = 0;
  let backlog = 0;
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
  return { completed, inProgress, backlog };
}

function buildTaskSprintMap(tasks: CsvTask[]): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const task of tasks) {
    map.set(task['Task ID'], getSprintNumber(task['Target Sprint']));
  }
  return map;
}

function collectForwardDeps(
  tasks: CsvTask[],
  taskSprintMap: Map<string, number | null>
): ForwardDependencyDetail[] {
  const details: ForwardDependencyDetail[] = [];
  for (const task of tasks) {
    const taskSprint = getSprintNumber(task['Target Sprint']);
    if (taskSprint === null) continue;
    for (const depId of parseDependencies(task.Dependencies)) {
      const depSprint = taskSprintMap.get(depId);
      if (depSprint !== null && depSprint !== undefined && depSprint > taskSprint) {
        details.push({
          task_id: task['Task ID'],
          task_description: task.Description?.substring(0, 50) + '...' || '',
          task_sprint: taskSprint,
          depends_on: depId,
          dep_sprint: depSprint,
        });
      }
    }
  }
  return details;
}

function collectBottleneckDetails(
  tasks: CsvTask[],
  taskSprintMap: Map<string, number | null>
): { details: BottleneckDetail[]; str: string } {
  const sprintDepCounts = new Map<number, { count: number; tasks: string[] }>();
  for (const task of tasks) {
    for (const depId of parseDependencies(task.Dependencies)) {
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
  const sortedBottlenecks = Array.from(sprintDepCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);
  const details: BottleneckDetail[] = sortedBottlenecks.map(([sprint, data]) => ({
    sprint,
    dependency_count: data.count,
    blocked_tasks: data.tasks.slice(0, 10),
  }));
  const str = sortedBottlenecks.length > 0
    ? sortedBottlenecks.map(([sprint]) => sprint).join(', ')
    : 'None';
  return { details, str };
}

async function collectMismatchAndRevertDetails(
  tasks: CsvTask[]
): Promise<{
  mismatchDetails: MismatchDetail[];
  tasksRequiringRevertDetails: TaskRequiringRevert[];
  trackedArtifacts: Set<string>;
}> {
  const mismatchDetails: MismatchDetail[] = [];
  const tasksRequiringRevertDetails: TaskRequiringRevert[] = [];
  const trackedArtifacts = new Set<string>();

  for (const task of tasks) {
    const parsed = parseArtifactsWithPrefixes(task['Artifacts To Track']);
    const status = (task.Status || '').toLowerCase().trim();
    const isCompleted = status === 'completed' || status === 'done';

    for (const artifact of parsed.artifacts) {
      trackedArtifacts.add(artifact);
    }

    const hasPathsToCheck =
      parsed.artifacts.length > 0 ||
      parsed.evidence.length > 0 ||
      parsed.specs.length > 0 ||
      parsed.plans.length > 0 ||
      parsed.contexts.length > 0 ||
      parsed.prds.length > 0 ||
      parsed.attestations.length > 0;

    if (!isCompleted || !hasPathsToCheck) continue;

    const { missingArtifacts, missingEvidence } = await collectMissingPaths(parsed);
    if (missingArtifacts.length === 0 && missingEvidence.length === 0) continue;

    mismatchDetails.push({
      task_id: task['Task ID'],
      description: task.Description?.substring(0, 50) + '...' || '',
      missing_artifacts: [...missingArtifacts, ...missingEvidence],
    });
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

  return { mismatchDetails, tasksRequiringRevertDetails, trackedArtifacts };
}

function loadAllSprintDirs(): string[] {
  const sprintAttestationRoot = join(MONOREPO_ROOT, '.specify', 'sprints');
  try {
    const entries = readdirSync(sprintAttestationRoot, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && e.name.startsWith('sprint-'))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sprintParam = searchParams.get('sprint');

    const csvPath = PATHS.sprintTracking.SPRINT_PLAN_CSV;
    const csvContent = await readFile(csvPath, 'utf-8');
    const allParsedTasks = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
      bom: true,
    }) as CsvTask[];

    const tasks = filterTasksBySprint(allParsedTasks, sprintParam);
    const total = tasks.length;
    const { completed, inProgress, backlog } = countTaskStatuses(tasks);
    const taskSprintMap = buildTaskSprintMap(tasks);
    const forwardDepsDetails = collectForwardDeps(tasks, taskSprintMap);
    const { mismatchDetails, tasksRequiringRevertDetails, trackedArtifacts } =
      await collectMismatchAndRevertDetails(tasks);

    const allSprintDirs = loadAllSprintDirs();
    const { contextGapDetails, planGapDetails, hashMismatchDetails } =
      collectCompletedTaskChecks(tasks, taskSprintMap, allSprintDirs);
    const integrityFailures = collectIntegrityFailures(tasks, taskSprintMap, allSprintDirs);
    const untrackedResult = await getUntrackedArtifactsWithDetails(trackedArtifacts);
    const { details: bottleneckDetails, str: bottleneckStr } = collectBottleneckDetails(tasks, taskSprintMap);

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
