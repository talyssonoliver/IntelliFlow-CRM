/**
 * Session Context Snapshot Generator
 *
 * Produces a small, scannable markdown digest (`docs/SESSION_CONTEXT.md`) of the
 * current working state of the repo so that a fresh Claude Code session can
 * bootstrap itself without reading `CLAUDE.md` + the full metrics tree.
 *
 * Inputs (read-only):
 *   - `docs/metrics/_global/task-registry.json`  — authoritative task/status index
 *   - `docs/metrics/{active_sprint}/_summary.json` — current sprint summary
 *   - `docs/metrics/{active_sprint}/**\/{TASK-ID}.json` — per-task execution JSONs
 *   - `docs/metrics/_global/Sprint_plan.csv`    — source of truth for CSV fields
 *   - git: branch, log, status (via execSync)
 *
 * Output: single markdown string under ~6KB. No files are written by this
 * module — the CLI (`scripts/generate-context.ts`) and API route
 * (`app/api/context/route.ts`) handle persistence.
 *
 * Pattern mirrors the existing `sync-metrics` trio (lib + CLI + API route).
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';

import { findTaskFile, readJsonTolerant } from './data-sync/file-io';
import { parseDependencies } from './data-sync/csv-mapping';

// ============================================================================
// Types
// ============================================================================

export interface SnapshotResult {
  markdown: string;
  generatedAt: string;
  sourceFiles: string[];
}

interface TaskRegistry {
  last_updated: string;
  total_tasks: number;
  current_sprint: number;
  active_sprint: string;
  sprints: Record<string, Record<string, unknown>>;
  tasks_by_status: Record<string, string[]>;
}

interface SprintSummary {
  sprint: string;
  name: string;
  target_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  phases?: Array<{
    id: string;
    status: string;
    started_at: string | null;
    completed_at: string | null;
  }>;
  task_summary?: {
    total: number;
    done: number;
    in_progress: number;
    blocked: number;
    not_started: number;
    failed: number;
  };
  completed_tasks?: Array<{ task_id: string; completed_at: string; duration_minutes?: number }>;
  blockers?: Array<{
    task_id: string;
    description: string;
    raised_at: string;
    resolved_at: string | null;
  }>;
  notes?: string;
}

interface TaskFile {
  task_id: string;
  description?: string;
  owner?: string;
  status?: string;
  status_history?: Array<{ status: string; at: string; note?: string }>;
  execution?: { started_at?: string; executor?: string };
  artifacts?: { created?: unknown[]; missing?: string[] };
  kpis?: Record<string, { met?: boolean }>;
}

interface CsvRow {
  'Task ID': string;
  Description: string;
  Status: string;
  Dependencies: string;
  'Target Sprint': string;
}

interface GitInfo {
  branch: string;
  dirtyCount: number;
  dirtyPreview: string[];
  recentCommits: Array<{ sha: string; subject: string; author: string; relative: string }>;
}

// ============================================================================
// Helpers
// ============================================================================

function safeExec(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function collectGitInfo(repoDir: string): GitInfo {
  const branch = safeExec('git rev-parse --abbrev-ref HEAD', repoDir) || '(unknown)';
  const statusOut = safeExec('git status --porcelain', repoDir);
  const dirtyLines = statusOut ? statusOut.split('\n') : [];
  const dirtyPreview = dirtyLines
    .slice(0, 10)
    .map((line) => line.replace(/^[\sA-Z?]{2}\s*/, ''))
    .filter(Boolean);

  // NOTE: use %x09 (tab) as delimiter instead of `|` because `|` is interpreted
  // as a shell pipe by cmd.exe on Windows when execSync runs without an array form.
  const logOut = safeExec('git log -n 10 --pretty=format:%h%x09%s%x09%an%x09%ar HEAD', repoDir);
  const recentCommits = logOut
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha = '', subject = '', author = '', relative = ''] = line.split('\t');
      return { sha, subject, author, relative };
    });

  return { branch, dirtyCount: dirtyLines.length, dirtyPreview, recentCommits };
}

