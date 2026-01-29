/**
 * POST /api/governance/run-lint
 * Triggers the Python plan-linter and returns results
 */

import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { loadLintReport, loadReviewQueue, loadPhantomCompletionAudit } from '@/lib/governance';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Detect Python command (python or python3)
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
    const verbose = searchParams.get('verbose') === 'true';
    const allSprints = searchParams.get('all') === 'true';

    // Run Python plan-linter from root directory
    const rootDir = path.join(process.cwd(), '..', '..');
    const pythonCmd = await getPythonCommand(rootDir);

    // Build command for Python linter
    const args = [
      '-m',
      'src.adapters.cli',
      'lint',
      `--sprint=${sprint}`,
      ...(verbose ? ['--verbose'] : []),
      ...(allSprints ? ['--all-sprints'] : []),
    ];
    const command = `cd tools/plan && ${pythonCmd} ${args.join(' ')}`;

    console.log(`Running Python plan-linter: ${command}`);
    console.log(`Working directory: ${rootDir}`);

    let stdout = '';
    let stderr = '';
    let exitCode = 0;

    try {
      const result = await execAsync(command, {
        cwd: rootDir,
        timeout: 120000, // 2 minute timeout
        env: { ...process.env, PYTHONPATH: path.join(rootDir, 'tools', 'plan', 'src') },
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash',
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (execError: any) {
      // exec throws on non-zero exit code
      stdout = execError.stdout || '';
      stderr = execError.stderr || '';
      exitCode = execError.code || 1;
    }

    // Load the generated reports
    const lintReport = loadLintReport();
    const reviewQueue = loadReviewQueue();
    const phantomAudit = loadPhantomCompletionAudit();

    // Count phantom completions from lint report
    const phantomCount =
      lintReport?.errors?.filter((e: any) => e.rule === 'PHANTOM_COMPLETION').length || 0;

    return NextResponse.json(
      {
        success: exitCode === 0,
        exitCode,
        command,
        linter: 'python', // Indicate which linter was used
        stdout: stdout.slice(-5000), // Last 5000 chars
        stderr: stderr.slice(-2000), // Last 2000 chars
        lintReport: lintReport || null,
        reviewQueue: reviewQueue || null,
        phantomCompletions: {
          count: phantomCount,
          audit: phantomAudit,
        },
        message:
          exitCode === 0
            ? 'Plan lint completed successfully'
            : `Plan lint found ${lintReport?.summary?.error_count || 'unknown'} violations (including ${phantomCount} phantom completions)`,
      },
      {
        status: 200, // Always return 200, use exitCode to indicate success
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error running plan-linter:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to run plan-linter',
        details: String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST to run the Python plan-linter',
    usage: 'POST /api/governance/run-lint?sprint=0&verbose=true&all=false',
    commands: {
      lint: 'POST /api/governance/run-lint - Run plan validation',
      migrate: 'POST /api/governance/migrate - Add schema v2 columns',
      digest: 'POST /api/governance/digest - Generate daily digest',
    },
    parameters: {
      sprint: 'Sprint number (default: 0)',
      verbose: 'Show detailed output (default: false)',
      all: 'Validate all sprints (default: false)',
    },
  });
}
