import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import Papa from 'papaparse';

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

export async function POST(request: Request) {
  try {
    const body: GenerateTaskPromptRequest = await request.json();
    const taskIds =
      (body.taskIds && body.taskIds.length > 0 && body.taskIds) ||
      (body.taskId ? [body.taskId] : []);

    if (!taskIds || taskIds.length === 0) {
      return NextResponse.json({ error: 'taskId or taskIds is required' }, { status: 400 });
    }

    const projectRoot = join(process.cwd(), '..', '..');
    const csvPath = join(projectRoot, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');
    const graphPath = join(projectRoot, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'dependency-graph.json');

    if (!existsSync(csvPath)) {
      return NextResponse.json({ error: 'Sprint_plan.csv not found' }, { status: 404 });
    }

    const csvContent = await readFile(csvPath, 'utf-8');
    const { data } = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
    });
    const tasks = data as CsvTask[];

    const selected = tasks.filter((t) => taskIds.includes(t['Task ID']));

    if (selected.length === 0) {
      return NextResponse.json({ error: `Tasks not found: ${taskIds.join(', ')}` }, { status: 404 });
    }

    let dependencyGraph: any | null = null;
    if (existsSync(graphPath)) {
      try {
        const graphContent = await readFile(graphPath, 'utf-8');
        dependencyGraph = JSON.parse(graphContent);
      } catch {
        dependencyGraph = null;
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultPath =
      taskIds.length === 1
        ? `artifacts/prompts/task-${taskIds[0]}.md`
        : `artifacts/prompts/tasks-${timestamp}.md`;
    const finalPath = body.outputPath || defaultPath;
    const fullPath = finalPath.startsWith('/')
      ? join(projectRoot, finalPath)
      : join(projectRoot, finalPath);

    await mkdir(dirname(fullPath), { recursive: true });

    const prompt = buildTaskPrompt(selected, dependencyGraph);
    await writeFile(fullPath, prompt, 'utf-8');

    return NextResponse.json({
      success: true,
      savedTo: fullPath,
      taskIds,
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

function buildTaskPrompt(tasks: CsvTask[], dependencyGraph: any | null): string {
  const lines: string[] = [];

  lines.push('# Task Execution Prompt');
  lines.push('');
  lines.push('Implement the selected task(s) with TDD, brand/page/sitemap, and flow context.');
  lines.push('### Key Objectives');
  lines.push('- Code: Deliver high-quality, tested code for the web app');
  lines.push('- Integration: Seamlessly integrate new features into existing architecture');
  lines.push('- Security: Ensure robust security and compliance');
  lines.push('- Performance: Optimize for speed and responsiveness');
  lines.push('- Aviability: Ensure high availability and reliability');
  lines.push('- Maintainability: Write clean, maintainable code');
  lines.push('- Documentation: Provide clear documentation and specs');
  lines.push('');
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

    lines.push(`## ${task['Task ID']} – ${task.Description}`);
    lines.push('');
    lines.push(`**Sprint:** ${task['Target Sprint']}`);
    lines.push(`**Section:** ${task.Section}`);
    lines.push(`**Owner:** ${task.Owner}`);
    lines.push(`**Status:** ${task.Status}`);
    lines.push('');
    lines.push('You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md');
    lines.push('');
    lines.push('### Dependencies');
    lines.push(deps.length ? deps.map((d) => `- ${d}`).join('\n') : '- None');
    if (depStatus.length) {
      lines.push('');
      lines.push('Dependency Status:');
      lines.push(depStatus.map((d) => `- ${d}`).join('\n'));
    }
    lines.push('');
    lines.push('### Pre-requisites');
    lines.push(task['Pre-requisites'] || 'None specified');
    lines.push('');
    lines.push('### Definition of Done');
    lines.push(dodItems.length ? dodItems.map((d, i) => `${i + 1}. ${d}`).join('\n') : '- None specified');
    lines.push('');
    lines.push('### Artifacts to Track');
    lines.push(artifacts.length ? artifacts.map((a) => `- ${a}`).join('\n') : '- None specified');
    lines.push('');
    lines.push('### Validation');
    lines.push(task['Validation Method'] || 'Manual review');
    lines.push('');
    lines.push('### Brand / UX / Flows References');
    lines.push('- Brand: docs/company/brand/style-guide.md');
    lines.push('- Page Registry: docs/design/page-registry.md');
    lines.push('- Sitemap: docs/design/sitemap.md');
    lines.push('- Check the relevant Flows: apps/project-tracker/docs/metrics/_global/flows/');
    lines.push('');
    lines.push('### Context Controls');
    lines.push('- Build context pack and context ack before coding.');
    lines.push('- Evidence folder: .specify/sprints/sprint-{N}/attestations/<task_id>/');
    lines.push('- Use spec/plan from .specify/sprints/sprint-{N}/specifications/ and planning/');
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  lines.push('## Delivery Checklist');
  lines.push('- Follow TDD: write/extend tests before implementation.');
  lines.push('- Respect Definition of Done and produce required artifacts.');
  lines.push('- Run lint/typecheck/test/build/security scans.');
  lines.push('- Attach evidence (context_pack, context_ack, summaries).');

  return lines.join('\n');
}
