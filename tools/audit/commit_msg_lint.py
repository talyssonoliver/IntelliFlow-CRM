#!/usr/bin/env python3
"""
Deterministic commit-message linter for the system-audit framework.

Validates the last N commit messages against the Conventional Commits spec
as configured in tools/scripts/commitlint.config.js:

  <type>(<scope>): <subject>

Rules enforced (mirrors commitlint.config.js):
  - type  : must be one of the allowed types, lower-case, non-empty
  - scope : if present, must be lower-case (warning-only, not blocking)
  - subject: non-empty, not starting with an upper-case letter or PascalCase,
             length between 10 and 100 characters, no trailing period
  - header : total header length <= 100 characters (soft warn)
  - body lines <= 100 characters
  - footer lines <= 100 characters

Commits whose full SHA prefix appears in
``tools/audit/waivers/commitlint-waivers.txt`` are skipped.

Exit codes:
  0  all commits pass (or all failures are waived)
  1  one or more commits violate the rules
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[2]
WAIVERS_PATH = REPO_ROOT / "tools" / "audit" / "waivers" / "commitlint-waivers.txt"

ALLOWED_TYPES = frozenset(
    [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
    ]
)

# Matches: type(scope): subject   OR   type: subject   OR   type(scope1)(scope2): subject
# Dependabot emits `chore(ci)(deps): bump foo` style headers with two scope
# groups (one from .github/dependabot.yml `commit-message.prefix`, one from
# Dependabot's own ecosystem marker). Accept up to 3 chained scopes; only
# the first is captured for downstream validation (lower-case check etc.).
_HEADER_RE = re.compile(
    r"^([a-z][a-z0-9-]*)(?:\(([^)]+)\))?(?:\([^)]+\)){0,2}!?:\s*(.+)$"
)

# Upper-case first char, PascalCase, ALL-CAPS (START-CASE covers multi-word Caps)
_BAD_SUBJECT_CASE_RE = re.compile(r"^[A-Z]")

# AI-coauthor trailers: repo policy is that AI assistance is a tool, not a
# co-author. Catches the canonical patterns emitted by Claude, Copilot, etc.
_AI_COAUTHOR_RE = re.compile(
    r"(?:Co-Authored-By|Co-authored-by):\s*(?:Claude|GitHub Copilot|Cursor)"
    r"|noreply@anthropic\.com"
    r"|🤖\s*Generated with .*Claude",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Waiver loading
# ---------------------------------------------------------------------------


def _load_waivers(path: Path) -> set[str]:
    """Return the set of (lower-cased) waived commit SHA prefixes."""
    waivers: set[str] = set()
    if not path.exists():
        return waivers
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        # First whitespace-delimited token is the SHA prefix
        sha = line.split()[0].lower()
        if sha:
            waivers.add(sha)
    return waivers


def _is_waived(full_sha: str, waivers: set[str]) -> bool:
    full_lower = full_sha.lower()
    return any(full_lower.startswith(w) for w in waivers)


# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------


def _messages_for_shas(shas: list[str]) -> list[tuple[str, str, str]]:
    """
    Return (full_sha, raw_commit_message, author_email) for each SHA.

    Strategy: retrieve each body individually.  This avoids NUL-separator
    issues on Windows when embedding NUL in a format string passed through
    the shell.
    """
    commits: list[tuple[str, str, str]] = []
    for sha in shas:
        msg_result = subprocess.run(
            ["git", "log", "-1", "--format=%B%x00%ae", sha],
            capture_output=True,
            text=True,
            cwd=str(REPO_ROOT),
        )
        if msg_result.returncode != 0:
            print(
                f"[commitlint] WARN  could not read message for {sha[:12]}: "
                f"{msg_result.stderr.strip()}",
                file=sys.stderr,
            )
            continue
        # %B%x00%ae produces: <body>\0<email>. Split on the NUL byte.
        payload = msg_result.stdout.rstrip("\n")
        if "\0" in payload:
            body, author_email = payload.rsplit("\0", 1)
        else:
            body, author_email = payload, ""
        commits.append((sha, body.strip(), author_email.strip()))

    return commits


def _git_log(count: int) -> list[tuple[str, str, str]]:
    """Return (sha, message, author_email) for the last *count* commits."""
    sha_result = subprocess.run(
        ["git", "log", f"-{count}", "--format=%H"],
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
    )
    if sha_result.returncode != 0:
        print(f"[commitlint] ERROR: git log failed: {sha_result.stderr.strip()}", file=sys.stderr)
        sys.exit(1)

    shas = [line.strip() for line in sha_result.stdout.splitlines() if line.strip()]
    return _messages_for_shas(shas)


def _git_log_range(base_ref: str) -> list[tuple[str, str, str]] | None:
    """
    Return (sha, message, author_email) for the commits in ``base_ref..HEAD``
    — i.e. exactly the commits this branch adds on top of *base_ref*.

    Returns ``None`` (not an empty list) when *base_ref* can't be resolved
    locally — e.g. ``origin/main`` isn't fetched in a shallow/fresh worktree —
    so the caller can degrade to advisory instead of false-failing the gate.
    """
    rev_result = subprocess.run(
        ["git", "rev-list", f"{base_ref}..HEAD"],
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
    )
    if rev_result.returncode != 0:
        return None
    shas = [line.strip() for line in rev_result.stdout.splitlines() if line.strip()]
    return _messages_for_shas(shas)


def _read_message_file(path: str) -> str:
    """
    Read a pending commit-message file (the path git passes to the commit-msg
    hook as ``$1``). Strips git comment lines (``#`` …) and the ``--verbose``
    scissors diff section so only the author's message is linted.
    """
    kept: list[str] = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if line.startswith("#") and ">8" in line:
            break  # scissors marker — everything below is the verbose diff
        if line.startswith("#"):
            continue
        kept.append(line)
    return "\n".join(kept).strip()


# Bot authors whose commits we don't gate. They use their own commit-message
# conventions (often with very long bodies listing version bumps) that we
# don't control. The bot-author check is sufficient auth signal.
_BOT_AUTHORS = frozenset(
    {
        "49699333+dependabot[bot]@users.noreply.github.com",  # Dependabot
        "support@github.com",  # Dependabot signed-off-by
        "noreply@github.com",  # GitHub web UI / merges
    }
)


def _is_bot_author(author_email: str) -> bool:
    """True if the commit was authored by a known bot we don't gate."""
    if not author_email:
        return False
    email = author_email.lower()
    if email in _BOT_AUTHORS:
        return True
    # Catch-all for `*[bot]@users.noreply.github.com` shape
    return email.endswith("[bot]@users.noreply.github.com")


# ---------------------------------------------------------------------------
# Lint logic
# ---------------------------------------------------------------------------


def _lint_message(sha: str, raw_msg: str) -> list[str]:
    """
    Return a list of violation strings (empty list = pass).
    """
    lines = raw_msg.splitlines()
    if not lines:
        return [f"{sha[:12]}: commit message is empty"]

    header = lines[0].rstrip()
    body_lines = lines[1:] if len(lines) > 1 else []

    violations: list[str] = []

    # ---- Header parse ----
    match = _HEADER_RE.match(header)
    if not match:
        # Could be a merge commit — allow "Merge …" subjects silently
        if header.startswith("Merge ") or header.startswith("Revert "):
            return []
        violations.append(
            f"{sha[:12]}: header does not match '<type>(<scope>): <subject>' — got: {header!r}"
        )
        return violations  # No point continuing if we can't parse

    commit_type, scope, subject = match.group(1), match.group(2), match.group(3)

    # ---- Type ----
    if commit_type not in ALLOWED_TYPES:
        violations.append(
            f"{sha[:12]}: type {commit_type!r} is not in the allowed set "
            f"({', '.join(sorted(ALLOWED_TYPES))})"
        )

    # ---- Scope case (warning only — mirrors scope-enum rule level=1) ----
    if scope is not None and scope != scope.lower():
        # Emit as info, not a blocking violation
        print(f"[commitlint] WARN  {sha[:12]}: scope {scope!r} should be lower-case", file=sys.stderr)

    # ---- Subject ----
    if not subject:
        violations.append(f"{sha[:12]}: subject is empty")
    else:
        sub_len = len(subject)
        if sub_len < 10:
            violations.append(
                f"{sha[:12]}: subject too short ({sub_len} chars, min 10): {subject!r}"
            )
        if sub_len > 100:
            violations.append(
                f"{sha[:12]}: subject too long ({sub_len} chars, max 100): {subject[:40]!r}…"
            )
        if subject.endswith("."):
            violations.append(f"{sha[:12]}: subject must not end with a period: {subject!r}")
        if _BAD_SUBJECT_CASE_RE.match(subject):
            violations.append(
                f"{sha[:12]}: subject must not start with an upper-case letter: {subject!r}"
            )

    # ---- Header length ----
    if len(header) > 100:
        violations.append(
            f"{sha[:12]}: header line too long ({len(header)} chars, max 100): {header[:60]!r}…"
        )

    # ---- Body / footer line length ----
    # Skip the blank line that separates header from body
    for i, line in enumerate(body_lines, start=2):
        if len(line) > 100:
            violations.append(
                f"{sha[:12]}: line {i} too long ({len(line)} chars, max 100): {line[:60]!r}…"
            )

    # ---- AI-coauthor trailer policy ----
    # Repo policy: AI assistance is a tool, not a co-author. Reject any commit
    # whose message body carries a Claude / Copilot / Cursor coauthor trailer
    # or the "Generated with Claude" robot-emoji line.
    for i, line in enumerate(body_lines, start=2):
        if _AI_COAUTHOR_RE.search(line):
            violations.append(
                f"{sha[:12]}: line {i} contains an AI-coauthor trailer (repo policy "
                f"forbids these): {line.strip()!r}"
            )

    return violations


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    # Commit messages legitimately contain non-ASCII (em-dashes, arrows like
    # ⇄, accented names). On Windows the console defaults to cp1252, so printing
    # an offending subject would crash with UnicodeEncodeError — which, in the
    # commit-msg hook, would itself abort the commit for the wrong reason. Force
    # UTF-8 (replace on the rare un-encodable byte) so output never crashes.
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass  # pytest capture / already-wrapped streams: leave as-is

    parser = argparse.ArgumentParser(
        description="Lint commit messages against the Conventional Commits spec."
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--count",
        type=int,
        default=20,
        help="Lint the last N commits reachable from HEAD (default: 20).",
    )
    mode.add_argument(
        "--base-ref",
        help=(
            "Lint the commits in <base-ref>..HEAD (the commits this branch "
            "adds — used by pre-ship/pre-push). Degrades to advisory if "
            "<base-ref> can't be resolved locally."
        ),
    )
    mode.add_argument(
        "--base-ref-env",
        metavar="ENV_VAR",
        help=(
            "Like --base-ref, but read the base ref from the named environment "
            "variable (e.g. BASE_REF, which CI's system-audit exports as "
            "origin/<base>). Used by audit-matrix.yml so CI lints only the PR's "
            "commits, not main's history. Advisory when the env var is unset/empty."
        ),
    )
    mode.add_argument(
        "--message-file",
        help=(
            "Lint a single pending commit-message file (the path git passes "
            "to the commit-msg hook). Bypasses waiver/bot handling."
        ),
    )
    args = parser.parse_args(argv)

    # --- Single pending message (the commit-msg hook) --------------------
    # Catches violations at commit time, before they're even committed.
    if args.message_file:
        msg = _read_message_file(args.message_file)
        if not msg:
            print("[commitlint] FAIL  commit message is empty", file=sys.stderr)
            return 1
        violations = _lint_message("pending", msg)
        if violations:
            for v in violations:
                print(f"[commitlint] FAIL  {v}")
            print(
                f"\n[commitlint] {len(violations)} violation(s) — fix the commit message.",
                file=sys.stderr,
            )
            return 1
        print(f"[commitlint] PASS  {msg.splitlines()[0][:72]}")
        return 0

    waivers = _load_waivers(WAIVERS_PATH)

    # --base-ref-env: read the base ref from a named env var (CI / audit-matrix
    # exports BASE_REF=origin/<base>). Unset/empty -> advisory (non-PR run).
    base_ref = args.base_ref
    if args.base_ref_env:
        base_ref = (os.environ.get(args.base_ref_env) or "").strip()
        if not base_ref:
            print(
                f"[commitlint] env {args.base_ref_env} unset/empty — skipping "
                "(advisory; non-PR run or no base ref)."
            )
            return 0

    # --- Range mode (pre-ship/pre-push/CI): <base-ref>..HEAD ------------
    if base_ref:
        commits = _git_log_range(base_ref)
        if commits is None:
            print(
                f"[commitlint] base ref {base_ref!r} not resolvable "
                "locally — skipping (advisory; CI's system-audit still gates)."
            )
            return 0
    else:
        commits = _git_log(args.count)

    if not commits:
        print("[commitlint] No commits found — nothing to lint.")
        return 0

    total = len(commits)
    waived_count = 0
    passed_count = 0
    failed_count = 0
    all_violations: list[str] = []

    for sha, msg, author_email in commits:
        if _is_waived(sha, waivers):
            print(f"[commitlint] WAIVE {sha[:12]}  (in waivers file)")
            waived_count += 1
            continue

        if _is_bot_author(author_email):
            # Bots (Dependabot, Renovate, etc.) use their own commit-message
            # conventions we don't gate. Author identity is the auth signal.
            print(f"[commitlint] SKIP  {sha[:12]}  bot author={author_email}")
            waived_count += 1
            continue

        violations = _lint_message(sha, msg)
        if violations:
            for v in violations:
                print(f"[commitlint] FAIL  {v}")
                all_violations.append(v)
            failed_count += 1
        else:
            subject_line = msg.splitlines()[0] if msg.splitlines() else ""
            print(f"[commitlint] PASS  {sha[:12]}  {subject_line[:72]}")
            passed_count += 1

    print(
        f"\n[commitlint] checked={total} passed={passed_count} "
        f"waived={waived_count} failed={failed_count}"
    )

    if failed_count > 0:
        print(f"[commitlint] {failed_count} violation(s) found — see above.", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
