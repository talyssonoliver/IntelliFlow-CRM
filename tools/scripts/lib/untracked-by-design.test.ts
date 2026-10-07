import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isIgnored, isUntrackedByDesign, parseIgnoreRules } from './untracked-by-design.js';

const REPO_ROOT = process.cwd();

describe('isUntrackedByDesign', () => {
  it('treats spec, plan, context and context_ack files as untracked by design', () => {
    for (const p of [
      '.specify/sprints/sprint-1/specifications/IFC-001-spec.md',
      '.specify/sprints/sprint-6/planning/IFC-019-plan.md',
      '.specify/sprints/sprint-1/context/IFC-001/hydrated-context.md',
      '.specify/sprints/sprint-13/attestations/IFC-022/context_ack.json',
      '.specify/sprints/sprint-16/execution/IFC-028/IFC-028-delivery.md',
    ]) {
      expect(isUntrackedByDesign(p, REPO_ROOT), p).toBe(true);
    }
  });

  it('keeps the canonical attestation files tracked, so a missing one still counts', () => {
    for (const p of [
      '.specify/sprints/sprint-16/attestations/IFC-204/attestation.json',
      '.specify/sprints/sprint-16/attestations/IFC-204/attestation-latest.json',
      '.specify/sprints/sprint-16/attestations/IFC-204/task-tracking.json',
    ]) {
      expect(isUntrackedByDesign(p, REPO_ROOT), p).toBe(false);
    }
  });

  it('never excuses code or docs outside .specify/sprints', () => {
    expect(isUntrackedByDesign('apps/api/src/modules/legal/legal.router.ts', REPO_ROOT)).toBe(
      false
    );
    expect(isUntrackedByDesign('docs/planning/specifications/x-spec.md', REPO_ROOT)).toBe(false);
  });

  it('agrees with git check-ignore for every sample path', () => {
    const samples = [
      '.specify/sprints/sprint-1/specifications/IFC-001-spec.md',
      '.specify/sprints/sprint-18/attestations/PG-060/context_ack.json',
      '.specify/sprints/sprint-18/attestations/PG-060/attestation.json',
      '.specify/sprints/sprint-18/attestations/PG-060/task-tracking.json',
      '.specify/sprints/sprint-18/_summary.json',
      '.specify/sprints/sprint-18/reports/r.md',
    ];
    for (const p of samples) {
      let gitIgnored: boolean;
      try {
        execFileSync('git', ['check-ignore', '-q', '--no-index', p], { cwd: REPO_ROOT });
        gitIgnored = true;
      } catch {
        gitIgnored = false;
      }
      expect(isUntrackedByDesign(p, REPO_ROOT), p).toBe(gitIgnored);
    }
  });
});

describe('isIgnored', () => {
  it('does not re-include a file whose parent directory is excluded', () => {
    const rules = parseIgnoreRules('build/\n!build/keep.txt\n');
    expect(isIgnored('build/keep.txt', rules)).toBe(true);
  });

  it('applies the last matching rule', () => {
    const rules = parseIgnoreRules('a/**\n!a/*/\n!a/*/x.json\n');
    expect(isIgnored('a/t/x.json', rules)).toBe(false);
    expect(isIgnored('a/t/y.json', rules)).toBe(true);
  });

  it('matches `?` against exactly one character, never a slash', () => {
    const rules = parseIgnoreRules('run-?.log\n');
    expect(isIgnored('run-1.log', rules)).toBe(true);
    expect(isIgnored('run-12.log', rules)).toBe(false);
  });

  it('ignores nothing for an empty path', () => {
    expect(isIgnored('', parseIgnoreRules('**\n'))).toBe(false);
  });
});

describe('isUntrackedByDesign without a .specify/sprints/.gitignore', () => {
  it('excuses nothing, so a missing spec still counts against the task', () => {
    const root = mkdtempSync(join(tmpdir(), 'untracked-'));
    try {
      expect(
        isUntrackedByDesign('.specify/sprints/sprint-1/specifications/IFC-001-spec.md', root)
      ).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
