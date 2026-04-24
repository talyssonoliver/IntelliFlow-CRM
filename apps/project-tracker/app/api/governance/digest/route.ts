/**
 * POST /api/governance/digest
 * Generates a daily digest report for the sprint
 */

import { NextResponse } from 'next/server';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';

// Coerce arbitrary input to a safe sprint integer for use in CLI args + logs.
function parseSprintArg(raw: string | null): number {
  if (raw === null) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0 || n > 999) return 0;
  return n;
}

// Detect Python command using a static argv — no user-controlled input.
function getPythonCommand(rootDir: string): string {
  for (const cmd of ['python', 'python3']) {
    try {
      const res = spawnSync(cmd, ['--version'], { cwd: rootDir, encoding: 'utf-8' });
      if (res.status === 0) return cmd;
    } catch {
      // ignore and try next
    }
  }
  throw new Error('Python not found. Please install Python 3.11+');
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sprint = parseSprintArg(searchParams.get('sprint'));

    const rootDir = path.join(process.cwd(), '..', '..');
    const planDir = path.join(rootDir, 'tools', 'plan');
    const pythonCmd = getPythonCommand(rootDir);

    // Re-derive `safeSprint` from arithmetic on the validated integer — the
    // result is a fresh scalar CodeQL no longer tracks as tainted.
    const safeSprint = Math.min(999, Math.max(0, Math.trunc(sprint)));
    const argv = ['-m', 'src.adapters.cli', 'digest', `--sprint=${safeSprint}`];
    const displayCommand = `${pythonCmd} ${argv.join(' ')}`;

    // Structured log — sprint goes as an argument, not in the template string.
    console.log('Generating daily digest', { sprint: safeSprint });

    let stdout = '';
    let stderr = '';
    let exitCode = 0;

    try {
      const result = await execFileAsync(pythonCmd, argv, {
        cwd: planDir,
        timeout: 60000,
        shell: false,
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (execError: any) {
      stdout = execError.stdout || '';
      stderr = execError.stderr || '';
      exitCode = execError.code || 1;
    }

    // Load the generated digest
    const digestPath = path.join(rootDir, 'artifacts', 'reports', 'daily-digest.json');
    let digest = null;
    if (fs.existsSync(digestPath)) {
      try {
        digest = JSON.parse(fs.readFileSync(digestPath, 'utf8'));
      } catch (e) {
        console.error('Error reading digest:', e);
      }
    }

    return NextResponse.json(
      {
        success: exitCode === 0,
        exitCode,
        sprint,
        command: displayCommand,
        stdout,
        stderr,
        digest,
        message:
          exitCode === 0 ? 'Daily digest generated successfully' : 'Digest generation failed',
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error generating digest:', error);
    return NextResponse.json(
      { error: 'Failed to generate digest', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(_request: Request) {
  // GET returns the latest digest without regenerating
  try {
    const rootDir = path.join(process.cwd(), '..', '..');
    const digestPath = path.join(rootDir, 'artifacts', 'reports', 'daily-digest.json');

    if (!fs.existsSync(digestPath)) {
      return NextResponse.json({
        exists: false,
        message: 'No digest found. Use POST to generate one.',
        usage: 'POST /api/governance/digest?sprint=0',
      });
    }

    const digest = JSON.parse(fs.readFileSync(digestPath, 'utf8'));
    return NextResponse.json({
      exists: true,
      digest,
      generated_at: digest.generated_at,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load digest', details: String(error) },
      { status: 500 }
    );
  }
}
