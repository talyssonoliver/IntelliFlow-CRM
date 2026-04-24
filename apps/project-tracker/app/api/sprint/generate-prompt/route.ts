import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve, sep, basename } from 'node:path';
import Papa from 'papaparse';
import { calculatePhases } from '../../../../lib/phase-calculator';
import { generateSprintPrompt, generateSprintPromptData } from '../../../../lib/prompt-generator';
import type { CSVTask } from '../../../../../../tools/scripts/lib/sprint/types';

/**
 * Taint-breaking output-path sanitizer.
 * Applies `path.basename` to strip any traversal, then restricts to a
 * safe filename alphabet so CodeQL's taint chain ends at this scalar.
 * Returns null if the result would be empty.
 */
function buildSafeOutputFilename(rawPath: string): string | null {
  const safe = basename(rawPath).replaceAll(/[^A-Za-z0-9._\- ]/g, '');
  return safe.length === 0 ? null : safe;
}

/**
 * Resolve a write target under `<projectRoot>/artifacts/`. Containment-checks
 * the result against `artifactsRoot` so caller can't escape via a crafted
 * outputPath. Returns an error response or the safe absolute path.
 */
function resolveArtifactPath(
  projectRoot: string,
  outputPath: string | undefined,
  defaultFilename: string | null
): { fullPath: string } | { errorResponse: Response } {
  const safeFilename = outputPath ? buildSafeOutputFilename(outputPath) : defaultFilename;
  if (!safeFilename) {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: 'Invalid output filename' },
        { status: 400 }
      ),
    };
  }
  const fullPath = join(projectRoot, 'artifacts', safeFilename);
  const artifactsRoot = resolve(projectRoot, 'artifacts');
  const resolvedFull = resolve(fullPath);
  if (resolvedFull !== artifactsRoot && !resolvedFull.startsWith(artifactsRoot + sep)) {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: 'Refusing to write outside artifacts root' },
        { status: 400 }
      ),
    };
  }
  return { fullPath };
}

async function writeArtifact(fullPath: string, content: string): Promise<void> {
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf-8');
}

export const dynamic = 'force-dynamic';

interface GeneratePromptRequest {
  sprintNumber: number;
  format?: 'markdown' | 'json';
  outputPath?: string;
  theme?: string;
}

interface DependencyGraph {
  nodes: Record<
    string,
    {
      task_id: string;
      sprint: number;
      status: string;
      dependencies: string[];
      dependents: string[];
    }
  >;
  ready_to_start: string[];
  blocked_tasks: string[];
}

interface PromptContext {
  sprintNumber: number;
  tasks: CSVTask[];
  phases: ReturnType<typeof calculatePhases>['phases'];
  parallelStreams: ReturnType<typeof calculatePhases>['parallelStreams'];
  outputPath: string | undefined;
  theme: string | undefined;
  projectRoot: string;
}

async function handleJsonFormat(ctx: PromptContext): Promise<Response> {
  const promptData = generateSprintPromptData({
    sprintNumber: ctx.sprintNumber,
    tasks: ctx.tasks,
    phases: ctx.phases,
    parallelStreams: ctx.parallelStreams,
    projectName: 'IntelliFlow CRM',
    theme: ctx.theme,
  });
  const output = JSON.stringify(promptData, null, 2);

  let savedTo: string | undefined;
  if (ctx.outputPath) {
    const resolved = resolveArtifactPath(ctx.projectRoot, ctx.outputPath, null);
    if ('errorResponse' in resolved) return resolved.errorResponse;
    await writeArtifact(resolved.fullPath, output);
    savedTo = resolved.fullPath;
  }

  return NextResponse.json({
    success: true,
    format: 'json',
    sprintNumber: ctx.sprintNumber,
    data: promptData,
    savedTo,
  });
}

