import { NextResponse } from 'next/server';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { generateCurrentStateReport } from '@/lib/current-state-report';
import { generateContextSnapshot } from '@/lib/context-snapshot';

/**
 * GET  /api/context  →  return current snapshot as JSON (no write)
 * POST /api/context  →  regenerate snapshot AND write docs/SESSION_CONTEXT.md
 *
 * Mirrors the `/api/sync-metrics` route shape: force-dynamic, same 500 error
 * payload structure (`error` + `details`).
 *
 * NOTE: `/api/context/[taskId]` is a separate feature (attestation context pack
 * viewer) — not modified here. That dynamic route coexists with this one under
 * the Next.js App Router.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function resolveSnapshotPaths() {
  // When Next runs, process.cwd() === apps/project-tracker
  const projectTrackerRoot = process.cwd();
  const monorepoRoot = join(projectTrackerRoot, '..', '..');
  const metricsDir = join(projectTrackerRoot, 'docs', 'metrics');
  const specifySprintsDir = join(monorepoRoot, '.specify', 'sprints');
  const outputPath = join(monorepoRoot, 'docs', 'SESSION_CONTEXT.md');
  const stateReportMdPath = join(monorepoRoot, 'docs', 'CURRENT_STATE_REPORT.md');
  const stateReportJsonPath = join(
    monorepoRoot,
    'artifacts',
    'reports',
    'current-state-report.json'
  );
  return {
    monorepoRoot,
    metricsDir,
    specifySprintsDir,
    outputPath,
    stateReportMdPath,
    stateReportJsonPath,
  };
}

export async function GET() {
  try {
    const { monorepoRoot, metricsDir } = resolveSnapshotPaths();
    const result = generateContextSnapshot(metricsDir, monorepoRoot);

    return NextResponse.json({
      success: true,
      markdown: result.markdown,
      generatedAt: result.generatedAt,
      sourceFiles: result.sourceFiles,
      written: false,
    });
  } catch (error) {
    console.error('Error generating context snapshot:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate context snapshot',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const {
      monorepoRoot,
      metricsDir,
      specifySprintsDir,
      outputPath,
      stateReportMdPath,
      stateReportJsonPath,
    } = resolveSnapshotPaths();

    // Step 1: Regenerate current-state-report so PROJECT_HEALTH section is fresh
    if (existsSync(specifySprintsDir)) {
      for (const p of [stateReportMdPath, stateReportJsonPath]) {
        const d = dirname(p);
        if (!existsSync(d)) mkdirSync(d, { recursive: true });
      }
      const stateReport = generateCurrentStateReport(metricsDir, specifySprintsDir, monorepoRoot);
      writeFileSync(stateReportMdPath, stateReport.markdown, 'utf-8');
      writeFileSync(stateReportJsonPath, `${JSON.stringify(stateReport.data, null, 2)}\n`, 'utf-8');
    }

    // Step 2: Generate SESSION_CONTEXT (reads fresh state-report JSON)
    const result = generateContextSnapshot(metricsDir, monorepoRoot);

    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    writeFileSync(outputPath, result.markdown, 'utf-8');

    console.log(`Wrote session context snapshot: ${outputPath} (${result.markdown.length} bytes)`);

    return NextResponse.json({
      success: true,
      written: true,
      path: outputPath,
      bytes: result.markdown.length,
      generatedAt: result.generatedAt,
      sourceFiles: result.sourceFiles,
    });
  } catch (error) {
    console.error('Error writing context snapshot:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to write context snapshot',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
