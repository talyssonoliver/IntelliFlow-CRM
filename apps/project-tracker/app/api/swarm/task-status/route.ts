/**
 * GET /api/swarm/task-status?taskId=TASK_ID
 *
 * Get the status of a specific swarm task.
 * Combines active task monitoring with CSV status for completed tasks.
 */

import { NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PATHS, getHeartbeatPath, getSwarmLogPath, isValidTaskId, sanitizeTaskId } from '@/lib/paths';
import { getTask } from '@/lib/csv-status';

export const dynamic = 'force-dynamic';

// Find task JSON file in sprint-0 hierarchy
async function findTaskJson(taskId: string): Promise<string | null> {
  const metricsDir = PATHS.sprintTracking.sprint0;

  async function searchDir(dir: string): Promise<string | null> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          const found = await searchDir(fullPath);
          if (found) return found;
        } else if (entry.name === `${taskId}.json`) {
          return fullPath;
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
    return null;
  }

  return searchDir(metricsDir);
}

// Get heartbeat age in seconds
async function getHeartbeatAgeSeconds(taskId: string): Promise<number> {
  const heartbeatPath = getHeartbeatPath(taskId);
  try {
    const stats = await stat(heartbeatPath);
    const now = Date.now();
    const mtime = stats.mtime.getTime();
    return Math.floor((now - mtime) / 1000);
  } catch {
    return -1; // No heartbeat file
  }
}

// Check if task has an active lock file
async function hasActiveLock(taskId: string): Promise<boolean> {
  try {
    const lockPath = join(PATHS.artifacts.locks, `${taskId}.lock`);
    await stat(lockPath);
    return true;
  } catch {
    return false;
  }
}

// Read phase info from task JSON file
async function getTaskPhaseInfo(taskId: string): Promise<{
  currentPhase: string | null;
  attempt: number;
  updatedAt: string | null;
}> {
  const taskFile = await findTaskJson(taskId);
  if (!taskFile) {
    return { currentPhase: null, attempt: 0, updatedAt: null };
  }

  try {
    const content = await readFile(taskFile, 'utf-8');
    const data = JSON.parse(content);
    return {
      currentPhase: data.current_phase || null,
      attempt: data.attempt || 0,
      updatedAt: data.updated_at || null,
    };
  } catch {
    return { currentPhase: null, attempt: 0, updatedAt: null };
  }
}

// Format phase name for display
function formatPhase(phase: string, attempt: number): string {
  const phaseMap: Record<string, string> = {
    START: 'Starting...',
    PRE_FLIGHT: 'Pre-Flight Check',
    ARCHITECT_SPEC: 'Phase 1: Generating Spec',
    ARCHITECT_PLAN: 'Phase 1: Generating Plan',
    ENFORCER_TDD: 'Phase 2: TDD Test Generation',
    BUILDER_ATTEMPT: `Phase 3: Building (Attempt ${attempt})`,
    QUALITY_GATES: `Phase 3.5: Quality Gates (Attempt ${attempt})`,
    TDD_VALIDATION: `Phase 3.6: TDD Validation (Attempt ${attempt})`,
    GATEKEEPER_ATTEMPT: `Phase 4: Validation (Attempt ${attempt})`,
    AUDITOR_ATTEMPT: `Phase 5: Audit (Attempt ${attempt})`,
    IN_REVIEW: 'Awaiting Review',
    COMPLETED: 'Completed',
    CRASHED: '⚠️ CRASHED',
    WATCHDOG_STUCK: '⚠️ Watchdog Killed',
    STOPPED_BY_OPERATOR: '⏹️ Stopped by Operator',
  };
  return phaseMap[phase] || phase;
}

// Parse log to extract recent info
function parseLogForStatus(logContent: string): {
  phase: string;
  lastMessage: string;
  recentActivity: string[];
  lastActivityTime: string;
} {
  const lines = logContent.split('\n').filter((line) => line.trim());

  // Find current phase
  const phaseLine = [...lines].reverse().find((line) => line.includes('[PHASE]'));
  let phase = 'Initializing...';
  if (phaseLine) {
    const match = /Phase \d+(?:\.\d+)?: (.+?)(?:\.\.\.|$)/.exec(phaseLine);
    if (match) phase = match[1].trim();
  }

  // Find last message
  const infoLine = [...lines].reverse().find((line) => line.includes('[INFO]') || line.includes('[SUCCESS]'));
  let lastMessage = '';
  if (infoLine) {
    const msgMatch = /- (.+)$/.exec(infoLine);
    if (msgMatch) lastMessage = msgMatch[1].trim();
  }
  if (!lastMessage && lines.length > 0) {
    const msgMatch = /- (.+)$/.exec(lines[lines.length - 1]);
    lastMessage = msgMatch ? msgMatch[1].trim() : 'Starting task execution...';
  }

  // Extract recent activity
  const meaningfulTags = ['[INFO]', '[SUCCESS]', '[PHASE]', '[ERROR]', '[WARN]', '[HUMAN]'];
  const meaningfulLines = lines.filter((line) => meaningfulTags.some((tag) => line.includes(tag))).slice(-10);

  const recentActivity = meaningfulLines
    .map((line) => {
      const msgMatch = /- (.+)$/.exec(line);
      return msgMatch ? msgMatch[1].trim() : null;
    })
    .filter((msg): msg is string => msg !== null);

  // Get last activity time
  let lastActivityTime = new Date().toISOString();
  if (lines.length > 0) {
    const timeMatch = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(lines[lines.length - 1]);
    if (timeMatch) lastActivityTime = new Date(timeMatch[1]).toISOString();
  }

  return { phase, lastMessage, recentActivity, lastActivityTime };
}

