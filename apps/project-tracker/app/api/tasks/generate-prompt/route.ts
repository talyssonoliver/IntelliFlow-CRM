import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import Papa from 'papaparse';
import { isValidTaskId } from '@/lib/paths';

// Note: output filename sanitisation is inlined at the sink in
// resolvePromptArtifactPath so CodeQL sees the basename+regex pattern
// directly at the fs call site rather than across a function boundary.

export const dynamic = 'force-dynamic';

interface GenerateTaskPromptRequest {
  taskId?: string;
  taskIds?: string[];
  outputPath?: string;
}

interface CsvTask {
  'Task ID': string;
  Section: string;
  Description: string;
  Owner: string;
  Status: string;
  'Target Sprint': string;
  Dependencies?: string;
  CleanDependencies?: string;
  'Pre-requisites'?: string;
  'Definition of Done': string;
  KPIs?: string;
  'Artifacts To Track'?: string;
  'Validation Method'?: string;
}

function normalizeTaskIds(body: GenerateTaskPromptRequest): string[] {
  if (body.taskIds && body.taskIds.length > 0) return body.taskIds;
  if (body.taskId) return [body.taskId];
  return [];
}

function resolvePromptArtifactFilename(
  outputPath: string | undefined,
  defaultFilename: string
): { safeFilename: string } | { errorResponse: Response } {
  const safeFilename = outputPath
    ? basename(outputPath).replace(/[^A-Za-z0-9._\- ]/g, '')
    : defaultFilename;
  if (!safeFilename || safeFilename.length === 0) {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: 'Invalid output filename' },
        { status: 400 }
      ),
    };
  }
  return { safeFilename };
}

