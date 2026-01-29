import { NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PATHS, getHeartbeatPath, getSwarmLogPath } from '@/lib/paths';

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

function parseStartTime(lines: string[]): string {
  if (lines.length === 0) return new Date().toISOString();

  const firstLine = lines[0];
  const timeMatch = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(firstLine);
  return timeMatch ? new Date(timeMatch[1]).toISOString() : new Date().toISOString();
}

function findCurrentPhaseFromLog(lines: string[]): string {
  const phaseLine = [...lines].reverse().find((line) => line.includes('[PHASE]'));
  if (!phaseLine) return 'Initializing...';

  const match = /Phase \d+(?:\.\d+)?: (.+?)(?:\.\.\.|$)/.exec(phaseLine);
  return match ? match[1].trim() : 'Initializing...';
}

function isInfoOrSuccessLine(line: string): boolean {
  return line.includes('[INFO]') || line.includes('[SUCCESS]');
}

function extractMessage(line: string): string | null {
  const msgMatch = /- (.+)$/.exec(line);
  return msgMatch ? msgMatch[1].trim() : null;
}

function findLastMessage(lines: string[]): string {
  const infoLine = [...lines].reverse().find(isInfoOrSuccessLine);
  const infoMsg = infoLine ? extractMessage(infoLine) : null;
  if (infoMsg) return infoMsg;

  const lastLine = lines.at(-1);
  const lastMsg = lastLine ? extractMessage(lastLine) : null;
  return lastMsg ?? '';
}

const MEANINGFUL_LOG_TAGS = ['[INFO]', '[SUCCESS]', '[PHASE]', '[ERROR]', '[WARN]', '[HUMAN]'];

function isMeaningfulLogLine(line: string): boolean {
  return MEANINGFUL_LOG_TAGS.some((tag) => line.includes(tag));
}

function parseLogLine(line: string): { timestamp: string; message: string } | null {
  const timeMatch = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(line);
  const msgMatch = /- (.+)$/.exec(line);
  if (!timeMatch || !msgMatch) return null;
  return { timestamp: new Date(timeMatch[1]).toISOString(), message: msgMatch[1].trim() };
}

function extractRecentActivity(logContent: string): {
  activities: Array<{ timestamp: string; message: string }>;
  lastActivityTime: string;
} {
  const lines = logContent.split('\n').filter((line) => line.trim());
  const meaningfulLines = lines.filter(isMeaningfulLogLine).slice(-10);

  const activities = meaningfulLines
    .map(parseLogLine)
    .filter((item): item is { timestamp: string; message: string } => item !== null);

  const lastActivityTime = activities.at(-1)?.timestamp || new Date().toISOString();
  return { activities, lastActivityTime };
}

function checkNeedsHumanReview(activities: Array<{ message: string }>): boolean {
  const keywords = ['review', 'HUMAN', 'intervention', 'Needs Human'];
  return activities.some((a) => keywords.some((kw) => a.message.includes(kw)));
}

interface TaskInfo {
  taskId: string;
  status: 'running' | 'stuck' | 'needs_human';
  phase: string;
  currentPhase: string | null; // From task JSON file
  attempt: number;
  lastMessage: string;
  lastUpdate: string;
  recentActivity: string[];
  isStuck: boolean;
  needsHumanReview: boolean;
  minutesSinceActivity: number;
  heartbeatAge: number;
}

async function processTaskLog(taskId: string, logPath: string): Promise<TaskInfo> {
  let phase = 'Initializing...';
  let lastMessage = 'Starting task execution...';
  let startTime = new Date().toISOString();
  let recentActivity: Array<{ timestamp: string; message: string }> = [];
  let lastActivityTime = startTime;

  try {
    const logContent = await readFile(logPath, 'utf-8');
    const lines = logContent.split('\n').filter((line) => line.trim());

    startTime = parseStartTime(lines);
    phase = findCurrentPhaseFromLog(lines);
    lastMessage = findLastMessage(lines) || 'Starting task execution...';

    const activityData = extractRecentActivity(logContent);
    recentActivity = activityData.activities;
    lastActivityTime = activityData.lastActivityTime || startTime;
  } catch {
    // Log reading failed, use defaults
  }

  // Get phase info from task JSON file (more authoritative than log parsing)
  const taskPhaseInfo = await getTaskPhaseInfo(taskId);

  // Get heartbeat age
  const heartbeatAge = await getHeartbeatAgeSeconds(taskId);

  const now = new Date();
  const lastActivity = new Date(lastActivityTime);
  const minutesSinceActivity = Math.floor((now.getTime() - lastActivity.getTime()) / 60000);

  // Use JSON phase if available, otherwise fall back to log parsing
  const displayPhase = taskPhaseInfo.currentPhase
    ? formatPhase(taskPhaseInfo.currentPhase, taskPhaseInfo.attempt)
    : phase;

  // Determine stuck status based on heartbeat (more accurate than log activity)
  const isStuck = heartbeatAge > 300 || minutesSinceActivity > 5; // 5 minutes threshold
  const needsHumanReview =
    checkNeedsHumanReview(recentActivity) ||
    taskPhaseInfo.currentPhase === 'CRASHED' ||
    taskPhaseInfo.currentPhase === 'WATCHDOG_STUCK' ||
    taskPhaseInfo.currentPhase === 'STOPPED_BY_OPERATOR';

  return {
    taskId,
    status: needsHumanReview ? 'needs_human' : isStuck ? 'stuck' : 'running',
    phase: displayPhase,
    currentPhase: taskPhaseInfo.currentPhase,
    attempt: taskPhaseInfo.attempt,
    lastMessage,
    lastUpdate: startTime,
    recentActivity: recentActivity.map((a) => a.message),
    isStuck,
    needsHumanReview,
    minutesSinceActivity,
    heartbeatAge,
  };
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

async function readLockFiles(locksPath: string): Promise<string[]> {
  try {
    const files = await readdir(locksPath);
    return files.filter((f) => f.endsWith('.lock'));
  } catch {
    return [];
  }
}

export async function GET() {
  const locksPath = PATHS.artifacts.locks;

  const lockFiles = await readLockFiles(locksPath);
  if (lockFiles.length === 0) {
    return NextResponse.json([]);
  }

  const tasks = await Promise.all(
    lockFiles.map((lockFile) => {
      const taskId = lockFile.replace('.lock', '');
      const logPath = getSwarmLogPath(taskId);
      return processTaskLog(taskId, logPath);
    })
  );

  return NextResponse.json(tasks);
}
