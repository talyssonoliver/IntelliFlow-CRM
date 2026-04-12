"""Unit tests for DependencyGraph cycle detection and cross-sprint validation."""

import pytest
from src.domain.dependency_graph import (
    DependencyGraph,
    CycleError,
    CrossSprintViolation,
)


class TestCycleDetection:
    """Test suite for dependency cycle detection."""

    def test_no_cycles_in_empty_graph(self) -> None:
        """Empty graph has no cycles."""
        graph = DependencyGraph()
        assert graph.detect_cycles() == []

    def test_no_cycles_in_linear_graph(self) -> None:
        """Linear chain A -> B -> C has no cycles."""
        graph = DependencyGraph()
        graph.add_task("A", ["B"])
        graph.add_task("B", ["C"])
        graph.add_task("C", [])

        cycles = graph.detect_cycles()
        assert cycles == []

    def test_detects_simple_two_node_cycle(self) -> None:
        """Detect A -> B -> A cycle."""
        graph = DependencyGraph()
        graph.add_task("A", ["B"])
        graph.add_task("B", ["A"])

        cycles = graph.detect_cycles()
        assert len(cycles) == 1
        assert set(cycles[0][:-1]) == {"A", "B"}

    def test_detects_three_node_cycle(self) -> None:
        """Detect A -> B -> C -> A cycle."""
        graph = DependencyGraph()
        graph.add_task("A", ["B"])
        graph.add_task("B", ["C"])
        graph.add_task("C", ["A"])

        cycles = graph.detect_cycles()
        assert len(cycles) == 1
        assert set(cycles[0][:-1]) == {"A", "B", "C"}

    def test_detects_self_loop(self) -> None:
        """Detect A -> A self-loop."""
        graph = DependencyGraph()
        graph.add_task("A", ["A"])

        cycles = graph.detect_cycles()
        assert len(cycles) == 1
        assert cycles[0] == ["A", "A"]

    def test_detects_multiple_cycles(self) -> None:
        """Detect multiple independent cycles."""
        graph = DependencyGraph()
        # Cycle 1: A -> B -> A
        graph.add_task("A", ["B"])
        graph.add_task("B", ["A"])
        # Cycle 2: C -> D -> C
        graph.add_task("C", ["D"])
        graph.add_task("D", ["C"])

        cycles = graph.detect_cycles()
        assert len(cycles) == 2

    def test_no_cycle_with_shared_dependency(self) -> None:
        """Diamond pattern is not a cycle: A -> B, A -> C, B -> D, C -> D."""
        graph = DependencyGraph()
        graph.add_task("A", ["B", "C"])
        graph.add_task("B", ["D"])
        graph.add_task("C", ["D"])
        graph.add_task("D", [])

        cycles = graph.detect_cycles()
        assert cycles == []

    def test_cycle_with_branch(self) -> None:
        """Cycle with additional non-cyclic branch."""
        graph = DependencyGraph()
        # Cycle: A -> B -> C -> A
        graph.add_task("A", ["B"])
        graph.add_task("B", ["C"])
        graph.add_task("C", ["A"])
        # Branch: D -> A (not part of cycle)
        graph.add_task("D", ["A"])

        cycles = graph.detect_cycles()
        assert len(cycles) == 1
        assert "D" not in cycles[0]

    def test_real_world_ifc_cycle(self) -> None:
        """Test with real IFC-106 -> IFC-131 -> IFC-106 cycle from production."""
        graph = DependencyGraph()
        graph.add_task("IFC-106", ["IFC-131"])
        graph.add_task("IFC-131", ["IFC-106"])

        cycles = graph.detect_cycles()
        assert len(cycles) == 1
        assert set(cycles[0][:-1]) == {"IFC-106", "IFC-131"}