async function loadDependencyGraphSafe(graphPath: string): Promise<any | null> {
  if (!existsSync(graphPath)) return null;
  try {
    const content = await readFile(graphPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body: GenerateTaskPromptRequest = await request.json();
    const taskIds = normalizeTaskIds(body);

    if (taskIds.length === 0) {
      return NextResponse.json({ error: 'taskId or taskIds is required' }, { status: 400 });
    }

    // Validate all task IDs against the canonical pattern before using them in paths.
    const invalidIds = taskIds.filter((id) => !isValidTaskId(id));
    if (invalidIds.length > 0) {
      return NextResponse.json(
        {
          error: `Invalid task ID(s): ${invalidIds.join(', ')}. Must match canonical task-id pattern.`,
        },
        { status: 400 }
      );
    }
    const safeTaskIds: string[] = taskIds;

    const projectRoot = join(process.cwd(), '..', '..');
    const csvPath = join(
      projectRoot,
      'apps',
      'project-tracker',
      'docs',
      'metrics',
      '_global',
      'Sprint_plan.csv'
    );
    const graphPath = join(
      projectRoot,
      'apps',
      'project-tracker',
      'docs',
      'metrics',
      '_global',
      'dependency-graph.json'
    );

    if (!existsSync(csvPath)) {
      return NextResponse.json({ error: 'Sprint_plan.csv not found' }, { status: 404 });
    }

    const csvContent = await readFile(csvPath, 'utf-8');
    const { data } = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
    });
    const tasks = data as CsvTask[];

    const selected = tasks.filter((t) => safeTaskIds.includes(t['Task ID']));

    if (selected.length === 0) {
      return NextResponse.json(
        { error: `Tasks not found: ${safeTaskIds.join(', ')}` },
        { status: 404 }
      );
    }

    const dependencyGraph = await loadDependencyGraphSafe(graphPath);

    const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
    const defaultFilename =
      safeTaskIds.length === 1 ? `task-${safeTaskIds[0]}.md` : `tasks-${timestamp}.md`;

    const resolved = resolvePromptArtifactFilename(body.outputPath, defaultFilename);
    if ('errorResponse' in resolved) return resolved.errorResponse;

    // Inline basename + whitelist-regex AT the fs sink. CodeQL recognises this
    // pattern as a path-injection sanitiser; helpers across function
    // boundaries are not propagated.
    const safeFullPath = join(
      projectRoot,
      'artifacts',
      'prompts',
      basename(resolved.safeFilename).replace(/[^A-Za-z0-9._\- ]/g, '')
    );
    await mkdir(dirname(safeFullPath), { recursive: true });

    const prompt = buildTaskPrompt(selected, dependencyGraph);
    await writeFile(safeFullPath, prompt, 'utf-8');

    return NextResponse.json({
      success: true,
      savedTo: safeFullPath,
      taskIds: safeTaskIds,
      markdown: prompt,
    });
  } catch (error) {
    console.error('Error generating task prompt:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate task prompt',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

function buildTaskPrompt(tasks: CsvTask[], dependencyGraph: any): string {
  const lines: string[] = [];

  lines.push(
    '# Task Execution Prompt',
    '',
    'Implement the selected task(s) with TDD, brand/page/sitemap, and flow context.',
    '### Key Objectives',
    '- Code: Deliver high-quality, tested code for the web app',
    '- Integration: Seamlessly integrate new features into existing architecture',
    '- Security: Ensure robust security and compliance',
    '- Performance: Optimize for speed and responsiveness',
    '- Aviability: Ensure high availability and reliability',
    '- Maintainability: Write clean, maintainable code',
    '- Documentation: Provide clear documentation and specs',
    ''
  );
  tasks.forEach((task) => {
    const depsRaw = task.CleanDependencies || task.Dependencies || '';
    const deps = depsRaw
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

    const depStatus: string[] = [];
    if (dependencyGraph) {
      deps.forEach((d) => {
        const node = dependencyGraph.nodes?.[d];
        if (node) {
          depStatus.push(`${d} (${node.status || 'UNKNOWN'})`);
        } else {
          depStatus.push(`${d} (not found)`);
        }
      });
    }

    const dodItems = task['Definition of Done']
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean);

    const artifacts = (task['Artifacts To Track'] || '')
      .split(';')
      .map((a) => a.trim())
      .filter(Boolean);

    lines.push(
      `## ${task['Task ID']} – ${task.Description}`,
      '',
      `**Sprint:** ${task['Target Sprint']}`,
      `**Section:** ${task.Section}`,
      `**Owner:** ${task.Owner}`,
      `**Status:** ${task.Status}`,
      ''
    );
    lines.push(
      'You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md',
      '',
      '### Dependencies',
      deps.length ? deps.map((d) => `- ${d}`).join('\n') : '- None'
    );
    if (depStatus.length) {
      lines.push('', 'Dependency Status:', depStatus.map((d) => `- ${d}`).join('\n'));
    }
    lines.push(
      '',
      '### Pre-requisites',
      task['Pre-requisites'] || 'None specified',
      '',
      '### Definition of Done',
      dodItems.length ? dodItems.map((d, i) => `${i + 1}. ${d}`).join('\n') : '- None specified'
    );
    lines.push(
      '',
      '### Artifacts to Track',
      artifacts.length ? artifacts.map((a) => `- ${a}`).join('\n') : '- None specified',
      '',
      '### Validation',
      task['Validation Method'] || 'Manual review',
      '',
      '### Brand / UX / Flows References',
      '- Brand: docs/company/brand/style-guide.md',
      '- Page Registry: docs/design/page-registry.md',
      '- Sitemap: docs/design/sitemap.md',
      '- Check the relevant Flows: apps/project-tracker/docs/metrics/_global/flows/',
      '',
      '### Context Controls',
      '- Build context pack and context ack before coding.',
      '- Evidence folder: .specify/sprints/sprint-{N}/attestations/<task_id>/',
      '- Use spec/plan from .specify/sprints/sprint-{N}/specifications/ and planning/',
      '',
      '---',
      ''
    );
  });

  lines.push(
    '## Delivery Checklist',
    '- Follow TDD: write/extend tests before implementation.',
    '- Respect Definition of Done and produce required artifacts.',
    '- Run lint/typecheck/test/build/security scans.',
    '- Attach evidence (context_pack, context_ack, summaries).'
  );

  return lines.join('\n');
}
