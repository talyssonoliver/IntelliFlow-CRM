#!/usr/bin/env python
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


CONVENTIONAL_COMMIT_RE = re.compile(
    r"^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\([^)]+\))?: .{1,100}$"
)

# Waiver file location (relative to repo root)
WAIVER_FILE = "tools/audit/waivers/commitlint-waivers.txt"


def _load_waivers() -> set[str]:
    """Load SHA prefixes from waiver file. Lines starting with # are comments."""
    waivers: set[str] = set()
    # Find repo root
    try:
        repo_root = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True
        ).stdout.strip()
    except Exception:
        return waivers

    waiver_path = Path(repo_root) / WAIVER_FILE
    if not waiver_path.exists():
        return waivers

    for line in waiver_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            # Extract just the SHA (first token)
            sha = line.split()[0] if line.split() else ""
            if sha:
                waivers.add(sha[:12])  # Use first 12 chars for matching
    return waivers


@dataclass(frozen=True)
class CommitMessage:
    sha: str
    subject: str


def _run_git(args: list[str]) -> str:
    proc = subprocess.run(["git", *args], capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or f"git {' '.join(args)} failed")
    return proc.stdout


def _get_commit_subjects(commit_range: str) -> list[CommitMessage]:
    out = _run_git(["log", "--no-color", "--format=%H%x09%s", commit_range])
    commits: list[CommitMessage] = []
    for line in out.splitlines():
        if not line.strip():
            continue
        sha, subject = line.split("\t", 1)
        commits.append(CommitMessage(sha=sha.strip(), subject=subject.strip()))
    return commits


def _get_recent_commit_subjects(count: int) -> list[CommitMessage]:
    out = _run_git(["log", f"-n{count}", "--no-color", "--format=%H%x09%s"])
    commits: list[CommitMessage] = []
    for line in out.splitlines():
        if not line.strip():
            continue
        sha, subject = line.split("\t", 1)
        commits.append(CommitMessage(sha=sha.strip(), subject=subject.strip()))
    return commits


def lint_commits(commits: list[CommitMessage], waivers: set[str]) -> tuple[bool, list[str], int]:
    """Lint commits, returning (ok, errors, waived_count)."""
    errors: list[str] = []
    waived_count = 0

    for c in commits:
        subject = c.subject
        sha_prefix = c.sha[:12]

        # Check if this commit is waived
        if sha_prefix in waivers:
            waived_count += 1
            continue

        if subject.startswith("Merge "):
            continue
        if subject.startswith("Revert "):
            continue
        if subject.lower().startswith("initial commit"):
            continue
        if not CONVENTIONAL_COMMIT_RE.match(subject):
            errors.append(f"{sha_prefix}: {subject}")

    return (len(errors) == 0, errors, waived_count)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Conventional commit subject linter (repo-local).")
    parser.add_argument(
        "--range",
        dest="commit_range",
        default=None,
        help="Optional git revision range to validate (e.g. origin/main..HEAD).",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=20,
        help="Number of most recent commits to validate when --range is not provided (default: 20).",
    )
    args = parser.parse_args(argv)

    # Load waivers
    waivers = _load_waivers()

    try:
        if args.commit_range:
            try:
                commits = _get_commit_subjects(args.commit_range)
            except Exception as e:
                # Common local failure mode: early repo history (e.g. HEAD~20 doesn't exist)
                # or missing remote ref (e.g. origin/main not available).
                fallback_count = args.count
                m = re.match(r"^HEAD~(\d+)\.\.HEAD$", str(args.commit_range).strip())
                if m:
                    try:
                        fallback_count = int(m.group(1))
                    except Exception:
                        fallback_count = args.count
                try:
                    commits = _get_recent_commit_subjects(fallback_count)
                except Exception as e2:
                    print(f"ERROR: unable to read git history: {e2}", file=sys.stderr)
                    return 2
                print(
                    f"WARNING: unable to resolve commit range {args.commit_range!r} ({e}); "
                    f"fell back to last {fallback_count} commits",
                    file=sys.stderr,
                )
        else:
            commits = _get_recent_commit_subjects(args.count)
    except Exception as e:
        print(f"ERROR: unable to read git history: {e}", file=sys.stderr)
        return 2

    ok, errors, waived_count = lint_commits(commits, waivers)
    label = args.commit_range or f"last {args.count}"

    if ok:
        waiver_note = f", {waived_count} waived" if waived_count > 0 else ""
        print(f"OK: commit subjects valid for {label} ({len(commits)} commits checked{waiver_note})")
        return 0

    print(f"FAIL: invalid commit subjects for {label}:", file=sys.stderr)
    for err in errors:
        print(f"  - {err}", file=sys.stderr)
    print("", file=sys.stderr)
    print("Expected pattern:", file=sys.stderr)
    print("  type(scope?): description", file=sys.stderr)
    print("Valid types: feat, fix, docs, style, refactor, test, chore, perf, ci, build, revert", file=sys.stderr)
    if waivers:
        print(f"\nNote: {len(waivers)} commit(s) waived via {WAIVER_FILE}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
