#!/usr/bin/env python3
"""CLI adapter for plan governance tools."""

import sys
from pathlib import Path
from typing import Optional

import click

# Add src to path for development
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.adapters.csv_repository import CsvPlanRepository
from src.adapters.yaml_loader import YamlConfigLoader
from src.adapters.json_writer import JsonReportWriter
from src.application.lint_plan import LintPlanUseCase
from src.application.migrate_schema import MigrateSchemaUseCase


# Default paths relative to project root
DEFAULT_SPRINT_PLAN = "apps/project-tracker/docs/metrics/_global/Sprint_plan.csv"
DEFAULT_PLAN_OVERRIDES = "apps/project-tracker/docs/metrics/plan-overrides.yaml"
DEFAULT_VALIDATION_RULES = "apps/project-tracker/docs/metrics/validation.yaml"
DEFAULT_REVIEW_QUEUE = "apps/project-tracker/docs/metrics/review-queue.json"
DEFAULT_LINT_REPORT = "artifacts/reports/plan-lint-report.json"


def find_project_root() -> Path:
    """Find project root by looking for CLAUDE.md or package.json."""
    current = Path.cwd()
    for parent in [current] + list(current.parents):
        if (parent / "CLAUDE.md").exists() or (parent / "package.json").exists():
            return parent
    return current


@click.group()
@click.version_option(version="1.0.0", prog_name="plan-tools")
def cli() -> None:
    """IntelliFlow Plan Governance Tools."""
    pass


@cli.command("lint")
@click.option(
    "--sprint", "-s",
    type=int,
    default=0,
    help="Sprint number to lint (default: 0)",
)
@click.option(
    "--all-sprints", "-a",
    is_flag=True,
    help="Lint all sprints (not just scoped sprint)",
)
@click.option(
    "--verbose", "-v",
    is_flag=True,
    help="Verbose output",
)
@click.option(
    "--json", "-j",
    is_flag=True,
    help="Output as JSON",
)
@click.option(
    "--plan-path",
    type=click.Path(exists=True),
    help="Path to Sprint_plan.csv",
)
@click.option(
    "--overrides-path",
    type=click.Path(),
    help="Path to plan-overrides.yaml",
)
def lint(
    sprint: int,
    all_sprints: bool,
    verbose: bool,
    json: bool,
    plan_path: Optional[str],
    overrides_path: Optional[str],
) -> None:
    """Lint the sprint plan for structural issues."""
    root = find_project_root()

    # Resolve paths
    csv_path = Path(plan_path) if plan_path else root / DEFAULT_SPRINT_PLAN
    overrides_file = Path(overrides_path) if overrides_path else root / DEFAULT_PLAN_OVERRIDES
    validation_file = root / DEFAULT_VALIDATION_RULES
    report_path = root / DEFAULT_LINT_REPORT
    queue_path = root / DEFAULT_REVIEW_QUEUE

    if not csv_path.exists():
        click.echo(f"Error: Sprint plan not found at {csv_path}", err=True)
        sys.exit(2)

    click.echo("=" * 50)
    click.echo("Plan Linter v1.0.0 (Python)")
    click.echo("=" * 50)
    click.echo()

    # Load data
    repo = CsvPlanRepository(csv_path)
    yaml_loader = YamlConfigLoader()
    json_writer = JsonReportWriter()

    tasks = repo.load_tasks()
    click.echo(f"Loaded {len(tasks)} tasks from {csv_path.name}")

    overrides = yaml_loader.load_overrides(overrides_file)
    if overrides:
        click.echo(f"Loaded {len(overrides)} overrides from {overrides_file.name}")

    validation = yaml_loader.load_validation_rules(validation_file)
    if validation:
        click.echo(f"Loaded validation rules from {validation_file.name}")

    linter_config = yaml_loader.load_linter_config(overrides_file)
    fanout_threshold = linter_config.get("fanout_threshold", 3)
    if fanout_threshold != 3:
        click.echo(f"Using fanout_threshold: {fanout_threshold}")

    # Filter to sprint scope
    sprint_scope = None if all_sprints else sprint
    if sprint_scope is not None:
        scoped_count = len([t for t in tasks if t.sprint == sprint_scope])
        click.echo(f"\nFiltering to Sprint {sprint_scope}: {scoped_count} tasks")

    # Run linter
    click.echo("\nRunning hard rules...")
    use_case = LintPlanUseCase(
        tasks=tasks,
        overrides=overrides,
        validation_rules=validation,
        sprint_scope=sprint_scope,
        project_root=str(root),  # For artifact validation
        fanout_threshold=fanout_threshold,
    )
    result = use_case.execute()

    click.echo("Running soft rules...")
    click.echo("Generating review queue...")

    # Output results
    click.echo()
    click.echo("=" * 50)
    click.echo("RESULTS")
    click.echo("=" * 50)
    click.echo()

    summary = result.summary
    click.echo(f"Total tasks (Sprint {sprint_scope or 'all'}): {summary['total_tasks']}")
    tier_breakdown = summary.get('tier_breakdown', {})
    click.echo(f"Tier breakdown: A={tier_breakdown.get('A', 0)}, B={tier_breakdown.get('B', 0)}, C={tier_breakdown.get('C', 0)}")

    coverage = summary.get('validation_coverage', {})
    click.echo(f"Validation coverage: {coverage.get('coverage_percentage', 0)}%")
    click.echo()
    click.echo(f"Errors: {len(result.errors)}")
    click.echo(f"Warnings: {len(result.warnings)}")
    click.echo(f"Review queue items: {len(result.review_queue)}")

    if result.errors:
        click.echo()
        click.echo("--- ERRORS ---")
        for e in result.errors:
            click.echo(f"  [{e.rule_id}] {e.message}")
            if verbose:
                click.echo(f"    Fix: {e.fix_suggestion}")

    if verbose and result.warnings:
        click.echo()
        click.echo("--- WARNINGS ---")
        for w in result.warnings:
            click.echo(f"  [{w.rule_id}] {w.message}")

    # Write reports
    json_writer.write_lint_report(
        report_path,
        summary=result.summary,
        errors=[_result_to_dict(e) for e in result.errors],
        warnings=[_result_to_dict(w) for w in result.warnings],
        review_queue=result.review_queue,
        sprint_scope=sprint_scope or "all",
    )
    click.echo(f"\nLint report written to {report_path}")

    json_writer.write_review_queue(
        queue_path,
        items=result.review_queue,
        sprint_scope=sprint_scope or "all",
    )
    click.echo(f"Review queue written to {queue_path}")

    # Exit code
    if result.has_errors():
        click.echo()
        click.echo("[FAILED] Hard rule violations detected")
        sys.exit(1)

    click.echo()
    click.echo("[PASSED] No hard rule violations")
    sys.exit(0)


