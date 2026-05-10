/**
 * /api/agent-validation/[taskId] — agent-validation result inbox
 *
 * Wave 2c-c: when /exec dispatches `agent-validation.yml` to GitHub Actions
 * (because local concurrent agent count > threshold), the workflow's report
 * job POSTs its outcome here. /exec polls this endpoint until results are
 * available or the 30-min timeout elapses.
 *
 * Storage: $CLAUDE_SCRATCHPAD/agent-validation-results/<TASK_ID>.json
 *   (CLAUDE_SCRATCHPAD defaults to .claude/hooks/state/agent-validation/)
 *
 * POST  body: { gates: [{ name, exit_code, log_url, completed_at }] }
 * GET           response: { task_id, gates: [...], updated_at } or 404
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface GateResult {
  name: string;
  exit_code: number;
  log_url?: string;
  completed_at: string;
}

interface ValidationDoc {
  task_id: string;
  gates: GateResult[];
  updated_at: string;
}

function resultsDir(): string {
  const base = process.env.CLAUDE_SCRATCHPAD ?? join(process.cwd(), '.claude', 'hooks', 'state');
  return join(base, 'agent-validation-results');
}

function resultsPath(taskId: string): string {
  const safe = taskId.replace(/[^A-Za-z0-9_-]/g, '_');
  return join(resultsDir(), `${safe}.json`);
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ taskId: string }> }
): Promise<NextResponse> {
  const { taskId } = await ctx.params;
  const fp = resultsPath(taskId);
  if (!existsSync(fp)) {
    return NextResponse.json({ error: 'no result yet', task_id: taskId }, { status: 404 });
  }
  try {
    const body: ValidationDoc = JSON.parse(readFileSync(fp, 'utf8'));
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json({ error: 'corrupted result', detail: String(err) }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ taskId: string }> }
): Promise<NextResponse> {
  const { taskId } = await ctx.params;
  let payload: { gates?: GateResult[] };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (!payload.gates || !Array.isArray(payload.gates)) {
    return NextResponse.json({ error: 'missing gates[]' }, { status: 400 });
  }

  const fp = resultsPath(taskId);
  mkdirSync(dirname(fp), { recursive: true });

  let existing: ValidationDoc | null = null;
  if (existsSync(fp)) {
    try {
      existing = JSON.parse(readFileSync(fp, 'utf8'));
    } catch {
      existing = null;
    }
  }

  const merged: ValidationDoc = {
    task_id: taskId,
    gates: existing ? mergeGates(existing.gates, payload.gates) : payload.gates,
    updated_at: new Date().toISOString(),
  };
  writeFileSync(fp, JSON.stringify(merged, null, 2));
  return NextResponse.json({ ok: true, task_id: taskId, gate_count: merged.gates.length });
}

function mergeGates(prior: GateResult[], next: GateResult[]): GateResult[] {
  const byName = new Map<string, GateResult>();
  for (const g of prior) byName.set(g.name, g);
  for (const g of next) byName.set(g.name, g);
  return Array.from(byName.values());
}
