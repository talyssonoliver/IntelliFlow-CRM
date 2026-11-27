/**
 * Tests for scripts/lib/review-metrics.mjs and the summary script: one JSON line per review run,
 * rounds and cost per PR.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  METRICS_VERSION,
  appendRecord,
  buildRecord,
  formatSummary,
  metricsPath,
  parseClaudeUsage,
  parseCodexTokens,
  parseMetrics,
  severityCounts,
  summarize,
} from '../lib/review-metrics.mjs';

const rec = (over: Record<string, unknown> = {}) =>
  buildRecord({
    branch: 'feat/x',
    mode: 'full',
    round: 1,
    tier: 'strong',
    reviewer: 'codex',
    model: 'm',
    effort: 'high',
    why: 'risky',
    verdict: 'FAIL',
    bytes: 1000,
    now: new Date('2026-11-27T10:00:00Z'),
    ...over,
  });

describe('buildRecord', () => {
  it('carries every documented field, null when unknown', () => {
    const r = rec({ findings: [{ severity: 'high', file: 'a.ts', line: 3, rule: 'r' }] });
    expect(r).toMatchObject({
      v: METRICS_VERSION,
      ts: '2026-11-27T10:00:00.000Z',
      branch: 'feat/x',
      pr: null,
      round: 1,
      mode: 'full',
      tier: 'strong',
      reviewer: 'codex',
      model: 'm',
      effort: 'high',
      why: 'risky',
      tokens: null,
      cost_usd: null,
      findings: { critical: 0, high: 1, medium: 0, low: 0 },
      verdict: 'FAIL',
      previous_round: null,
    });
    expect(r.finding_list).toEqual([
      { severity: 'high', file: 'a.ts', line: 3, rule: 'r', carried: false },
    ]);
  });

  it('counts severities and any other value as other', () => {
    expect(
      severityCounts([{ severity: 'HIGH' }, { severity: 'low' }, { severity: 'weird' }, {}])
    ).toEqual({
      critical: 0,
      high: 1,
      medium: 0,
      low: 1,
      other: 2,
    });
  });
});

describe('tokens and cost', () => {
  it('reads codex "tokens used"', () => {
    expect(parseCodexTokens('...\ntokens used\n12,345\n')).toEqual({ total: 12345 });
    expect(parseCodexTokens('nothing')).toBeNull();
  });

  it('reads the claude envelope usage and cost', () => {
    const out = JSON.stringify({
      result: 'x',
      total_cost_usd: 0.42,
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 },
    });
    expect(parseClaudeUsage(out)).toEqual({
      tokens: { total: 115, input: 10, output: 5 },
      costUsd: 0.42,
    });
    expect(parseClaudeUsage('not json')).toEqual({ tokens: null, costUsd: null });
  });
});

describe('the metrics file', () => {
  it('appends one JSON line per run and never throws', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-'));
    const file = path.join(dir, 'sub', 'metrics.jsonl');
    expect(appendRecord(fs, file, rec())).toBe(true);
    expect(appendRecord(fs, file, rec({ round: 2 }))).toBe(true);
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]).round).toBe(2);
    const broken = {
      mkdirSync: vi.fn(() => {
        throw new Error('disk');
      }),
      appendFileSync: vi.fn(),
    };
    expect(appendRecord(broken as never, file, rec())).toBe(false);
  });

  it('lets an env var move the file', () => {
    expect(metricsPath('/o', { CODEX_REVIEW_METRICS_PATH: '/x/m.jsonl' })).toBe('/x/m.jsonl');
    expect(metricsPath('/o', {})).toBe(path.join('/o', 'metrics.jsonl'));
  });

  it('skips lines that are not records', () => {
    const text = `${JSON.stringify(rec())}\nnot json\n${JSON.stringify({ v: 99 })}\n`;
    expect(parseMetrics(text)).toHaveLength(1);
  });
});

describe('summarize: rounds and cost per PR', () => {
  const records = [
    rec({
      pr: 7,
      round: 1,
      mode: 'full',
      bytes: 2000,
      tokens: { total: 500 },
      findings: [
        { severity: 'high', file: 'a.ts', line: 1, rule: 'r' },
        { severity: 'low', file: 'a.ts', line: 9, rule: 'q' },
      ],
    }),
    rec({
      pr: 7,
      round: 2,
      mode: 'delta',
      bytes: 300,
      reviewer: 'claude',
      model: 'claude',
      costUsd: 0.5,
      previousRound: { round: 1, findings: 2, changed_code: 1, unchanged: 1 },
      findings: [{ severity: 'low', file: 'a.ts', line: 9, rule: 'q', carried: true }],
      verdict: 'PASS',
    }),
    rec({ pr: 7, mode: 'skipped', round: 0, tier: 'skip', reviewer: 'none' }),
    rec({ pr: 7, mode: 'deferred', round: 0, verdict: 'DEFERRED' }),
    rec({ pr: 8, branch: 'feat/y', round: 1, mode: 'full' }),
  ];

  it('groups by PR with model rounds, skips, deferrals and cost', () => {
    const groups = summarize(records);
    expect(groups.map((g: { key: string }) => g.key)).toEqual(['PR #7', 'PR #8']);
    const g = groups[0];
    expect(g).toMatchObject({
      modelRounds: 2,
      skipped: 1,
      deferred: 1,
      bytes: 2300,
      tokens: 500,
      acted: 1,
      raisedBeforeLastRound: 2,
    });
    expect(g.costUsd).toBeCloseTo(0.5);
    expect([...g.reviewers].sort()).toEqual(['claude', 'codex']);
  });

  it('does not count a carried finding as new', () => {
    const g = summarize(records)[0];
    expect(g.findings).toEqual({ critical: 0, high: 1, medium: 0, low: 1 });
  });

  it('groups by branch when no PR number was recorded', () => {
    expect(summarize([rec({ pr: null })])[0].key).toBe('feat/x');
  });

  it('prints a block per PR and a total', () => {
    const text = formatSummary(summarize(records));
    expect(text).toMatch(/PR #7 \(feat\/x\)/);
    expect(text).toMatch(/model rounds : 2 +skipped: 1 +reused: 0 +deferred: 1/);
    expect(text).toMatch(/acted on +: 1 of 2/);
    expect(text).toMatch(/USD 0\.50/);
    expect(text).toMatch(/Total: 2 PR\/branch\(es\), 3 model round\(s\)/);
    expect(formatSummary([])).toMatch(/No review metrics/);
  });

  it('the summary script prints rounds per PR from a file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-cli-'));
    const file = path.join(dir, 'm.jsonl');
    fs.writeFileSync(file, records.map((r) => JSON.stringify(r)).join('\n'));
    const script = path.resolve(__dirname, '../codex-review-metrics.mjs');
    const r = spawnSync(process.execPath, [script, `--file=${file}`], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/PR #7/);
    expect(r.stdout).toMatch(/model rounds : 2/);
    const j = spawnSync(process.execPath, [script, `--file=${file}`, '--json'], {
      encoding: 'utf8',
    });
    expect(JSON.parse(j.stdout)).toHaveLength(2);
  });
});
