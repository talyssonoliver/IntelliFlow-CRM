/**
 * Orphan Artifacts API
 *
 * GET /api/artifacts/orphans - List artifacts not linked to any task
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import {
  scanArtifactRegistry,
  ArtifactEntry,
  ArtifactCategory,
} from '@/lib/artifact-registry';
import { PATHS } from '@/lib/paths';

interface OrphanSummary {
  total: number;
  byCategory: Record<ArtifactCategory, number>;
  byExtension: Record<string, number>;
  totalSize: number;
}

/**
 * Load tasks from Sprint_plan.csv
 */
function loadTasks(): Array<{
  id: string;
  artifacts: string[];
  prerequisites: string;
  validation: string;
  status: string;
  section: string;
}> {
  const csvPath = PATHS.sprintTracking.SPRINT_PLAN_CSV;

  if (!existsSync(csvPath)) {
    return [];
  }

  try {
    const content = readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    if (lines.length < 2) return [];

    const header = parseCSVLine(lines[0]);
    const colIndex: Record<string, number> = {};
    header.forEach((col, i) => {
      colIndex[col.trim()] = i;
    });

    const tasks: Array<{
      id: string;
      artifacts: string[];
      prerequisites: string;
      validation: string;
      status: string;
      section: string;
    }> = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const taskId = cols[colIndex['Task ID']]?.trim();

      if (!taskId) continue;

      const artifactsField = cols[colIndex['Artifacts To Track']]?.trim() || '';
      const artifacts = artifactsField
        ? artifactsField.split(/[,;\n]/).map((a) => a.trim()).filter(Boolean)
        : [];

      tasks.push({
        id: taskId,
        artifacts,
        prerequisites: cols[colIndex['Pre-requisites']]?.trim() || '',
        validation: cols[colIndex['Validation Method']]?.trim() || '',
        status: cols[colIndex['Status']]?.trim() || '',
        section: cols[colIndex['Section']]?.trim() || '',
      });
    }

    return tasks;
  } catch (error) {
    console.error('Failed to load Sprint_plan.csv:', error);
    return [];
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);

    const tasks = loadTasks();
    const registry = scanArtifactRegistry(tasks);

    // Get orphan artifacts only
    let orphans = registry.artifacts.filter((a) => a.isOrphan);

    // Filter by category if specified
    if (category) {
      orphans = orphans.filter((a) => a.category === category);
    }

    // Sort by last modified (most recent first)
    orphans.sort((a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    );

    // Generate orphan summary
    const summary: OrphanSummary = {
      total: orphans.length,
      byCategory: {} as Record<ArtifactCategory, number>,
      byExtension: {},
      totalSize: 0,
    };

    for (const orphan of orphans) {
      summary.byCategory[orphan.category] =
        (summary.byCategory[orphan.category] || 0) + 1;
      summary.byExtension[orphan.extension] =
        (summary.byExtension[orphan.extension] || 0) + 1;
      summary.totalSize += orphan.size;
    }

    // Paginate
    const total = orphans.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedOrphans = orphans.slice(startIndex, endIndex);

    return NextResponse.json({
      orphans: paginatedOrphans,
      summary,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('Orphan artifacts error:', error);
    return NextResponse.json(
      { error: 'Failed to get orphan artifacts', details: String(error) },
      { status: 500 }
    );
  }
}
