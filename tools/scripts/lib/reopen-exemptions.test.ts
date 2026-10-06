import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  REOPEN_EXEMPTIONS_PATH,
  activeExemptionIds,
  checkReopenExemptions,
  loadReopenExemptions,
  type ReopenExemption,
} from './reopen-exemptions.js';
import {
  checkSprintCompletion,
  checkSprintStartGate,
  useReopenExemptions,
  type SprintTask,
} from './validation-utils.js';

const EXPIRES = '2026-10-11T23:59:00+01:00';
const BEFORE = new Date('2026-10-11T22:58:00Z'); // 23:58 London (BST)
const AFTER = new Date('2026-10-11T23:00:00Z'); // 00:00 London, the next day

const task = (id: string, status: string, sprint = '1') =>
  ({ 'Task ID': id, Status: status, 'Target Sprint': sprint }) as unknown as SprintTask;

const exemption = (taskId: string, expires = EXPIRES): ReopenExemption => ({
  taskId,
  expires,
  due: '2026-10-10',
  lane: 'test lane',
  reason: 'reopened',
});

describe('activeExemptionIds', () => {
  it('honours an exemption until its London-time expiry, not after', () => {
    const list = [exemption('IFC-1')];
    expect(activeExemptionIds(list, BEFORE).has('IFC-1')).toBe(true);
    expect(activeExemptionIds(list, AFTER).has('IFC-1')).toBe(false);
  });

  it('ignores an entry whose expiry cannot be parsed', () => {
    expect(activeExemptionIds([exemption('IFC-1', 'next sunday')], BEFORE).size).toBe(0);
  });
});

describe('checkReopenExemptions', () => {
  it('passes, listing each active exemption, while in date', () => {
    const result = checkReopenExemptions(
      [exemption('IFC-1')],
      [task('IFC-1', 'In Progress')],
      BEFORE
    );
    expect(result.severity).toBe('PASS');
    expect(result.details?.[0]).toContain('IFC-1: exempt until');
  });

  it('FAILS once an exemption has expired and the task is still open', () => {
    const result = checkReopenExemptions(
      [exemption('IFC-1')],
      [task('IFC-1', 'In Progress')],
      AFTER
    );
    expect(result.severity).toBe('FAIL');
    expect(result.details?.[0]).toContain('exemption EXPIRED');
  });

  it('does not fail on an expired entry whose task is Completed again', () => {
    const result = checkReopenExemptions([exemption('IFC-1')], [task('IFC-1', 'Completed')], AFTER);
    expect(result.severity).toBe('PASS');
  });

  it('fails on an entry for an unknown task or with an unparseable date', () => {
    const result = checkReopenExemptions(
      [exemption('NOPE-1'), exemption('IFC-2', 'soon')],
      [task('IFC-2', 'In Progress')],
      BEFORE
    );
    expect(result.severity).toBe('FAIL');
    expect(result.details).toEqual([
      'NOPE-1: not in Sprint_plan.csv',
      'IFC-2: unparseable expiry "soon"',
    ]);
  });

  it('passes trivially with no exemptions', () => {
    expect(checkReopenExemptions([], [], BEFORE).severity).toBe('PASS');
  });
});

describe('loadReopenExemptions', () => {
  let root: string | undefined;
  afterEach(() => root && rmSync(root, { recursive: true, force: true }));

  it('returns [] when the file is absent and parses the committed shape', () => {
    root = mkdtempSync(join(tmpdir(), 'reopen-'));
    expect(loadReopenExemptions(root)).toEqual([]);
    mkdirSync(join(root, 'tools/scripts'), { recursive: true });
    writeFileSync(
      join(root, REOPEN_EXEMPTIONS_PATH),
      JSON.stringify({ exemptions: [exemption('IFC-1')] })
    );
    expect(loadReopenExemptions(root)[0].taskId).toBe('IFC-1');
  });

  it('rejects a file without an exemptions array', () => {
    root = mkdtempSync(join(tmpdir(), 'reopen-'));
    mkdirSync(join(root, 'tools/scripts'), { recursive: true });
    writeFileSync(join(root, REOPEN_EXEMPTIONS_PATH), '[]');
    expect(() => loadReopenExemptions(root!)).toThrow('expected { "exemptions": [...] }');
  });
});

describe('completion gates with exemptions', () => {
  const tasks = [
    task('IFC-1', 'In Progress'),
    task('IFC-2', 'Completed'),
    task('IFC-3', 'Backlog'),
  ];

  it('skips only exempt open tasks; any other open task still blocks', () => {
    const exempt = new Set(['IFC-1']);
    const result = checkSprintCompletion(tasks, '1', exempt);
    expect(result.exemptTasks.map((t) => t['Task ID'])).toEqual(['IFC-1']);
    expect(result.incompleteTasks.map((t) => t['Task ID'])).toEqual(['IFC-3']);
    expect(result.isComplete).toBe(false);
    expect(checkSprintCompletion(tasks, '1', new Set(['IFC-1', 'IFC-3'])).isComplete).toBe(true);
  });

  it('keeps the old behaviour when no exemptions are passed', () => {
    expect(checkSprintCompletion(tasks, '1', new Set()).incompleteTasks).toHaveLength(2);
  });

  it('lets the start gate pass a prerequisite sprint whose only open tasks are exempt', () => {
    expect(
      checkSprintStartGate(tasks, 2, new Set(['IFC-1', 'IFC-3']), []).gateResult.severity
    ).toBe('PASS');
    expect(checkSprintStartGate(tasks, 2, new Set(), []).gateResult.severity).not.toBe('PASS');
  });

  it('fails the start gate for any sprint, even 0, when an exemption is invalid', () => {
    const result = checkSprintStartGate(tasks, 0, new Set(), [exemption('NOPE-1')]);
    expect(result.gateResult).toMatchObject({ name: 'Sprint Start Gate', severity: 'FAIL' });
  });

  it('applies no exemptions by default; an entry point opts in with useReopenExemptions', () => {
    const open = [task('IFC-1', 'In Progress')];
    expect(checkSprintCompletion(open, '1').isComplete).toBe(false);
    useReopenExemptions([exemption('IFC-1', '2999-01-01T00:00:00+00:00')]);
    try {
      expect(checkSprintCompletion(open, '1').isComplete).toBe(true);
      expect(checkSprintStartGate(open, 2).gateResult.severity).toBe('PASS');
    } finally {
      useReopenExemptions([]);
    }
  });
});
