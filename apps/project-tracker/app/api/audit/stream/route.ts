import { NextRequest } from 'next/server';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

type AuditStreamCommand = 'run-audit' | 'status-snapshot' | 'sprint0-audit' | 'affected';

function isAuditStreamCommand(value: string | null): value is AuditStreamCommand {
  return (
    value === 'run-audit' ||
    value === 'status-snapshot' ||
    value === 'sprint0-audit' ||
    value === 'affected'
  );
}

function getRepoRootDir(): string {
  // Next app cwd is expected to be `apps/project-tracker`, so repo root is two levels up.
  return path.join(process.cwd(), '..', '..');
}

function getPythonCommand(): string {
  const candidates = ['python', 'python3'];
  for (const cmd of candidates) {
    try {
      const res = spawnSync(cmd, ['--version'], { encoding: 'utf-8' });
      if (res.status === 0) return cmd;
    } catch {
      // ignore
    }
  }
  return 'python';
}

function generateRunId(prefix: string): string {
  const ts = new Date().toISOString().replaceAll(':', '').replaceAll('-', '').replace('.000Z', 'Z');
  const rand = randomUUID().replaceAll('-', '').slice(0, 8);
  return `${prefix}-${ts}-${rand}`;
}

function sendSse(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  event: string,
  data: unknown
): void {
  controller.enqueue(encoder.encode(`event: ${event}\n`));
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

function getStringParam(searchParams: URLSearchParams, key: string): string | undefined {
  const v = searchParams.get(key);
  if (!v) return undefined;
  const trimmed = v.trim();
  return trimmed ? trimmed : undefined;
}

function getBoolParam(searchParams: URLSearchParams, key: string): boolean {
  const v = searchParams.get(key);
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function getIntParam(searchParams: URLSearchParams, key: string, fallback: number): number {
  const v = searchParams.get(key);
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function buildCommand(
  cmd: AuditStreamCommand,
  searchParams: URLSearchParams
): { displayName: string; runId?: string; argv: string[] } {
  const python = getPythonCommand();

  if (cmd === 'run-audit') {
    const mode = getStringParam(searchParams, 'mode');
    const tier = getStringParam(searchParams, 'tier');
    const scope = getStringParam(searchParams, 'scope');
    const baseRef = getStringParam(searchParams, 'baseRef') ?? 'origin/main';
    const resume = getBoolParam(searchParams, 'resume');
    const concurrency = getIntParam(searchParams, 'concurrency', 1);
    const runId = getStringParam(searchParams, 'runId') ?? generateRunId('ui-audit');

    const args: string[] = [python, path.join('tools', 'audit', 'run_audit.py')];

    if (mode) {
      args.push('--mode', mode);
    } else if (tier) {
      args.push('--tier', tier);
    } else {
      args.push('--mode', 'pr');
    }

    if (scope) args.push('--scope', scope);
    if (baseRef) args.push('--base-ref', baseRef);
    if (resume) args.push('--resume');
    if (concurrency > 1) args.push('--concurrency', String(concurrency));

    args.push('--run-id', runId);

    return { displayName: 'System Audit', runId, argv: args };
  }

  if (cmd === 'status-snapshot') {
    return {
      displayName: 'Status Snapshot',
      argv: [python, path.join('tools', 'audit', 'status_snapshot.py')],
    };
  }

  if (cmd === 'sprint0-audit') {
    const runId = getStringParam(searchParams, 'runId');
    if (!runId) {
      throw new Error('Missing required query param: runId');
    }
    return {
      displayName: 'Sprint 0 Audit Reports',
      runId,
      argv: [python, path.join('tools', 'audit', 'sprint0_audit.py'), '--run-id', runId],
    };
  }

  // cmd === 'affected'
  {
    const baseRef = getStringParam(searchParams, 'baseRef') ?? 'origin/main';
    const includeDependents = getBoolParam(searchParams, 'includeDependents');
    const args: string[] = [
      python,
      path.join('tools', 'audit', 'affected.py'),
      '--base-ref',
      baseRef,
    ];
    if (includeDependents) args.push('--include-dependents');
    return {
      displayName: 'Affected Scope',
      argv: args,
    };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cmdRaw = searchParams.get('cmd');

  if (!isAuditStreamCommand(cmdRaw)) {
    return new Response(
      JSON.stringify({
        error: 'Invalid cmd',
        valid: ['run-audit', 'status-snapshot', 'sprint0-audit', 'affected'],
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const repoRoot = getRepoRootDir();
      const startedAt = new Date().toISOString();

      let child: ReturnType<typeof spawn> | undefined;
      let pingTimer: NodeJS.Timeout | undefined;

      const safeClose = () => {
        try {
          if (pingTimer) clearInterval(pingTimer);
        } catch {
          // ignore
        }
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      const sendLogLine = (streamName: 'stdout' | 'stderr', line: string) => {
        const clean = stripVTControlCharacters(line.replace(/\r/g, ''));
        if (!clean.trim()) return;
        sendSse(controller, encoder, 'log', {
          stream: streamName,
          line: clean,
          ts: Date.now(),
        });
      };

      try {
        const { displayName, runId, argv } = buildCommand(cmdRaw, searchParams);

        sendSse(controller, encoder, 'start', {
          cmd: cmdRaw,
          displayName,
          runId,
          argv,
          cwd: repoRoot,
          startedAt,
        });

        // Keep-alive ping to avoid idle timeouts.
        pingTimer = setInterval(() => {
          try {
            sendSse(controller, encoder, 'ping', { ts: Date.now() });
          } catch {
            // ignore
          }
        }, 15000);

        child = spawn(argv[0], argv.slice(1), {
          cwd: repoRoot,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false,
        });

        let stdoutBuf = '';
        let stderrBuf = '';

        child.stdout?.on('data', (data) => {
          stdoutBuf += data.toString('utf-8');
          const parts = stdoutBuf.split(/\n/);
          stdoutBuf = parts.pop() ?? '';
          for (const line of parts) sendLogLine('stdout', line);
        });

        child.stderr?.on('data', (data) => {
          stderrBuf += data.toString('utf-8');
          const parts = stderrBuf.split(/\n/);
          stderrBuf = parts.pop() ?? '';
          for (const line of parts) sendLogLine('stderr', line);
        });

        child.on('close', (code, signal) => {
          if (stdoutBuf.trim()) sendLogLine('stdout', stdoutBuf);
          if (stderrBuf.trim()) sendLogLine('stderr', stderrBuf);

          sendSse(controller, encoder, 'exit', {
            exitCode: code,
            signal,
            finishedAt: new Date().toISOString(),
          });
          safeClose();
        });

        child.on('error', (error) => {
          sendSse(controller, encoder, 'server-error', { message: error.message });
          safeClose();
        });

        request.signal.addEventListener('abort', () => {
          try {
            child?.kill();
          } catch {
            // ignore
          }
          sendSse(controller, encoder, 'aborted', { finishedAt: new Date().toISOString() });
          safeClose();
        });
      } catch (error: any) {
        sendSse(controller, encoder, 'server-error', { message: String(error?.message || error) });
        safeClose();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, max-age=0',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