function relativeTimeFromIso(iso: string | undefined | null, now = Date.now()): string {
  if (!iso) return 'unknown';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const deltaSec = Math.max(0, Math.floor((now - t) / 1000));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) return `${deltaMin}m ago`;
  const deltaHr = Math.floor(deltaMin / 60);
  if (deltaHr < 24) return `${deltaHr}h ago`;
  const deltaDay = Math.floor(deltaHr / 24);
  if (deltaDay < 30) return `${deltaDay}d ago`;
  const deltaMonth = Math.floor(deltaDay / 30);
  if (deltaMonth < 12) return `${deltaMonth}mo ago`;
  return `${Math.floor(deltaMonth / 12)}y ago`;
}

function loadRegistry(metricsDir: string, sourceFiles: string[]): TaskRegistry | null {
  const path = join(metricsDir, '_global', 'task-registry.json');
  if (!existsSync(path)) return null;
  sourceFiles.push(path);
  return readJsonTolerant(path) as TaskRegistry;
}

function loadSprintSummary(
  metricsDir: string,
  sprintKey: string,
  sourceFiles: string[]
): SprintSummary | null {
  const path = join(metricsDir, sprintKey, '_summary.json');
  if (!existsSync(path)) return null;
  sourceFiles.push(path);
  return readJsonTolerant(path) as SprintSummary;
}

function loadCsvRows(metricsDir: string, sourceFiles: string[]): Map<string, CsvRow> {
  const path = join(metricsDir, '_global', 'Sprint_plan.csv');
  const result = new Map<string, CsvRow>();
  if (!existsSync(path)) return result;
  sourceFiles.push(path);

  const content = readFileSync(path, 'utf-8');
  const parsed = Papa.parse<CsvRow>(content, { header: true, skipEmptyLines: true });
  for (const row of parsed.data) {
    const id = row['Task ID']?.trim();
    if (id) result.set(id, row);
  }
  return result;
}

function loadInProgressTasks(
  metricsDir: string,
  sprintKey: string,
  taskIds: string[],
  sourceFiles: string[]
): TaskFile[] {
  const sprintDir = join(metricsDir, sprintKey);
  if (!existsSync(sprintDir)) return [];

  const out: TaskFile[] = [];
  for (const id of taskIds) {
    const path = findTaskFile(id, sprintDir);
    if (!path) continue;
    try {
      const task = readJsonTolerant(path) as TaskFile;
      sourceFiles.push(path);
      out.push(task);
    } catch {
      // tolerant: skip tasks whose JSON can't be parsed
    }
  }
  return out;
}

// ============================================================================
// Project Health (from current-state-report.json)
// ============================================================================

interface ReportOverview {
  totalTasks: number;
  completedTasks: number;
  backlogTasks: number;
  blockedTasks: number;
  inProgressTasks: number;
  completionPercentage: number;
}

interface ReportHealth {
  overview: ReportOverview;
  activeFocusSprints: number[];
  attestedButNotCompleted: number;
  sprintMismatches: number;
  completedWithoutAttestation: number;
  generatedAt: string;
}

function loadReportHealth(repoDir: string): ReportHealth | null {
  const reportPath = join(repoDir, 'artifacts', 'reports', 'current-state-report.json');
  if (!existsSync(reportPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(reportPath, 'utf-8'));
    return {
      overview: raw.overview,
      activeFocusSprints: raw.currentState?.activeFocusSprints ?? [],
      attestedButNotCompleted: raw.inconsistencies?.attestedButNotCompletedInCsv?.length ?? 0,
      sprintMismatches: raw.inconsistencies?.sprintMismatches?.length ?? 0,
      completedWithoutAttestation:
        raw.inconsistencies?.completedWithoutCanonicalAttestation?.length ?? 0,
      generatedAt: raw.generatedAt ?? '',
    };
  } catch {
    return null;
  }
}

