/**
 * Code Analysis API
 *
 * GET /api/code-analysis - Get cached analysis results
 * POST /api/code-analysis - Run analysis tools (Knip, Depcheck, etc.)
 *
 * Query params:
 * - tool: 'knip' | 'depcheck' | 'all' (default: 'all')
 */

import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { MONOREPO_ROOT, PATHS } from '../../../lib/paths';

const PROJECT_ROOT = MONOREPO_ROOT;
const CACHE_DIR = join(PATHS.artifacts.reports, 'code-analysis');
const CACHE_FILE = join(CACHE_DIR, 'latest.json');

interface KnipResult {
  files: string[];
  dependencies: string[];
  devDependencies: string[];
  unlisted: string[];
  exports: Array<{ file: string; exports: string[] }>;
  types: Array<{ file: string; types: string[] }>;
  duplicates: string[];
}

interface DepcheckResult {
  dependencies: string[];
  devDependencies: string[];
  missing: Record<string, string[]>;
}

interface AnalysisResult {
  timestamp: string;
  knip?: {
    success: boolean;
    data?: KnipResult;
    error?: string;
    summary?: {
      unusedFiles: number;
      unusedDeps: number;
      unusedExports: number;
      unusedTypes: number;
    };
  };
  depcheck?: {
    success: boolean;
    data?: DepcheckResult;
    error?: string;
    summary?: {
      unusedDeps: number;
      unusedDevDeps: number;
      missingDeps: number;
    };
  };
}

/**
 * Parse Knip output (JSON format)
 *
 * Knip's JSON format:
 * {
 *   "files": ["unused/file.ts", ...],
 *   "issues": [
 *     {
 *       "file": "path/to/file.ts",
 *       "exports": [{ "name": "exportName", "line": 10 }],
 *       "types": [{ "name": "TypeName", "line": 20 }],
 *       "dependencies": [{ "name": "dep" }],
 *       "devDependencies": [{ "name": "devDep" }]
 *     }
 *   ]
 * }
 */
function collectUniqueNames(items: any[] | undefined, bag: string[]): void {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (item.name && !bag.includes(item.name)) bag.push(item.name);
  }
}

function parseKnipIssues(
  issues: any[]
): Pick<KnipResult, 'dependencies' | 'devDependencies' | 'unlisted' | 'exports' | 'types'> {
  const dependencies: string[] = [];
  const devDependencies: string[] = [];
  const unlisted: string[] = [];
  const exports: Array<{ file: string; exports: string[] }> = [];
  const types: Array<{ file: string; types: string[] }> = [];

  for (const issue of issues) {
    collectUniqueNames(issue.dependencies, dependencies);
    collectUniqueNames(issue.devDependencies, devDependencies);
    collectUniqueNames(issue.unlisted, unlisted);

    if (Array.isArray(issue.exports) && issue.exports.length > 0) {
      exports.push({ file: issue.file, exports: issue.exports.map((e: any) => e.name) });
    }
    if (Array.isArray(issue.types) && issue.types.length > 0) {
      types.push({ file: issue.file, types: issue.types.map((t: any) => t.name) });
    }
  }

  return { dependencies, devDependencies, unlisted, exports, types };
}

function parseKnipOutput(output: string): KnipResult {
  const empty: KnipResult = {
    files: [],
    dependencies: [],
    devDependencies: [],
    unlisted: [],
    exports: [],
    types: [],
    duplicates: [],
  };

  try {
    const parsed = JSON.parse(output);
    const issues = Array.isArray(parsed.issues) ? parseKnipIssues(parsed.issues) : {};
    return {
      files: parsed.files || [],
      duplicates: parsed.duplicates || [],
      dependencies: [],
      devDependencies: [],
      unlisted: [],
      exports: [],
      types: [],
      ...issues,
    };
  } catch (err) {
    console.error('Failed to parse Knip JSON output:', err);
    return empty;
  }
}

/**
 * Parse Depcheck output (JSON format)
 */
