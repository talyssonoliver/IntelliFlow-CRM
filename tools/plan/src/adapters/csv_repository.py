"""CSV repository adapter for reading/writing sprint plan."""

import csv
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

from ..domain.task import Task, Tier, GateProfile, TaskStatus


@dataclass
class CsvPlanRepository:
    """
    Repository for reading and writing sprint plan CSV.

    Implements the repository pattern as an adapter for CSV storage.
    Handles parsing, schema migration, and preserving CSV formatting.
    """
    file_path: Path

    # Column mappings (CSV header -> internal name)
    COLUMN_MAP = {
        "Task ID": "task_id",
        "Section": "section",
        "Description": "description",
        "Owner": "owner",
        "Dependencies": "dependencies",
        "CleanDependencies": "clean_dependencies",
        "CrossQuarterDeps": "cross_quarter_deps",
        "Pre-requisites": "prerequisites",
        "Definition of Done": "definition_of_done",
        "Status": "status",
        "KPIs": "kpis",
        "Target Sprint": "target_sprint",
        "Artifacts To Track": "artifacts_to_track",
        "Validation Method": "validation_method",
        # Schema v2 columns (new)
        "Tier": "tier",
        "Gate Profile": "gate_profile",
        "Evidence Required": "evidence_required",
        "Acceptance Criteria": "acceptance_criteria",
        "Artifacts Expected": "artifacts_expected",
        "ADR Required": "adr_required",
        "Risk": "risk",
        "Review Required": "review_required",
        "Waiver Policy": "waiver_policy",
        "CrossSprintAllowed": "cross_sprint_allowed",
        "CrossSprintReason": "cross_sprint_reason",
    }

    # Schema v2 columns to add if missing
    SCHEMA_V2_COLUMNS = [
        "Tier",
        "Gate Profile",
        "Evidence Required",
        "Acceptance Criteria",
        "Artifacts Expected",
        "ADR Required",
        "Risk",
        "Review Required",
        "Waiver Policy",
        "CrossSprintAllowed",
        "CrossSprintReason",
    ]

    # Default values for new columns
    SCHEMA_V2_DEFAULTS = {
        "Tier": "",  # Will be computed
        "Gate Profile": "none",
        "Evidence Required": "",
        "Acceptance Criteria": "",
        "Artifacts Expected": "",
        "ADR Required": "N",
        "Risk": "Low",
        "Review Required": "",  # Derived from Tier
        "Waiver Policy": "none",
        "CrossSprintAllowed": "N",
        "CrossSprintReason": "",
    }

    def load_tasks(self) -> list[Task]:
        """Load all tasks from CSV."""
        tasks: list[Task] = []

        with open(self.file_path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                task = self._row_to_task(row)
                tasks.append(task)

        return tasks

    def load_raw_rows(self) -> tuple[list[str], list[dict[str, str]]]:
        """Load raw CSV data (headers and rows) for migration."""
        with open(self.file_path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            headers = list(reader.fieldnames or [])
            rows = list(reader)
        return headers, rows

    def save_with_new_columns(
        self,
        headers: list[str],
        rows: list[dict[str, str]],
        backup: bool = True,
    ) -> Path:
        """Save CSV with potentially new columns."""
        if backup:
            backup_path = self.file_path.with_suffix(".csv.bak")
            import shutil
            shutil.copy(self.file_path, backup_path)

        with open(self.file_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=headers, quoting=csv.QUOTE_MINIMAL)
            writer.writeheader()
            writer.writerows(rows)

        return self.file_path

    def get_missing_schema_v2_columns(self) -> list[str]:
        """Check which schema v2 columns are missing."""
        headers, _ = self.load_raw_rows()
        return [col for col in self.SCHEMA_V2_COLUMNS if col not in headers]

    def _row_to_task(self, row: dict[str, str]) -> Task:
        """Convert CSV row to Task entity."""
        # Parse dependencies (prefer CleanDependencies if available)
        deps_str = row.get("CleanDependencies") or row.get("Dependencies") or ""
        dependencies = tuple(
            d.strip() for d in deps_str.split(",") if d.strip()
        )

        # Parse sprint
        sprint_str = row.get("Target Sprint", "").strip()
        sprint: Optional[int] = None
        if sprint_str and sprint_str.lower() != "continuous":
            try:
                sprint = int(sprint_str)
            except ValueError:
                pass

        # Parse evidence required
        evidence_str = row.get("Evidence Required", "")
        evidence = tuple(
            e.strip() for e in evidence_str.split(",") if e.strip()
        )

        # Parse artifacts expected
        artifacts_str = row.get("Artifacts Expected") or row.get("Artifacts To Track") or ""
        artifacts = tuple(
            a.strip() for a in artifacts_str.split(",") if a.strip()
        )

        return Task(
            task_id=row.get("Task ID", "").strip(),
            section=row.get("Section", "").strip(),
            description=row.get("Description", "").strip(),
            owner=row.get("Owner", "").strip(),
            dependencies=dependencies,
            sprint=sprint,
            status=TaskStatus.from_string(row.get("Status", "")),
            tier=Tier.from_string(row.get("Tier", "")),
            gate_profile=GateProfile.from_string(row.get("Gate Profile", "")),
            acceptance_owner=row.get("Acceptance Owner", "").strip() or None,
            evidence_required=evidence,
            acceptance_criteria=row.get("Acceptance Criteria", "").strip(),
            artifacts_expected=artifacts,
            adr_required=row.get("ADR Required", "").strip().upper() == "Y",
            risk=row.get("Risk", "Low").strip() or "Low",
            review_required=row.get("Review Required", "").strip().upper() == "Y",
            waiver_policy=row.get("Waiver Policy", "none").strip() or "none",
            cross_sprint_allowed=row.get("CrossSprintAllowed", "").strip().upper() == "Y",
            cross_sprint_reason=row.get("CrossSprintReason", "").strip(),
            definition_of_done=row.get("Definition of Done", "").strip(),
            kpis=row.get("KPIs", "").strip(),
            validation_method=row.get("Validation Method", "").strip(),
        )


def parse_csv_line(line: str) -> list[str]:
    """Parse a single CSV line handling quoted fields."""
    values: list[str] = []
    current = ""
    in_quotes = False

    for i, char in enumerate(line):
        if char == '"':
            if in_quotes and i + 1 < len(line) and line[i + 1] == '"':
                current += '"'
                continue
            in_quotes = not in_quotes
        elif char == ',' and not in_quotes:
            values.append(current.strip())
            current = ""
        else:
            current += char

    values.append(current.strip())
    return values
