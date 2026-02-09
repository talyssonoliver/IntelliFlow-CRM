#!/usr/bin/env node
/**
 * csv-status-guard.mjs — PreToolUse hook for Edit calls on Sprint_plan.csv
 *
 * Validates status transitions by checking prerequisite artifacts/phases
 * exist before each status change.
 *
 * Target Status    | Required Condition
 * Spec Complete    | Spec file exists
 * Planning         | Spec file exists
 * Plan Complete    | Plan file exists
 * In Progress      | Plan file exists
 * Completed        | exec-phase-state.json has gates + attestation + compliance-check
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Status patterns and their prerequisites
const TRANSITIONS = {
  'Spec Complete': { check: 'spec-file', msg: 'Spec file must exist before marking Spec Complete' },
  'Planning':      { check: 'spec-file', msg: 'Spec file must exist before starting planning' },
  'Plan Complete': { check: 'plan-file', msg: 'Plan file must exist before marking Plan Complete' },
  'In Progress':   { check: 'plan-file', msg: 'Plan file must exist before starting implementation' },
  'Completed':     { check: 'exec-phases', msg: 'Mandatory exec phases must complete before marking Completed' },
};

function getStateDir() {
  return process.env.CLAUDE_SCRATCHPAD || join(process.cwd(), '.claude', 'hooks', 'state');
}

function extractTaskId(oldStr, newStr) {
  // Try to extract task ID from the CSV row context
  // Task IDs follow patterns: IFC-NNN, PG-NNN, ENV-NNN-AI, AI-SETUP-NNN, etc.
  const patterns = [
    /\b(IFC-\d+)\b/,
    /\b(PG-\d+)\b/,
    /\b(ENV-\d+-AI)\b/,
    /\b(AI-SETUP-\d+)\b/,
    /\b(EXC-[A-Z]+-\d+)\b/,
    /\b(AUTOMATION-\d+)\b/,
    /\b(BRAND-\d+)\b/,
    /\b(DOC-\d+)\b/,
    /\b(GOV-\d+)\b/,
    /\b(SALES-\d+)\b/,
    /\b(GTM-\d+)\b/,
    /\b(ANALYTICS-\d+)\b/,
    /\b(ENG-OPS-\d+)\b/,
    /\b(PM-OPS-\d+)\b/,
    /\b(EP-\d+-AI)\b/,
  ];

  const combined = (oldStr || '') + (newStr || '');
  for (const pat of patterns) {
    const m = combined.match(pat);
    if (m) return m[1];
  }
  return null;
}

function extractSprintNumber(taskId) {
  // Read Sprint_plan.csv and find the task's target sprint
  try {
    const csvPath = join(process.cwd(), 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');
    const csv = readFileSync(csvPath, 'utf8');
    for (const line of csv.split('\n')) {
      if (line.includes(taskId)) {
        // Target Sprint is typically the column after several others
        // Parse the CSV properly — find column index
        const headerLine = csv.split('\n')[0];
        const headers = headerLine.split(',').map(h => h.trim().replace(/"/g, ''));
        const sprintIdx = headers.findIndex(h => h === 'Target Sprint');
        if (sprintIdx >= 0) {
          const cols = line.split(',');
          if (cols[sprintIdx]) {
            const n = parseInt(cols[sprintIdx].replace(/"/g, '').trim(), 10);
            if (!isNaN(n)) return n;
          }
        }
      }
    }
  } catch { /* fallback */ }
  return null;
}

function detectTargetStatus(newStr) {
  for (const status of Object.keys(TRANSITIONS)) {
    if (newStr && newStr.includes(status)) {
      return status;
    }
  }
  return null;
}

function checkPrerequisite(check, taskId, sprintN) {
  const specifyBase = join(process.cwd(), '.specify', 'sprints', `sprint-${sprintN}`);

  switch (check) {
    case 'spec-file': {
      const specPath = join(specifyBase, 'specifications', `${taskId}-spec.md`);
      return existsSync(specPath);
    }
    case 'plan-file': {
      const planPath = join(specifyBase, 'planning', `${taskId}-plan.md`);
      return existsSync(planPath);
    }
    case 'exec-phases': {
      const stateDir = getStateDir();
      const statePath = join(stateDir, 'exec-phase-state.json');
      try {
        const state = JSON.parse(readFileSync(statePath, 'utf8'));
        const required = ['exec-gates', 'exec-attestation', 'compliance-check'];
        const completed = (state.completed || []).map(c => c.skill);
        return required.every(s => completed.includes(s));
      } catch {
        return false;
      }
    }
    default:
      return true;
  }
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

  // Only fire for Edit tool
  if (data.tool_name !== 'Edit') process.exit(0);

  // Only fire for Sprint_plan.csv
  const filePath = data.tool_input?.file_path || '';
  if (!filePath.includes('Sprint_plan.csv')) process.exit(0);

  const newStr = data.tool_input?.new_string || '';
  const oldStr = data.tool_input?.old_string || '';

  // Detect which status is being set
  const targetStatus = detectTargetStatus(newStr);
  if (!targetStatus) process.exit(0); // Not a status change we track

  const transition = TRANSITIONS[targetStatus];
  const taskId = extractTaskId(oldStr, newStr);

  if (!taskId) {
    // Can't identify task — allow but warn
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: `[CSV Guard] Warning: Could not identify task ID for status change to "${targetStatus}". Prerequisite check skipped.`
      }
    };
    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  }

  const sprintN = extractSprintNumber(taskId);

  if (sprintN === null) {
    // Can't find sprint — allow but warn
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: `[CSV Guard] Warning: Could not determine sprint for ${taskId}. Prerequisite check skipped.`
      }
    };
    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  }

  // Check prerequisite
  const passed = checkPrerequisite(transition.check, taskId, sprintN);

  if (!passed) {
    const output = {
      decision: 'block',
      reason: `[CSV Status Guard] BLOCKED: Cannot set ${taskId} to "${targetStatus}". ${transition.msg}. ` +
              (transition.check === 'spec-file'
                ? `Expected: .specify/sprints/sprint-${sprintN}/specifications/${taskId}-spec.md`
                : transition.check === 'plan-file'
                ? `Expected: .specify/sprints/sprint-${sprintN}/planning/${taskId}-plan.md`
                : `Required exec phases: exec-gates, exec-attestation, compliance-check. Run these skills first.`)
    };
    process.stdout.write(JSON.stringify(output));
  }
  // If passed, exit silently (allow the edit)
}

main().catch(() => process.exit(0));
