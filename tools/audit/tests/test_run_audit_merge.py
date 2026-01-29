from __future__ import annotations

import run_audit


def test_merge_summaries_unions_tools_and_tiers() -> None:
    existing = {
        "commit_sha": "abc",
        "matrix_sha256": "m1",
        "tiers_requested": ["1"],
        "tools": [{"id": "t1", "tier": 1, "required": True, "enabled": True, "status": "pass"}],
        "started_at": "2025-01-01T00:00:00Z",
        "finished_at": "2025-01-01T00:01:00Z",
    }
    new = {
        "commit_sha": "abc",
        "matrix_sha256": "m1",
        "tiers_requested": ["2"],
        "tools": [{"id": "t2", "tier": 2, "required": False, "enabled": True, "status": "warn"}],
        "started_at": "2025-01-01T00:02:00Z",
        "finished_at": "2025-01-01T00:03:00Z",
        "mode": "pr",
        "scope": "affected",
    }

    merged = run_audit._merge_summaries(existing, new)
    assert set(merged["tiers_requested"]) == {"1", "2"}
    assert {t["id"] for t in merged["tools"]} == {"t1", "t2"}
    assert merged["started_at"] == "2025-01-01T00:00:00Z"
    assert merged["finished_at"] == "2025-01-01T00:03:00Z"


def test_merge_summaries_does_not_merge_on_mismatch() -> None:
    existing = {"commit_sha": "abc", "matrix_sha256": "m1", "tiers_requested": ["1"], "tools": [{"id": "t1"}]}
    new = {"commit_sha": "def", "matrix_sha256": "m1", "tiers_requested": ["2"], "tools": [{"id": "t2"}]}
    merged = run_audit._merge_summaries(existing, new)
    assert merged == new

