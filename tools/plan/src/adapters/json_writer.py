"""JSON report writer adapter."""

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


@dataclass
class JsonReportWriter:
    """Writer for JSON reports (lint report, review queue, etc.)."""

    def write_lint_report(
        self,
        file_path: Path,
        summary: dict[str, Any],
        errors: list[dict],
        warnings: list[dict],
        review_queue: list[dict],
        sprint_scope: int | str,
    ) -> None:
        """Write lint report to JSON file."""
        report = {
            "meta": {
                "generated_at": datetime.utcnow().isoformat() + "Z",
                "schema_version": "1.0.0",
                "sprint_scope": sprint_scope,
            },
            "summary": summary,
            "errors": errors,
            "warnings": warnings,
            "review_queue": review_queue,
        }

        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)

    def write_review_queue(
        self,
        file_path: Path,
        items: list[dict],
        sprint_scope: int | str,
    ) -> None:
        """Write review queue to JSON file."""
        queue = {
            "meta": {
                "generated_at": datetime.utcnow().isoformat() + "Z",
                "sprint_scope": sprint_scope,
                "total_items": len(items),
            },
            "items": items,
        }

        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(queue, f, indent=2)

    def write_daily_digest(
        self,
        file_path: Path,
        digest: dict[str, Any],
    ) -> None:
        """Write daily digest to JSON file."""
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(digest, f, indent=2)

    def append_debt_entry(
        self,
        file_path: Path,
        entry: dict,
    ) -> None:
        """Append a debt entry to JSONL file."""
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
