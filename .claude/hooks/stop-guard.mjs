#!/usr/bin/env node
/**
 * stop-guard.mjs — Stop event hook
 *
 * When the agent tries to stop during an active /exec session,
 * warns about incomplete mandatory phases and blocks exit.
 * User can always Ctrl+C to force quit.
 */

import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { locksHeldByTask, repoRootFromHook } from './lib/agent-context.mjs';

const REQUIRED_PHASES = ['exec-gates', 'exec-attestation', 'compliance-check', 'exec-metrics'];

function getStateDir() {
  return process.env.CLAUDE_SCRATCHPAD || join(process.cwd(), '.claude', 'hooks', 'state');
}

/**
 * Wave 3.1 — release any locks held by this task before stopping.
 *
 * Opt-in via CLAUDE_TASK_ID env var. Without it, no release is attempted
 * (the lock-sweep CI workflow still reaps orphans on a 15-min cadence).
 *
 * Failures here MUST be silent — Stop hook output goes back to the user
 * verbatim, and a lock-release error from a background utility shouldn't
 * change whether the session can stop.
 */
function releaseLocksOnStop() {
  const taskId = process.env.CLAUDE_TASK_ID;
  if (!taskId) return 0;
  try {
    const repoRoot = repoRootFromHook(import.meta.url);
    const held = locksHeldByTask(taskId, repoRoot);
    for (const l of held) {
      try {
        unlinkSync(join(repoRoot, '.claude', 'locks', l.file));
      } catch {
        /* ignore — sweep will reap orphans */
      }
    }
    return held.length;
  } catch {
    return 0;
  }
}

async function main() {
  // Release locks first; this happens whether or not phases are complete.
  releaseLocksOnStop();

  process.stdin.setEncoding('utf8');
  // Drain stdin (content not used by this hook)
  for await (const _chunk of process.stdin) {
    // consume
  }

  // Load exec phase state
  const statePath = join(getStateDir(), 'exec-phase-state.json');
  let state;
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    // No state file — not in an exec session, allow stop
    process.exit(0);
  }

  // Not in an active exec session
  if (!state?.started) process.exit(0);

  // Already completed all phases
  if (state?.all_complete) process.exit(0);

  const completed = (state.completed || []).map(c => c.skill);
  const missing = REQUIRED_PHASES.filter(s => !completed.includes(s));

  if (missing.length > 0) {
    const output = {
      decision: 'block',
      reason: `[Stop Guard] BLOCKED: /exec session for ${state.task_id || 'unknown task'} has ${missing.length} incomplete mandatory phase(s): ${missing.join(', ')}. ` +
              `Complete these phases before finishing. User can Ctrl+C to force quit if needed.`
    };
    process.stdout.write(JSON.stringify(output));
  }
  // If no missing phases, allow stop
}

main().catch(() => process.exit(0));
