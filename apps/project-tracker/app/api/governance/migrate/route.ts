/**
 * POST /api/governance/migrate
 * Runs the schema migration to add v2 columns to Sprint_plan.csv
 */

import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Detect Python command
async function getPythonCommand(rootDir: string): Promise<string> {
  try {
    await execAsync('python --version', { cwd: rootDir });
    return 'python';
  } catch {
    try {
      await execAsync('python3 --version', { cwd: rootDir });
      return 'python3';
    } catch {
      throw new Error('Python not found. Please install Python 3.11+');
    }
  }
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get('dry-run') !== 'false';

    const rootDir = path.join(process.cwd(), '..', '..');
    const pythonCmd = await getPythonCommand(rootDir);

    // Build command for Python migrate
    const args = ['-m', 'src.adapters.cli', 'migrate', ...(dryRun ? ['--dry-run'] : [])];
    const command = `cd tools/plan && ${pythonCmd} ${args.join(' ')}`;

    console.log(`Running schema migration: ${command}`);

    let stdout = '';
    let stderr = '';
    let exitCode = 0;

    try {
      const result = await execAsync(command, {
        cwd: rootDir,
        timeout: 60000,
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash',
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (execError: any) {
      stdout = execError.stdout || '';
      stderr = execError.stderr || '';
      exitCode = execError.code || 1;
    }

    return NextResponse.json(
      {
        success: exitCode === 0,
        exitCode,
        dryRun,
        command,
        stdout,
        stderr,
        message:
          exitCode === 0
            ? dryRun
              ? 'Migration preview completed'
              : 'Schema migration completed successfully'
            : 'Migration failed',
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error running migration:', error);
    return NextResponse.json(
      { error: 'Failed to run migration', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST to run schema migration',
    usage: 'POST /api/governance/migrate?dry-run=true',
    description:
      'Adds governance columns (Tier, Gate Profile, Evidence Required, etc.) to Sprint_plan.csv',
    parameters: {
      'dry-run': 'Preview changes without applying (default: true)',
    },
  });
}
