/**
 * Artifact History API
 *
 * GET /api/artifacts/history - Get creation/modification history for files
 *
 * Query params:
 * - path: specific file path (optional, returns all if not provided)
 * - stale: 'true' to filter only stale files
 * - staleDays: number of days to consider stale (default: 30)
 */

import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = process.cwd().replace(/[\\/]apps[\\/]project-tracker$/, '');

export interface FileHistoryEntry {
  path: string;
  exists: boolean;
  // Creation info from git
  createdAt: string | null; // ISO timestamp
  createdBy: string | null; // Author name
  createdInCommit: string | null; // Commit hash
  createdPurpose: string | null; // Commit message (why it was created)
  createdTaskId: string | null; // Extracted task ID from commit message
  // Modification info
  lastModifiedAt: string | null; // ISO timestamp
  lastModifiedBy: string | null;
  lastModifiedCommit: string | null;
  lastModifiedMessage: string | null;
  // Staleness
  daysSinceModified: number | null;
  isStale: boolean;
  staleReason: string | null;
  // File system info (fallback if not in git)
  fsCreatedAt: string | null;
  fsModifiedAt: string | null;
}

/**
 * Extract task ID from commit message
 * Matches patterns like: IFC-001, ENV-001-AI, EXC-SEC-001, etc.
 */
function extractTaskId(message: string): string | null {
  const patterns = [
    /\b(IFC-\d+)/i,
    /\b(ENV-\d+-AI)/i,
    /\b(EXC-[A-Z]+-\d+)/i,
    /\b(AI-SETUP-\d+)/i,
    /\b(AUTOMATION-\d+)/i,
    /\b(PG-\d+)/i,
    /\b(GOV-\d+)/i,
    /\b(DOC-\d+)/i,
    /\b(BRAND-\d+)/i,
    /\b(GTM-\d+)/i,
    /\b(SALES-\d+)/i,
    /\b(PM-OPS-\d+)/i,
    /\b(ENG-OPS-\d+)/i,
    /\b(ANALYTICS-\d+)/i,
    /\b(EP-\d+-AI)/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(message);
    if (match) {
      return match[1].toUpperCase();
    }
  }
  return null;
}

/**
 * Compute staleness fields from a date string and threshold.
 */
function computeStaleness(
  dateStr: string,
  staleDays: number,
  label: string
): { daysSinceModified: number; isStale: boolean; staleReason: string | null } {
  const modDate = new Date(dateStr);
  const diffMs = Date.now() - modDate.getTime();
  const daysSinceModified = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const isStale = daysSinceModified > staleDays;
  return {
    daysSinceModified,
    isStale,
    staleReason: isStale ? `Not modified in ${daysSinceModified} days (${label})` : null,
  };
}

/**
 * Parse a git log line in format: hash|date|author|subject
 */
function parseGitLogLine(line: string): {
  hash: string;
  date: string;
  author: string;
  message: string;
} {
  const [hash, date, author, ...messageParts] = line.split('|');
  return {
    hash: hash || '',
    date: date || '',
    author: author || '',
    message: messageParts.join('|'),
  };
}

/**
 * Get git history for a specific file
 */
