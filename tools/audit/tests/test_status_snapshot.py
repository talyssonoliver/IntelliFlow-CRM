from __future__ import annotations

from pathlib import Path

import status_snapshot


def test_status_snapshot_extracts_completed_ids_sorted() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    plan_path = repo_root / "tools" / "audit" / "tests" / "fixtures" / "sample_plan.csv"

    snapshot = status_snapshot._snapshot_from_csv(plan_path)
    completed = [
        t["task_id"] for t in snapshot["tasks"] if (t.get("status") or "").strip().lower() == "completed"
    ]
    assert completed == sorted(completed)
    assert completed == ["A-001", "C-001"]


def test_status_snapshot_counts_total() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    plan_path = repo_root / "tools" / "audit" / "tests" / "fixtures" / "sample_plan.csv"
    snapshot = status_snapshot._snapshot_from_csv(plan_path)
    assert snapshot["counts"]["total"] == 3