function buildProjectHealth(health: ReportHealth | null): string {
  if (!health) return '';

  const { overview: o } = health;
  const lines: string[] = ['## Project Health', ''];

  lines.push(
    `- **Progress:** ${o.completedTasks}/${o.totalTasks} tasks completed (${o.completionPercentage}%) — ${o.backlogTasks} backlog, ${o.blockedTasks} blocked, ${o.inProgressTasks} in progress.`
  );

  if (health.activeFocusSprints.length > 0) {
    lines.push(
      `- **Focus band:** Sprints ${health.activeFocusSprints.join(', ')} carry the earliest remaining backlog.`
    );
  }

  const issues: string[] = [];
  if (health.completedWithoutAttestation > 0) {
    issues.push(`${health.completedWithoutAttestation} completed without attestation`);
  }
  if (health.attestedButNotCompleted > 0) {
    issues.push(`${health.attestedButNotCompleted} attested but CSV not updated`);
  }
  if (health.sprintMismatches > 0) {
    issues.push(`${health.sprintMismatches} sprint path mismatches`);
  }

  if (issues.length > 0) {
    lines.push(`- **Evidence issues:** ${issues.join('; ')}.`);
  } else {
    lines.push('- **Evidence health:** Clean — no attestation gaps or mismatches.');
  }

  lines.push(
    `- _Source: \`docs/CURRENT_STATE_REPORT.md\` (${relativeTimeFromIso(health.generatedAt)}) — full sprint-by-sprint breakdown._`
  );

  lines.push('');
  return lines.join('\n');
}

// ============================================================================
// Section builders
// ============================================================================

function buildHeader(branch: string, generatedAt: string): string {
  return [
    '# Session Context Snapshot',
    `_Generated: ${generatedAt} • Branch: ${branch}_`,
    '',
    '> Auto-generated from `apps/project-tracker/docs/metrics/`. **Do not edit by hand** — regenerate with `npx tsx apps/project-tracker/scripts/generate-context.ts`.',
    '',
  ].join('\n');
}

function buildWhereWeLeftOff(
  registry: TaskRegistry,
  summary: SprintSummary | null,
  inProgressCount: number,
  openBlockerCount: number
): string {
  const parts: string[] = ['## Where We Left Off', ''];

  const sprintKey = registry.active_sprint;
  const sprintName = summary?.name ?? sprintKey;
  const taskSummary = summary?.task_summary;
  const pct = taskSummary?.total ? Math.round((taskSummary.done / taskSummary.total) * 100) : null;

  const donePhases = summary?.phases?.filter((p) => p.status === 'DONE').length ?? 0;
  const totalPhases = summary?.phases?.length ?? 0;

  const sentences: string[] = [];
  sentences.push(
    `Active sprint: **${sprintName}** (${sprintKey})` +
      (pct !== null
        ? ` — ${pct}% complete (${taskSummary!.done}/${taskSummary!.total} tasks).`
        : '.')
  );
  if (totalPhases > 0) {
    sentences.push(`${donePhases}/${totalPhases} phases DONE.`);
  }
  sentences.push(
    `${inProgressCount} task(s) in progress, ${openBlockerCount} open blocker(s) across the registry.`
  );
  sentences.push(
    `Registry last updated ${relativeTimeFromIso(registry.last_updated)}; ${registry.total_tasks} total tasks across the project.`
  );

  parts.push(sentences.join(' '), '');
  return parts.join('\n');
}

