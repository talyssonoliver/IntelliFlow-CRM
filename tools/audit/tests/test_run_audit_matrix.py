from __future__ import annotations

from pathlib import Path

import yaml

import run_audit


def test_audit_matrix_parses_and_has_unique_ids() -> None:
    matrix_path = Path(__file__).resolve().parents[3] / "audit-matrix.yml"
    data = yaml.safe_load(matrix_path.read_text(encoding="utf-8"))
    tools = run_audit._validate_matrix(data)

    ids = [t["id"] for t in tools]
    assert len(ids) == len(set(ids)), "tool ids must be unique"
    assert all(isinstance(t.get("tier"), int) or str(t.get("tier")).isdigit() for t in tools)


def test_matrix_contains_required_fields() -> None:
    matrix_path = Path(__file__).resolve().parents[3] / "audit-matrix.yml"
    data = yaml.safe_load(matrix_path.read_text(encoding="utf-8"))
    tools = run_audit._validate_matrix(data)

    for tool in tools:
        assert "id" in tool
        assert "tier" in tool

