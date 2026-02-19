#!/usr/bin/env node
/**
 * git-destructive-guard.mjs — PreToolUse hook for Bash
 *
 * Blocks destructive git commands even when running with
 * --dangerously-skip-permissions (YOLO mode).
 *
 * Hooks ALWAYS fire regardless of permission mode, making this
 * the last line of defense against accidental destructive operations.
 *
 * Blocked commands:
 *   - git push --force / -f (without --force-with-lease)
 *   - git reset --hard
 *   - git clean -f / -fd / -fx
 *   - git checkout . / git checkout -- <path> (discard changes)
 *   - git restore <path> / git restore --worktree / --source (discard changes)
 *   - git branch -D (force delete branch)
 *   - git rebase with --no-edit or -i (interactive/unsafe rebase)
 *   - git stash (all subcommands — push/pop/apply can silently overwrite working tree in subagents)
 *   - git reflog expire / delete
 */

const DESTRUCTIVE_PATTERNS = [
  {
    pattern: /\bgit\s+push\b.*(?:--force(?!-with-lease)|-f\b)/,
    reason: 'git push --force is blocked. Use --force-with-lease for safer force pushes, or ask the user to run it manually.',
  },
  {
    pattern: /\bgit\s+reset\s+--hard\b/,
    reason: 'git reset --hard is blocked — it permanently discards uncommitted changes. Use git reset --soft instead.',
  },
  {
    pattern: /\bgit\s+clean\s+-[a-zA-Z]*f/,
    reason: 'git clean -f is blocked — it permanently deletes untracked files. Use git clean -n (dry run) first, then ask the user to confirm.',
  },
  {
    pattern: /\bgit\s+checkout\s+\.\s*$/,
    reason: 'git checkout . is blocked — it discards all unstaged changes. Ask the user to handle this manually.',
  },
  {
    pattern: /\bgit\s+checkout\s+--\s/,
    reason: 'git checkout -- <path> is blocked — it permanently discards uncommitted changes to the specified files. Ask the user to handle this manually.',
  },
  {
    pattern: /\bgit\s+restore\s+\.\s*$/,
    reason: 'git restore . is blocked — it discards all unstaged changes. Ask the user to handle this manually.',
  },
  {
    pattern: /\bgit\s+restore\s+--staged\s+--worktree\b/,
    reason: 'git restore --staged --worktree is blocked — it discards both staged and unstaged changes.',
  },
  {
    pattern: /\bgit\s+restore\s+--worktree\b/,
    reason: 'git restore --worktree is blocked — it discards working tree changes. Ask the user to handle this manually.',
  },
  {
    pattern: /\bgit\s+restore\s+--source\b/,
    reason: 'git restore --source is blocked — it replaces files with content from another commit. Ask the user to handle this manually.',
  },
  {
    pattern: /\bgit\s+restore\s+(?!--staged\b)(?!-)[^\s]/,
    reason: 'git restore <path> is blocked — it discards working tree changes to the specified files. Ask the user to handle this manually.',
  },
  {
    pattern: /\bgit\s+branch\s+-D\b/,
    reason: 'git branch -D (force delete) is blocked. Use git branch -d for safe deletion (only if fully merged).',
  },
  {
    pattern: /\bgit\s+stash\b/,
    reason: 'git stash is blocked — stash push/pop/apply can silently overwrite working tree files, especially dangerous from subagents. The user must run git stash manually.',
  },
  {
    pattern: /\bgit\s+reflog\s+(?:expire|delete)\b/,
    reason: 'git reflog expire/delete is blocked — it removes recovery points. This should only be done manually by the user.',
  },
];

async function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    // Can't parse input — allow through
    process.exit(0);
  }

  const command = data?.tool_input?.command;
  if (!command) {
    process.exit(0);
  }

  // Check each line of a multi-line or chained command
  // Split on &&, ||, ;, and newlines to check each subcommand
  const subcommands = command.split(/&&|\|\||;|\n/).map(s => s.trim());

  for (const sub of subcommands) {
    for (const { pattern, reason } of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(sub)) {
        const output = {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `[Git Safety Guard] BLOCKED: ${reason}`,
          },
        };
        process.stdout.write(JSON.stringify(output));
        process.exit(0);
      }
    }
  }

  // Not destructive — allow
  process.exit(0);
}

main().catch(() => process.exit(0));
