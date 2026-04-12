#!/usr/bin/env npx tsx

import { existsSync, readdirSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  findRepoRoot,
  log,
  logHeader,
  logSection,
  parseSprintCsv,
  resolveSprintPlanPath,
} from './lib/validation-utils.js';
import { getSprintForTask } from './lib/workflow/utils.js';
import {
  loadBlockers,
  resolveBlocker,
  resolveReviewQueueItems,
  backfillBlockerResolutionEvidence,
} from './lib/stoa/remediation.js';

interface AttestationEvidence {
  path: string;
  /** Parsed from attestation_timestamp in the file content — never from filesystem mtime */
  timestampMs: number;
}

interface ReconciliationEntry {
  taskId: string;
  blockerCreatedAt: string;
  status: string | null;
  action: 'resolved' | 'backfilled' | 'skipped';
  reason: string;
  attestationPath: string | null;
}

function loadTaskStatuses(repoRoot: string): Map<string, string> {
  const csvPath = resolveSprintPlanPath(repoRoot);
  if (!csvPath || !existsSync(csvPath)) {
    throw new Error('Sprint_plan.csv not found');
  }

  const { tasks, errors } = parseSprintCsv(readFileSync(csvPath, 'utf-8'));
  if (errors.length > 0) {
    throw new Error(`Failed to parse Sprint_plan.csv: ${errors.join('; ')}`);
  }

  return new Map(tasks.map((task) => [task['Task ID'], task.Status]));
}

function findLatestAttestationEvidence(
  repoRoot: string,
  taskId: string
): AttestationEvidence | null {
  let sprintNumber: number;
  try {
    sprintNumber = getSprintForTask(taskId, repoRoot);
  } catch {
    return null;
  }

  const attestationDir = join(
    repoRoot,
    '.specify',
    'sprints',
    `sprint-${sprintNumber}`,
    'attestations',
    taskId
  );

  if (!existsSync(attestationDir)) {
    return null;
  }

  const files = readdirSync(attestationDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(attestationDir, entry.name));

  if (files.length === 0) {
    return null;
  }

  const preferred = files.filter(
    (filePath) => /attestation/i.test(filePath) && filePath.endsWith('.json')
  );
  const candidates =
    preferred.length > 0 ? preferred : files.filter((filePath) => filePath.endsWith('.json'));

  if (candidates.length === 0) {
    return null;
  }

  // Use the attestation_timestamp embedded in each file rather than filesystem mtime.
  // Filesystem mtime is unreliable — it changes on git checkout, file copies, and reformatters.
  let best: AttestationEvidence | null = null;

  for (const filePath of candidates) {
    try {
      const content = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
      const rawTimestamp = content['attestation_timestamp'];
      if (typeof rawTimestamp !== 'string') continue;
      const timestampMs = Date.parse(rawTimestamp);
      if (Number.isNaN(timestampMs)) continue;
      if (best === null || timestampMs > best.timestampMs) {
        best = { path: filePath, timestampMs };
      }
    } catch {
      // Skip files that cannot be read or parsed as JSON
    }
  }

  return best;
}

function normalizeRepoRelative(repoRoot: string, path: string): string {
  return relative(repoRoot, path).replaceAll('\\', '/');
}

function main(): void {
  const repoRoot = findRepoRoot();
  const taskStatuses = loadTaskStatuses(repoRoot);
  const blockers = loadBlockers(repoRoot);
  const candidateByTask = new Map(
    blockers
      .filter((blocker) => blocker.resolvedAt === null || blocker.resolutionEvidencePath === null)
      .map((blocker) => [blocker.taskId, blocker])
  );

  const entries: ReconciliationEntry[] = [];

  logHeader('Reconcile Blockers');
  log(`Repo: ${repoRoot}`);
  log(`Blocker records needing reconciliation: ${candidateByTask.size}`);

  for (const [taskId, blocker] of candidateByTask.entries()) {
    const status = taskStatuses.get(taskId) ?? null;
    const evidence = findLatestAttestationEvidence(repoRoot, taskId);
    const blockerCreatedAtMs = Date.parse(blocker.createdAt);

    if (status !== 'Completed') {
      entries.push({
        taskId,
        blockerCreatedAt: blocker.createdAt,
        status,
        action: 'skipped',
        reason: `Task status is ${status ?? 'unknown'}`,
        attestationPath: evidence ? normalizeRepoRelative(repoRoot, evidence.path) : null,
      });
      continue;
    }

    if (!evidence) {
      entries.push({
        taskId,
        blockerCreatedAt: blocker.createdAt,
        status,
        action: 'skipped',
        reason: 'No attestation evidence found',
        attestationPath: null,
      });
      continue;
    }

    if (Number.isNaN(blockerCreatedAtMs)) {
      entries.push({
        taskId,
        blockerCreatedAt: blocker.createdAt,
        status,
        action: 'skipped',
        reason: 'Blocker createdAt is invalid',
        attestationPath: normalizeRepoRelative(repoRoot, evidence.path),
      });
      continue;
    }

    if (evidence.timestampMs <= blockerCreatedAtMs) {
      entries.push({
        taskId,
        blockerCreatedAt: blocker.createdAt,
        status,
        action: 'skipped',
        reason: 'Latest attestation is not newer than blocker',
        attestationPath: normalizeRepoRelative(repoRoot, evidence.path),
      });
      continue;
    }

    const resolvedBy = `reconcile-blockers:${normalizeRepoRelative(repoRoot, evidence.path)}`;
    const attestationPath = normalizeRepoRelative(repoRoot, evidence.path);

    if (blocker.resolvedAt === null) {
      resolveBlocker(repoRoot, taskId, resolvedBy, attestationPath);
      resolveReviewQueueItems(
        repoRoot,
        taskId,
        resolvedBy,
        'Resolved during blocker reconciliation'
      );

      entries.push({
        taskId,
        blockerCreatedAt: blocker.createdAt,
        status,
        action: 'resolved',
        reason: 'Completed task has newer attestation evidence',
        attestationPath,
      });
      continue;
    }

    backfillBlockerResolutionEvidence(repoRoot, taskId, attestationPath);

    entries.push({
      taskId,
      blockerCreatedAt: blocker.createdAt,
      status,
      action: 'backfilled',
      reason: 'Resolved blocker was missing canonical resolution evidence',
      attestationPath,
    });
  }

  const resolvedCount = entries.filter((entry) => entry.action === 'resolved').length;
  const backfilledCount = entries.filter((entry) => entry.action === 'backfilled').length;
  const skippedCount = entries.filter((entry) => entry.action === 'skipped').length;

  logSection('Summary');
  log(`Resolved: ${resolvedCount}`);
  log(`Backfilled: ${backfilledCount}`);
  log(`Skipped: ${skippedCount}`);

  const reportDir = join(repoRoot, 'artifacts', 'reports');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, 'blocker-reconciliation.json');
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        resolvedCount,
        backfilledCount,
        skippedCount,
        entries,
      },
      null,
      2
    )
  );

  log(`Report: ${normalizeRepoRelative(repoRoot, reportPath)}`);
}

main();
