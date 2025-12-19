"""Domain layer - core business logic for plan governance."""

from .task import Task, Tier, GateProfile, TaskStatus
from .dependency_graph import DependencyGraph, CycleError, UnresolvedDependencyError
from .validation_rules import ValidationResult, RuleSeverity, LintRule
from .debt import DebtEntry, DebtCategory, DebtSeverity

__all__ = [
    "Task",
    "Tier",
    "GateProfile",
    "TaskStatus",
    "DependencyGraph",
    "CycleError",
    "UnresolvedDependencyError",
    "ValidationResult",
    "RuleSeverity",
    "LintRule",
    "DebtEntry",
    "DebtCategory",
    "DebtSeverity",
]
