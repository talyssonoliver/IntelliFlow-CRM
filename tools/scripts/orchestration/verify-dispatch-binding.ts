/**
 * Dispatch-binding guard (ADR-070, L48 recurrence prevention).
 *
 * Validates the 4-way binding before any task execution begins:
 *   taskId (contract) === intended task ID
 *   agentLeaseId (contract) === current session ID
 *   branch (contract) === HEAD branch of the executing worktree
 *   worktree (contract) === realpath of the executing worktree
 *
 * Exits 0 if all bindings match. Exits 1 with diagnostics on any mismatch.
 * MUST be called by the supervisor and exit 0 before the agent writes any file.
 *
 * Usage:
 *   npx tsx tools/scripts/orchestration/verify-dispatch-binding.ts \
 *     --contract .specify/sprints/sprint-19/spec/ORCH-002/contract.json \
 *     --task-id   ORCH-002-task-contract-schema-and-dispatch-guard \
 *     --session-id local_28109fae \
 *     --branch    fix/orch-002-task-contract-and-dispatch-guard \
 *     --worktree  /c/Users/talys/projects/iflow-orch-002-contract-and-guard
 *
 * See docs/operations/agent-autonomy-policy.md — Dispatch-Binding Enforcement.
 */

import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import * as path from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BindingCheckInput {
  contractPath: string;
  intendedTaskId: string;
  sessionId: string;
  branch: string;
  worktree: string;
}

export interface BindingMismatch {
  dimension: 'taskId' | 'agentLeaseId' | 'branch' | 'worktree';
  expected: string;
  actual: string;
}

export interface BindingCheckResult {
  ok: boolean;
  mismatches: BindingMismatch[];
  contract?: Record<string, unknown>;
}

// ─── Core binding check ───────────────────────────────────────────────────────

export function verifyDispatchBinding(input: BindingCheckInput): BindingCheckResult {
  let contract: Record<string, unknown>;

  try {
    contract = JSON.parse(fs.readFileSync(input.contractPath, 'utf-8')) as Record<string, unknown>;
  } catch (e) {
    return {
      ok: false,
      mismatches: [
        {
          dimension: 'taskId',
          expected: '(contract file readable)',
          actual: `Error reading '${input.contractPath}': ${String(e)}`,
        },
      ],
    };
  }

  const mismatches: BindingMismatch[] = [];

  // 1. taskId binding
  const contractTaskId = String(contract.taskId ?? '');
  if (contractTaskId !== input.intendedTaskId) {
    mismatches.push({
      dimension: 'taskId',
      expected: input.intendedTaskId,
      actual: contractTaskId,
    });
  }

  // 2. agentLeaseId binding (must match the sessionId of the executing agent)
  const contractLeaseId = String(contract.agentLeaseId ?? '');
  if (contractLeaseId !== input.sessionId) {
    mismatches.push({
      dimension: 'agentLeaseId',
      expected: input.sessionId,
      actual: contractLeaseId,
    });
  }

  // 3. branch binding
  const contractBranch = String(contract.branch ?? '');
  if (contractBranch !== input.branch) {
    mismatches.push({
      dimension: 'branch',
      expected: input.branch,
      actual: contractBranch,
    });
  }

  // 4. worktree binding (normalised: forward slashes, no trailing slash)
  const contractWorktree = normalisePath(String(contract.worktree ?? ''));
  const intendedWorktree = normalisePath(input.worktree);
  if (contractWorktree !== intendedWorktree) {
    mismatches.push({
      dimension: 'worktree',
      expected: intendedWorktree,
      actual: contractWorktree,
    });
  }

  return { ok: mismatches.length === 0, mismatches, contract };
}

type ExecFn = (cmd: string, opts: Record<string, unknown>) => string;

/**
 * Resolves the current branch of a git worktree at the given path.
 * Returns null if git is not available or path is not a git repo.
 * Accepts an optional execFn for testing without spawning real processes.
 */
export function resolveCurrentBranch(
  worktreePath: string,
  execFn: ExecFn = (cmd, opts) =>
    execSync(cmd, { ...opts, encoding: 'utf-8' } as Parameters<typeof execSync>[1]) as string
): string | null {
  try {
    return execFn('git rev-parse --abbrev-ref HEAD', {
      cwd: worktreePath,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalisePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/$/, '');
}

export function parseArgs(argv: string[]): BindingCheckInput | null {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx !== -1 ? argv[idx + 1] : undefined;
  };

  const contractPath = get('--contract');
  const intendedTaskId = get('--task-id');
  const sessionId = get('--session-id');
  const branch = get('--branch');
  const worktree = get('--worktree') ?? normalisePath(path.resolve('.'));

  if (!contractPath || !intendedTaskId || !sessionId || !branch) {
    return null;
  }

  return { contractPath, intendedTaskId, sessionId, branch, worktree };
}

// ─── Testable CLI runner ──────────────────────────────────────────────────────

export interface CliIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  exit: (code: number) => never;
}

export function runBindingCli(args: string[], io: CliIO): void {
  const input = parseArgs(args);

  if (!input) {
    io.stderr(
      'Usage: verify-dispatch-binding.ts \\\n' +
        '  --contract <path>   Path to the task contract JSON\n' +
        '  --task-id   <id>    Intended task ID (from supervisor directive)\n' +
        '  --session-id <id>   Current Claude Code session ID\n' +
        '  --branch    <name>  Expected git branch\n' +
        '  [--worktree <path>] Worktree path (defaults to CWD)\n'
    );
    io.exit(1);
  }

  const result = verifyDispatchBinding(input!);

  if (result.ok) {
    io.stdout(`✓ Dispatch binding verified.\n`);
    io.stdout(`  taskId:       ${String(result.contract?.taskId)}\n`);
    io.stdout(`  agentLeaseId: ${String(result.contract?.agentLeaseId)}\n`);
    io.stdout(`  branch:       ${String(result.contract?.branch)}\n`);
    io.stdout(`  worktree:     ${String(result.contract?.worktree)}\n`);
    io.exit(0);
  } else {
    io.stderr(`✗ Dispatch binding FAILED — ${result.mismatches.length} mismatch(es):\n\n`);
    for (const m of result.mismatches) {
      io.stderr(`  [${m.dimension}]\n`);
      io.stderr(`    expected: ${m.expected}\n`);
      io.stderr(`    actual:   ${m.actual}\n\n`);
    }
    io.stderr(
      'STOP. Do NOT begin task execution. Notify the supervisor and resolve\n' +
        'the binding mismatch before any file writes occur.\n'
    );
    io.exit(1);
  }
}

/* c8 ignore next 6 */
if (import.meta.url === `file://${process.argv[1]}`) {
  runBindingCli(process.argv.slice(2), {
    stdout: process.stdout.write.bind(process.stdout),
    stderr: process.stderr.write.bind(process.stderr),
    exit: process.exit,
  });
}
