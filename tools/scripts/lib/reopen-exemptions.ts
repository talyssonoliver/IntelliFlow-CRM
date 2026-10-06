/**
 * Temporary, dated exemptions for tasks that were truthfully reopened.
 *
 * The strict sprint gates require every earlier-sprint task to be Completed.
 * When an audit reopens tasks whose Completed status was false (#795), the
 * gates would fail on every PR. Owner ruling 2026-10-06: the gate stays strict,
 * but exactly those reopened tasks are exempt until a fixed date, by which
 * they must be redone. An expired exemption is a hole, so it is never skipped
 * silently: once past its date, the exemption gate FAILS (in every mode)
 * until the task is done or the entry is removed.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GateResult, SprintTask } from './validation-utils.js';

export const REOPEN_EXEMPTIONS_PATH = 'tools/scripts/reopen-exemptions.json';

export interface ReopenExemption {
  taskId: string;
  /** ISO 8601 with offset, e.g. 2026-10-11T23:59:00+01:00 (Europe/London). */
  expires: string;
  /** When the redo is due; informational. */
  due: string;
  /** Which lane owns the redo. */
  lane: string;
  reason: string;
}

export function loadReopenExemptions(repoRoot: string): ReopenExemption[] {
  const path = join(repoRoot, REOPEN_EXEMPTIONS_PATH);
  if (!existsSync(path)) return [];
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8').replaceAll('﻿', ''));
  const list = (parsed as { exemptions?: unknown }).exemptions;
  if (!Array.isArray(list)) {
    throw new Error(`${REOPEN_EXEMPTIONS_PATH}: expected { "exemptions": [...] }`);
  }
  return list as ReopenExemption[];
}

function expiryOf(exemption: ReopenExemption): number {
  return Date.parse(exemption.expires);
}

/** Task IDs whose exemption is valid and not yet expired at `now`. */
export function activeExemptionIds(
  exemptions: readonly ReopenExemption[],
  now: Date = new Date()
): Set<string> {
  return new Set(
    exemptions
      .filter((e) => Number.isFinite(expiryOf(e)) && expiryOf(e) > now.getTime())
      .map((e) => e.taskId)
  );
}

const COMPLETED = new Set(['Done', 'Completed']);

/**
 * The exemption list itself is a gate: every entry must name a real task,
 * carry a parseable expiry, and not be past it while the task is still open.
 */
export function checkReopenExemptions(
  exemptions: readonly ReopenExemption[],
  tasks: readonly SprintTask[],
  now: Date = new Date()
): GateResult {
  if (exemptions.length === 0) {
    return { name: 'Reopen Exemptions', severity: 'PASS', message: 'No reopen exemptions' };
  }
  const byId = new Map(tasks.map((t) => [t['Task ID'], t]));
  const problems: string[] = [];
  const active: string[] = [];
  for (const e of exemptions) {
    const task = byId.get(e.taskId);
    const expiry = expiryOf(e);
    if (!task) {
      problems.push(`${e.taskId}: not in Sprint_plan.csv`);
    } else if (!Number.isFinite(expiry)) {
      problems.push(`${e.taskId}: unparseable expiry "${e.expires}"`);
    } else if (expiry <= now.getTime() && !COMPLETED.has(task.Status)) {
      problems.push(
        `${e.taskId}: exemption EXPIRED ${e.expires} and the task is still ${task.Status} (lane: ${e.lane}). Redo it or remove the entry.`
      );
    } else if (!COMPLETED.has(task.Status)) {
      active.push(`${e.taskId}: exempt until ${e.expires} (due ${e.due}, lane: ${e.lane})`);
    }
  }
  if (problems.length > 0) {
    return {
      name: 'Reopen Exemptions',
      severity: 'FAIL',
      message: `${problems.length} reopen exemption(s) invalid or expired`,
      details: [...problems, ...active],
    };
  }
  return {
    name: 'Reopen Exemptions',
    // PASS, not WARN: strict mode turns WARN into FAIL, and an in-date exemption
    // is the ruled state. Expiry is what fails (above).
    severity: 'PASS',
    message: `${active.length} reopened task(s) temporarily exempt from the completion gates`,
    details: active,
  };
}
