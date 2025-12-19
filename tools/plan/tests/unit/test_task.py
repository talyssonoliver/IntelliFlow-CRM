"""Unit tests for Task entity and related value objects."""

import pytest
from src.domain.task import Task, Tier, GateProfile, TaskStatus


class TestTier:
    """Test suite for Tier enum."""

    def test_from_string_a(self) -> None:
        """Parse Tier A from string."""
        assert Tier.from_string("A") == Tier.A
        assert Tier.from_string("a") == Tier.A
        assert Tier.from_string(" A ") == Tier.A

    def test_from_string_b(self) -> None:
        """Parse Tier B from string."""
        assert Tier.from_string("B") == Tier.B

    def test_from_string_c(self) -> None:
        """Parse Tier C from string."""
        assert Tier.from_string("C") == Tier.C

    def test_from_string_empty_defaults_to_c(self) -> None:
        """Empty string defaults to Tier C."""
        assert Tier.from_string("") == Tier.C
        assert Tier.from_string(None) == Tier.C

    def test_from_string_invalid_defaults_to_c(self) -> None:
        """Invalid value defaults to Tier C."""
        assert Tier.from_string("X") == Tier.C
        assert Tier.from_string("tier-a") == Tier.C


class TestGateProfile:
    """Test suite for GateProfile enum."""

    def test_from_string_none(self) -> None:
        """Parse 'none' gate profile."""
        assert GateProfile.from_string("none") == GateProfile.NONE
        assert GateProfile.from_string("") == GateProfile.NONE

    def test_from_string_basic(self) -> None:
        """Parse 'basic' gate profile."""
        assert GateProfile.from_string("basic") == GateProfile.BASIC

    def test_from_string_standard(self) -> None:
        """Parse 'standard' gate profile."""
        assert GateProfile.from_string("standard") == GateProfile.STANDARD

    def test_from_string_strict(self) -> None:
        """Parse 'strict' gate profile."""
        assert GateProfile.from_string("strict") == GateProfile.STRICT

    def test_from_string_custom_treated_as_strict(self) -> None:
        """Custom profiles are treated as strict for validation."""
        assert GateProfile.from_string("custom:my-profile") == GateProfile.STRICT


class TestTaskStatus:
    """Test suite for TaskStatus enum."""

    def test_from_string_planned(self) -> None:
        """Parse 'Planned' status."""
        assert TaskStatus.from_string("Planned") == TaskStatus.PLANNED
        assert TaskStatus.from_string("planned") == TaskStatus.PLANNED

    def test_from_string_completed(self) -> None:
        """Parse 'Completed' status."""
        assert TaskStatus.from_string("Completed") == TaskStatus.COMPLETED

    def test_from_string_done_alias(self) -> None:
        """'Done' is alias for Completed."""
        assert TaskStatus.from_string("Done") == TaskStatus.COMPLETED
        assert TaskStatus.from_string("done") == TaskStatus.COMPLETED

    def test_from_string_in_progress(self) -> None:
        """Parse 'In Progress' status."""
        assert TaskStatus.from_string("In Progress") == TaskStatus.IN_PROGRESS

    def test_from_string_empty_defaults_to_planned(self) -> None:
        """Empty string defaults to Planned."""
        assert TaskStatus.from_string("") == TaskStatus.PLANNED