function buildActiveTasks(tasks: TaskFile[]): string {
  const parts: string[] = ['## Active Tasks (IN_PROGRESS)', ''];
  if (tasks.length === 0) {
    parts.push('_None. The active sprint has no tasks currently in progress._', '');
    return parts.join('\n');
  }

  for (const t of tasks) {
    const startedAt = t.execution?.started_at ?? t.status_history?.at(-1)?.at;
    const started = startedAt ? relativeTimeFromIso(startedAt) : 'unknown';
    const owner = t.execution?.executor ?? t.owner ?? 'unassigned';
    const desc = t.description ?? '(no description)';
    parts.push(`- **[${t.task_id}]** ${desc} — started ${started}, ${owner}`);

    const created = t.artifacts?.created?.length ?? 0;
    const missing = t.artifacts?.missing?.length ?? 0;
    const kpiOpen = t.kpis ? Object.entries(t.kpis).filter(([, v]) => v?.met === false).length : 0;
    const subBits: string[] = [];
    subBits.push(`artifacts: ${created} created / ${missing} missing`);
    if (kpiOpen > 0) subBits.push(`${kpiOpen} open KPI(s)`);
    parts.push(`  - ${subBits.join(' · ')}`);
  }
  parts.push('');
  return parts.join('\n');
}

function buildOpenBlockers(summary: SprintSummary | null): string {
  const blockers = (summary?.blockers ?? []).filter((b) => b.resolved_at === null);
  if (blockers.length === 0) return '';

  const parts: string[] = ['## Open Blockers', '', '| Task | Blocker | Raised |', '|---|---|---|'];
  for (const b of blockers) {
    const desc = b.description.replaceAll('|', '\\|').slice(0, 80);
    parts.push(`| ${b.task_id} | ${desc} | ${relativeTimeFromIso(b.raised_at)} |`);
  }
  parts.push('');
  return parts.join('\n');
}

function buildRecentlyCompleted(summary: SprintSummary | null): string {
  const completed = summary?.completed_tasks ?? [];
  if (completed.length === 0) return '';

  const sorted = [...completed].sort(
    (a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at)
  );
  const top = sorted.slice(0, 5);

  const parts: string[] = ['## Recently Completed (last 5)', ''];
  for (const c of top) {
    const duration = c.duration_minutes != null ? ` (${c.duration_minutes}m)` : '';
    parts.push(`- **${c.task_id}** — ${relativeTimeFromIso(c.completed_at)}${duration}`);
  }
  parts.push('');
  return parts.join('\n');
}

function buildNextUp(registry: TaskRegistry, csvRows: Map<string, CsvRow>): string {
  // The approved plan targeted Status === 'Planned', but tasks_by_status.PLANNED is
  // currently empty in reality — so we broaden the candidate pool to PLANNED + BACKLOG
  // and filter for tasks whose dependencies are all in DONE. Result is still sorted
  // by Target Sprint ascending, top 3.
  const doneSet = new Set(registry.tasks_by_status.DONE ?? []);
  const candidateIds = [
    ...(registry.tasks_by_status.PLANNED ?? []),
    ...(registry.tasks_by_status.BACKLOG ?? []),
  ];

  type Entry = { id: string; desc: string; targetSprint: number; row: CsvRow };
  const entries: Entry[] = [];
  for (const id of candidateIds) {
    const row = csvRows.get(id);
    if (!row) continue;
    const deps = parseDependencies(row.Dependencies ?? '');
    const unmet = deps.filter((d) => !doneSet.has(d));
    if (unmet.length > 0) continue;

    const targetSprintRaw = row['Target Sprint']?.trim() ?? '';
    const targetSprint = Number.parseInt(targetSprintRaw, 10);
    entries.push({
      id,
      desc: row.Description?.trim().slice(0, 90) ?? '',
      targetSprint: Number.isFinite(targetSprint) ? targetSprint : 999,
      row,
    });
  }

  entries.sort((a, b) => a.targetSprint - b.targetSprint || a.id.localeCompare(b.id));
  const top = entries.slice(0, 3);

  const parts: string[] = ['## Next Up (unblocked)', ''];
  if (top.length === 0) {
    parts.push(
      '_No unblocked Planned/Backlog tasks found. Check Sprint_plan.csv for upcoming work._',
      ''
    );
    return parts.join('\n');
  }
  for (const e of top) {
    parts.push(`- **${e.id}** (sprint ${e.targetSprint}) — ${e.desc}`);
  }
  parts.push('');
  return parts.join('\n');
}

