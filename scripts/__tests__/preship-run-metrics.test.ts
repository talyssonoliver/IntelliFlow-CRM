import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendRunRecord,
  buildRunRecord,
  createMemorySampler,
  summaryLine,
} from '../lib/preship-run-metrics.mjs';

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** A sampler driven by hand: no real timer, free memory read from `free.value`. */
function manualSampler(free: { value: number }) {
  let tick: (() => void) | null = null;
  const sampler = createMemorySampler({
    freemem: () => free.value,
    totalmem: () => 32 * GB,
    setIntervalFn: ((fn: () => void) => {
      tick = fn;
      return 1;
    }) as unknown as typeof setInterval,
    clearIntervalFn: (() => {
      tick = null;
    }) as unknown as typeof clearInterval,
  });
  return { sampler, tick: () => tick?.() };
}

describe('createMemorySampler', () => {
  it('records the lowest free memory overall and per step', () => {
    const free = { value: 20 * GB };
    const { sampler, tick } = manualSampler(free);
    sampler.start();

    sampler.mark('unit-tests');
    free.value = 12 * GB;
    tick();
    free.value = 9 * GB;
    tick();
    sampler.mark(null);

    sampler.mark('build');
    free.value = 6 * GB;
    tick();
    sampler.mark(null);

    free.value = 18 * GB;
    const m = sampler.stop();

    expect(m.total_mb).toBe(32 * 1024);
    expect(m.min_free_mb).toBe(6 * 1024);
    expect(m.peak_used_mb).toBe(26 * 1024);
    expect(m.per_step_min_free_mb).toEqual({ 'unit-tests': 9 * 1024, build: 6 * 1024 });
  });

  it('does not attribute samples taken between steps to a step', () => {
    const free = { value: 20 * GB };
    const { sampler, tick } = manualSampler(free);
    sampler.start();
    free.value = 4 * GB;
    tick();
    const m = sampler.stop();
    expect(m.min_free_mb).toBe(4 * 1024);
    expect(m.per_step_min_free_mb).toEqual({});
  });
});

describe('buildRunRecord + summaryLine', () => {
  const results = [
    { id: 'lint', verdict: 'PASS', duration_ms: 33_000 },
    {
      id: 'unit-tests',
      verdict: 'CACHED_PASS',
      duration_ms: 0,
      cached_original_duration_ms: 420_000,
    },
    { id: 'build', verdict: 'PASS', duration_ms: 282_000 },
    { id: 'coverage', verdict: 'PASS', duration_ms: 215_000 },
  ];
  const record = buildRunRecord({
    head: 'abc123',
    branch: 'feat/x',
    mode: 'standard',
    testScope: {
      scope: 'full',
      reason: 'package.json changed — it can affect tests that do not import it',
      files: [],
      base: 'origin/main',
    },
    results,
    startedAt: Date.UTC(2026, 10, 6, 23, 0, 0),
    durationMs: 990_000,
    verdict: 'PASS',
    memory: {
      total_mb: 32768,
      min_free_mb: 9216,
      peak_used_mb: 23552,
      per_step_min_free_mb: { build: 9216 },
    },
  });

  it('keeps the scope and why it widened, per-step times and memory', () => {
    expect(record).toMatchObject({
      at: '2026-11-06T23:00:00.000Z',
      head: 'abc123',
      branch: 'feat/x',
      only: null,
      verdict: 'PASS',
      test_scope: { scope: 'full', changed_files: 0, base: 'origin/main' },
      memory: { min_free_mb: 9216, total_mb: 32768 },
    });
    expect(record.test_scope.reason).toContain('package.json changed');
    expect(record.steps.find((s) => s.id === 'build')).toEqual({
      id: 'build',
      verdict: 'PASS',
      duration_ms: 282_000,
      min_free_mb: 9216,
    });
    expect(record.steps.find((s) => s.id === 'unit-tests')).toMatchObject({
      cached_original_duration_ms: 420_000,
    });
  });

  it('prints one line with the time, scope, memory and slowest steps', () => {
    const line = summaryLine(record, 'artifacts/preship/runs.jsonl');
    expect(line.endsWith('\n')).toBe(true);
    expect(line.trim().split('\n')).toHaveLength(1);
    expect(line).toContain('pre-ship metrics: 16m30s');
    expect(line).toContain('tests full (package.json changed');
    expect(line).toContain('min free RAM 9.0 GB of 32.0 GB');
    expect(line).toContain('slowest: build 4m42s, coverage 3m35s, lint 33s');
    expect(line).toContain('Log: artifacts/preship/runs.jsonl');
  });
});

describe('appendRunRecord', () => {
  let dir = '';
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preship-metrics-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('appends one JSON line per run', () => {
    const logPath = path.join(dir, 'nested', 'runs.jsonl');
    expect(appendRunRecord(logPath, { run: 1 })).toBe(true);
    expect(appendRunRecord(logPath, { run: 2 })).toBe(true);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines.map((l) => JSON.parse(l))).toEqual([{ run: 1 }, { run: 2 }]);
  });

  it('never throws when the log cannot be written', () => {
    const blocker = path.join(dir, 'file');
    fs.writeFileSync(blocker, 'x');
    expect(appendRunRecord(path.join(blocker, 'runs.jsonl'), { run: 1 })).toBe(false);
  });
});