class TestTaskEntity:
    """Test suite for Task entity."""

    def test_create_minimal_task(self) -> None:
        """Create task with minimal required fields."""
        task = Task(
            task_id="TEST-001",
            section="Test",
            description="Test task",
            owner="DevOps",
        )
        assert task.task_id == "TEST-001"
        assert task.tier == Tier.C
        assert task.status == TaskStatus.PLANNED

    def test_task_id_required(self) -> None:
        """Task ID cannot be empty."""
        with pytest.raises(ValueError, match="task_id cannot be empty"):
            Task(
                task_id="",
                section="Test",
                description="Test",
                owner="Owner",
            )

    def test_tier_a_complete_check_fails_without_owner(self) -> None:
        """Tier A task incomplete without acceptance_owner."""
        task = Task(
            task_id="TEST-001",
            section="Test",
            description="Test",
            owner="Owner",
            tier=Tier.A,
            gate_profile=GateProfile.STRICT,
            evidence_required=("spec", "plan"),
            acceptance_criteria="Must work",
        )
        # Missing acceptance_owner
        assert task.is_tier_a_complete() is False

    def test_tier_a_complete_check_fails_without_gates(self) -> None:
        """Tier A task incomplete without gate_profile."""
        task = Task(
            task_id="TEST-001",
            section="Test",
            description="Test",
            owner="Owner",
            tier=Tier.A,
            acceptance_owner="Lead",
            evidence_required=("spec",),
            acceptance_criteria="Must work",
            gate_profile=GateProfile.NONE,  # Invalid for Tier A
        )
        assert task.is_tier_a_complete() is False

    def test_tier_a_complete_check_passes(self) -> None:
        """Tier A task complete with all required fields."""
        task = Task(
            task_id="TEST-001",
            section="Test",
            description="Test",
            owner="Owner",
            tier=Tier.A,
            acceptance_owner="Lead",
            evidence_required=("spec", "plan", "validation"),
            acceptance_criteria="System must respond in <100ms",
            gate_profile=GateProfile.STRICT,
        )
        assert task.is_tier_a_complete() is True

    def test_tier_b_always_complete(self) -> None:
        """Tier B tasks don't require full evidence pack."""
        task = Task(
            task_id="TEST-001",
            section="Test",
            description="Test",
            owner="Owner",
            tier=Tier.B,
        )
        assert task.is_tier_a_complete() is True

    def test_requires_review_tier_a(self) -> None:
        """Tier A tasks require review."""
        task = Task(
            task_id="TEST-001",
            section="Test",
            description="Test",
            owner="Owner",
            tier=Tier.A,
        )
        assert task.requires_review() is True

    def test_requires_review_explicit_flag(self) -> None:
        """Explicit review_required flag overrides tier."""
        task = Task(
            task_id="TEST-001",
            section="Test",
            description="Test",
            owner="Owner",
            tier=Tier.C,
            review_required=True,
        )
        assert task.requires_review() is True

    def test_with_override_tier(self) -> None:
        """Override tier creates new task."""
        original = Task(
            task_id="TEST-001",
            section="Test",
            description="Test",
            owner="Owner",
            tier=Tier.C,
        )
        updated = original.with_override(tier=Tier.A)

        assert original.tier == Tier.C  # Immutable
        assert updated.tier == Tier.A
        assert updated.task_id == original.task_id

    def test_with_override_dependencies_remove(self) -> None:
        """Override can remove dependencies."""
        original = Task(
            task_id="TEST-001",
            section="Test",
            description="Test",
            owner="Owner",
            dependencies=("DEP-1", "DEP-2", "DEP-3"),
        )
        updated = original.with_override(dependencies_remove=("DEP-2",))

        assert "DEP-2" in original.dependencies
        assert "DEP-2" not in updated.dependencies
        assert "DEP-1" in updated.dependencies

    def test_with_override_dependencies_add(self) -> None:
        """Override can add dependencies."""
        original = Task(
            task_id="TEST-001",
            section="Test",
            description="Test",
            owner="Owner",
            dependencies=("DEP-1",),
        )
        updated = original.with_override(dependencies_add=("DEP-2", "DEP-3"))

        assert len(updated.dependencies) == 3

    def test_with_override_sprint(self) -> None:
        """Override can change sprint."""
        original = Task(
            task_id="TEST-001",
            section="Test",
            description="Test",
            owner="Owner",
            sprint=5,
        )
        updated = original.with_override(sprint_override=1)

        assert original.sprint == 5
        assert updated.sprint == 1

    def test_task_is_frozen(self) -> None:
        """Task is immutable (frozen dataclass)."""
        task = Task(
            task_id="TEST-001",
            section="Test",
            description="Test",
            owner="Owner",
        )
        with pytest.raises(Exception):  # FrozenInstanceError
            task.tier = Tier.A
