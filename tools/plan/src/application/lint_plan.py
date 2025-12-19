"""LintPlan use case - validates sprint plan and generates reports."""

from collections import Counter
from dataclasses import dataclass, field
from typing import Optional

from ..domain.task import Task, Tier, GateProfile
from ..domain.dependency_graph import DependencyGraph
from ..domain.validation_rules import (
    ValidationResult,
    RuleSeverity,
    create_cycle_error,
    create_cross_sprint_error,
    create_unresolved_dep_error,
    create_tier_a_missing_gates_error,
    create_tier_a_missing_owner_error,
    create_tier_a_missing_evidence_error,
    create_tier_a_missing_acceptance_error,
    create_duplicate_id_error,
    create_high_fanout_warning,
    create_missing_validation_warning,
    create_phantom_completion_error,
    create_invalid_artifact_path_error,
    create_artifact_suggestion_warning,
    is_valid_artifact_path,
    find_similar_paths,
    RULE_TIER_B_MISSING_GATES,
    RULE_WAIVER_EXPIRING,
)
from ..adapters.yaml_loader import TaskOverride


@dataclass
class LintPlanResult:
    """Result of plan linting."""
    errors: list[ValidationResult] = field(default_factory=list)
    warnings: list[ValidationResult] = field(default_factory=list)
    review_queue: list[dict] = field(default_factory=list)
    summary: dict = field(default_factory=dict)

    def has_errors(self) -> bool:
        """Check if there are any hard failures."""
        return len(self.errors) > 0

    def exit_code(self) -> int:
        """Return appropriate exit code."""
        return 1 if self.has_errors() else 0


