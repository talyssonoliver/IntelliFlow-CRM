"""Dependency graph analysis for sprint plan tasks."""

from dataclasses import dataclass, field
from typing import Optional


class CycleError(Exception):
    """Raised when a dependency cycle is detected."""

    def __init__(self, cycle: list[str]) -> None:
        self.cycle = cycle
        super().__init__(f"Dependency cycle detected: {' -> '.join(cycle)}")


class UnresolvedDependencyError(Exception):
    """Raised when a dependency cannot be resolved."""

    def __init__(self, task_id: str, dependency: str) -> None:
        self.task_id = task_id
        self.dependency = dependency
        super().__init__(f"Task {task_id} has unresolved dependency: {dependency}")


@dataclass
class CrossSprintViolation:
    """Represents a cross-sprint dependency violation."""
    task_id: str
    task_sprint: int
    dependency_id: str
    dependency_sprint: int
    is_allowed: bool = False
    reason: str = ""


@dataclass
class DependencyGraph:
    """
    Directed graph of task dependencies with cycle detection.

    Uses adjacency list representation where each task maps to its dependencies.
    Supports:
    - Cycle detection using DFS with coloring
    - Cross-sprint violation detection
    - Fan-out computation (how many tasks depend on each task)
    - Topological sorting
    """
    # task_id -> list of dependency task_ids
    _adjacency: dict[str, list[str]] = field(default_factory=dict)
    # task_id -> sprint number (None for Continuous)
    _sprints: dict[str, Optional[int]] = field(default_factory=dict)
    # task_id -> cross_sprint_allowed flag
    _cross_sprint_allowed: dict[str, bool] = field(default_factory=dict)

    def add_task(
        self,
        task_id: str,
        dependencies: list[str],
        sprint: Optional[int] = None,
        cross_sprint_allowed: bool = False,
    ) -> None:
        """Add a task to the graph."""
        self._adjacency[task_id] = list(dependencies)
        self._sprints[task_id] = sprint
        self._cross_sprint_allowed[task_id] = cross_sprint_allowed

    def task_ids(self) -> set[str]:
        """Return all task IDs in the graph."""
        return set(self._adjacency.keys())

    def get_dependencies(self, task_id: str) -> list[str]:
        """Get dependencies for a task."""
        return self._adjacency.get(task_id, [])

    def get_sprint(self, task_id: str) -> Optional[int]:
        """Get sprint number for a task."""
        return self._sprints.get(task_id)

    def detect_cycles(self) -> list[list[str]]:
        """
        Detect all cycles in the dependency graph using DFS.

        Returns a list of cycles, where each cycle is a list of task IDs
        forming a closed loop.

        Algorithm: DFS with three-color marking (WHITE, GRAY, BLACK)
        - WHITE: not visited
        - GRAY: in current DFS path (recursion stack)
        - BLACK: fully processed

        When we encounter a GRAY node, we've found a cycle.
        """
        WHITE, GRAY, BLACK = 0, 1, 2
        color: dict[str, int] = {node: WHITE for node in self._adjacency}
        cycles: list[list[str]] = []

        def dfs(node: str, path: list[str]) -> None:
            if color[node] == GRAY:
                # Found cycle - extract it from path
                cycle_start = path.index(node)
                cycle = path[cycle_start:] + [node]
                cycles.append(cycle)
                return
            if color[node] == BLACK:
                return

            color[node] = GRAY
            path.append(node)

            for dep in self._adjacency.get(node, []):
                if dep in self._adjacency:  # Only follow edges to known nodes
                    dfs(dep, path.copy())

            color[node] = BLACK

        for node in self._adjacency:
            if color[node] == WHITE:
                dfs(node, [])

        # Deduplicate cycles (same cycle can be found from different starting points)
        unique_cycles: list[list[str]] = []
        seen_cycle_sets: list[frozenset[str]] = []

        for cycle in cycles:
            # Normalize cycle for comparison (excluding the repeated last element)
            cycle_set = frozenset(cycle[:-1])
            if cycle_set not in seen_cycle_sets:
                seen_cycle_sets.append(cycle_set)
                unique_cycles.append(cycle)

        return unique_cycles

    def detect_cross_sprint_violations(
        self,
        scope_sprint: Optional[int] = None,
    ) -> list[CrossSprintViolation]:
        """
        Detect cross-sprint dependency violations.

        A violation occurs when a task in sprint N depends on a task in sprint M
        where M > N (later sprint). This is invalid unless explicitly allowed.

        Args:
            scope_sprint: If provided, only check tasks in this sprint.
                         If None, check all sprints.

        Returns:
            List of CrossSprintViolation objects.
        """
        violations: list[CrossSprintViolation] = []

        for task_id, deps in self._adjacency.items():
            task_sprint = self._sprints.get(task_id)

            # Skip if task has no sprint (Continuous) or not in scope
            if task_sprint is None:
                continue
            if scope_sprint is not None and task_sprint != scope_sprint:
                continue

            for dep_id in deps:
                dep_sprint = self._sprints.get(dep_id)

                # Skip if dependency has no sprint or is not in graph
                if dep_sprint is None:
                    continue

                # Check for violation: depending on a LATER sprint
                if dep_sprint > task_sprint:
                    is_allowed = self._cross_sprint_allowed.get(task_id, False)
                    violations.append(
                        CrossSprintViolation(
                            task_id=task_id,
                            task_sprint=task_sprint,
                            dependency_id=dep_id,
                            dependency_sprint=dep_sprint,
                            is_allowed=is_allowed,
                        )
                    )

        return violations

    def find_unresolved_dependencies(self) -> list[tuple[str, str]]:
        """
        Find all dependencies that reference non-existent tasks.

        Returns list of (task_id, missing_dependency) tuples.
        """
        unresolved: list[tuple[str, str]] = []
        known_tasks = self.task_ids()

        for task_id, deps in self._adjacency.items():
            for dep in deps:
                if dep not in known_tasks:
                    unresolved.append((task_id, dep))

        return unresolved

    def compute_fanout(self) -> dict[str, int]:
        """
        Compute fan-out for each task (how many tasks depend on it).

        Returns dict mapping task_id to count of direct dependents.
        """
        fanout: dict[str, int] = {task_id: 0 for task_id in self._adjacency}

        for deps in self._adjacency.values():
            for dep in deps:
                if dep in fanout:
                    fanout[dep] += 1

        return fanout

    def topological_sort(self) -> list[str]:
        """
        Return tasks in topological order (dependencies before dependents).

        Raises CycleError if cycles exist.
        """
        cycles = self.detect_cycles()
        if cycles:
            raise CycleError(cycles[0])

        # Build reverse adjacency (who depends on each task)
        # Our _adjacency maps task -> [dependencies]
        # We need dependents -> [task] to compute proper in-degree
        dependents: dict[str, list[str]] = {node: [] for node in self._adjacency}
        in_degree: dict[str, int] = {node: 0 for node in self._adjacency}

        for task, deps in self._adjacency.items():
            # task depends on deps, so task's in-degree is len(deps that exist)
            for dep in deps:
                if dep in dependents:
                    dependents[dep].append(task)
                    in_degree[task] += 1

        # Start with nodes that have no dependencies (in_degree = 0)
        queue = [node for node, degree in in_degree.items() if degree == 0]
        result: list[str] = []

        while queue:
            node = queue.pop(0)
            result.append(node)

            # For each task that depends on this node, reduce its in-degree
            for dependent in dependents.get(node, []):
                in_degree[dependent] -= 1
                if in_degree[dependent] == 0:
                    queue.append(dependent)

        return result

    def get_tasks_for_sprint(self, sprint: int) -> set[str]:
        """Get all task IDs for a specific sprint."""
        return {
            task_id
            for task_id, task_sprint in self._sprints.items()
            if task_sprint == sprint
        }

    @classmethod
    def from_tasks(cls, tasks: list["Task"]) -> "DependencyGraph":
        """Build a DependencyGraph from a list of Task entities."""
        from .task import Task  # Import here to avoid circular import

        graph = cls()
        for task in tasks:
            graph.add_task(
                task_id=task.task_id,
                dependencies=list(task.dependencies),
                sprint=task.sprint,
                cross_sprint_allowed=task.cross_sprint_allowed,
            )
        return graph
