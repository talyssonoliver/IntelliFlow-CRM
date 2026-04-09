import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  backfillBlockerResolutionEvidence,
  loadBlockers,
  loadReviewQueue,
  processVerdictRemediation,
  saveBlockers,
  type BlockerRecord,
} from './remediation.js';
import type { StoaVerdict } from './types.js';

function createVerdict(
  taskId: string,
  verdict: StoaVerdict['verdict'],
  rationale: string
): StoaVerdict {
  return {
    stoa: 'Foundation',
    taskId,
    verdict,
    rationale,
    toolIdsSelected: ['turbo-typecheck'],
    toolIdsExecuted: ['turbo-typecheck'],
    waiversProposed: [],
    findings: [],
    timestamp: '2026-01-01T00:00:00.000Z',
  };
}

describe('stoa remediation blockers', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('writes blockers using the wrapped ledger shape', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'remediation-ledger-'));
    tempRoots.push(repoRoot);

    const blockers: BlockerRecord[] = [
      {
        taskId: 'ENV-003-AI',
        runId: 'run-1',
        type: 'gate_failure',
        message: '1 gate(s) failed: turbo-typecheck',
        failedGates: ['turbo-typecheck'],
        evidencePath: 'artifacts/reports/system-audit/run-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
        resolvedBy: null,
        resolutionEvidencePath: null,
      },
    ];

    saveBlockers(repoRoot, blockers);

    const ledgerPath = join(repoRoot, 'artifacts', 'blockers.json');
    const raw = JSON.parse(readFileSync(ledgerPath, 'utf-8')) as {
      blockers?: BlockerRecord[];
      last_updated?: string;
    };

    expect(Array.isArray(raw.blockers)).toBe(true);
    expect(raw.blockers).toHaveLength(1);
    expect(typeof raw.last_updated).toBe('string');
    expect(raw.blockers?.[0]?.resolutionEvidencePath).toBeNull();
  });

  it('resolves open blocker and review queue entries after a later PASS verdict', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'remediation-pass-'));
    tempRoots.push(repoRoot);

    processVerdictRemediation(
      createVerdict('IFC-101', 'FAIL', '1 gate(s) failed: turbo-typecheck'),
      'run-fail',
      repoRoot,
      'artifacts/reports/system-audit/run-fail',
      [{ toolId: 'turbo-typecheck', exitCode: 1, logPath: 'gates/turbo-typecheck.log' }]
    );

    const unresolvedBlocker = loadBlockers(repoRoot).find(
      (blocker) => blocker.taskId === 'IFC-101'
    );
    expect(unresolvedBlocker?.resolvedAt).toBeNull();

    const unresolvedReviewItem = loadReviewQueue(repoRoot).find(
      (item) => item.taskId === 'IFC-101'
    );
    expect(unresolvedReviewItem?.resolvedAt).toBeNull();

    processVerdictRemediation(
      createVerdict('IFC-101', 'PASS', 'All gates passed'),
      'run-pass',
      repoRoot,
      'artifacts/reports/system-audit/run-pass',
      []
    );

    const resolvedBlocker = loadBlockers(repoRoot).find((blocker) => blocker.taskId === 'IFC-101');
    expect(resolvedBlocker?.resolvedAt).not.toBeNull();
    expect(resolvedBlocker?.resolvedBy).toBe('MATOP run run-pass');
    expect(resolvedBlocker?.resolutionEvidencePath).toBe('artifacts/reports/system-audit/run-pass');

    const resolvedReviewItem = loadReviewQueue(repoRoot).find((item) => item.taskId === 'IFC-101');
    expect(resolvedReviewItem?.resolvedAt).not.toBeNull();
    expect(resolvedReviewItem?.resolvedBy).toBe('MATOP run run-pass');
    expect(resolvedReviewItem?.resolution).toBe('Task passed validation');
  });

  it('backfills canonical resolution evidence for previously resolved blockers', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'remediation-backfill-'));
    tempRoots.push(repoRoot);

    saveBlockers(repoRoot, [
      {
        taskId: 'ENV-003-AI',
        runId: 'run-1',
        type: 'gate_failure',
        message: '1 gate(s) failed: turbo-typecheck',
        failedGates: ['turbo-typecheck'],
        evidencePath: 'artifacts/reports/system-audit/run-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: '2026-01-02T00:00:00.000Z',
        resolvedBy: 'manual-reconcile',
        resolutionEvidencePath: null,
      },
    ]);

    const changed = backfillBlockerResolutionEvidence(
      repoRoot,
      'ENV-003-AI',
      '.specify/sprints/sprint-0/attestations/ENV-003-AI/ENV-003-AI-attestation.json'
    );

    expect(changed).toBe(true);

    const blocker = loadBlockers(repoRoot).find((entry) => entry.taskId === 'ENV-003-AI');
    expect(blocker?.resolvedBy).toBe('manual-reconcile');
    expect(blocker?.resolutionEvidencePath).toBe(
      '.specify/sprints/sprint-0/attestations/ENV-003-AI/ENV-003-AI-attestation.json'
    );
  });
});