@dataclass
class LintPlanUseCase:
    """
    Use case for linting sprint plan.

    Validates:
    - Dependency cycles
    - Cross-sprint dependencies (within scope)
    - Unresolved dependencies
    - Tier A requirements
    - Task ID uniqueness
    - Phantom completions (completed but missing artifacts)

    Generates:
    - Error list (hard failures)
    - Warning list (soft failures)
    - Review queue
    - Summary statistics
    """
    tasks: list[Task]
    overrides: dict[str, TaskOverride] = field(default_factory=dict)
    validation_rules: dict = field(default_factory=dict)
    sprint_scope: Optional[int] = None
    fanout_threshold: int = 3
    project_root: Optional[str] = None  # For artifact validation

    def execute(self) -> LintPlanResult:
        """Execute the lint plan use case."""
        result = LintPlanResult()

        # Apply overrides to tasks
        tasks = self._apply_overrides()

        # Build dependency graph
        graph = DependencyGraph.from_tasks(tasks)

        # Get tasks in scope
        scoped_tasks = self._get_scoped_tasks(tasks)

        # Run hard rules (errors)
        result.errors.extend(self._check_cycles(graph))
        result.errors.extend(self._check_cross_sprint(graph))
        result.errors.extend(self._check_unresolved_deps(graph))
        result.errors.extend(self._check_tier_a_requirements(scoped_tasks))
        result.errors.extend(self._check_unique_ids())
        result.errors.extend(self._check_phantom_completions(scoped_tasks))

        # Run soft rules (warnings)
        result.warnings.extend(self._check_tier_b_gates(scoped_tasks))
        result.warnings.extend(self._check_high_fanout(graph, scoped_tasks))
        result.warnings.extend(self._check_validation_coverage(scoped_tasks))
        result.warnings.extend(self._check_waivers(scoped_tasks))
        result.warnings.extend(self._check_artifact_paths(scoped_tasks))

        # Generate review queue
        result.review_queue = self._generate_review_queue(
            scoped_tasks, graph, result.errors, result.warnings
        )

        # Generate summary
        result.summary = self._generate_summary(scoped_tasks, graph, result)

        return result

    def _apply_overrides(self) -> list[Task]:
        """Apply overrides to tasks."""
        result: list[Task] = []

        for task in self.tasks:
            override = self.overrides.get(task.task_id)
            if not override:
                result.append(task)
                continue

            result.append(self._apply_override(task, override))

        return result

    def _apply_override(self, task: Task, override: TaskOverride) -> Task:
        tier = Tier.from_string(override.tier) if override.tier else None
        gate_profile = (
            GateProfile.from_string(override.gate_profile[0]) if override.gate_profile else None
        )
        evidence_required = tuple(override.evidence_required) if override.evidence_required else None
        dependencies_add = tuple(override.override_deps_add) if override.override_deps_add else None
        dependencies_remove = (
            tuple(override.override_deps_remove) if override.override_deps_remove else None
        )

        return task.with_override(
            tier=tier,
            gate_profile=gate_profile,
            acceptance_owner=override.acceptance_owner,
            evidence_required=evidence_required,
            dependencies_add=dependencies_add,
            dependencies_remove=dependencies_remove,
            sprint_override=override.sprint_override,
        )

    def _get_scoped_tasks(self, tasks: list[Task]) -> list[Task]:
        """Filter tasks to sprint scope."""
        if self.sprint_scope is None:
            return tasks
        return [t for t in tasks if t.sprint == self.sprint_scope]

    def _check_cycles(self, graph: DependencyGraph) -> list[ValidationResult]:
        """Check for dependency cycles (scoped to current sprint if specified)."""
        cycles = graph.detect_cycles()

        # If sprint-scoped, only report cycles involving tasks in that sprint
        if self.sprint_scope is not None:
            scoped_task_ids = {t.task_id for t in self.tasks if t.sprint == self.sprint_scope}
            cycles = [
                cycle for cycle in cycles
                if any(task_id in scoped_task_ids for task_id in cycle)
            ]

        return [create_cycle_error(cycle) for cycle in cycles]

    def _check_cross_sprint(self, graph: DependencyGraph) -> list[ValidationResult]:
        """Check for cross-sprint dependency violations."""
        violations = graph.detect_cross_sprint_violations(self.sprint_scope)
        errors: list[ValidationResult] = []

        for v in violations:
            if not v.is_allowed:
                errors.append(create_cross_sprint_error(
                    v.task_id, v.task_sprint, v.dependency_id, v.dependency_sprint
                ))

        return errors

    def _check_unresolved_deps(self, graph: DependencyGraph) -> list[ValidationResult]:
        """Check for unresolved dependencies."""
        unresolved = graph.find_unresolved_dependencies()
        return [create_unresolved_dep_error(task, dep) for task, dep in unresolved]

    def _check_tier_a_requirements(self, tasks: list[Task]) -> list[ValidationResult]:
        """Check Tier A task requirements."""
        errors: list[ValidationResult] = []

        for task in tasks:
            if task.tier != Tier.A:
                continue
            errors.extend(self._tier_a_requirement_errors(task))

        return errors

    def _tier_a_requirement_errors(self, task: Task) -> list[ValidationResult]:
        override = self.overrides.get(task.task_id)
        errors: list[ValidationResult] = []

        has_gates = task.gate_profile != GateProfile.NONE or bool(override and override.gate_profile)
        has_owner = bool(task.acceptance_owner or (override and override.acceptance_owner))
        has_evidence = bool(task.evidence_required or (override and override.evidence_required))
        has_acceptance = bool(task.acceptance_criteria or (override and override.acceptance_criteria))

        if not has_gates:
            errors.append(create_tier_a_missing_gates_error(task.task_id))
        if not has_owner:
            errors.append(create_tier_a_missing_owner_error(task.task_id))
        if not has_evidence:
            errors.append(create_tier_a_missing_evidence_error(task.task_id))
        if not has_acceptance:
            errors.append(create_tier_a_missing_acceptance_error(task.task_id))

        return errors

    def _check_unique_ids(self) -> list[ValidationResult]:
        """Check for duplicate task IDs."""
        id_counts = Counter(t.task_id for t in self.tasks)
        errors: list[ValidationResult] = []

        for task_id, count in id_counts.items():
            if count > 1:
                errors.append(create_duplicate_id_error(task_id, count))

        return errors

    def _check_phantom_completions(self, tasks: list[Task]) -> list[ValidationResult]:
        """
        Check for phantom completions - tasks marked Complete but missing artifacts.

        This is a critical integrity check that prevents fabricated progress.

        Enhanced features:
        - Detects prose text vs actual file paths
        - Suggests alternative paths when artifacts exist elsewhere
        - Validates both CSV artifacts and plan-overrides evidence
        """
        from pathlib import Path
        from ..domain.task import TaskStatus

        if not self.project_root:
            return []  # Skip if no project root provided

        root = Path(self.project_root)
        errors: list[ValidationResult] = []

        for task in tasks:
            if task.status != TaskStatus.COMPLETED:
                continue
            errors.extend(self._phantom_completion_errors_for_task(task, root))

        return errors

    def _phantom_completion_errors_for_task(self, task: Task, root) -> list[ValidationResult]:
        expected = self._collect_phantom_expected_artifacts(task)
        normalized = self._normalize_artifact_paths(expected)
        invalid_errors, valid_artifacts = self._split_valid_artifacts(task.task_id, normalized)

        missing, suggestions = self._find_missing_artifacts(root, valid_artifacts)
        errors = list(invalid_errors)

        if missing:
            errors.append(
                create_phantom_completion_error(
                    task.task_id, missing, suggestions if suggestions else None
                )
            )

        return errors

    def _collect_phantom_expected_artifacts(self, task: Task) -> list[str]:
        expected = list(task.artifacts_expected)

        override = self.overrides.get(task.task_id)
        if override and override.evidence_required:
            self._extend_unique(expected, override.evidence_required)

        self._extend_unique(expected, task.evidence_required)
        return expected

    @staticmethod
    def _extend_unique(existing: list[str], extra) -> None:
        for item in extra:
            if item not in existing:
                existing.append(item)

    @staticmethod
    def _normalize_artifact_paths(artifact_paths: list[str]) -> list[str]:
        normalized: list[str] = []
        for artifact_path in artifact_paths:
            value = artifact_path.strip()
            if value:
                normalized.append(value)
        return normalized

    def _split_valid_artifacts(
        self, task_id: str, artifact_paths: list[str]
    ) -> tuple[list[ValidationResult], list[str]]:
        errors: list[ValidationResult] = []
        valid: list[str] = []

        for artifact_path in artifact_paths:
            is_valid, reason = is_valid_artifact_path(artifact_path)
            if not is_valid:
                errors.append(create_invalid_artifact_path_error(task_id, artifact_path, reason))
                continue
            valid.append(artifact_path)

        return errors, valid

    def _find_missing_artifacts(self, root, artifact_paths: list[str]) -> tuple[list[str], dict[str, str]]:
        missing: list[str] = []
        suggestions: dict[str, str] = {}

        for artifact_path in artifact_paths:
            if self._artifact_exists(root, artifact_path):
                continue

            missing.append(artifact_path)
            similar = find_similar_paths(artifact_path, root, max_suggestions=1)
            if similar:
                suggestions[artifact_path] = similar[0]

        return missing, suggestions

    @staticmethod
    def _artifact_exists(root, artifact_path: str) -> bool:
        if "*" in artifact_path:
            dir_path = artifact_path.split("*", 1)[0].rstrip("/\\")
            return (root / dir_path).exists()
        return (root / artifact_path).exists()

    def _check_artifact_paths(self, tasks: list[Task]) -> list[ValidationResult]:
        """
        Check artifact paths for common issues (runs on ALL tasks, not just completed).

        This is a preventive check that catches path issues before tasks are completed.
        Returns warnings for potential issues.
        """
        from pathlib import Path

        if not self.project_root:
            return []

        root = Path(self.project_root)
        warnings: list[ValidationResult] = []

        for task in tasks:
            warnings.extend(self._artifact_path_warnings_for_task(task, root))

        return warnings

    def _artifact_path_warnings_for_task(self, task: Task, root) -> list[ValidationResult]:
        override = self.overrides.get(task.task_id)
        all_artifacts = list(task.artifacts_expected)
        if override and override.evidence_required:
            all_artifacts.extend(override.evidence_required)

        warnings: list[ValidationResult] = []
        for artifact_path in self._normalize_artifact_paths(all_artifacts):
            is_valid, _ = is_valid_artifact_path(artifact_path)
            if not is_valid:
                continue  # Already reported as error for completed tasks
            if "*" in artifact_path:
                continue

            full_path = root / artifact_path
            if full_path.exists():
                continue

            similar = find_similar_paths(artifact_path, root, max_suggestions=1)
            if similar:
                warnings.append(
                    create_artifact_suggestion_warning(task.task_id, artifact_path, similar[0])
                )

        return warnings

    def _check_tier_b_gates(self, tasks: list[Task]) -> list[ValidationResult]:
        """Check Tier B tasks have gate profiles."""
        warnings: list[ValidationResult] = []

        for task in tasks:
            if task.tier != Tier.B:
                continue

            override = self.overrides.get(task.task_id)
            has_gates = (
                task.gate_profile != GateProfile.NONE
                or (override and override.gate_profile)
            )

            if not has_gates:
                warnings.append(ValidationResult(
                    rule_id=RULE_TIER_B_MISSING_GATES,
                    severity=RuleSeverity.WARNING,
                    message=f"Tier B task {task.task_id} missing gate_profile",
                    tasks=(task.task_id,),
                    priority="medium",
                ))

        return warnings

    def _check_high_fanout(
        self, graph: DependencyGraph, tasks: list[Task]
    ) -> list[ValidationResult]:
        """Check for high fan-out tasks."""
        fanout = graph.compute_fanout()
        warnings: list[ValidationResult] = []

        task_ids = {t.task_id for t in tasks}
        for task_id in task_ids:
            count = fanout.get(task_id, 0)
            if count >= self.fanout_threshold:
                warnings.append(create_high_fanout_warning(task_id, count))

        return warnings

    def _check_validation_coverage(self, tasks: list[Task]) -> list[ValidationResult]:
        """Check tasks have validation rules."""
        warnings: list[ValidationResult] = []

        for task in tasks:
            if task.task_id not in self.validation_rules:
                warnings.append(create_missing_validation_warning(
                    task.task_id, task.section
                ))

        return warnings

    def _check_waivers(self, tasks: list[Task]) -> list[ValidationResult]:
        """Check for expiring waivers."""
        warnings: list[ValidationResult] = []

        for task in tasks:
            override = self.overrides.get(task.task_id)
            if not override or not override.waiver_expiry:
                continue

            warning = self._waiver_expiry_warning(task.task_id, override.waiver_expiry)
            if warning:
                warnings.append(warning)

        return warnings

    def _waiver_expiry_warning(self, task_id: str, waiver_expiry: str) -> Optional[ValidationResult]:
        from datetime import datetime

        try:
            expiry = datetime.fromisoformat(waiver_expiry.replace("Z", "+00:00"))
        except ValueError:
            return None

        now = datetime.now(expiry.tzinfo) if expiry.tzinfo else datetime.now()
        days_until = (expiry - now).days

        if days_until > 30:
            return None

        severity = RuleSeverity.ERROR if days_until <= 0 else RuleSeverity.WARNING
        priority = "critical" if days_until <= 0 else "high"
        return ValidationResult(
            rule_id=RULE_WAIVER_EXPIRING,
            severity=severity,
            message=f"Task {task_id} waiver expires in {days_until} days",
            tasks=(task_id,),
            priority=priority,
            metadata={"days_until_expiry": days_until},
        )

    def _generate_review_queue(
        self,
        tasks: list[Task],
        graph: DependencyGraph,
        errors: list[ValidationResult],
        warnings: list[ValidationResult],
    ) -> list[dict]:
        """Generate review queue for tasks needing attention."""
        queue: list[dict] = []
        fanout = graph.compute_fanout()

        task_errors = self._index_results_by_task(errors)
        task_warnings = self._index_results_by_task(warnings)

        for task in tasks:
            override = self.overrides.get(task.task_id)
            reasons = self._review_reasons(task, fanout, task_errors, task_warnings, override)
            if not reasons:
                continue

            priority = self._review_priority(task, has_errors=task.task_id in task_errors)
            owner = override.acceptance_owner if override else task.owner
            waiver_expiry = override.waiver_expiry if override else None
            queue.append(
                {
                    "task_id": task.task_id,
                    "tier": task.tier.value,
                    "section": task.section,
                    "status": task.status.value,
                    "owner": owner,
                    "reasons": reasons,
                    "dependent_count": fanout.get(task.task_id, 0),
                    "waiver_expiry": waiver_expiry,
                    "priority": priority,
                }
            )

        # Sort by priority
        priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        queue.sort(key=lambda x: priority_order.get(x["priority"], 3))

        return queue

    @staticmethod
    def _index_results_by_task(results: list[ValidationResult]) -> dict[str, list[ValidationResult]]:
        index: dict[str, list[ValidationResult]] = {}
        for result in results:
            for task_id in result.tasks:
                index.setdefault(task_id, []).append(result)
        return index

    def _review_reasons(
        self,
        task: Task,
        fanout: dict[str, int],
        task_errors: dict[str, list[ValidationResult]],
        task_warnings: dict[str, list[ValidationResult]],
        override: Optional[TaskOverride],
    ) -> list[str]:
        reasons: list[str] = []

        if task.tier == Tier.A:
            reasons.append("Tier A task - requires explicit validation")

        dependent_count = fanout.get(task.task_id, 0)
        if dependent_count >= self.fanout_threshold:
            reasons.append(f"High fan-out ({dependent_count} dependents)")

        errors_for_task = task_errors.get(task.task_id, [])
        if errors_for_task:
            reasons.append(f"Has {len(errors_for_task)} error(s)")

        if override and (override.debt_allowed or override.waiver_expiry):
            reasons.append("Has waiver or debt_allowed")

        warnings_for_task = task_warnings.get(task.task_id, [])
        if self._has_missing_validation_warning(warnings_for_task):
            reasons.append("Missing validation.yaml entry")

        return reasons

    @staticmethod
    def _has_missing_validation_warning(warnings: list[ValidationResult]) -> bool:
        return any("validation" in w.message.lower() for w in warnings)

    @staticmethod
    def _review_priority(task: Task, has_errors: bool) -> str:
        if task.tier == Tier.A:
            return "critical"
        if has_errors:
            return "high"
        return "medium"

    def _generate_summary(
        self,
        tasks: list[Task],
        graph: DependencyGraph,
        result: LintPlanResult,
    ) -> dict:
        """Generate summary statistics."""
        tier_counts = Counter(t.tier.value for t in tasks)

        # Validation coverage
        validated = sum(1 for t in tasks if t.task_id in self.validation_rules)

        # Dependency graph statistics
        task_ids = {t.task_id for t in tasks}
        total_dependencies = sum(len(graph.get_dependencies(tid)) for tid in task_ids)
        tasks_with_deps = sum(1 for tid in task_ids if graph.get_dependencies(tid))

        # Compute dependents: tasks that are depended upon by others
        depended_upon: set[str] = set()
        for tid in task_ids:
            for dep in graph.get_dependencies(tid):
                if dep in task_ids:
                    depended_upon.add(dep)
        tasks_with_dependents = len(depended_upon)

        # Orphan tasks: neither depend on others nor are depended upon
        tasks_with_any_link = {tid for tid in task_ids if graph.get_dependencies(tid)} | depended_upon

        return {
            "total_tasks": len(tasks),
            "tier_breakdown": dict(tier_counts),
            "error_count": len(result.errors),
            "warning_count": len(result.warnings),
            "review_queue_size": len(result.review_queue),
            "validation_coverage": {
                "tasks_with_validation": validated,
                "tasks_without_validation": len(tasks) - validated,
                "coverage_percentage": round(validated / len(tasks) * 100) if tasks else 0,
            },
            "dependency_stats": {
                "total_dependencies": total_dependencies,
                "tasks_with_dependencies": tasks_with_deps,
                "tasks_with_dependents": tasks_with_dependents,
                "orphan_tasks": len(task_ids) - len(tasks_with_any_link),
            },
        }
