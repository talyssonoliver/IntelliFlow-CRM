"""Integration tests for CLI commands."""

import json
import os
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Generator

import pytest


@pytest.fixture
def temp_project() -> Generator[Path, None, None]:
    """Create a temporary project structure for testing."""
    with TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)

        # Create marker file
        (root / "CLAUDE.md").touch()

        # Create metrics directory structure
        metrics_dir = root / "apps" / "project-tracker" / "docs" / "metrics"
        global_dir = metrics_dir / "_global"
        global_dir.mkdir(parents=True)

        # Create artifacts directory
        (root / "artifacts" / "reports").mkdir(parents=True)

        yield root


@pytest.fixture
def sample_csv(temp_project: Path) -> Path:
    """Create a sample Sprint_plan.csv for testing."""
    csv_path = temp_project / "apps" / "project-tracker" / "docs" / "metrics" / "_global" / "Sprint_plan.csv"

    # Use Tier C for all tasks to avoid Tier A validation requirements in basic tests
    csv_content = """Task ID,Section,Description,Owner,Dependencies,Status,Target Sprint,Tier
TASK-001,Foundation,Setup project,Team,,Planned,0,C
TASK-002,Foundation,Add database,Team,TASK-001,Planned,0,C
TASK-003,Core,Implement feature,Team,TASK-002,Planned,0,C
TASK-004,Core,Add tests,Team,TASK-003,Planned,0,C
"""
    csv_path.write_text(csv_content)
    return csv_path


@pytest.fixture
def csv_with_cycle(temp_project: Path) -> Path:
    """Create a CSV with a dependency cycle."""
    csv_path = temp_project / "apps" / "project-tracker" / "docs" / "metrics" / "_global" / "Sprint_plan.csv"

    # Use Tier C for all tasks - cycle detection is independent of tier
    csv_content = """Task ID,Section,Description,Owner,Dependencies,Status,Target Sprint,Tier
TASK-001,Foundation,Task A,Team,TASK-002,Planned,0,C
TASK-002,Foundation,Task B,Team,TASK-001,Planned,0,C
TASK-003,Core,Task C,Team,,Planned,0,C
"""
    csv_path.write_text(csv_content)
    return csv_path


def get_cli_path() -> Path:
    """Get path to CLI module."""
    return Path(__file__).parent.parent.parent / "src" / "adapters" / "cli.py"


def run_cli(args: list[str], cwd: Path) -> subprocess.CompletedProcess:
    """Run the CLI command and return result."""
    cmd = [sys.executable, str(get_cli_path())] + args
    return subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONPATH": str(Path(__file__).parent.parent.parent / "src")},
    )


