#!/usr/bin/env node
/**
 * exec-phase-tracker.mjs — PostToolUse hook for Skill calls
 *
 * Tracks which mandatory /exec phases have been completed in the current session.
 * State file: {scratchpad}/exec-phase-state.json
 * Injects additionalContext reminding agent of remaining mandatory phases.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TRACKED_SKILLS = ['exec-gates', 'exec-attestation', 'exec-metrics', 'compliance-check'];

// Read state from scratchpad (session-scoped temp dir)
function getStateDir() {
  // Use CLAUDE_SCRATCHPAD or fall back to .claude/hooks/state
  return process.env.CLAUDE_SCRATCHPAD || join(process.cwd(), '.claude', 'hooks', 'state');
}

function getStatePath() {
  return join(getStateDir(), 'exec-phase-state.json');
}

function loadState() {
  try {
    return JSON.parse(readFileSync(getStatePath(), 'utf8'));
  } catch {
    return { started: false, task_id: null, completed: [] };
  }
}

function saveState(state) {
  const dir = getStateDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getStatePath(), JSON.stringify(state, null, 2));
}

async function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  // Only track Skill tool calls
  if (data.tool_name !== 'Skill') process.exit(0);

  const skill = data.tool_input?.skill;

  // Mark exec session as started when /exec is invoked
  if (skill === 'exec') {
    const state = loadState();
    state.started = true;
    state.started_at = new Date().toISOString();
    state.task_id = data.tool_input?.args || null;
    state.completed = [];
    saveState(state);
    process.exit(0);
  }

  // Track mandatory phase completion
  if (TRACKED_SKILLS.includes(skill)) {
    const state = loadState();

    // Only track if an exec session is active
    if (!state.started) {
      // Standalone invocation — still record it but don't inject reminders
      process.exit(0);
    }

    // Avoid duplicates
    if (!state.completed.some(c => c.skill === skill)) {
      state.completed.push({ skill, at: new Date().toISOString() });
      saveState(state);
    }

    const remaining = TRACKED_SKILLS.filter(s => !state.completed.some(c => c.skill === s));

    if (remaining.length > 0) {
      const output = {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `[Exec Phase Tracker] Completed: ${skill}. Remaining mandatory phases: ${remaining.join(', ')}. Do NOT mark task as Completed until all phases are done.`
        }
      };
      process.stdout.write(JSON.stringify(output));
    } else {
      // All phases done — clear the session
      const output = {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `[Exec Phase Tracker] All mandatory phases completed: ${TRACKED_SKILLS.join(', ')}. Task can now be marked as Completed.`
        }
      };
      process.stdout.write(JSON.stringify(output));
      state.all_complete = true;
      saveState(state);
    }
  }
}

main().catch(() => process.exit(0));
