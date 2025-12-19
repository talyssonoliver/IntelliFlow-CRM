import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
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

export async function GET(_request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  if (!runId || !isSafeRunId(runId)) {
    return NextResponse.json({ error: 'Invalid runId' }, { status: 400 });
  }

  const repoRoot = getRepoRootDir();
  const runDir = path.join(repoRoot, 'artifacts', 'reports', 'system-audit', runId);
  const summaryJsonPath = path.join(runDir, 'summary.json');
  const summaryMdPath = path.join(runDir, 'summary.md');

  try {
    const [summaryJsonRaw, summaryMdRaw, summaryStat] = await Promise.all([
      readFile(summaryJsonPath, 'utf-8'),
      readFile(summaryMdPath, 'utf-8'),
      stat(summaryJsonPath),
    ]);

    return NextResponse.json({
      runId,
      runDir: path.relative(repoRoot, runDir).replaceAll('\\', '/'),
      updatedAt: summaryStat.mtime.toISOString(),
      summary: JSON.parse(summaryJsonRaw),
      summaryMd: summaryMdRaw,
    });
  } catch (error) {
    return NextResponse.json(
      {
        runId,
        runDir: path.relative(repoRoot, runDir).replaceAll('\\', '/'),
        error: String(error),
      },
      { status: 404 }
    );
  }
}