@cli.command("migrate")
@click.option(
    "--dry-run", "-n",
    is_flag=True,
    help="Show what would be done without making changes",
)
@click.option(
    "--plan-path",
    type=click.Path(exists=True),
    help="Path to Sprint_plan.csv",
)
def migrate(dry_run: bool, plan_path: Optional[str]) -> None:
    """Migrate CSV schema to v2 (add governance columns)."""
    root = find_project_root()
    csv_path = Path(plan_path) if plan_path else root / DEFAULT_SPRINT_PLAN

    if not csv_path.exists():
        click.echo(f"Error: Sprint plan not found at {csv_path}", err=True)
        sys.exit(2)

    click.echo("=" * 50)
    click.echo("Schema Migration Tool v1.0.0")
    click.echo("=" * 50)
    click.echo()

    repo = CsvPlanRepository(csv_path)
    use_case = MigrateSchemaUseCase(repo)

    result = use_case.execute(dry_run=dry_run)

    if result["columns_added"]:
        click.echo(f"Columns to add: {', '.join(result['columns_added'])}")
        click.echo(f"Rows affected: {result['rows_updated']}")
        if result["backup_path"]:
            click.echo(f"Backup created: {result['backup_path']}")
    else:
        click.echo("No migration needed - schema already at v2")

    click.echo()
    click.echo(result["message"])


@cli.command("digest")
@click.option(
    "--sprint", "-s",
    type=int,
    default=0,
    help="Sprint number (default: 0)",
)
@click.option(
    "--output", "-o",
    type=click.Path(),
    help="Output path for digest",
)
def digest(sprint: int, output: Optional[str]) -> None:
    """Generate daily digest report."""
    root = find_project_root()
    csv_path = root / DEFAULT_SPRINT_PLAN
    overrides_file = root / DEFAULT_PLAN_OVERRIDES
    output_path = Path(output) if output else root / "artifacts" / "reports" / "daily-digest.json"

    if not csv_path.exists():
        click.echo(f"Error: Sprint plan not found at {csv_path}", err=True)
        sys.exit(2)

    click.echo("Generating daily digest...")

    repo = CsvPlanRepository(csv_path)
    yaml_loader = YamlConfigLoader()
    json_writer = JsonReportWriter()

    tasks = repo.load_tasks()
    overrides = yaml_loader.load_overrides(overrides_file)

    # Count by status
    from collections import Counter
    from src.domain.task import TaskStatus

    scoped_tasks = [t for t in tasks if t.sprint == sprint]
    status_counts = Counter(t.status for t in scoped_tasks)

    digest_data = {
        "sprint": sprint,
        "generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "buckets": {
            "ready": status_counts.get(TaskStatus.PLANNED, 0),
            "running": status_counts.get(TaskStatus.IN_PROGRESS, 0),
            "blocked": status_counts.get(TaskStatus.BLOCKED, 0),
            "validating": status_counts.get(TaskStatus.VALIDATING, 0),
            "completed": status_counts.get(TaskStatus.COMPLETED, 0),
            "failed": status_counts.get(TaskStatus.FAILED, 0),
        },
        "total_tasks": len(scoped_tasks),
    }

    json_writer.write_daily_digest(output_path, digest_data)
    click.echo(f"Digest written to {output_path}")

    # Print summary
    click.echo()
    click.echo(f"Sprint {sprint} Summary:")
    for bucket, count in digest_data["buckets"].items():
        click.echo(f"  {bucket.capitalize()}: {count}")


def _result_to_dict(result) -> dict:
    """Convert ValidationResult to dict for JSON serialization."""
    return {
        "rule": result.rule_id,
        "severity": result.severity.value,
        "message": result.message,
        "tasks": list(result.tasks),
        "fix": result.fix_suggestion,
        "priority": result.priority,
    }


# Entry points
def lint_cli() -> None:
    """Entry point for plan-lint command."""
    cli(["lint"] + sys.argv[1:])


def migrate_cli() -> None:
    """Entry point for plan-migrate command."""
    cli(["migrate"] + sys.argv[1:])


def digest_cli() -> None:
    """Entry point for plan-digest command."""
    cli(["digest"] + sys.argv[1:])


if __name__ == "__main__":
    cli()
