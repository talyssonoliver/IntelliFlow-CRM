"""Task domain entity and related value objects."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Tier(Enum):
    """Task tier classification for governance strictness."""
    A = "A"  # Critical - requires full evidence pack, explicit gates
    B = "B"  # Important - recommended gates
    C = "C"  # Standard - default validation

    @classmethod
    def from_string(cls, value: str) -> "Tier":
        """Parse tier from string, defaulting to C."""
        if not value:
            return cls.C
        normalized = value.strip().upper()
        if normalized in ("A", "B", "C"):
            return cls(normalized)
        return cls.C


class GateProfile(Enum):
    """Predefined gate profiles for task validation."""
    NONE = "none"
    BASIC = "basic"          # spec_check only
    STANDARD = "standard"    # spec_check + build + lint
    STRICT = "strict"        # all gates including tests and audit

    @classmethod
    def from_string(cls, value: str) -> "GateProfile":
        """Parse gate profile from string."""
        if not value:
            return cls.NONE
        normalized = value.strip().lower()
        # Handle custom profiles
        if normalized.startswith("custom:"):
            return cls.STRICT  # Treat custom as strict for validation
        try:
            return cls(normalized)
        except ValueError:
            return cls.NONE


class TaskStatus(Enum):
    """Task execution status."""
    PLANNED = "Planned"
    IN_PROGRESS = "In Progress"
    VALIDATING = "Validating"
    COMPLETED = "Completed"
    BLOCKED = "Blocked"
    FAILED = "Failed"
    BACKLOG = "Backlog"

    @classmethod
    def from_string(cls, value: str) -> "TaskStatus":
        """Parse status from string."""
        if not value:
            return cls.PLANNED
        normalized = value.strip()
        for status in cls:
            if status.value.lower() == normalized.lower():
                return status
        # Handle alternative names
        if normalized.lower() == "done":
            return cls.COMPLETED
        return cls.PLANNED


@dataclass(frozen=True)
class Task:
    """
    Task entity representing a single item in the sprint plan.

    Invariants:
    - task_id must be non-empty
    - sprint must be >= 0 or None for 'Continuous'
    - Tier A tasks require acceptance_owner, gate_profile, evidence_required
    """
    task_id: str
    section: str
    description: str
    owner: str
    dependencies: tuple[str, ...] = field(default_factory=tuple)
    sprint: Optional[int] = None  # None means 'Continuous'
    status: TaskStatus = TaskStatus.PLANNED
    tier: Tier = Tier.C
    gate_profile: GateProfile = GateProfile.NONE
    acceptance_owner: Optional[str] = None
    evidence_required: tuple[str, ...] = field(default_factory=tuple)
    acceptance_criteria: str = ""
    artifacts_expected: tuple[str, ...] = field(default_factory=tuple)
    adr_required: bool = False
    risk: str = "Low"
    review_required: bool = False
    waiver_policy: str = "none"
    cross_sprint_allowed: bool = False
    cross_sprint_reason: str = ""
    definition_of_done: str = ""
    kpis: str = ""
    validation_method: str = ""

    def __post_init__(self) -> None:
        """Validate task invariants."""
        if not self.task_id:
            raise ValueError("task_id cannot be empty")

    def is_tier_a_complete(self) -> bool:
        """Check if Tier A requirements are satisfied."""
        if self.tier != Tier.A:
            return True
        return bool(
            self.acceptance_owner
            and self.gate_profile != GateProfile.NONE
            and self.evidence_required
            and self.acceptance_criteria
        )

    def requires_review(self) -> bool:
        """Determine if task requires human review based on tier and flags."""
        if self.review_required:
            return True
        if self.tier == Tier.A:
            return True
        return False

    def with_override(
        self,
        tier: Optional[Tier] = None,
        gate_profile: Optional[GateProfile] = None,
        acceptance_owner: Optional[str] = None,
        evidence_required: Optional[tuple[str, ...]] = None,
        dependencies_add: Optional[tuple[str, ...]] = None,
        dependencies_remove: Optional[tuple[str, ...]] = None,
        sprint_override: Optional[int] = None,
    ) -> "Task":
        """Create a new Task with overrides applied."""
        new_deps = set(self.dependencies)
        if dependencies_remove:
            new_deps -= set(dependencies_remove)
        if dependencies_add:
            new_deps |= set(dependencies_add)

        return Task(
            task_id=self.task_id,
            section=self.section,
            description=self.description,
            owner=self.owner,
            dependencies=tuple(sorted(new_deps)),
            sprint=sprint_override if sprint_override is not None else self.sprint,
            status=self.status,
            tier=tier if tier is not None else self.tier,
            gate_profile=gate_profile if gate_profile is not None else self.gate_profile,
            acceptance_owner=acceptance_owner if acceptance_owner is not None else self.acceptance_owner,
            evidence_required=evidence_required if evidence_required is not None else self.evidence_required,
            acceptance_criteria=self.acceptance_criteria,
            artifacts_expected=self.artifacts_expected,
            adr_required=self.adr_required,
            risk=self.risk,
            review_required=self.review_required,
            waiver_policy=self.waiver_policy,
            cross_sprint_allowed=self.cross_sprint_allowed,
            cross_sprint_reason=self.cross_sprint_reason,
            definition_of_done=self.definition_of_done,
            kpis=self.kpis,
            validation_method=self.validation_method,
        )
