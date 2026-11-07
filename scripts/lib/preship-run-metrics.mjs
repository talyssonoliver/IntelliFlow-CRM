/**
 * Pre-ship run metrics (#1216 item 0).
 *
 * Every run records what it cost, so changes to the gate can be measured instead of guessed:
 *  - each step's duration and verdict;
 *  - the test scope the run chose and why (and so why it widened to the full suite);
 *  - memory: the lowest free physical memory seen during the run, overall and per step,
 *    sampled every couple of seconds (system-wide, so it includes everything else on the
 *    machine, which is what decides whether other work has to pause).
 *
 * The record is appended as one JSON line to a local log (artifacts/preship/runs.jsonl, ignored
 * by git), and a one-line summary is printed at the end of the run.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MB = 1024 * 1024;

/**
 * Samples free physical memory on an interval and attributes each sample to the current step.
 * `freemem`, `totalmem` and the timer functions are injectable for tests.
 */
export function createMemorySampler({
  intervalMs = 2000,
  freemem = os.freemem,
  totalmem = os.totalmem,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  let current = null;
  let minFree = Number.POSITIVE_INFINITY;
  const perStep = new Map();
  let timer = null;

  function sample() {
    const free = freemem();
    if (free < minFree) minFree = free;
    if (current) {
      const prev = perStep.get(current);
      if (prev === undefined || free < prev) perStep.set(current, free);
    }
  }

  return {
    start() {
      sample();
      timer = setIntervalFn(sample, intervalMs);
      if (timer && typeof timer.unref === 'function') timer.unref();
    },
    /** Attribute the following samples to `stepId` (null: between steps). */
    mark(stepId) {
      current = stepId;
      if (stepId) sample();
    },
    stop() {
      sample();
      if (timer) clearIntervalFn(timer);
      timer = null;
      current = null;
      const total = totalmem();
      const min = Number.isFinite(minFree) ? minFree : freemem();
      return {
        total_mb: Math.round(total / MB),
        min_free_mb: Math.round(min / MB),
        peak_used_mb: Math.round((total - min) / MB),
        per_step_min_free_mb: Object.fromEntries(
          [...perStep.entries()].map(([id, free]) => [id, Math.round(free / MB)])
        ),
      };
    },
  };
}

/** The run record appended to the log. */
export function buildRunRecord({
  head,
  branch,
  mode,
  only,
  testScope,
  results,
  startedAt,
  durationMs,
  verdict,
  memory,
}) {
  const perStepMin = memory?.per_step_min_free_mb ?? {};
  return {
    at: new Date(startedAt).toISOString(),
    head,
    branch: branch ?? null,
    mode,
    /** Steps selected with --only, or null for a whole run (a baseline uses whole runs). */
    only: only ?? null,
    verdict,
    duration_ms: durationMs,
    test_scope: {
      scope: testScope?.scope ?? null,
      reason: testScope?.reason ?? null,
      changed_files: Array.isArray(testScope?.files) ? testScope.files.length : 0,
      base: testScope?.base ?? null,
    },
    memory: {
      total_mb: memory?.total_mb ?? null,
      min_free_mb: memory?.min_free_mb ?? null,
      peak_used_mb: memory?.peak_used_mb ?? null,
    },
    steps: results.map((r) => ({
      id: r.id,
      verdict: r.verdict,
      duration_ms: r.duration_ms ?? 0,
      ...(r.cached_original_duration_ms !== undefined
        ? { cached_original_duration_ms: r.cached_original_duration_ms }
        : {}),
      ...(perStepMin[r.id] !== undefined ? { min_free_mb: perStepMin[r.id] } : {}),
    })),
  };
}

/** Append one record as a JSON line. Never throws: metrics must not fail the gate. */
export function appendRunRecord(logPath, record) {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
    return true;
  } catch {
    return false;
  }
}

function fmt(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
}

function gb(mb) {
  return mb === null || mb === undefined ? '?' : `${(mb / 1024).toFixed(1)} GB`;
}

/** One-line summary of a run record. */
export function summaryLine(record, logPathForDisplay) {
  const slowest = [...record.steps]
    .filter((s) => s.duration_ms > 0)
    .sort((a, b) => b.duration_ms - a.duration_ms)
    .slice(0, 3)
    .map((s) => `${s.id} ${fmt(s.duration_ms)}`)
    .join(', ');
  const scope = record.test_scope.scope
    ? `tests ${record.test_scope.scope} (${record.test_scope.reason})`
    : 'tests ?';
  return (
    `pre-ship metrics: ${fmt(record.duration_ms)}, ${scope}, ` +
    `min free RAM ${gb(record.memory.min_free_mb)} of ${gb(record.memory.total_mb)}` +
    (slowest ? `, slowest: ${slowest}` : '') +
    (logPathForDisplay ? `. Log: ${logPathForDisplay}` : '') +
    '\n'
  );
}
