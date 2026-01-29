import { NextResponse } from 'next/server';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * GET /api/matop/sprint-runs
 *
 * Returns list of MATOP sprint run reports.
 * Query params:
 *   - sprint: Filter by sprint number (optional)
 *   - limit: Max results (default: 20)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sprintFilter = searchParams.get('sprint');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const repoRoot = process.cwd();
    const runsDir = join(repoRoot, 'artifacts', 'reports', 'sprint-runs');

    if (!existsSync(runsDir)) {
      return NextResponse.json({
        runsDir,
        runs: [],
        message: 'No sprint runs found',
      });
    }

    // Get all JSON files
    const files = readdirSync(runsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const filePath = join(runsDir, f);
        const stat = statSync(filePath);
        return {
          filename: f,
          path: filePath,
          mtime: stat.mtime,
        };
      })
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // Filter by sprint if specified
    const filtered = sprintFilter
      ? files.filter((f) => f.filename.startsWith(`sprint-${sprintFilter}-`))
      : files;

    // Limit results
    const limited = filtered.slice(0, limit);

    // Load report data
    const runs = limited.map((f) => {
      try {
        const content = JSON.parse(readFileSync(f.path, 'utf-8'));
        return {
          runId: content.runId || f.filename.replace('.json', ''),
          sprint: content.sprint,
          timestamp: content.timestamp,
          totalTasks: content.totalTasks,
          results: content.results,
          duration: content.duration,
          passRate:
            content.totalTasks > 0 ? ((content.results?.pass || 0) / content.totalTasks) * 100 : 0,
          mdPath: f.path.replace('.json', '.md'),
        };
      } catch {
        return {
          runId: f.filename.replace('.json', ''),
          error: 'Failed to parse report',
        };
      }
    });

    return NextResponse.json({
      runsDir,
      total: filtered.length,
      returned: runs.length,
      runs,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