export interface SwarmTaskStatus {
  taskId: string;
  status: 'running' | 'completed' | 'failed' | 'stuck' | 'needs_human' | 'not_started';
  phase: string;
  currentPhase: string | null;
  attempt: number;
  lastMessage: string;
  recentActivity: string[];
  isActive: boolean;
  heartbeatAge: number;
  csvStatus?: string;
  startedAt?: string;
  completedAt?: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawTaskId = searchParams.get('taskId');

    if (!rawTaskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    // Validate and sanitize taskId
    if (!isValidTaskId(rawTaskId)) {
      return NextResponse.json(
        { error: 'Invalid taskId format' },
        { status: 400 }
      );
    }

    const taskId = sanitizeTaskId(rawTaskId);
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID sanitization failed' }, { status: 400 });
    }

    // Get task from CSV for baseline status
    const csvTask = await getTask(taskId);
    if (!csvTask) {
      return NextResponse.json({ error: `Task ${taskId} not found in Sprint_plan.csv` }, { status: 404 });
    }

    // Check if task has active lock (running in swarm)
    const isActive = await hasActiveLock(taskId);

    // Get phase info from task JSON
    const taskPhaseInfo = await getTaskPhaseInfo(taskId);

    // Get heartbeat age
    const heartbeatAge = await getHeartbeatAgeSeconds(taskId);

    // Try to read log file
    const logPath = getSwarmLogPath(taskId);
    let logInfo = {
      phase: 'Not started',
      lastMessage: '',
      recentActivity: [] as string[],
      lastActivityTime: new Date().toISOString(),
    };

    try {
      const logContent = await readFile(logPath, 'utf-8');
      logInfo = parseLogForStatus(logContent);
    } catch {
      // No log file yet
    }

    // Determine overall status
    let status: SwarmTaskStatus['status'] = 'not_started';

    if (isActive) {
      // Task is currently running in swarm
      const isStuck = heartbeatAge > 300; // 5 minutes without heartbeat
      const needsHuman =
        taskPhaseInfo.currentPhase === 'CRASHED' ||
        taskPhaseInfo.currentPhase === 'WATCHDOG_STUCK' ||
        taskPhaseInfo.currentPhase === 'IN_REVIEW' ||
        logInfo.recentActivity.some((a) => a.includes('HUMAN') || a.includes('review'));

      if (needsHuman) {
        status = 'needs_human';
      } else if (isStuck) {
        status = 'stuck';
      } else {
        status = 'running';
      }
    } else {
      // Task not actively running - check CSV status
      const csvStatus = csvTask.Status?.toLowerCase() || '';
      if (csvStatus === 'completed' || csvStatus === 'done') {
        status = 'completed';
      } else if (csvStatus === 'failed' || csvStatus === 'blocked') {
        status = 'failed';
      } else if (taskPhaseInfo.currentPhase === 'COMPLETED') {
        status = 'completed';
      } else if (taskPhaseInfo.currentPhase === 'CRASHED') {
        status = 'failed';
      }
    }

    // Use JSON phase if available, otherwise fall back to log parsing
    const displayPhase = taskPhaseInfo.currentPhase
      ? formatPhase(taskPhaseInfo.currentPhase, taskPhaseInfo.attempt)
      : logInfo.phase;

    const result: SwarmTaskStatus = {
      taskId,
      status,
      phase: displayPhase,
      currentPhase: taskPhaseInfo.currentPhase,
      attempt: taskPhaseInfo.attempt,
      lastMessage: logInfo.lastMessage,
      recentActivity: logInfo.recentActivity,
      isActive,
      heartbeatAge,
      csvStatus: csvTask.Status,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[swarm/task-status] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get task status',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
