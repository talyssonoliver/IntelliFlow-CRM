/**
 * POST /api/governance/digest
 * Generates a daily digest report for the sprint
 */

import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

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
    const sprint = searchParams.get('sprint') || '0';

    const rootDir = path.join(process.cwd(), '..', '..');
    const pythonCmd = await getPythonCommand(rootDir);

    // Build command for Python digest
    const args = ['-m', 'src.adapters.cli', 'digest', `--sprint=${sprint}`];
    const command = `cd tools/plan && ${pythonCmd} ${args.join(' ')}`;

    console.log(`Generating daily digest: ${command}`);

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
        sprint: parseInt(sprint),
        command,
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