async function handleMarkdownFormat(ctx: PromptContext): Promise<Response> {
  const output = generateSprintPrompt({
    sprintNumber: ctx.sprintNumber,
    tasks: ctx.tasks,
    phases: ctx.phases,
    parallelStreams: ctx.parallelStreams,
    projectName: 'IntelliFlow CRM',
    theme: ctx.theme,
  });

  const defaultFilename = `Sprint${ctx.sprintNumber}_prompt.md`;
  const resolved = resolveArtifactPath(ctx.projectRoot, ctx.outputPath, defaultFilename);
  if ('errorResponse' in resolved) return resolved.errorResponse;

  await writeArtifact(resolved.fullPath, output);

  return NextResponse.json({
    success: true,
    format: 'markdown',
    sprintNumber: ctx.sprintNumber,
    markdown: output,
    savedTo: resolved.fullPath,
    summary: {
      totalPhases: ctx.phases.length,
      totalTasks: ctx.phases.reduce((sum, p) => sum + p.tasks.length, 0),
      parallelStreams: ctx.parallelStreams.length,
      sequentialPhases: ctx.phases.filter((p) => p.executionType === 'sequential').length,
      parallelPhases: ctx.phases.filter((p) => p.executionType === 'parallel').length,
    },
  });
}

/**
 * POST /api/sprint/generate-prompt
 * Generate sprint prompt markdown from dependency graph
 */
export async function POST(request: Request) {
  try {
    const body: GeneratePromptRequest = await request.json();
    const { sprintNumber, format = 'markdown', outputPath, theme } = body;

    if (sprintNumber === undefined || sprintNumber === null) {
      return NextResponse.json({ error: 'sprintNumber is required' }, { status: 400 });
    }

    const metricsDir = join(process.cwd(), 'docs', 'metrics');
    const projectRoot = join(process.cwd(), '..', '..');
    const csvPath = join(metricsDir, '_global', 'Sprint_plan.csv');
    const graphPath = join(metricsDir, '_global', 'dependency-graph.json');

    if (!existsSync(csvPath)) {
      return NextResponse.json({ error: 'Sprint_plan.csv not found' }, { status: 404 });
    }
    if (!existsSync(graphPath)) {
      return NextResponse.json(
        { error: 'dependency-graph.json not found. Run sync first.' },
        { status: 404 }
      );
    }

    const csvContent = await readFile(csvPath, 'utf-8');
    const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    const tasks = data as CSVTask[];

    const graphContent = await readFile(graphPath, 'utf-8');
    const dependencyGraph: DependencyGraph = JSON.parse(graphContent);

    const { phases, parallelStreams } = calculatePhases(dependencyGraph, tasks, sprintNumber);

    const ctx: PromptContext = {
      sprintNumber,
      tasks,
      phases,
      parallelStreams,
      outputPath,
      theme,
      projectRoot,
    };

    return format === 'json' ? handleJsonFormat(ctx) : handleMarkdownFormat(ctx);
  } catch (error) {
    console.error('Error generating sprint prompt:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate sprint prompt',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sprint/generate-prompt
 * Get info about prompt generation
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/sprint/generate-prompt',
    method: 'POST',
    description: 'Generate sprint prompt markdown from dependency graph',
    parameters: {
      sprintNumber: {
        type: 'number',
        required: true,
        description: 'The sprint number to generate prompt for',
      },
      format: {
        type: 'string',
        enum: ['markdown', 'json'],
        default: 'markdown',
        description: 'Output format',
      },
      outputPath: {
        type: 'string',
        required: false,
        description: 'Optional output path (relative to project root or artifacts)',
      },
      theme: {
        type: 'string',
        required: false,
        description: 'Optional sprint theme override',
      },
    },
    example: {
      request: {
        sprintNumber: 1,
        format: 'markdown',
      },
      response: {
        success: true,
        format: 'markdown',
        sprintNumber: 1,
        markdown: '# Sprint 1 Sub-Agent Orchestration Prompt...',
        savedTo: '/path/to/Sprint1_prompt.md',
      },
    },
  });
}
