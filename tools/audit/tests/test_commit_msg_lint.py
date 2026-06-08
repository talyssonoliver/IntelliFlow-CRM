"""
Tests for the --message-file mode of tools/audit/commit_msg_lint.py.

This mode is what the .husky/commit-msg hook calls to validate a single pending
commit message, and it shares _lint_message() with the range/count modes the
pre-ship gate and CI system-audit use. Covering it here guarantees the
local hook and the CI gate can't diverge on the rules (the drift that let an
upper-case subject pass locally and red in CI — #340).
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "commit_msg_lint.py"


def _lint(message: str) -> tuple[int, str]:
    """Run the linter in --message-file mode on *message*; return (code, output)."""
    with tempfile.NamedTemporaryFile(
        "w", suffix=".txt", delete=False, encoding="utf-8"
    ) as f:
        f.write(message)
        path = f.name
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), "--message-file", path],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return proc.returncode, proc.stdout + proc.stderr


def test_valid_message_passes():
    code, _ = _lint("feat(api): add a perfectly fine subject line\n")
    assert code == 0


def test_upper_case_subject_fails():
    # The exact gap that let #340 through: subject starts with a capital letter.
    code, out = _lint("feat(ai-worker): OpenRouter fallback for resilience\n")
    assert code == 1
    assert "upper-case" in out


def test_subject_too_short_fails():
    code, _ = _lint("fix(api): a\n")
    assert code == 1


def test_subject_trailing_period_fails():
    code, _ = _lint("fix(api): resolve the flaky pool timeout.\n")
    assert code == 1


def test_long_body_line_fails():
    code, _ = _lint("fix(api): valid lowercase subject here\n\n" + "x" * 120 + "\n")
    assert code == 1


def test_ai_coauthor_trailer_fails():
    code, out = _lint(
        "fix(api): valid lowercase subject here\n\n"
        "Co-Authored-By: Claude <noreply@anthropic.com>\n"
    )
    assert code == 1


def test_unknown_type_fails():
    code, _ = _lint("wibble(api): not a real conventional type here\n")
    assert code == 1


def test_empty_message_fails():
    code, _ = _lint("\n\n")
    assert code == 1


def test_merge_commit_is_allowed():
    code, _ = _lint("Merge branch 'main' into feature/x\n")
    assert code == 0


def test_comment_and_scissors_lines_are_ignored():
    # git comment lines (`# …`) and the `--verbose` scissors diff must not be
    # linted — only the author's actual message.
    message = (
        "feat(api): add a perfectly fine subject line\n"
        "\n"
        "# this is a git comment and should be ignored\n"
        "a real body line that is fine\n"
        "# ------------------------ >8 ------------------------\n"
        "diff --git a/x b/x\n"
        "+" + "z" * 200 + "\n"  # an over-long diff line below the scissors
    )
    code, _ = _lint(message)
    assert code == 0