class TestLintCommand:
    """Integration tests for the lint command."""

    def test_lint_clean_plan_passes(self, temp_project: Path, sample_csv: Path) -> None:
        """Lint should pass for a clean plan."""
        result = run_cli(["lint", "--sprint", "0"], cwd=temp_project)

        # Should exit with 0 (no hard errors)
        assert result.returncode == 0, f"stderr: {result.stderr}\nstdout: {result.stdout}"
        assert "[PASSED]" in result.stdout

    def test_lint_detects_cycle(self, temp_project: Path, csv_with_cycle: Path) -> None:
        """Lint should fail when cycle is detected."""
        result = run_cli(["lint", "--sprint", "0"], cwd=temp_project)

        # Should exit with 1 (hard error)
        assert result.returncode == 1, f"stdout: {result.stdout}"
        assert "[FAILED]" in result.stdout
        assert "cycle" in result.stdout.lower() or "CYCLE" in result.stdout

    def test_lint_verbose_shows_fix_suggestions(self, temp_project: Path, csv_with_cycle: Path) -> None:
        """Verbose mode should show fix suggestions."""
        result = run_cli(["lint", "--sprint", "0", "--verbose"], cwd=temp_project)

        assert result.returncode == 1
        # Verbose should have more detailed output
        assert "Errors:" in result.stdout

    def test_lint_creates_report_file(self, temp_project: Path, sample_csv: Path) -> None:
        """Lint should create a JSON report file."""
        result = run_cli(["lint", "--sprint", "0"], cwd=temp_project)

        assert result.returncode == 0

        report_path = temp_project / "artifacts" / "reports" / "plan-lint-report.json"
        assert report_path.exists(), f"Report not created. stdout: {result.stdout}"

        with open(report_path) as f:
            report = json.load(f)

        assert "meta" in report
        assert "summary" in report
        assert "errors" in report
        assert "warnings" in report

    def test_lint_creates_review_queue(self, temp_project: Path, sample_csv: Path) -> None:
        """Lint should create a review queue file."""
        result = run_cli(["lint", "--sprint", "0"], cwd=temp_project)

        assert result.returncode == 0

        queue_path = temp_project / "apps" / "project-tracker" / "docs" / "metrics" / "review-queue.json"
        assert queue_path.exists()

        with open(queue_path) as f:
            queue = json.load(f)

        assert "meta" in queue
        assert "items" in queue

    def test_lint_with_custom_plan_path(self, temp_project: Path) -> None:
        """Lint should accept custom plan path."""
        custom_path = temp_project / "custom" / "plan.csv"
        custom_path.parent.mkdir(parents=True)

        csv_content = """Task ID,Section,Description,Owner,Dependencies,Status,Target Sprint,Tier
TASK-001,Test,Test task,Team,,Planned,0,C
"""
        custom_path.write_text(csv_content)

        result = run_cli(["lint", "--plan-path", str(custom_path)], cwd=temp_project)

        assert result.returncode == 0
        assert "Loaded 1 tasks" in result.stdout


class TestMigrateCommand:
    """Integration tests for the migrate command."""

    def test_migrate_dry_run(self, temp_project: Path, sample_csv: Path) -> None:
        """Dry run should not modify the file."""
        original_content = sample_csv.read_text()

        result = run_cli(["migrate", "--dry-run"], cwd=temp_project)

        assert result.returncode == 0
        assert "DRY RUN" in result.stdout or "no migration needed" in result.stdout.lower()

        # File should be unchanged
        assert sample_csv.read_text() == original_content

    def test_migrate_adds_columns(self, temp_project: Path) -> None:
        """Migrate should add missing columns."""
        # Create CSV without governance columns
        csv_path = temp_project / "apps" / "project-tracker" / "docs" / "metrics" / "_global" / "Sprint_plan.csv"

        minimal_csv = """Task ID,Section,Description,Owner,Dependencies,Status,Target Sprint
TASK-001,Foundation,Setup,Team,,Planned,0
"""
        csv_path.write_text(minimal_csv)

        result = run_cli(["migrate"], cwd=temp_project)

        assert result.returncode == 0

        # Check columns were added
        new_content = csv_path.read_text()
        assert "Tier" in new_content or "already at v2" in result.stdout


class TestDigestCommand:
    """Integration tests for the digest command."""

    def test_digest_generates_json(self, temp_project: Path, sample_csv: Path) -> None:
        """Digest should generate a JSON file."""
        result = run_cli(["digest", "--sprint", "0"], cwd=temp_project)

        assert result.returncode == 0

        digest_path = temp_project / "artifacts" / "reports" / "daily-digest.json"
        assert digest_path.exists()

        with open(digest_path) as f:
            digest = json.load(f)

        assert "sprint" in digest
        assert digest["sprint"] == 0
        assert "buckets" in digest
        assert "total_tasks" in digest

    def test_digest_with_custom_output(self, temp_project: Path, sample_csv: Path) -> None:
        """Digest should accept custom output path."""
        output_path = temp_project / "custom-digest.json"

        result = run_cli(["digest", "--sprint", "0", "--output", str(output_path)], cwd=temp_project)

        assert result.returncode == 0
        assert output_path.exists()


class TestVersionOption:
    """Test version output."""

    def test_version_flag(self, temp_project: Path) -> None:
        """--version should show version info."""
        result = run_cli(["--version"], cwd=temp_project)

        assert result.returncode == 0
        assert "1.0.0" in result.stdout
