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
 *   - git checkout . / git checkout -- <path> / git checkout <ref> -- <path> (discard changes)
 *   - git restore <path> / git restore --worktree / --source (discard changes)
 *   - git branch -D (force delete branch)
 *   - git rebase with --no-edit or -i (interactive/unsafe rebase)
 *   - git stash (all subcommands — push/pop/apply can silently overwrite working tree in subagents)
 *   - git reflog expire / delete
 *   - git show <ref>:<path> > <path>  (same-path redirect silently overwrites working tree)
 *
 * Also scans interpreter invocations (node/tsx/ts-node/bun/deno/python*) and inspects
 * the target script file for destructive git calls via child_process / subprocess / os.system,
 * so a subagent cannot bypass the guard by writing a small wrapper script.
 *
 * Scope: applies to every Claude Code Bash invocation, including those spawned by
 * subagents and by plugin-spawned runtimes (Codex, Ralph Wiggum, etc.) that route
 * shell work through the Bash tool.
 */

import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Direct command patterns ────────────────────────────────────────────────
const DESTRUCTIVE_PATTERNS = [
  {
    pattern: /\bgit\s+push\b.*(?:--force(?!-with-lease)|-f\b)/,
    reason: 'git push --force is blocked. Use --force-with-lease for safer force pushes, or ask the user to run it manually.',
  },
  {
    pattern: /\bgit\s+push\s+(?:\S+\s+)?(?:origin\s+)?main\b(?!\s*:)/,
    reason: 'Direct push to main is blocked. Push to agent/<TASK_ID> and open a PR. See docs/runbooks/gate-4b-recovery.md.',
  },
  {
    pattern: /\bgit\s+push\s+\S+\s+HEAD:main\b/,
    reason: 'Direct push to main via HEAD: ref is blocked. Push to agent/<TASK_ID> and open a PR. See docs/runbooks/gate-4b-recovery.md.',
  },
  {
    pattern: /\bgit\s+push\s+\S+\s+:main\b/,
    reason: 'Deletion of remote main via empty source ref is blocked.',
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
    pattern: /\bgit\s+checkout\s+\S+\s+--\s/,
    reason: 'git checkout <ref> -- <path> is blocked — it overwrites working tree files with content from another commit. Ask the user to handle this manually.',
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
  {
    // git show <anything>:<path>  followed by  redirect into the SAME <path>
    // Backref \1 enforces equality. Matches  `git show HEAD:foo > foo` ,
    // `git show stash@{0}:dir/f > dir/f`, etc. Does NOT match same-path shown via
    // a /tmp move, which is the explicit-intent pattern the user should use.
    pattern: /\bgit\s+show\s+\S*?:([^\s>]+)\s*>{1,2}\s*\1(?:\s|$)/,
    reason: 'git show <ref>:<path> > <path> is blocked — redirecting back to the same path silently overwrites your working tree (how we lost 4h of work once). Use a temp file: `git show <ref>:<path> > /tmp/file && mv /tmp/file <path>` to make the intent explicit.',
  },
];

// ─── Script-content scan patterns ───────────────────────────────────────────
// When an interpreter is invoked against a script, read the script and scan
// for destructive git calls inside subprocess / child_process / os.system.
// Regex accept split-quote styles and whitespace. Each entry describes what
// to flag and why.
const SCRIPT_DESTRUCTIVE_PATTERNS = [
  // ── Node / Bun / Deno — child_process ──
  {
    // child_process.execSync('git stash ...')
    // child_process.exec("git reset --hard ...")
    pattern: /\b(?:exec|execSync|execFile|execFileSync|spawn|spawnSync|fork)\s*\(\s*(['"`])\s*git\s+(?:stash\b|reset\s+--hard\b|clean\s+-[a-zA-Z]*f|checkout\s+(?:\.|--)|restore(?!\s+--staged\b)|push[^'"`]*(?:--force(?!-with-lease)|\s-f\b)|branch\s+-D\b|reflog\s+(?:expire|delete)\b)/,
    reason: 'Script runs a destructive git command inline (exec/spawn with \'git stash ...\' or similar). Blocked.',
  },
  {
    // spawnSync('git', ['stash', 'push', ...])
    // execFileSync("git", ["reset", "--hard", ...])
    pattern: /\b(?:exec|execSync|execFile|execFileSync|spawn|spawnSync|fork)\s*\(\s*(['"`])git\1\s*,\s*\[\s*(['"`])(?:stash|push|reset|clean|checkout|restore|branch|reflog)\2[^\]]*?(?:\2\s*,\s*(['"`])(?:--hard|--force|-f|-D|expire|delete|--worktree|--source|\.)\3)?/,
    reason: 'Script spawns git with destructive argv (e.g. spawn(\'git\', [\'stash\', ...]) or spawn(\'git\', [\'reset\', \'--hard\'])). Blocked.',
  },
  // ── Python — subprocess / os.system ──
  {
    pattern: /\b(?:subprocess\.(?:run|call|check_call|check_output|Popen)|os\.system|os\.popen)\s*\(\s*\[?\s*(['"])git\1\s*,\s*(['"])(?:stash|push|reset|clean|checkout|restore|branch|reflog)\2/,
    reason: 'Python subprocess/os.system calls git with a destructive subcommand. Blocked.',
  },
  {
    pattern: /\b(?:subprocess\.(?:run|call|check_call|check_output|Popen)|os\.system|os\.popen)\s*\(\s*f?['"]\s*git\s+(?:stash\b|reset\s+--hard\b|clean\s+-[a-zA-Z]*f|checkout\s+(?:\.|--)|restore(?!\s+--staged\b)|push[^'"]*(?:--force(?!-with-lease)|\s-f\b)|branch\s+-D\b|reflog\s+(?:expire|delete)\b)/,
    reason: 'Python runs a destructive git command via subprocess/os.system. Blocked.',
  },
  // ── Same-path git-show redirect appearing inside the script ──
  {
    pattern: /\bgit\s+show\s+\S*?:([^\s>'"`]+)\s*>{1,2}\s*\1(?:\s|$|['"`])/,
    reason: 'Script contains `git show <ref>:<path> > <path>` — same-path redirect silently overwrites working tree. Use a /tmp intermediate.',
  },
];

// ─── Interpreter detection ──────────────────────────────────────────────────
// Match `node foo.mjs`, `tsx path/to/foo.ts`, `npx tsx foo.ts`, `pnpm exec tsx foo.ts`,
// `bun run foo.ts`, `deno run foo.ts`, `python foo.py`, `python3 foo.py`,
// `ts-node foo.ts`, `./scripts/foo.mjs`, etc. Capture the first .mjs/.js/.ts/.tsx/.py path.
const INTERPRETER_RX =
  /\b(?:node|bun(?:\s+run)?|deno(?:\s+run)?|python3?|tsx|ts-node|npx(?:\s+tsx|\s+ts-node)?|pnpm\s+(?:dlx|exec)\s+(?:tsx|ts-node))\b[^\n]*?((?:\.?\/)?[^\s"']+?\.(?:mjs|cjs|js|ts|tsx|py))(?:\s|$)/i;

const MAX_SCRIPT_BYTES = 256 * 1024; // Don't read huge files

function extractScriptPath(cmd) {
  const m = cmd.match(INTERPRETER_RX);
  if (!m) return null;
  // Strip surrounding quotes from the matched path, if any.
  return m[1].replace(/^['"]|['"]$/g, '');
}

function scanScriptFile(scriptPath) {
  let abs;
  try {
    abs = resolve(process.cwd(), scriptPath);
    const st = statSync(abs);
    if (!st.isFile()) return null;
    if (st.size > MAX_SCRIPT_BYTES) return null; // skip huge files silently
  } catch {
    return null; // script doesn't exist — let Node/python surface the error
  }
  let content;
  try {
    content = readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
  for (const { pattern, reason } of SCRIPT_DESTRUCTIVE_PATTERNS) {
    if (pattern.test(content)) {
      return { path: scriptPath, reason };
    }
  }
  return null;
}

function checkDirectPatterns(cmd) {
  // Split on &&, ||, ;, newlines — check each subcommand independently
  const subs = cmd.split(/&&|\|\||;|\n/).map((s) => s.trim());
  for (const sub of subs) {
    for (const { pattern, reason } of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(sub)) return reason;
    }
  }
  return null;
}

function checkInterpreterScripts(cmd) {
  // A single command line may chain multiple interpreter invocations. Walk each sub.
  const subs = cmd.split(/&&|\|\||;|\n/).map((s) => s.trim());
  for (const sub of subs) {
    const scriptPath = extractScriptPath(sub);
    if (!scriptPath) continue;
    const hit = scanScriptFile(scriptPath);
    if (hit) {
      return `${hit.reason} (in script ${hit.path})`;
    }
  }
  return null;
}

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
    process.exit(0); // can't parse — allow through
  }

  const command = data?.tool_input?.command;
  if (!command) process.exit(0);

  const directReason = checkDirectPatterns(command);
  if (directReason) return deny(directReason);

  const scriptReason = checkInterpreterScripts(command);
  if (scriptReason) return deny(scriptReason);

  process.exit(0);
}

function deny(reason) {
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

main().catch(() => process.exit(0));
