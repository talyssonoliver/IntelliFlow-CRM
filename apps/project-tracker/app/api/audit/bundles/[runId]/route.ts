import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat, access } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

function getRepoRootDir(): string {
  return path.join(process.cwd(), '..', '..');
}

function isSafeRunId(runId: string): boolean {
  // Prevent path traversal; audit run ids are directory names.
  return /^[A-Za-z0-9._-]+$/.test(runId);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

type BundleLocation = {
  runDir: string;
  summaryJsonPath: string;
  summaryMdPath: string;
  type: 'system' | 'sprint';
};

async function findBundleLocation(repoRoot: string, runId: string): Promise<BundleLocation | null> {
  // Check system-audit first
  const systemDir = path.join(repoRoot, 'artifacts', 'reports', 'system-audit', runId);
  const systemSummary = path.join(systemDir, 'summary.json');
  if (await exists(systemSummary)) {
    return {
      runDir: systemDir,
      summaryJsonPath: systemSummary,
      summaryMdPath: path.join(systemDir, 'summary.md'),
      type: 'system',
    };
  }

  // Check sprint-audit
  const sprintDir = path.join(repoRoot, 'artifacts', 'reports', 'sprint-audit', runId);
  const sprintSummary = path.join(sprintDir, 'audit.json');
  if (await exists(sprintSummary)) {
    return {
      runDir: sprintDir,
      summaryJsonPath: sprintSummary,
      summaryMdPath: path.join(sprintDir, 'audit.md'),
      type: 'sprint',
    };
  }

  return null;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  if (!runId || !isSafeRunId(runId)) {
    return NextResponse.json({ error: 'Invalid runId' }, { status: 400 });
  }

  const repoRoot = getRepoRootDir();
  const location = await findBundleLocation(repoRoot, runId);

  if (!location) {
    return NextResponse.json(
      {
        runId,
        error: 'Bundle not found in system-audit or sprint-audit directories',
      },
      { status: 404 }
    );
  }

  try {
    const [summaryJsonRaw, summaryMdRaw, summaryStat] = await Promise.all([
      readFile(location.summaryJsonPath, 'utf-8'),
      readFile(location.summaryMdPath, 'utf-8').catch(() => ''),
      stat(location.summaryJsonPath),
    ]);

    return NextResponse.json({
      runId,
      type: location.type,
      runDir: path.relative(repoRoot, location.runDir).replaceAll('\\', '/'),
      updatedAt: summaryStat.mtime.toISOString(),
      summary: JSON.parse(summaryJsonRaw),
      summaryMd: summaryMdRaw,
    });
  } catch (error) {
    return NextResponse.json(
      {
        runId,
        type: location.type,
        runDir: path.relative(repoRoot, location.runDir).replaceAll('\\', '/'),
        error: String(error),
      },
      { status: 500 }
    );
  }
}
