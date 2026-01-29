import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import Papa from 'papaparse';
import { calculatePhases } from '../../../../lib/phase-calculator';
import { generateSprintPrompt, generateSprintPromptData } from '../../../../lib/prompt-generator';
import type { CSVTask } from '../../../../../../tools/scripts/lib/sprint/types';

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

    // Check required files exist
    if (!existsSync(csvPath)) {
      return NextResponse.json({ error: 'Sprint_plan.csv not found' }, { status: 404 });
    }

    if (!existsSync(graphPath)) {
      return NextResponse.json(
        { error: 'dependency-graph.json not found. Run sync first.' },
        { status: 404 }
      );
    }

    // Load CSV
    const csvContent = await readFile(csvPath, 'utf-8');
    const { data } = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
    });
    const tasks = data as CSVTask[];

    // Load dependency graph
    const graphContent = await readFile(graphPath, 'utf-8');
    const dependencyGraph: DependencyGraph = JSON.parse(graphContent);

    // Calculate phases
    const { phases, parallelStreams } = calculatePhases(dependencyGraph, tasks, sprintNumber);

    // Generate output based on format
    let output: string;
    let savedTo: string | undefined;

    if (format === 'json') {
      const promptData = generateSprintPromptData({
        sprintNumber,
        tasks,
        phases,
        parallelStreams,
        projectName: 'IntelliFlow CRM',
        theme,
      });

      output = JSON.stringify(promptData, null, 2);

      // Save to file if outputPath specified
      if (outputPath) {
        const fullPath = outputPath.startsWith('/')
          ? join(projectRoot, outputPath)
          : join(projectRoot, 'artifacts', outputPath);

        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, output, 'utf-8');
        savedTo = fullPath;
      }

      return NextResponse.json({
        success: true,
        format: 'json',
        sprintNumber,
        data: promptData,
        savedTo,
      });
    } else {
      // Markdown format
      output = generateSprintPrompt({
        sprintNumber,
        tasks,
        phases,
        parallelStreams,
        projectName: 'IntelliFlow CRM',
        theme,
      });

      // Determine output path
      const defaultPath = `Sprint${sprintNumber}_prompt.md`;
      const finalPath = outputPath || defaultPath;
      const fullPath = finalPath.startsWith('/')
        ? join(projectRoot, finalPath)
        : join(projectRoot, 'artifacts', finalPath);

      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, output, 'utf-8');
      savedTo = fullPath;

      return NextResponse.json({
        success: true,
        format: 'markdown',
        sprintNumber,
        markdown: output,
        savedTo,
        summary: {
          totalPhases: phases.length,
          totalTasks: phases.reduce((sum, p) => sum + p.tasks.length, 0),
          parallelStreams: parallelStreams.length,
          sequentialPhases: phases.filter((p) => p.executionType === 'sequential').length,
          parallelPhases: phases.filter((p) => p.executionType === 'parallel').length,
        },
      });
    }
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