function parseDepcheckOutput(output: string): DepcheckResult {
  try {
    const parsed = JSON.parse(output);
    return {
      dependencies: parsed.dependencies || [],
      devDependencies: parsed.devDependencies || [],
      missing: parsed.missing || {},
    };
  } catch {
    return { dependencies: [], devDependencies: [], missing: {} };
  }
}

/**
 * Run Knip analysis
 */
function runKnip(): AnalysisResult['knip'] {
  try {
    // Run knip with JSON reporter for structured output
    // Knip exits with non-zero when issues are found, so we need to handle that
    let output = '';
    try {
      output = execSync('npx knip --reporter json --exclude unlisted,unresolved --no-gitignore', {
        // NOSONAR — PATH inherited from dev environment, internal tooling only
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        timeout: 120000, // 2 minutes
        maxBuffer: 50 * 1024 * 1024, // 50MB
      });
    } catch (execError: any) {
      // Knip returns non-zero exit code when it finds issues
      // The output is still in stdout
      if (execError.stdout) {
        output = execError.stdout.toString();
      } else if (execError.message) {
        return { success: false, error: execError.message };
      }
    }

    if (!output.trim()) {
      return {
        success: true,
        data: {
          files: [],
          dependencies: [],
          devDependencies: [],
          unlisted: [],
          exports: [],
          types: [],
          duplicates: [],
        },
        summary: { unusedFiles: 0, unusedDeps: 0, unusedExports: 0, unusedTypes: 0 },
      };
    }

    const data = parseKnipOutput(output);

    return {
      success: true,
      data,
      summary: {
        unusedFiles: data.files.length,
        unusedDeps: data.dependencies.length + data.devDependencies.length,
        unusedExports: data.exports.reduce((sum, e) => sum + e.exports.length, 0),
        unusedTypes: data.types.reduce((sum, t) => sum + t.types.length, 0),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Run Depcheck analysis
 */
function runDepcheck(): AnalysisResult['depcheck'] {
  try {
    // Depcheck also exits with non-zero when it finds issues
    let output = '';
    try {
      output = execSync(
        'npx depcheck --json --ignores="@types/*,eslint-*,prettier,husky,lint-staged,turbo"', // NOSONAR S4036 — PATH inherited from developer environment, internal tooling only
        {
          cwd: PROJECT_ROOT,
          encoding: 'utf-8',
          timeout: 60000, // 1 minute
          maxBuffer: 10 * 1024 * 1024, // 10MB
        }
      );
    } catch (execError: any) {
      // Depcheck returns non-zero exit code when it finds issues
      if (execError.stdout) {
        output = execError.stdout.toString();
      } else if (execError.message) {
        return { success: false, error: execError.message };
      }
    }

    if (!output.trim()) {
      return {
        success: true,
        data: { dependencies: [], devDependencies: [], missing: {} },
        summary: { unusedDeps: 0, unusedDevDeps: 0, missingDeps: 0 },
      };
    }

    const data = parseDepcheckOutput(output);

    return {
      success: true,
      data,
      summary: {
        unusedDeps: data.dependencies.length,
        unusedDevDeps: data.devDependencies.length,
        missingDeps: Object.keys(data.missing).length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Load cached results
 */
function loadCache(): AnalysisResult | null {
  if (!existsSync(CACHE_FILE)) return null;

  try {
    const content = readFileSync(CACHE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Save results to cache
 */
function saveCache(result: AnalysisResult): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(result, null, 2));
}

export async function GET() {
  const cached = loadCache();

  if (cached) {
    return NextResponse.json({
      source: 'cache',
      ...cached,
    });
  }

  return NextResponse.json({
    source: 'none',
    message: 'No cached analysis. Run POST /api/code-analysis to generate.',
  });
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tool = searchParams.get('tool') || 'all';

    const result: AnalysisResult = {
      timestamp: new Date().toISOString(),
    };

    if (tool === 'knip' || tool === 'all') {
      result.knip = runKnip();
    }

    if (tool === 'depcheck' || tool === 'all') {
      result.depcheck = runDepcheck();
    }

    // Cache the result
    saveCache(result);

    return NextResponse.json({
      source: 'fresh',
      ...result,
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to run analysis', details: String(error) },
      { status: 500 }
    );
  }
}