function getFileHistory(relativePath: string, staleDays: number): FileHistoryEntry {
  const absolutePath = join(PROJECT_ROOT, relativePath);
  const exists = existsSync(absolutePath);

  const entry: FileHistoryEntry = {
    path: relativePath,
    exists,
    createdAt: null,
    createdBy: null,
    createdInCommit: null,
    createdPurpose: null,
    createdTaskId: null,
    lastModifiedAt: null,
    lastModifiedBy: null,
    lastModifiedCommit: null,
    lastModifiedMessage: null,
    daysSinceModified: null,
    isStale: false,
    staleReason: null,
    fsCreatedAt: null,
    fsModifiedAt: null,
  };

  // Get file system timestamps as fallback
  if (exists) {
    try {
      const stats = statSync(absolutePath);
      entry.fsCreatedAt = stats.birthtime.toISOString();
      entry.fsModifiedAt = stats.mtime.toISOString();
    } catch {
      // Ignore stat errors
    }
  }

  try {
    // Get creation commit (first commit that added this file)
    // Format: hash|date|author|subject
    // S4721: use execFileSync with argument array — relativePath may come from user query params.
    const creationOutput = execFileSync(
      'git', // NOSONAR S4036 — PATH inherited from developer environment, internal tooling only
      ['log', '--follow', '--diff-filter=A', '--format=%H|%aI|%an|%s', '--', relativePath],
      { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 10000 }
    ).trim();

    if (creationOutput) {
      const lines = creationOutput.split('\n');
      // Take the last line (oldest commit that added the file)
      const lastLine = lines[lines.length - 1];
      const { hash, date, author, message } = parseGitLogLine(lastLine);
      entry.createdInCommit = hash || null;
      entry.createdAt = date || null;
      entry.createdBy = author || null;
      entry.createdPurpose = message || null;
      entry.createdTaskId = message ? extractTaskId(message) : null;
    }

    // Get last modification commit
    // S4721: use execFileSync with argument array — relativePath may come from user query params.
    const modifyOutput = execFileSync(
      'git', // NOSONAR S4036 — PATH inherited from developer environment, internal tooling only
      ['log', '-1', '--format=%H|%aI|%an|%s', '--', relativePath],
      { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 10000 }
    ).trim();

    if (modifyOutput) {
      const { hash, date, author, message } = parseGitLogLine(modifyOutput);
      entry.lastModifiedCommit = hash || null;
      entry.lastModifiedAt = date || null;
      entry.lastModifiedBy = author || null;
      entry.lastModifiedMessage = message || null;

      if (date) {
        const stale = computeStaleness(date, staleDays, `threshold: ${staleDays}`);
        entry.daysSinceModified = stale.daysSinceModified;
        entry.isStale = stale.isStale;
        entry.staleReason = stale.staleReason;
      }
    }
  } catch {
    // File might not be tracked by git yet — use filesystem timestamps if available
    if (entry.fsModifiedAt) {
      const stale = computeStaleness(entry.fsModifiedAt, staleDays, 'untracked file');
      entry.daysSinceModified = stale.daysSinceModified;
      entry.isStale = stale.isStale;
      entry.staleReason = stale.staleReason;
    }
  }

  return entry;
}

/**
 * Get all tracked files from git
 */
function getAllTrackedFiles(): string[] {
  try {
    const output = execFileSync('git', ['ls-files'], {
      // NOSONAR — PATH inherited from dev environment, internal tooling only
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 50 * 1024 * 1024,
    });

    return output
      .split('\n')
      .map((f: string) => f.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get untracked files from git
 */
function getUntrackedFiles(): string[] {
  try {
    const output = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
      // NOSONAR — PATH inherited from dev environment, internal tooling only
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 50 * 1024 * 1024,
    });

    return output
      .split('\n')
      .map((f: string) => f.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const specificPath = searchParams.get('path');
    const staleOnly = searchParams.get('stale') === 'true';
    const staleDays = Number.parseInt(searchParams.get('staleDays') || '30', 10);

    // If specific path requested
    if (specificPath) {
      const history = getFileHistory(specificPath, staleDays);
      return NextResponse.json(history);
    }

    // Get all files (tracked + untracked)
    const trackedFiles = getAllTrackedFiles();
    const untrackedFiles = getUntrackedFiles();
    const allFiles = [...new Set([...trackedFiles, ...untrackedFiles])];

    // Filter to relevant directories (exclude node_modules, .git, etc.)
    const relevantDirs = [
      'apps/',
      'packages/',
      'docs/',
      'infra/',
      'scripts/',
      'tools/',
      'artifacts/',
      'tests/',
      '.claude/',
      '.github/',
    ];

    const filteredFiles = allFiles.filter(
      (f) => relevantDirs.some((dir) => f.startsWith(dir)) || !f.includes('/') // Root files
    );

    // Get history for each file (with progress batching for performance)
    const histories: FileHistoryEntry[] = [];
    const batchSize = 50;

    for (let i = 0; i < filteredFiles.length; i += batchSize) {
      const batch = filteredFiles.slice(i, i + batchSize);
      const batchHistories = batch.map((f) => getFileHistory(f, staleDays));
      histories.push(...batchHistories);
    }

    // Apply stale filter if requested
    const result = staleOnly ? histories.filter((h) => h.isStale) : histories;

    // Summary stats
    const summary = {
      totalFiles: result.length,
      staleFiles: result.filter((h) => h.isStale).length,
      trackedInGit: result.filter((h) => h.createdAt !== null).length,
      untrackedFiles: result.filter((h) => h.createdAt === null).length,
      withTaskId: result.filter((h) => h.createdTaskId !== null).length,
      staleDaysThreshold: staleDays,
    };

    return NextResponse.json({
      summary,
      files: result,
    });
  } catch (error) {
    console.error('History API error:', error);
    return NextResponse.json(
      { error: 'Failed to get file history', details: String(error) },
      { status: 500 }
    );
  }
}