class TestCrossSprintValidation:
    """Test suite for cross-sprint dependency validation."""

    def test_no_violations_same_sprint(self) -> None:
        """Tasks in same sprint can depend on each other."""
        graph = DependencyGraph()
        graph.add_task("A", ["B"], sprint=1)
        graph.add_task("B", [], sprint=1)

        violations = graph.detect_cross_sprint_violations()
        assert violations == []

    def test_no_violations_earlier_sprint_dependency(self) -> None:
        """Task in Sprint 2 can depend on Sprint 1 task."""
        graph = DependencyGraph()
        graph.add_task("A", ["B"], sprint=2)
        graph.add_task("B", [], sprint=1)

        violations = graph.detect_cross_sprint_violations()
        assert violations == []

    def test_detects_later_sprint_dependency(self) -> None:
        """Detect Sprint 1 task depending on Sprint 2 task."""
        graph = DependencyGraph()
        graph.add_task("A", ["B"], sprint=1)
        graph.add_task("B", [], sprint=2)

        violations = graph.detect_cross_sprint_violations()
        assert len(violations) == 1
        assert violations[0].task_id == "A"
        assert violations[0].task_sprint == 1
        assert violations[0].dependency_id == "B"
        assert violations[0].dependency_sprint == 2
        assert violations[0].is_allowed is False

    def test_allowed_cross_sprint_not_violation(self) -> None:
        """Cross-sprint dependency marked as allowed is not a violation."""
        graph = DependencyGraph()
        graph.add_task("A", ["B"], sprint=1, cross_sprint_allowed=True)
        graph.add_task("B", [], sprint=2)

        violations = graph.detect_cross_sprint_violations()
        assert len(violations) == 1
        assert violations[0].is_allowed is True

    def test_scope_sprint_filters_violations(self) -> None:
        """Only check tasks in scoped sprint."""
        graph = DependencyGraph()
        # Violation in Sprint 1
        graph.add_task("A", ["B"], sprint=1)
        graph.add_task("B", [], sprint=2)
        # Violation in Sprint 3
        graph.add_task("C", ["D"], sprint=3)
        graph.add_task("D", [], sprint=4)

        # Only check Sprint 1
        violations = graph.detect_cross_sprint_violations(scope_sprint=1)
        assert len(violations) == 1
        assert violations[0].task_id == "A"

    def test_continuous_sprint_not_checked(self) -> None:
        """Tasks with no sprint (Continuous) are not checked."""
        graph = DependencyGraph()
        graph.add_task("A", ["B"], sprint=None)
        graph.add_task("B", [], sprint=1)

        violations = graph.detect_cross_sprint_violations()
        assert violations == []

    def test_multiple_violations_same_task(self) -> None:
        """Task with multiple cross-sprint dependencies."""
        graph = DependencyGraph()
        graph.add_task("A", ["B", "C"], sprint=1)
        graph.add_task("B", [], sprint=2)
        graph.add_task("C", [], sprint=3)

        violations = graph.detect_cross_sprint_violations()
        assert len(violations) == 2

    def test_real_world_cross_sprint_violation(self) -> None:
        """Test with real IFC-072 -> IFC-008 violation from production."""
        graph = DependencyGraph()
        graph.add_task("IFC-072", ["IFC-008"], sprint=1)
        graph.add_task("IFC-008", [], sprint=2)

        violations = graph.detect_cross_sprint_violations()
        assert len(violations) == 1
        assert violations[0].task_id == "IFC-072"


class TestUnresolvedDependencies:
    """Test suite for unresolved dependency detection."""

    def test_no_unresolved_when_all_exist(self) -> None:
        """All dependencies exist in graph."""
        graph = DependencyGraph()
        graph.add_task("A", ["B"])
        graph.add_task("B", [])

        unresolved = graph.find_unresolved_dependencies()
        assert unresolved == []

    def test_detects_missing_dependency(self) -> None:
        """Detect reference to non-existent task."""
        graph = DependencyGraph()
        graph.add_task("A", ["B", "C"])
        graph.add_task("B", [])
        # C is not added

        unresolved = graph.find_unresolved_dependencies()
        assert len(unresolved) == 1
        assert unresolved[0] == ("A", "C")

    def test_multiple_unresolved(self) -> None:
        """Multiple tasks with unresolved dependencies."""
        graph = DependencyGraph()
        graph.add_task("A", ["MISSING-1"])
        graph.add_task("B", ["MISSING-2"])

        unresolved = graph.find_unresolved_dependencies()
        assert len(unresolved) == 2


class TestFanoutComputation:
    """Test suite for fan-out (dependent count) computation."""

    def test_fanout_empty_graph(self) -> None:
        """Empty graph has no fanout."""
        graph = DependencyGraph()
        assert graph.compute_fanout() == {}

    def test_fanout_single_dependency(self) -> None:
        """Single dependency gives fanout of 1."""
        graph = DependencyGraph()
        graph.add_task("A", ["B"])
        graph.add_task("B", [])

        fanout = graph.compute_fanout()
        assert fanout["B"] == 1
        assert fanout["A"] == 0

    def test_fanout_multiple_dependents(self) -> None:
        """Task with multiple dependents."""
        graph = DependencyGraph()
        graph.add_task("A", ["C"])
        graph.add_task("B", ["C"])
        graph.add_task("C", [])

        fanout = graph.compute_fanout()
        assert fanout["C"] == 2

    def test_fanout_high_value(self) -> None:
        """Test high fan-out detection threshold."""
        graph = DependencyGraph()
        # Root task with 5 dependents
        graph.add_task("ROOT", [])
        for i in range(5):
            graph.add_task(f"TASK-{i}", ["ROOT"])

        fanout = graph.compute_fanout()
        assert fanout["ROOT"] == 5


class TestTopologicalSort:
    """Test suite for topological sorting."""

    def test_topo_sort_linear(self) -> None:
        """Linear chain produces correct order."""
        graph = DependencyGraph()
        graph.add_task("A", ["B"])
        graph.add_task("B", ["C"])
        graph.add_task("C", [])

        order = graph.topological_sort()
        # C must come before B, B before A
        assert order.index("C") < order.index("B")
        assert order.index("B") < order.index("A")

    def test_topo_sort_raises_on_cycle(self) -> None:
        """Topological sort raises CycleError on cycle."""
        graph = DependencyGraph()
        graph.add_task("A", ["B"])
        graph.add_task("B", ["A"])

        with pytest.raises(CycleError):
            graph.topological_sort()

    def test_topo_sort_diamond(self) -> None:
        """Diamond pattern sorts correctly."""
        graph = DependencyGraph()
        graph.add_task("A", ["B", "C"])
        graph.add_task("B", ["D"])
        graph.add_task("C", ["D"])
        graph.add_task("D", [])

        order = graph.topological_sort()
        assert order.index("D") < order.index("B")
        assert order.index("D") < order.index("C")
        assert order.index("B") < order.index("A")
        assert order.index("C") < order.index("A")
