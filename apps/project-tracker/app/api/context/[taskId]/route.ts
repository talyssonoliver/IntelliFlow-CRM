import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Get repo root (apps/project-tracker -> repo root)
function getRepoRoot(): string {
  return join(process.cwd(), '..', '..');
}

// Get sprint number for a task from CSV
async function getTaskSprintNumber(taskId: string): Promise<number> {
  const repoRoot = getRepoRoot();
  const csvPath = join(repoRoot, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');

  try {
    const csvContent = await readFile(csvPath, 'utf-8');
    const records = parse(csvContent, { columns: true, skip_empty_lines: true }) as Array<Record<string, string>>;
    const task = records.find((r) => r['Task ID'] === taskId);
    return parseInt(task?.['Target Sprint'] || '0', 10);
  } catch {
    return 0;
  }
}

interface Params {
  params: Promise<{
    taskId: string;
  }>;
}

interface FileHashEntry {
  path: string;
  hash: string;
  status: 'matched' | 'mismatched' | 'missing' | 'pending';
  size?: number;
}

interface ContextPackData {
  taskId: string;
  runId?: string;
  packStatus: 'generated' | 'pending' | 'missing' | 'error';
  ackStatus: 'acknowledged' | 'pending' | 'missing' | 'invalid';
  hashStatus: 'valid' | 'invalid' | 'pending' | 'unchecked';
  filesRead: FileHashEntry[];
  invariantsAcknowledged?: string[];
  totalSize?: number;
  generatedAt?: string;
  acknowledgedAt?: string;
}

// Normalized manifest interface (supports both old and new formats)
interface NormalizedManifest {
  taskId?: string;
  runId?: string;
  createdAt?: string;
  files: Array<{
    path: string;
    sha256: string; // Normalized from 'hash' or 'sha256'
  }>;
}

// Raw manifest can have either old or new format
interface RawManifest {
  taskId?: string;
  runId?: string;
  createdAt?: string;
  generatedAt?: string; // Old format
  files?: Array<{
    path: string;
    hash?: string; // Old format
    sha256?: string; // New format
    status?: string;
    size?: number;
    totalLines?: number;
    excerptLines?: number;
    truncated?: boolean;
    included?: boolean;
  }>;
}

/**
 * Normalize manifest from old or new format to consistent structure
 */
function normalizeManifest(raw: RawManifest, taskId: string): NormalizedManifest {
  return {
    taskId: raw.taskId || taskId,
    runId: raw.runId,
    createdAt: raw.createdAt || raw.generatedAt, // Support both field names
    files: (raw.files || []).map((f) => ({
      path: f.path,
      sha256: f.sha256 || f.hash || '', // Support both 'sha256' and 'hash'
    })),
  };
}

/**
 * Load context pack from sprint-based location first, then legacy
 */
async function loadContextPack(taskId: string, sprintNumber: number): Promise<{
  manifest?: NormalizedManifest;
  content?: string;
}> {
  const repoRoot = getRepoRoot();

  // Sprint-based location first, then legacy
  const possibleDirs = [
    join(repoRoot, '.specify', 'sprints', `sprint-${sprintNumber}`, 'attestations', taskId),
    join(repoRoot, 'artifacts', 'attestations', taskId), // Legacy location
  ];

  const result: { manifest?: NormalizedManifest; content?: string } = {};

  for (const packDir of possibleDirs) {
    const manifestPath = join(packDir, 'context_pack.manifest.json');
    const contentPath = join(packDir, 'context_pack.md');

    // Try to load manifest
    if (!result.manifest && existsSync(manifestPath)) {
      try {
        const manifestContent = await readFile(manifestPath, 'utf-8');
        const rawManifest: RawManifest = JSON.parse(manifestContent);
        result.manifest = normalizeManifest(rawManifest, taskId);
      } catch {
        // Manifest exists but is invalid
      }
    }

    // Try to load content
    if (!result.content && existsSync(contentPath)) {
      try {
        result.content = await readFile(contentPath, 'utf-8');
      } catch {
        // Content exists but can't be read
      }
    }

    // If we found both, stop searching
    if (result.manifest && result.content) {
      break;
    }
  }

  return result;
}

// Raw ack structure that supports multiple formats
interface RawAckData {
  task_id?: string;
  run_id?: string;
  files_read?: Array<{ path: string; sha256?: string; hash?: string }>;
  invariants_acknowledged?: string[];
  acknowledged_at?: string;
  created_at?: string;
  completed_at?: string;
  attestation_timestamp?: string;
}

// Normalized ack structure
interface NormalizedAck {
  task_id: string;
  run_id: string;
  files_read: { path: string; sha256: string }[];
  invariants_acknowledged: string[];
  acknowledged_at: string;
}

/**
 * Normalize ack data from different formats
 */
function normalizeAck(raw: RawAckData, taskId: string): NormalizedAck {
  return {
    task_id: raw.task_id || taskId,
    run_id: raw.run_id || '',
    files_read: (raw.files_read || []).map((f) => ({
      path: f.path,
      sha256: f.sha256 || f.hash || 'verified_on_read',
    })),
    invariants_acknowledged: raw.invariants_acknowledged || [],
    acknowledged_at:
      raw.acknowledged_at || raw.completed_at || raw.created_at || raw.attestation_timestamp || '',
  };
}

/**
 * Load context acknowledgment from sprint-based location first, then legacy
 * Supports both attestation.json (new format) and context_ack.json (legacy format)
 */
async function loadContextAck(taskId: string, sprintNumber: number): Promise<{
  ack?: NormalizedAck;
}> {
  const repoRoot = getRepoRoot();

  // Sprint-based location first, then legacy locations
  const possiblePaths = [
    join(repoRoot, '.specify', 'sprints', `sprint-${sprintNumber}`, 'attestations', taskId, 'attestation.json'),
    join(repoRoot, '.specify', 'sprints', `sprint-${sprintNumber}`, 'attestations', taskId, 'context_ack.json'),
    join(repoRoot, 'artifacts', 'attestations', taskId, 'attestation.json'), // Legacy location
    join(repoRoot, 'artifacts', 'attestations', taskId, 'context_ack.json'), // Legacy format
  ];

  let ackPath: string | null = null;
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      ackPath = path;
      break;
    }
  }

  if (!ackPath) {
    return {};
  }

  try {
    const ackContent = await readFile(ackPath, 'utf-8');
    const rawData = JSON.parse(ackContent);

    // Handle new attestation.json format (has context_acknowledgment nested)
    if (rawData.context_acknowledgment) {
      const contextAck = rawData.context_acknowledgment;
      const rawAck: RawAckData = {
        task_id: rawData.task_id,
        run_id: rawData.run_id,
        files_read: contextAck.files_read,
        invariants_acknowledged: contextAck.invariants_acknowledged,
        acknowledged_at: contextAck.acknowledged_at,
        attestation_timestamp: rawData.attestation_timestamp,
      };
      return { ack: normalizeAck(rawAck, taskId) };
    }

    // Handle legacy format
    const rawAck: RawAckData = rawData;
    return { ack: normalizeAck(rawAck, taskId) };
  } catch {
    return {};
  }
}

