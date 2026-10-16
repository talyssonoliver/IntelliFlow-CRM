/**
 * Push-based executor status file (ADR-077, issue #581).
 *
 * An executor writes ONE small JSON file per task; the orchestrator reads it
 * instead of paying a `read_transcript` round-trip per check. The file is an
 * accelerator over the existing transcript polling, never a replacement for it:
 * `readExecutorStatus` reports `needsPoll: true` whenever the file cannot be
 * trusted (missing, unparseable, stale, wrong task) so the caller falls back to
 * the existing poll with no behaviour change.
 *
 * Disabled by default. `writeExecutorStatus` is a no-op unless the feature is
 * enabled (`INTELLIFLOW_EXECUTOR_STATUS=1` or `{ enabled: true }`).
 *
 * Design points (see ADR-077 for the reasoning):
 *  - one file per task, one writer per file -> no locking needed
 *  - atomic publish: write `<file>.<pid>.tmp` in the same directory, then rename
 *  - freshness is judged by the reader from `last_updated` + `heartbeat_s`, so a
 *    crashed executor (which can never write a final status) becomes `stale`
 *    rather than looking healthy forever
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export const STATUS_SCHEMA_VERSION = 1;
export const ENABLE_ENV = 'INTELLIFLOW_EXECUTOR_STATUS';
export const DEFAULT_HEARTBEAT_S = 60;
/** A non-terminal file older than STALE_MULTIPLIER x heartbeat is stale. */
export const STALE_MULTIPLIER = 3;

export const PHASES = Object.freeze([
  'setup',
  'spec',
  'plan',
  'exec',
  'validate',
  'preship',
  'ci',
  'ready',
  'merged',
  'blocked',
  'failed',
]);
export const GATE_STATUSES = Object.freeze(['unknown', 'running', 'pass', 'fail']);
/** Phases after which no further heartbeat is expected. */
export const TERMINAL_PHASES = Object.freeze(['ready', 'merged', 'blocked', 'failed']);

const TASK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function isEnabled(env = process.env) {
  return env[ENABLE_ENV] === '1';
}

/** Task ids become file names; reject anything that could escape the directory. */
export function assertTaskId(taskId) {
  if (typeof taskId !== 'string' || !TASK_ID_RE.test(taskId)) {
    throw new Error(`invalid task id: ${JSON.stringify(taskId)}`);
  }
  return taskId;
}

export function statusFilePath(dir, taskId) {
  return path.join(dir, `${assertTaskId(taskId)}.json`);
}

function readRaw(file) {
  try {
    return { text: fs.readFileSync(file, 'utf8') };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { missing: true };
    return { error: err };
  }
}

/**
 * Publish a status snapshot. Returns the written record, or null when disabled.
 * `fields` may carry: phase, gate_status, next_expected_event, detail, branch,
 * mem_mb, cpu_s, heartbeat_s.
 */
export function writeExecutorStatus(dir, taskId, fields, opts = {}) {
  const enabled = opts.enabled ?? isEnabled(opts.env);
  if (!enabled) return null;
  assertTaskId(taskId);

  const phase = fields.phase;
  if (!PHASES.includes(phase)) throw new Error(`invalid phase: ${JSON.stringify(phase)}`);
  const gate = fields.gate_status ?? 'unknown';
  if (!GATE_STATUSES.includes(gate)) {
    throw new Error(`invalid gate_status: ${JSON.stringify(gate)}`);
  }

  const file = statusFilePath(dir, taskId);
  const previous = readRaw(file);
  let seq = 1;
  if (previous.text !== undefined) {
    try {
      const prev = JSON.parse(previous.text);
      if (Number.isInteger(prev.seq) && prev.seq >= 1) seq = prev.seq + 1;
    } catch {
      // A torn or corrupt previous file must not block the next write.
    }
  }

  const now = opts.now ?? new Date();
  const record = {
    schema_version: STATUS_SCHEMA_VERSION,
    task_id: taskId,
    phase,
    gate_status: gate,
    terminal: TERMINAL_PHASES.includes(phase),
    seq,
    last_updated: now.toISOString(),
    heartbeat_s: fields.heartbeat_s ?? DEFAULT_HEARTBEAT_S,
    pid: opts.pid ?? process.pid,
  };
  for (const key of ['next_expected_event', 'detail', 'branch', 'mem_mb', 'cpu_s']) {
    if (fields[key] !== undefined) record[key] = fields[key];
  }

  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${record.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  return record;
}

/**
 * Interpret a task's status file.
 *
 * state: 'fresh' | 'stale' | 'terminal' | 'missing' | 'invalid'
 * needsPoll: true unless the file can be trusted (fresh, or terminal).
 */
export function readExecutorStatus(dir, taskId, opts = {}) {
  const file = statusFilePath(dir, taskId);
  const raw = readRaw(file);
  if (raw.missing) return { state: 'missing', needsPoll: true, status: null };
  if (raw.error)
    return { state: 'invalid', needsPoll: true, status: null, reason: raw.error.message };

  let status;
  try {
    status = JSON.parse(raw.text);
  } catch (err) {
    return {
      state: 'invalid',
      needsPoll: true,
      status: null,
      reason: `unparseable: ${err.message}`,
    };
  }
  const problem = validateStatus(status, taskId);
  if (problem) return { state: 'invalid', needsPoll: true, status: null, reason: problem };

  // A terminal record is final: age is irrelevant, the executor will not write again.
  if (status.terminal) return { state: 'terminal', needsPoll: false, status };

  const now = (opts.now ?? new Date()).getTime();
  const ageMs = now - Date.parse(status.last_updated);
  const limitMs = (opts.staleAfterS ?? status.heartbeat_s * STALE_MULTIPLIER) * 1000;
  if (ageMs > limitMs) {
    return { state: 'stale', needsPoll: true, status, ageS: Math.round(ageMs / 1000) };
  }
  return { state: 'fresh', needsPoll: false, status, ageS: Math.max(0, Math.round(ageMs / 1000)) };
}

function validateStatus(s, taskId) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return 'not an object';
  if (s.schema_version !== STATUS_SCHEMA_VERSION)
    return `unsupported schema_version ${s.schema_version}`;
  if (s.task_id !== taskId) return `task_id mismatch (${s.task_id})`;
  if (!PHASES.includes(s.phase)) return `unknown phase ${s.phase}`;
  if (!GATE_STATUSES.includes(s.gate_status)) return `unknown gate_status ${s.gate_status}`;
  if (typeof s.terminal !== 'boolean') return 'terminal must be boolean';
  if (!Number.isFinite(Date.parse(s.last_updated))) return 'last_updated is not a timestamp';
  if (!Number.isFinite(s.heartbeat_s) || s.heartbeat_s <= 0) return 'heartbeat_s must be > 0';
  return null;
}

/** Read every `<task>.json` in `dir`; unreadable entries come back as invalid. */
export function listExecutorStatuses(dir, opts = {}) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
  return names
    .filter((n) => n.endsWith('.json'))
    .map((n) => n.slice(0, -'.json'.length))
    .filter((id) => TASK_ID_RE.test(id))
    .sort()
    .map((taskId) => ({ taskId, ...readExecutorStatus(dir, taskId, opts) }));
}
