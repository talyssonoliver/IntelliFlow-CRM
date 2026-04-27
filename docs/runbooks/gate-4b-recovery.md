# Gate 4b — Worktree Landed: Recovery Runbook

## What this gate checks

Gate 4b ("Worktree Landed") verifies that an agent's work has actually been
persisted to the shared remote before the task is stamped `COMPLETE`. It
requires three things to be true simultaneously: the worktree's working tree
must be clean (no uncommitted edits), the current branch must have at least one
commit beyond `origin/master`, and that branch must have been pushed to the
remote so that `origin/agent/<TASK_ID>` resolves. This gate exists to prevent
the IFC-227 / PG-053 / PG-054 class of orphan bug, where a task was marked
`verdict: COMPLETE` against worktree-only state and the implementation was never
visible outside the agent's private working directory. Without this gate, a
session crash, worktree removal, or pool slot reclaim silently erases all work.

## How to recognize a Gate 4b BLOCK

The gate emits one of three error message prefixes depending on which check
failed:

```text
[Gate 4b] BLOCK: Worktree has uncommitted edits.

[Gate 4b] BLOCK: Worktree branch has no commits beyond origin/master.
Commit your work and push to `agent/<TASK_ID>` before stamping COMPLETE.

[Gate 4b] BLOCK: Branch has not been pushed. Remote ref
`origin/agent/<TASK_ID>` is unknown or behind local HEAD.
```

## Cause 1 — Uncommitted edits

**Diagnosis.** Run `git status` inside the worktree slot. If the output is
non-empty (modified, added, or deleted files listed), the gate will BLOCK.

```bash
git -C .claude/worktrees/agent-a76bbd49ac8f0151e status
```

**Recovery.** Stage and commit all work using a HEREDOC commit message to match
the repo convention. Substitute `<TASK_ID>` with the real task ID (e.g.,
`IFC-227`) and `<slug>` with a one-line description:

```bash
git -C .claude/worktrees/agent-a76bbd49ac8f0151e add apps/ packages/ docs/ tools/

git -C .claude/worktrees/agent-a76bbd49ac8f0151e commit -m "$(cat <<'EOF'
feat(IFC-227): implement worktree-landed gate

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

After committing, verify the working tree is clean:

```bash
git -C .claude/worktrees/agent-a76bbd49ac8f0151e status
# Expected: "nothing to commit, working tree clean"
```

Then proceed to push (see Cause 3 below if the branch has not been pushed yet).

## Cause 2 — Zero commits past master

**Diagnosis.** Run `git log` comparing the branch against `master`:

```bash
git -C .claude/worktrees/agent-a76bbd49ac8f0151e log master..HEAD --oneline
```

If this produces no output, the branch has no commits of its own — it is sitting
at exactly the same position as `master`.

**What this means.** Either the implementation was never written, or the edits
were reverted after being committed. The most common cause is the formatter
revert pattern documented in PG-126 (see
`memory/feedback_verify_edits_persisted.md`): some files (barrel `index.ts`,
`Sprint_plan.csv`, `container.ts`, `context.ts`, router files) are
asynchronously overwritten by an external formatter or pre-commit hook after an
`Edit` call succeeds, leaving the working tree with zero net changes and any
previously committed content identical to master.

**Recovery — implementation was never written.** Re-do the implementation
according to the task plan, then commit:

```bash
# After implementing:
git -C .claude/worktrees/agent-a76bbd49ac8f0151e add apps/ packages/ docs/ tools/

git -C .claude/worktrees/agent-a76bbd49ac8f0151e commit -m "$(cat <<'EOF'
feat(IFC-NNN): implement <task-slug>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

**Recovery — formatter revert (PG-126 pattern).** Before committing, re-grep
every file listed in the plan's "Files to Modify" section for the exact string
you expect to be present. Use `grep` or the Grep tool to confirm edits persisted
on disk. If a file was reverted, use `Write` instead of `Edit` — `Write`
bypasses the file-content cache that the formatter hooks against:

```bash
# Verify an edit actually landed before committing:
grep -n "expectedString" apps/api/src/container.ts
# If grep returns nothing, the edit was reverted — re-apply with Write tool.
```

After confirming all edits are present on disk, commit and push (Cause 3).

See `memory/feedback_verify_edits_persisted.md` for the full IFC-227 / PG-126
post-mortem and the write-tool guidance.

## Cause 3 — Branch not pushed

**Diagnosis.** Check whether the remote ref exists:

```bash
git -C .claude/worktrees/agent-a76bbd49ac8f0151e fetch --quiet

git rev-list HEAD..origin/agent/IFC-NNN 2>&1
# "unknown revision or path not in the working tree" = branch not pushed yet.
```

Alternatively, list remote agent branches:

```bash
git ls-remote origin 'refs/heads/agent/*'
# If agent/<TASK_ID> does not appear, the branch has not been pushed.
```