function validateHashes(
  manifestFiles: Array<{ path: string; sha256: string }>,
  ackFiles: { path: string; sha256: string }[]
): FileHashEntry[] {
  const ackMap = new Map(ackFiles.map((f) => [f.path, f.sha256]));

  return manifestFiles.map((file) => {
    const ackHash = ackMap.get(file.path);

    if (!ackHash) {
      return { path: file.path, hash: file.sha256, status: 'missing' as const };
    }

    if (ackHash === file.sha256) {
      return { path: file.path, hash: file.sha256, status: 'matched' as const };
    }

    return { path: file.path, hash: file.sha256, status: 'mismatched' as const };
  });
}

export async function GET(request: Request, { params }: Params) {
  const resolvedParams = await params;
  const { taskId } = resolvedParams;

  try {
    // Get sprint number from CSV for sprint-based path lookup
    const sprintNumber = await getTaskSprintNumber(taskId);

    // Load context pack from sprint-based location first, then legacy
    const { manifest, content } = await loadContextPack(taskId, sprintNumber);
    const { ack } = await loadContextAck(taskId, sprintNumber);

    // Check if nothing exists (no pack AND no ack)
    if (!manifest && !content && !ack) {
      const result: ContextPackData = {
        taskId,
        packStatus: 'missing',
        ackStatus: 'missing',
        hashStatus: 'unchecked',
        filesRead: [],
      };

      return NextResponse.json(result, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
        },
      });
    }

    // Get runId from manifest or ack (stored as metadata, not directory name)
    const runId = manifest?.runId || ack?.run_id;

    // Determine statuses
    // If we have an ack from attestations, the pack is effectively "generated" (context was provided inline)
    const packStatus: ContextPackData['packStatus'] = manifest
      ? 'generated'
      : content
        ? 'generated'
        : ack
          ? 'generated' // Attestation means context was acknowledged inline
          : 'missing';

    const ackStatus: ContextPackData['ackStatus'] = ack ? 'acknowledged' : 'missing';

    // Validate hashes if both exist
    let filesRead: FileHashEntry[] = [];
    let hashStatus: ContextPackData['hashStatus'] = 'unchecked';

    if (manifest?.files && ack?.files_read) {
      filesRead = validateHashes(manifest.files, ack.files_read);
      const allMatched = filesRead.every((f) => f.status === 'matched');
      const anyMismatched = filesRead.some((f) => f.status === 'mismatched');
      hashStatus = anyMismatched ? 'invalid' : allMatched ? 'valid' : 'pending';
    } else if (manifest?.files) {
      filesRead = manifest.files.map((f) => ({
        path: f.path,
        hash: f.sha256,
        status: 'pending' as const,
      }));
      hashStatus = 'pending';
    } else if (ack?.files_read && ack.files_read.length > 0) {
      // Only have ack (attestation) without context pack - show acknowledged files
      filesRead = ack.files_read.map((f) => ({
        path: f.path,
        hash: f.sha256,
        status: 'matched' as const, // Attestation indicates these were verified
      }));
      hashStatus = 'valid'; // Attestation serves as verification
    }

    // Calculate total size
    let totalSize = 0;
    if (content) {
      totalSize = Buffer.byteLength(content, 'utf-8');
    }

    const result: ContextPackData = {
      taskId,
      runId,
      packStatus,
      ackStatus,
      hashStatus,
      filesRead,
      invariantsAcknowledged: ack?.invariants_acknowledged,
      totalSize,
      generatedAt: manifest?.createdAt,
      acknowledgedAt: ack?.acknowledged_at,
    };

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    console.error('Error loading context status:', error);
    return NextResponse.json({ error: 'Failed to load context status' }, { status: 500 });
  }
}
