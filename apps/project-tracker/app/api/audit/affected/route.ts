import { NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

function getRepoRootDir(): string {
  return path.join(process.cwd(), '..', '..');
}

export async function GET() {
  const repoRoot = getRepoRootDir();
  const reportDir = path.join(repoRoot, 'artifacts', 'reports', 'affected');
  const jsonPath = path.join(reportDir, 'affected-packages.json');
  const mdPath = path.join(reportDir, 'affected-summary.md');

  try {
    const [jsonRaw, mdRaw, jsonStat] = await Promise.all([
      readFile(jsonPath, 'utf-8'),
      readFile(mdPath, 'utf-8').catch(() => ''),
      stat(jsonPath),
    ]);
    return NextResponse.json({
      reportDir: path.relative(repoRoot, reportDir).replaceAll('\\', '/'),
      updatedAt: jsonStat.mtime.toISOString(),
      affected: JSON.parse(jsonRaw),
      summaryMd: mdRaw,
    });
  } catch (error) {
    return NextResponse.json(
      {
        reportDir: path.relative(repoRoot, reportDir).replaceAll('\\', '/'),
        affected: null,
        summaryMd: null,
        error: String(error),
      },
      { status: 404 }
    );
  }
}
