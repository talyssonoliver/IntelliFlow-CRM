import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { PATHS } from '@/lib/paths';

// Valid CLI commands from orchestrator.sh
const VALID_COMMANDS = [
  'list-ready',
  'list',
  'status',
  'interventions',
  'blockers',
  'context',
  'explain',
  'generate-runbook',
] as const;

type ValidCommand = (typeof VALID_COMMANDS)[number];

function isValidCommand(cmd: string): cmd is ValidCommand {
  return VALID_COMMANDS.includes(cmd as ValidCommand);
}

// Convert Windows path to Unix-style for Git Bash
function toUnixPath(windowsPath: string): string {
  // Convert backslashes to forward slashes
  let unixPath = windowsPath.replace(/\\/g, '/');
  // Convert C: to /c (Git Bash style)
  unixPath = unixPath.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
  return unixPath;
}

// Get bash executable path (works on Windows and Unix)
function getBashPath(): string {
  if (process.platform === 'win32') {
    // Common Git Bash locations on Windows (check both bin and usr/bin)
    const gitBashPaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe',
      process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Git\\bin\\bash.exe` : '',
      process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Git\\usr\\bin\\bash.exe` : '',
      process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Programs\\Git\\bin\\bash.exe` : '',
    ].filter(Boolean);

    for (const p of gitBashPaths) {
      if (existsSync(p)) {
        return p;
      }
    }
    // Fallback: default Git Bash location
    return 'C:\\Program Files\\Git\\bin\\bash.exe';
  }
  return 'bash'; // Unix systems
}

// Commands that may return exit code 1 for "incomplete" status (not errors)
const STATUS_COMMANDS = ['status', 'list', 'interventions', 'blockers'];

// Timeout per command type (ms)
const COMMAND_TIMEOUTS: Record<string, number> = {
  list: 90000, // 90 seconds - iterates all tasks
  status: 90000, // 90 seconds - calculates stats
  'list-ready': 30000,
  interventions: 30000,
  blockers: 30000,
  context: 30000,
  explain: 30000,
  'generate-runbook': 30000,
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { command, args = [] } = body;

    if (!command || !isValidCommand(command)) {
      return NextResponse.json(
        { error: `Invalid command. Valid commands: ${VALID_COMMANDS.join(', ')}` },
        { status: 400 }
      );
    }

    const orchestratorPath = PATHS.scripts.orchestrator;
    const metricsDir = PATHS.scripts.root;

    // Convert paths for Git Bash on Windows
    const unixOrchestratorPath = toUnixPath(orchestratorPath);

    // Build command arguments
    const cmdArgs = [unixOrchestratorPath, command, ...args];

    const bashPath = getBashPath();
    const timeout = COMMAND_TIMEOUTS[command] || 60000;

    return new Promise<Response>((resolve) => {
      let resolved = false;

      const child = spawn(bashPath, cmdArgs, {
        cwd: metricsDir,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (resolved) return;
        resolved = true;

        // Clean up output - remove carriage returns and ANSI codes
        const cleanStdout = stdout
          .trim()
          .replace(/\r/g, '')
          // eslint-disable-next-line no-control-regex
          .replace(/\x1b\[[0-9;]*m/g, '');
        const cleanStderr = stderr.trim().replace(/\r/g, '');

        // For status commands, exit code 1 often means "tasks incomplete" not error
        const isStatusCommand = STATUS_COMMANDS.includes(command);
        const success = code === 0 || (isStatusCommand && code === 1 && cleanStdout.length > 0);

        resolve(
          NextResponse.json({
            command,
            args,
            exitCode: code,
            stdout: cleanStdout,
            stderr: cleanStderr,
            success,
          })
        );
      });

      child.on('error', (error) => {
        if (resolved) return;
        resolved = true;
        resolve(
          NextResponse.json(
            { error: `Failed to execute command: ${error.message}` },
            { status: 500 }
          )
        );
      });

      // Timeout with partial output
      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        child.kill();

        // Return partial output if available
        const cleanStdout = stdout
          .trim()
          .replace(/\r/g, '')
          // eslint-disable-next-line no-control-regex
          .replace(/\x1b\[[0-9;]*m/g, '');
        if (cleanStdout.length > 0) {
          resolve(
            NextResponse.json({
              command,
              args,
              exitCode: null,
              stdout: cleanStdout,
              stderr: stderr.trim(),
              success: true,
              partial: true,
              warning: `Command output truncated after ${timeout / 1000}s`,
            })
          );
        } else {
          resolve(
            NextResponse.json(
              { error: `Command timed out after ${timeout / 1000} seconds` },
              { status: 504 }
            )
          );
        }
      }, timeout);
    });
  } catch (error) {
    console.error('CLI command error:', error);
    return NextResponse.json({ error: 'Failed to execute CLI command' }, { status: 500 });
  }
}
