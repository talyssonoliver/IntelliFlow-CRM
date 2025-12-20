"""YAML configuration loader adapter."""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import yaml


@dataclass
class TaskOverride:
    """Override configuration for a single task."""
    task_id: str
    tier: Optional[str] = None
    gate_profile: list[str] = field(default_factory=list)
    acceptance_owner: Optional[str] = None
    acceptance_criteria: list[str] = field(default_factory=list)  # Audit checklist for sign-off
    evidence_required: list[str] = field(default_factory=list)
    override_deps_add: list[str] = field(default_factory=list)
    override_deps_remove: list[str] = field(default_factory=list)
    sprint_override: Optional[int] = None
    exception_policy: Optional[str] = None
    debt_allowed: bool = False
    waiver_expiry: Optional[str] = None
    notes: Optional[str] = None


@dataclass
class YamlConfigLoader:
    """Loader for YAML configuration files (plan-overrides, validation)."""

    def load_overrides(self, file_path: Path) -> dict[str, TaskOverride]:
        """Load plan-overrides.yaml and return task overrides."""
        if not file_path.exists():
            return {}

        with open(file_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}

        overrides: dict[str, TaskOverride] = {}

        # Skip metadata keys
        skip_keys = {"schema_version", "last_updated", "maintainer", "gate_profiles"}

        for key, value in data.items():
            if key.startswith("_") or key in skip_keys:
                continue
            if not isinstance(value, dict):
                continue

            overrides[key] = TaskOverride(
                task_id=key,
                tier=value.get("tier"),
                gate_profile=value.get("gate_profile", []) or [],
                acceptance_owner=value.get("acceptance_owner"),
                acceptance_criteria=value.get("acceptance_criteria", []) or [],
                evidence_required=value.get("evidence_required", []) or [],
                override_deps_add=value.get("override_deps_add", []) or [],
                override_deps_remove=value.get("override_deps_remove", []) or [],
                sprint_override=value.get("sprint_override"),
                exception_policy=value.get("exception_policy"),
                debt_allowed=value.get("debt_allowed") in (True, "yes", "Y"),
                waiver_expiry=value.get("waiver_expiry"),
                notes=value.get("notes"),
            )

        return overrides

    def load_validation_rules(self, file_path: Path) -> dict[str, Any]:
        """Load validation.yaml and return validation rules."""
        if not file_path.exists():
            return {}

        with open(file_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}

        return data

    def load_gate_profiles(self, file_path: Path) -> dict[str, dict]:
        """Load gate profile definitions from plan-overrides.yaml."""
        if not file_path.exists():
            return {}

        with open(file_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}

        return data.get("gate_profiles", {})

    def load_linter_config(self, file_path: Path) -> dict[str, Any]:
        """Load linter configuration from plan-overrides.yaml.

        Returns config dict with keys:
          - fanout_threshold: int (default 3)
          - waiver_warning_days: int (default 30)
        """
        if not file_path.exists():
            return {"fanout_threshold": 3, "waiver_warning_days": 30}

        with open(file_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}

        config = data.get("linter_config", {})
        return {
            "fanout_threshold": config.get("fanout_threshold", 3),
            "waiver_warning_days": config.get("waiver_warning_days", 30),
        }
