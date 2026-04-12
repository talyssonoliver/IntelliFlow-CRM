#!/usr/bin/env python
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PLAN_PATH = REPO_ROOT / "apps" / "project-tracker" / "docs" / "metrics" / "_global" / "Sprint_plan.csv"
DEFAULT_STATUS_DIR = REPO_ROOT / "artifacts" / "status"
DEFAULT_REPORTS_DIR = REPO_ROOT / "artifacts" / "reports"


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _read_csv_plan(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        rows: list[dict[str, str]] = []
        for row in reader:
            rows.append({k: (v or "").strip() for k, v in row.items()})
        return rows


def _snapshot_from_csv(plan_path: Path) -> dict[str, Any]:
    rows = _read_csv_plan(plan_path)
    tasks: list[dict[str, Any]] = []
    counts = Counter()

    for row in rows:
        task_id = row.get("Task ID") or row.get("TaskID") or row.get("task_id") or ""
        status = (row.get("Status") or "").strip()
        counts[status] += 1

        tasks.append(
            {
                "task_id": task_id,
                "status": status,
                "target_sprint": (row.get("Target Sprint") or "").strip(),
                "section": row.get("Section") or "",
                "description": row.get("Description") or "",
                "owner": row.get("Owner") or "",
                "artifacts_to_track": row.get("Artifacts To Track") or "",
                "validation_method": row.get("Validation Method") or "",
            }
        )

    tasks_sorted = sorted(tasks, key=lambda t: t["task_id"])
    return {
        "generated_at": _utc_now(),
        "source": {"type": "csv", "path": str(plan_path.relative_to(REPO_ROOT)).replace("\\", "/")},
        "counts": {"total": len(tasks_sorted), "by_status": dict(sorted(counts.items()))},
        "tasks": tasks_sorted,
    }


def _load_status_overrides(status_dir: Path) -> tuple[dict[str, str], list[str]]:
    if not status_dir.exists():
        return {}, []

    overrides: dict[str, str] = {}
    used_files: list[str] = []

    for path in sorted(status_dir.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue

        tasks: list[dict[str, Any]] = []
        if isinstance(data, list):
            tasks = [t for t in data if isinstance(t, dict)]
        elif isinstance(data, dict):
            if isinstance(data.get("tasks"), list):
                tasks = [t for t in data["tasks"] if isinstance(t, dict)]
            elif isinstance(data.get("items"), list):
                tasks = [t for t in data["items"] if isinstance(t, dict)]

        for t in tasks:
            task_id = (t.get("task_id") or t.get("Task ID") or t.get("id") or "").strip()
            status = (t.get("status") or t.get("Status") or "").strip()
            if task_id and status:
                overrides[task_id] = status

        used_files.append(str(path.relative_to(REPO_ROOT)).replace("\\", "/"))

    return overrides, used_files


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate deterministic task status snapshots.")
    parser.add_argument("--plan-path", default=str(DEFAULT_PLAN_PATH), help="Path to Sprint_plan.csv")
    parser.add_argument(
        "--status-dir",
        default=str(DEFAULT_STATUS_DIR),
        help="Directory for artifacts/status/*.json (overrides CSV status when present).",
    )
    parser.add_argument("--reports-dir", default=str(DEFAULT_REPORTS_DIR), help="Output directory (artifacts/reports).")
    args = parser.parse_args(argv)

    plan_path = Path(args.plan_path).resolve()
    status_dir = Path(args.status_dir).resolve()
    reports_dir = Path(args.reports_dir).resolve()

    snapshot = _snapshot_from_csv(plan_path)
    overrides, override_files = _load_status_overrides(status_dir)

    if overrides:
        for t in snapshot["tasks"]:
            task_id = t.get("task_id")
            if task_id in overrides:
                t["status"] = overrides[task_id]
        snapshot["source"] = {
            "type": "csv+status_json",
            "plan_path": snapshot["source"]["path"],
            "status_files": override_files,
        }

    snapshot_path = reports_dir / "status-snapshot.json"
    completed_ids_path = reports_dir / "completed-task-ids.txt"

    completed_ids = sorted(
        [t["task_id"] for t in snapshot["tasks"] if (t.get("status") or "").strip().lower() == "completed"]
    )

    _write_json(snapshot_path, snapshot)
    _write_text(completed_ids_path, "\n".join(completed_ids) + ("\n" if completed_ids else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
