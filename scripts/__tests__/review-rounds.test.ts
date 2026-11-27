/**
 * Tests for scripts/lib/review-rounds.mjs: re-review only the hunks changed since the last round,
 * and a round limit with a human route (never an auto-waiver).
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAX_ROUNDS,
  allHunks,
  deltaAgainst,
  emptyBranch,
  hunkForFinding,
  loadBranch,
  maxRounds,
  nextBranchRecord,
  previousRoundOutcome,
  roundLimitMessage,
  splitHunks,
  storeBranch,
  withHunks,
} from '../lib/review-rounds.mjs';

const section = (file: string, ...hunks: string[]) => ({
  file,
  text: `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n${hunks.join('')}`,
});
const H1 = '@@ -1,2 +1,3 @@\n a\n+const one = 1;\n b\n';
const H2 = '@@ -40,2 +41,3 @@\n x\n+const two = 2;\n y\n';

describe('hunks', () => {
  it('splits a section into its header and hunks with new-file line ranges', () => {
    const { header, hunks } = splitHunks(section('a.ts', H1, H2));
    expect(header).toMatch(/^diff --git a\/a\.ts/);
    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toMatchObject({ file: 'a.ts', start: 1, end: 3 });
    expect(hunks[1]).toMatchObject({ start: 41, end: 43 });
  });

  it('hashes the changed lines only, so moved line numbers do not change a hunk', () => {
    const moved = '@@ -90,2 +95,3 @@\n a\n+const one = 1;\n b\n';
    const other = '@@ -1,2 +1,3 @@\n zzz\n+const one = 1;\n qqq\n';
    const a = allHunks([section('a.ts', H1)])[0].hash;
    expect(allHunks([section('a.ts', moved)])[0].hash).toBe(a);
    expect(allHunks([section('a.ts', other)])[0].hash).toBe(a);
    expect(allHunks([section('b.ts', H1)])[0].hash).not.toBe(a);
    const edited = '@@ -1,2 +1,3 @@\n a\n+const one = 2;\n b\n';
    expect(allHunks([section('a.ts', edited)])[0].hash).not.toBe(a);
  });

  it('finds the hunk of a finding by file and line, accepting "N-M"', () => {
    const hunks = allHunks([section('a.ts', H1, H2)]);
    expect(hunkForFinding({ file: 'a.ts', line: 2 }, hunks)).toBe(hunks[0].hash);
    expect(hunkForFinding({ file: 'a.ts', line: '42-44' }, hunks)).toBe(hunks[1].hash);
    expect(hunkForFinding({ file: 'a.ts', line: 20 }, hunks)).toBeNull();
    expect(hunkForFinding({ file: 'zz.ts', line: 2 }, hunks)).toBeNull();
  });
});

describe('deltaAgainst: only what changed since the last round', () => {
  const sections = [section('a.ts', H1, H2)];

  it('sends everything on the first round', () => {
    const d = deltaAgainst(sections, emptyBranch());
    expect(d.newHunks).toBe(2);
    expect(d.review).toHaveLength(1);
    expect(d.review[0].text).toContain('const one');
    expect(d.review[0].text).toContain('const two');
  });

  it('sends nothing when every hunk was reviewed already', () => {
    const prev = nextBranchRecord({
      prev: emptyBranch(),
      head: 'h1',
      sections,
      findings: [],
      modelRound: true,
      pass: true,
    });
    const d = deltaAgainst(sections, prev);
    expect(d.newHunks).toBe(0);
    expect(d.seenHunks).toBe(2);
    expect(d.review).toEqual([]);
  });

  it('sends only the changed hunk, with its file header', () => {
    const prev = nextBranchRecord({
      prev: emptyBranch(),
      head: 'h1',
      sections,
      findings: [],
      modelRound: true,
      pass: true,
    });
    const H2b = '@@ -40,2 +41,3 @@\n x\n+const two = 22;\n y\n';
    const d = deltaAgainst([section('a.ts', H1, H2b)], prev);
    expect(d.newHunks).toBe(1);
    expect(d.seenHunks).toBe(1);
    expect(d.review[0].text).toMatch(/^diff --git a\/a\.ts/);
    expect(d.review[0].text).toContain('const two = 22');
    expect(d.review[0].text).not.toContain('const one');
  });

  it('treats a new file and a new hunk in an old file as new', () => {
    const prev = nextBranchRecord({
      prev: emptyBranch(),
      head: 'h1',
      sections,
      findings: [],
      modelRound: true,
      pass: true,
    });
    const d = deltaAgainst([...sections, section('b.ts', H1)], prev);
    expect(d.review.map((s: { file: string }) => s.file)).toEqual(['b.ts']);
  });

  it('carries an unresolved finding whose hunk is unchanged and drops one whose hunk changed', () => {
    const found = withHunks(
      [
        { severity: 'high', file: 'a.ts', line: 2, rule: 'r1' },
        { severity: 'medium', file: 'a.ts', line: 42, rule: 'r2' },
      ],
      sections
    );
    const prev = nextBranchRecord({
      prev: emptyBranch(),
      head: 'h1',
      sections,
      findings: found,
      modelRound: true,
      pass: false,
    });
    const H2b = '@@ -40,2 +41,3 @@\n x\n+const two = 22;\n y\n';
    const d = deltaAgainst([section('a.ts', H1, H2b)], prev);
    expect(d.carried.map((f: { rule: string }) => f.rule)).toEqual(['r1']);
    expect(d.dropped.map((f: { rule: string }) => f.rule)).toEqual(['r2']);
  });

  it('drops a finding whose code was removed from the diff', () => {
    const found = withHunks([{ severity: 'high', file: 'a.ts', line: 2, rule: 'r1' }], sections);
    const prev = nextBranchRecord({
      prev: emptyBranch(),
      head: 'h1',
      sections,
      findings: found,
      modelRound: true,
      pass: false,
    });
    const d = deltaAgainst([section('a.ts', H2)], prev);
    expect(d.dropped).toHaveLength(1);
    expect(d.carried).toHaveLength(0);
  });
});

describe('the branch record and the round count', () => {
  it('counts a failed model round and resets on a pass', () => {
    const a = nextBranchRecord({
      prev: emptyBranch(),
      head: 'h1',
      sections: [section('a.ts', H1)],
      findings: [{ severity: 'high' }],
      modelRound: true,
      pass: false,
    });
    expect(a.rounds).toBe(1);
    const b = nextBranchRecord({
      prev: a,
      head: 'h2',
      sections: [section('a.ts', H1)],
      findings: [],
      modelRound: true,
      pass: false,
    });
    expect(b.rounds).toBe(2);
    const c = nextBranchRecord({
      prev: b,
      head: 'h3',
      sections: [section('a.ts', H1)],
      findings: [],
      modelRound: true,
      pass: true,
    });
    expect(c.rounds).toBe(0);
  });

  it('does not count a round that called no model', () => {
    const a = nextBranchRecord({
      prev: { ...emptyBranch(), rounds: 2 },
      head: 'h',
      sections: [section('a.ts', H1)],
      findings: [{ severity: 'high' }],
      modelRound: false,
      pass: false,
    });
    expect(a.rounds).toBe(2);
  });

  it('keeps only LOW findings after a pass', () => {
    const a = nextBranchRecord({
      prev: emptyBranch(),
      head: 'h',
      sections: [section('a.ts', H1)],
      findings: [{ severity: 'low' }, { severity: 'high' }],
      modelRound: true,
      pass: true,
    });
    expect(a.findings).toEqual([{ severity: 'low' }]);
  });

  it('stores and loads records per branch, and a bad file is a fresh record', () => {
    const rec = { ...emptyBranch(), rounds: 3 };
    const text = storeBranch(storeBranch('', 'feat/a', rec), 'feat/b', { ...rec, rounds: 1 });
    expect(loadBranch(text, 'feat/a').rounds).toBe(3);
    expect(loadBranch(text, 'feat/b').rounds).toBe(1);
    expect(loadBranch(text, 'feat/c')).toEqual(emptyBranch());
    expect(loadBranch('garbage', 'feat/a')).toEqual(emptyBranch());
    expect(loadBranch('', 'feat/a')).toEqual(emptyBranch());
  });
});

describe('round limit', () => {
  it('defaults to 4 and reads the env', () => {
    expect(DEFAULT_MAX_ROUNDS).toBe(4);
    expect(maxRounds({})).toBe(4);
    expect(maxRounds({ CODEX_REVIEW_MAX_ROUNDS: '6' })).toBe(6);
    expect(maxRounds({ CODEX_REVIEW_MAX_ROUNDS: '0' })).toBe(4);
    expect(maxRounds({ CODEX_REVIEW_MAX_ROUNDS: 'x' })).toBe(4);
  });

  it('stops with a human route, lists open findings and waives nothing', () => {
    const m = roundLimitMessage({
      branch: 'feat/x',
      rounds: 4,
      limit: 4,
      findings: [
        { severity: 'high', file: 'a.ts', line: 3, rule: 'r1' },
        { severity: 'low', file: 'b.ts', line: 1, rule: 'r2' },
      ],
    });
    expect(m).toMatch(/^ROUND_LIMIT: 4 semantic-review rounds on feat\/x \(limit 4\)/);
    expect(m).toMatch(/Gate FAIL/);
    expect(m).toMatch(/nothing waived/);
    expect(m).toMatch(/owner or the orchestrator decides/);
    expect(m).toMatch(/\[HIGH\] a\.ts:3 r1/);
    expect(m).not.toMatch(/b\.ts/);
  });
});

describe('previousRoundOutcome', () => {
  it('reports how many earlier findings had their code changed', () => {
    const prev = { ...emptyBranch(), lastRound: { round: 2, head: 'h', at: 'now' } };
    const out = previousRoundOutcome(
      prev,
      [{ file: 'a.ts', line: 1, severity: 'high', rule: 'r' }],
      [{ file: 'b.ts', line: 1, severity: 'low', rule: 'q' }]
    );
    expect(out).toMatchObject({ round: 2, findings: 2, changed_code: 1, unchanged: 1 });
    expect(out!.changed[0]).toMatchObject({ file: 'a.ts', rule: 'r' });
  });

  it('is null on the first round', () => {
    expect(previousRoundOutcome(emptyBranch(), [], [])).toBeNull();
  });
});
