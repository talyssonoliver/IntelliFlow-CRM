/**
 * Full Codebase Registry API
 *
 * GET /api/artifacts - List all project files with metadata
 * POST /api/artifacts - Force rescan of all files
 *
 * Query params:
 * - scope: 'all' | 'artifacts' (default: 'all')
 * - directory: filter by directory type
 * - category: filter by category
 * - orphans: 'true' to show only orphans
 * - linked: 'true' to show only linked files
 * - page, pageSize: pagination
 * - refresh: 'true' to force cache refresh
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import {
  scanFullRegistry,
  scanArtifactRegistry,
  FileEntry,
  CodebaseHealth,
  MissingFile,
  CleanupSuggestion,
  DirectoryType,
  FileCategory,
} from '@/lib/artifact-registry';
import { PATHS } from '@/lib/paths';

interface FullRegistryResponse {
  files: FileEntry[];
  health: CodebaseHealth;
  missing: MissingFile[];
  cleanup: CleanupSuggestion[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// Cache the registry result for performance
let cachedFullResult: ReturnType<typeof scanFullRegistry> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60000; // 1 minute (increased due to full scan)

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
    console.warn('Sprint_plan.csv not found at:', csvPath);
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

/**
 * Get full registry with caching
 */
function getFullRegistry(forceRefresh: boolean = false) {
  const now = Date.now();

  if (!forceRefresh && cachedFullResult && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedFullResult;
  }

  const tasks = loadTasks();
  const result = scanFullRegistry(tasks);

  cachedFullResult = result;
  cacheTimestamp = now;

  return result;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') || 'all';
    const directory = searchParams.get('directory') as DirectoryType | null;
    const category = searchParams.get('category') as FileCategory | null;
    const orphansOnly = searchParams.get('orphans') === 'true';
    const linkedOnly = searchParams.get('linked') === 'true';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '100', 10);
    const forceRefresh = searchParams.get('refresh') === 'true';

    const registry = getFullRegistry(forceRefresh);

    // Start with all files or just artifacts
    let filteredFiles = scope === 'artifacts'
      ? registry.files.filter(f => f.directory === 'artifacts')
      : registry.files;

    // Apply filters
    if (directory) {
      filteredFiles = filteredFiles.filter((f) => f.directory === directory);
    }

    if (category) {
      filteredFiles = filteredFiles.filter((f) => f.category === category);
    }

    if (orphansOnly) {
      filteredFiles = filteredFiles.filter((f) => f.isOrphan);
    }

    if (linkedOnly) {
      filteredFiles = filteredFiles.filter((f) => !f.isOrphan);
    }

    // Paginate
    const total = filteredFiles.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedFiles = filteredFiles.slice(startIndex, endIndex);

    const response: FullRegistryResponse = {
      files: paginatedFiles,
      health: registry.health,
      missing: registry.missing,
      cleanup: registry.cleanup.slice(0, 50), // Limit cleanup suggestions
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Registry scan error:', error);
    return NextResponse.json(
      { error: 'Failed to scan files', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    // Force refresh cache
    const registry = getFullRegistry(true);

    return NextResponse.json({
      message: 'Full registry refreshed',
      health: registry.health,
      cleanupCount: registry.cleanup.length,
    });
  } catch (error) {
    console.error('Registry refresh error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh registry', details: String(error) },
      { status: 500 }
    );
  }
}