**Recovery.** Push the branch to the remote. Always use `--force-with-lease`,
never `--force`, to guard against overwriting remote commits you may not have
fetched:

```bash
git -C .claude/worktrees/agent-a76bbd49ac8f0151e push -u origin agent/IFC-NNN --force-with-lease
```

If the branch name in your worktree does not match the `agent/<TASK_ID>` pattern
(e.g., it was accidentally created as `feat/something`), the gate will also
BLOCK because Step 1.2 of the multi-agent plan requires the `agent/<TASK_ID>`
naming convention. Rename before pushing:

```bash
git -C .claude/worktrees/agent-a76bbd49ac8f0151e branch -m feat/something agent/IFC-NNN
git -C .claude/worktrees/agent-a76bbd49ac8f0151e push -u origin agent/IFC-NNN --force-with-lease
```

## Re-running the gate

Once the cause has been resolved (committed, pushed, clean working tree), re-run
the gate directly to confirm PASS before continuing the `/exec` workflow:

```bash
node tools/scripts/exec-preflight/check-worktree-landed.mjs IFC-NNN 6
```

Replace `IFC-NNN` with the actual task ID and `6` with the target sprint number
(read from the `Target Sprint` column in `Sprint_plan.csv` or the task's JSON
file). A passing run prints:

```text
[Gate 4b] PASS: Branch agent/IFC-NNN has N commit(s) beyond origin/master
and is pushed.
```

The gate is safe to re-run any number of times — it is read-only and makes no
mutations.

## Escalation

If the gate appears to be emitting a false BLOCK (you believe the branch is
committed and pushed but the gate still blocks), work through this checklist
before filing a bug:

**a) Verify `origin/master` is up to date.**

```bash
git fetch origin master
git log --oneline -3 origin/master
```

If `origin/master` is behind the canonical remote (e.g., another agent merged
work since your last fetch), the `rev-list` counts will be inflated. Fetch
always resolves this.

**b) Check whether `git-destructive-guard.mjs` silently blocked the push.**

The hook at `.claude/hooks/git-destructive-guard.mjs` blocks several push
patterns. If your push was intercepted, the hook exits with a message such as
`"[guard] BLOCKED: destructive git command detected"`. Review your terminal
history or check whether `origin/agent/<TASK_ID>` actually exists:

```bash
git ls-remote origin refs/heads/agent/IFC-NNN
```

If the ref is absent after you ran push, the push was blocked. Check the
destructive-guard allowlist;
`git push -u origin agent/<TASK_ID> --force-with-lease` to an `agent/*` branch
is permitted by the guard.

**c) Check for a worktree-vs-main-tree path mismatch (the IFC-227 root cause).**

Gate 4b runs `git status` and `git rev-list` against `process.cwd()`. If the
gate is invoked from the main working tree instead of the agent's worktree slot,
it checks the wrong directory and will always BLOCK (the main tree has no
`agent/IFC-NNN` commits). Verify you are running the gate from inside the
correct worktree:

```bash
pwd
# Must be something like .claude/worktrees/agent-<id>/
# or .claude/worktree-pool/slot-N/ — NOT the repo root.
```

If you are in the wrong directory, `cd` to the worktree slot and re-run the gate
from there.

**d) File a bug if reproducible.**

If the gate still produces a false BLOCK after the three checks above, append a
structured entry to the false-blocks log so the gate can be improved:

```bash
node -e "
const fs = require('fs');
const entry = {
  timestamp: new Date().toISOString(),
  task_id: 'IFC-NNN',
  sprint: 6,
  cwd: process.cwd(),
  gate_output: '<paste gate output here>',
  git_status: '<paste git status output>',
  git_log: '<paste git log master..HEAD --oneline output>',
  notes: '<describe what you tried>'
};
fs.appendFileSync(
  'artifacts/reports/gate-4b-false-blocks.jsonl',
  JSON.stringify(entry) + '\n'
);
console.log('Entry written.');
"
```

The file `artifacts/reports/gate-4b-false-blocks.jsonl` is append-only; each
line is a self-contained JSON object. The gate's maintainer reviews it during
the Wave 1 shake-out period.

## Related

- `docs/operations/runbooks/dlq-triage.md` — sibling runbook for DLQ triage
- `docs/operations/incident-runbook.md` — sibling incident runbook
- `docs/operations/runbooks/workflow-troubleshooting.md` — sibling workflow
  troubleshooting runbook
- `memory/feedback_verify_edits_persisted.md` — PG-126 / IFC-227 post-mortem:
  formatter reverts and the write-tool bypass
- `.claude/skills/exec/references/phase4-completion-gates.md` — full binary gate
  contract; Gate 4b is inserted between Gate 4 (STOA) and Gate 12 (Nav Wiring)
