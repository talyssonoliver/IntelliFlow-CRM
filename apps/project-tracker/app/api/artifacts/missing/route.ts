/**
 * Missing Artifacts API
 *
 * GET /api/artifacts/missing - List expected artifacts that don't exist
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import {
  scanArtifactRegistry,
  MissingArtifact,
} from '@/lib/artifact-registry';
import { PATHS } from '@/lib/paths';

interface MissingSummary {
  total: number;
  byPrefix: {
    ARTIFACT: number;
    EVIDENCE: number;
  };
  affectedTasks: string[];
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
    const taskId = searchParams.get('taskId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);

    const tasks = loadTasks();
    const registry = scanArtifactRegistry(tasks);

    // Get missing artifacts
    let missing = registry.missing;

    // Filter by task if specified
    if (taskId) {
      missing = missing.filter((m) => m.expectedBy.includes(taskId));
    }

    // Generate summary
    const affectedTasksSet = new Set<string>();
    let artifactCount = 0;
    let evidenceCount = 0;

    for (const m of missing) {
      m.expectedBy.forEach((t) => affectedTasksSet.add(t));
      if (m.prefix === 'ARTIFACT') {
        artifactCount++;
      } else {
        evidenceCount++;
      }
    }

    const summary: MissingSummary = {
      total: missing.length,
      byPrefix: {
        ARTIFACT: artifactCount,
        EVIDENCE: evidenceCount,
      },
      affectedTasks: Array.from(affectedTasksSet),
    };

    // Paginate
    const total = missing.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedMissing = missing.slice(startIndex, endIndex);

    return NextResponse.json({
      missing: paginatedMissing,
      summary,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('Missing artifacts error:', error);
    return NextResponse.json(
      { error: 'Failed to get missing artifacts', details: String(error) },
      { status: 500 }
    );
  }
}