function buildGitActivity(git: GitInfo): string {
  const parts: string[] = ['## Git Activity', ''];
  parts.push(`- **Branch:** \`${git.branch}\` (${git.dirtyCount} dirty file(s))`);
  if (git.dirtyPreview.length > 0) {
    parts.push(
      `- **Dirty preview:** ${git.dirtyPreview
        .slice(0, 5)
        .map((f) => `\`${f}\``)
        .join(', ')}${git.dirtyPreview.length > 5 ? ' …' : ''}`
    );
  }
  parts.push('- **Last 10 commits:**');
  for (const c of git.recentCommits) {
    parts.push(`  - \`${c.sha}\` ${c.subject} — ${c.author}, ${c.relative}`);
  }
  parts.push('');
  return parts.join('\n');
}

function buildKeyFiles(): string {
  return [
    '## Key File References',
    '',
    '- Sprint plan CSV: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`',
    '- Task registry: `apps/project-tracker/docs/metrics/_global/task-registry.json`',
    '- Active sprint metrics: `apps/project-tracker/docs/metrics/{active_sprint}/`',
    '- This snapshot: `docs/SESSION_CONTEXT.md`',
    '- Full state report: `docs/CURRENT_STATE_REPORT.md` (deep sprint-by-sprint reference)',
    '- Refresh: `npx tsx apps/project-tracker/scripts/generate-context.ts` or POST `/api/context`',
    '',
  ].join('\n');
}

// ============================================================================
// Public API
// ============================================================================

export function generateContextSnapshot(metricsDir: string, repoDir: string): SnapshotResult {
  const generatedAt = new Date().toISOString();
  const sourceFiles: string[] = [];

  const registry = loadRegistry(metricsDir, sourceFiles);
  if (!registry) {
    throw new Error(`task-registry.json not found at ${metricsDir}/_global`);
  }

  // Fallback: derive active_sprint from task_details when the generator hasn't
  // written the field yet (schema gap — the generator now writes it, but this
  // guard keeps the tool runnable against older registry snapshots).
  if (!registry.active_sprint) {
    const taskDetails = (registry as unknown as Record<string, Record<string, { status: string; sprint: number }>>).task_details ?? {};
    const nonDoneSprints: number[] = [];
    let highest = 0;
    for (const detail of Object.values(taskDetails)) {
      if (typeof detail.sprint === 'number' && detail.sprint >= 0) {
        if (detail.sprint > highest) highest = detail.sprint;
        if (detail.status !== 'DONE') nonDoneSprints.push(detail.sprint);
      }
    }
    const n = nonDoneSprints.length > 0 ? Math.min(...nonDoneSprints) : highest;
    registry.active_sprint = `sprint-${n}`;
  }

  const summary = loadSprintSummary(metricsDir, registry.active_sprint, sourceFiles);
  const csvRows = loadCsvRows(metricsDir, sourceFiles);

  const inProgressIds = registry.tasks_by_status?.IN_PROGRESS ?? [];
  const inProgressTasks = loadInProgressTasks(
    metricsDir,
    registry.active_sprint,
    inProgressIds,
    sourceFiles
  );
  const openBlockerCount = (summary?.blockers ?? []).filter((b) => b.resolved_at === null).length;

  const git = collectGitInfo(repoDir);
  const reportHealth = loadReportHealth(repoDir);

  const sections: string[] = [
    buildHeader(git.branch, generatedAt),
    buildWhereWeLeftOff(registry, summary, inProgressIds.length, openBlockerCount),
    buildProjectHealth(reportHealth),
    buildActiveTasks(inProgressTasks),
    buildOpenBlockers(summary), // returns '' if no blockers
    buildRecentlyCompleted(summary), // returns '' if no completed tasks
    buildNextUp(registry, csvRows),
    buildGitActivity(git),
    buildKeyFiles(),
  ];

  const markdown = sections.filter(Boolean).join('\n');

  return { markdown, generatedAt, sourceFiles };
}
