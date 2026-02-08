#!/usr/bin/env node
/**
 * stop-guard.mjs — Stop event hook
 *
 * When the agent tries to stop during an active /exec session,
 * warns about incomplete mandatory phases and blocks exit.
 * User can always Ctrl+C to force quit.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const REQUIRED_PHASES = ['exec-gates', 'exec-attestation', 'compliance-check', 'exec-metrics'];

function getStateDir() {
  return process.env.CLAUDE_SCRATCHPAD || join(process.cwd(), '.claude', 'hooks', 'state');
}

async function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    input += chunk;
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
