"""MigrateSchema use case - adds schema v2 columns to CSV."""

from dataclasses import dataclass
from pathlib import Path

from ..adapters.csv_repository import CsvPlanRepository


@dataclass
class MigrateSchemaUseCase:
    """
    Use case for migrating CSV schema to v2.

    Adds new columns for governance metadata:
    - Tier (A/B/C)
    - Gate Profile
    - Evidence Required
    - Acceptance Criteria
    - etc.

    This is idempotent - running multiple times has no effect.
    """
    repository: CsvPlanRepository

    def execute(self, dry_run: bool = False) -> dict:
        """
        Execute schema migration.

        Returns:
            dict with:
            - columns_added: list of new columns
            - rows_updated: number of rows
            - backup_path: path to backup file (if not dry_run)
        """
        missing_columns = self.repository.get_missing_schema_v2_columns()

        if not missing_columns:
            return {
                "columns_added": [],
                "rows_updated": 0,
                "backup_path": None,
                "message": "Schema already at v2, no migration needed",
            }

        headers, rows = self.repository.load_raw_rows()

        # Add missing columns to headers
        new_headers = headers + missing_columns

        # Add default values to each row
        for row in rows:
            for col in missing_columns:
                row[col] = CsvPlanRepository.SCHEMA_V2_DEFAULTS.get(col, "")

        if dry_run:
            return {
                "columns_added": missing_columns,
                "rows_updated": len(rows),
                "backup_path": None,
                "message": f"DRY RUN: Would add {len(missing_columns)} columns to {len(rows)} rows",
            }

        # Save with backup
        self.repository.save_with_new_columns(new_headers, rows, backup=True)
        backup_path = self.repository.file_path.with_suffix(".csv.bak")

        return {
            "columns_added": missing_columns,
            "rows_updated": len(rows),
            "backup_path": str(backup_path),
            "message": f"Added {len(missing_columns)} columns to {len(rows)} rows",
        }

    def compute_tier_defaults(self, rows: list[dict]) -> None:
        """
        Compute default tier values based on task properties.

        Rules:
        - Root tasks (no dependencies): Tier A
        - Security tasks (EXC-SEC-*): Tier A
        - Foundation tasks (ENV-*, AI-SETUP-*): Tier B
        - Everything else: Tier C

        This modifies rows in place.
        """
        # Build dependency count
        dep_count = {}
        for row in rows:
            task_id = row.get("Task ID", "")
            deps = row.get("CleanDependencies") or row.get("Dependencies") or ""
            for dep in deps.split(","):
                dep = dep.strip()
                if dep:
                    dep_count[dep] = dep_count.get(dep, 0) + 1

        for row in rows:
            task_id = row.get("Task ID", "")
            deps = row.get("CleanDependencies") or row.get("Dependencies") or ""
            has_deps = bool(deps.strip())

            # Skip if already has tier
            if row.get("Tier", "").strip():
                continue

            # Compute tier
            if task_id.startswith("EXC-SEC-"):
                row["Tier"] = "A"
            elif not has_deps:
                row["Tier"] = "A"  # Root task
            elif dep_count.get(task_id, 0) >= 3:
                row["Tier"] = "A"  # High fan-out
            elif task_id.startswith("ENV-") or task_id.startswith("AI-SETUP-"):
                row["Tier"] = "B"
            else:
                row["Tier"] = "C"
