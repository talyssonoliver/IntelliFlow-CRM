"""Validation rules for plan linting."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Optional


class RuleSeverity(Enum):
    """Severity level for validation rules."""
    ERROR = "error"      # CI must fail
    WARNING = "warning"  # Add to review queue
    INFO = "info"        # Informational only


@dataclass(frozen=True)
class ValidationResult:
    """Result of a validation rule check."""
    rule_id: str
    severity: RuleSeverity
    message: str
    tasks: tuple[str, ...] = field(default_factory=tuple)
    fix_suggestion: str = ""
    priority: str = "medium"
    metadata: dict = field(default_factory=dict)

    def is_error(self) -> bool:
        """Check if this is a hard failure."""
        return self.severity == RuleSeverity.ERROR

    def is_warning(self) -> bool:
        """Check if this is a warning."""
        return self.severity == RuleSeverity.WARNING


# Rule IDs - Hard Rules (CI fails)
RULE_NO_CYCLES = "NO_CYCLES"
RULE_NO_CROSS_SPRINT_UNRESOLVED = "NO_CROSS_SPRINT_UNRESOLVED"
RULE_DEPS_RESOLVE = "DEPS_RESOLVE"
RULE_TIER_A_GATES_REQUIRED = "TIER_A_GATES_REQUIRED"
RULE_TIER_A_OWNER_REQUIRED = "TIER_A_OWNER_REQUIRED"
RULE_TIER_A_EVIDENCE_REQUIRED = "TIER_A_EVIDENCE_REQUIRED"
RULE_TIER_A_ACCEPTANCE_REQUIRED = "TIER_A_ACCEPTANCE_REQUIRED"
RULE_TASK_ID_UNIQUE = "TASK_ID_UNIQUE"
RULE_PHANTOM_COMPLETION = "PHANTOM_COMPLETION"  # Completed but missing artifacts
RULE_INVALID_ARTIFACT_PATH = "INVALID_ARTIFACT_PATH"  # Artifact path is prose, not a file path

# Rule IDs - Soft Rules (warnings)
RULE_MISSING_VALIDATION = "MISSING_VALIDATION"
RULE_TIER_B_MISSING_GATES = "TIER_B_MISSING_GATES"
RULE_HIGH_FANOUT = "HIGH_FANOUT"
RULE_WAIVER_EXPIRING = "WAIVER_EXPIRING"
RULE_DEBT_EXPIRING = "DEBT_EXPIRING"
RULE_AI_TASKS_MVP = "AI_TASKS_MVP"
RULE_ARTIFACT_PATH_SUGGESTION = "ARTIFACT_PATH_SUGGESTION"  # Artifact exists at different path


@dataclass
class LintRule:
    """Definition of a lint rule."""
    rule_id: str
    description: str
    severity: RuleSeverity
    enabled: bool = True
    threshold: Optional[int] = None  # For rules like HIGH_FANOUT


# Default rule configurations
DEFAULT_HARD_RULES = [
    LintRule(RULE_NO_CYCLES, "No dependency cycles allowed", RuleSeverity.ERROR),
    LintRule(RULE_NO_CROSS_SPRINT_UNRESOLVED, "No unresolved cross-sprint dependencies", RuleSeverity.ERROR),
    LintRule(RULE_DEPS_RESOLVE, "All dependencies must exist", RuleSeverity.ERROR),
    LintRule(RULE_TIER_A_GATES_REQUIRED, "Tier A tasks must have gate_profile", RuleSeverity.ERROR),
    LintRule(RULE_TIER_A_OWNER_REQUIRED, "Tier A tasks must have acceptance_owner", RuleSeverity.ERROR),
    LintRule(RULE_TIER_A_EVIDENCE_REQUIRED, "Tier A tasks must have evidence_required", RuleSeverity.ERROR),
    LintRule(RULE_TIER_A_ACCEPTANCE_REQUIRED, "Tier A tasks must have acceptance_criteria", RuleSeverity.ERROR),
    LintRule(RULE_TASK_ID_UNIQUE, "Task IDs must be unique", RuleSeverity.ERROR),
]

DEFAULT_SOFT_RULES = [
    LintRule(RULE_MISSING_VALIDATION, "Task should have validation commands", RuleSeverity.WARNING),
    LintRule(RULE_TIER_B_MISSING_GATES, "Tier B tasks should have gate_profile", RuleSeverity.WARNING),
    LintRule(RULE_HIGH_FANOUT, "High fan-out tasks need careful validation", RuleSeverity.INFO, threshold=3),
    LintRule(RULE_WAIVER_EXPIRING, "Waiver expiring soon", RuleSeverity.WARNING),
    LintRule(RULE_DEBT_EXPIRING, "Technical debt expiring soon", RuleSeverity.WARNING),
    LintRule(RULE_AI_TASKS_MVP, "AI/predictive tasks should have MVP criteria", RuleSeverity.WARNING),
]


def create_cycle_error(cycle: list[str]) -> ValidationResult:
    """Create validation result for a cycle error."""
    return ValidationResult(
        rule_id=RULE_NO_CYCLES,
        severity=RuleSeverity.ERROR,
        message=f"Dependency cycle detected: {' -> '.join(cycle)}",
        tasks=tuple(cycle[:-1]),  # Exclude repeated last element
        fix_suggestion="Add override_deps_remove in plan-overrides.yaml to break cycle",
        priority="critical",
    )


def create_cross_sprint_error(
    task_id: str,
    task_sprint: int,
    dep_id: str,
    dep_sprint: int,
) -> ValidationResult:
    """Create validation result for a cross-sprint dependency error."""
    return ValidationResult(
        rule_id=RULE_NO_CROSS_SPRINT_UNRESOLVED,
        severity=RuleSeverity.ERROR,
        message=f"Cross-sprint dependency: {task_id} (Sprint {task_sprint}) depends on {dep_id} (Sprint {dep_sprint})",
        tasks=(task_id, dep_id),
        fix_suggestion="Add sprint_override or override_deps_remove in plan-overrides.yaml, or set cross_sprint_allowed=Y",
        priority="high",
    )


def create_unresolved_dep_error(task_id: str, dep: str) -> ValidationResult:
    """Create validation result for an unresolved dependency."""
    return ValidationResult(
        rule_id=RULE_DEPS_RESOLVE,
        severity=RuleSeverity.ERROR,
        message=f"Task {task_id} has unresolved dependency: {dep}",
        tasks=(task_id,),
        fix_suggestion="Fix typo in dependency or add missing task to Sprint_plan.csv",
        priority="high",
    )


def create_tier_a_missing_gates_error(task_id: str) -> ValidationResult:
    """Create validation result for Tier A task missing gates."""
    return ValidationResult(
        rule_id=RULE_TIER_A_GATES_REQUIRED,
        severity=RuleSeverity.ERROR,
        message=f"Tier A task {task_id} missing gate_profile",
        tasks=(task_id,),
        fix_suggestion="Add gate_profile to task in plan-overrides.yaml",
        priority="high",
    )


def create_tier_a_missing_owner_error(task_id: str) -> ValidationResult:
    """Create validation result for Tier A task missing owner."""
    return ValidationResult(
        rule_id=RULE_TIER_A_OWNER_REQUIRED,
        severity=RuleSeverity.ERROR,
        message=f"Tier A task {task_id} missing acceptance_owner",
        tasks=(task_id,),
        fix_suggestion="Add acceptance_owner to task in plan-overrides.yaml",
        priority="high",
    )


def create_tier_a_missing_evidence_error(task_id: str) -> ValidationResult:
    """Create validation result for Tier A task missing evidence."""
    return ValidationResult(
        rule_id=RULE_TIER_A_EVIDENCE_REQUIRED,
        severity=RuleSeverity.ERROR,
        message=f"Tier A task {task_id} missing evidence_required",
        tasks=(task_id,),
        fix_suggestion="Add evidence_required list to task in plan-overrides.yaml",
        priority="high",
    )


def create_tier_a_missing_acceptance_error(task_id: str) -> ValidationResult:
    """Create validation result for Tier A task missing acceptance criteria."""
    return ValidationResult(
        rule_id=RULE_TIER_A_ACCEPTANCE_REQUIRED,
        severity=RuleSeverity.ERROR,
        message=f"Tier A task {task_id} missing acceptance_criteria",
        tasks=(task_id,),
        fix_suggestion="Add Acceptance Criteria column value in Sprint_plan.csv",
        priority="high",
    )


def create_duplicate_id_error(task_id: str, count: int) -> ValidationResult:
    """Create validation result for duplicate task ID."""
    return ValidationResult(
        rule_id=RULE_TASK_ID_UNIQUE,
        severity=RuleSeverity.ERROR,
        message=f"Task ID {task_id} appears {count} times (must be unique)",
        tasks=(task_id,),
        fix_suggestion="Rename duplicate task IDs in Sprint_plan.csv",
        priority="critical",
    )


def create_high_fanout_warning(task_id: str, fanout: int) -> ValidationResult:
    """Create validation result for high fan-out task."""
    return ValidationResult(
        rule_id=RULE_HIGH_FANOUT,
        severity=RuleSeverity.INFO,
        message=f"Task {task_id} has {fanout} direct dependents (high fan-out)",
        tasks=(task_id,),
        priority="high",
        metadata={"fanout": fanout},
    )


def create_missing_validation_warning(task_id: str, section: str) -> ValidationResult:
    """Create validation result for task missing validation commands."""
    return ValidationResult(
        rule_id=RULE_MISSING_VALIDATION,
        severity=RuleSeverity.WARNING,
        message=f"Task {task_id} has no validation commands in validation.yaml",
        tasks=(task_id,),
        priority="medium",
        metadata={"section": section},
    )


def create_phantom_completion_error(
    task_id: str,
    missing_artifacts: list[str],
    suggestions: dict[str, str] | None = None,
) -> ValidationResult:
    """Create validation result for task marked complete but missing artifacts."""
    artifact_list = ", ".join(missing_artifacts[:3])
    if len(missing_artifacts) > 3:
        artifact_list += f" (+{len(missing_artifacts) - 3} more)"

    fix_suggestion = "Either create the missing artifacts or revert task status to In Progress"
    if suggestions:
        suggestion_text = "; ".join(
            f"'{old}' might be at '{new}'" for old, new in list(suggestions.items())[:2]
        )
        fix_suggestion = f"Possible path corrections: {suggestion_text}. Update Sprint_plan.csv or plan-overrides.yaml"

    return ValidationResult(
        rule_id=RULE_PHANTOM_COMPLETION,
        severity=RuleSeverity.ERROR,
        message=f"PHANTOM COMPLETION: Task {task_id} marked Completed but missing artifacts: {artifact_list}",
        tasks=(task_id,),
        fix_suggestion=fix_suggestion,
        priority="critical",
        metadata={
            "missing_artifacts": missing_artifacts,
            "missing_count": len(missing_artifacts),
            "suggestions": suggestions or {},
        },
    )


def create_invalid_artifact_path_error(
    task_id: str,
    invalid_path: str,
    reason: str,
) -> ValidationResult:
    """Create validation result for artifact path that is prose, not a file path."""
    return ValidationResult(
        rule_id=RULE_INVALID_ARTIFACT_PATH,
        severity=RuleSeverity.ERROR,
        message=f"INVALID ARTIFACT PATH: Task {task_id} has non-path artifact: '{invalid_path[:50]}...' ({reason})",
        tasks=(task_id,),
        fix_suggestion="Replace prose descriptions with actual file paths in Sprint_plan.csv 'Artifacts To Track' column",
        priority="critical",
        metadata={
            "invalid_path": invalid_path,
            "reason": reason,
        },
    )


def create_artifact_suggestion_warning(
    task_id: str,
    expected_path: str,
    suggested_path: str,
) -> ValidationResult:
    """Create warning suggesting correct artifact path."""
    return ValidationResult(
        rule_id=RULE_ARTIFACT_PATH_SUGGESTION,
        severity=RuleSeverity.WARNING,
        message=f"Task {task_id}: artifact '{expected_path}' not found, but similar file exists at '{suggested_path}'",
        tasks=(task_id,),
        fix_suggestion=f"Update Sprint_plan.csv or plan-overrides.yaml to use '{suggested_path}'",
        priority="medium",
        metadata={
            "expected_path": expected_path,
            "suggested_path": suggested_path,
        },
    )


def is_valid_artifact_path(path: str) -> tuple[bool, str]:
    """
    Check if a string looks like a valid artifact path vs prose text.

    Returns (is_valid, reason) tuple.

    Valid paths:
    - Start with alphanumeric, dot, or ./
    - Contain / or \\ as path separators
    - End with file extension or /* for globs
    - No sentences (multiple spaces between words)

    Invalid paths (prose):
    - Contain multiple spaces between words
    - Look like sentences (subject + verb patterns)
    - Start with articles (A, An, The)
    - Contain common prose words without path chars
    """
    path = path.strip()

    if not path:
        return False, "empty path"

    # Check for sentence patterns (multiple consecutive words with spaces)
    words = path.split()
    if len(words) > 4 and " " in path and "/" not in path and "\\" not in path:
        return False, "looks like prose (multiple words, no path separators)"

    # Check for common prose starters
    prose_starters = ("a ", "an ", "the ", "all ", "no ", "each ", "every ", "this ", "that ")
    if path.lower().startswith(prose_starters):
        return False, "starts with article/determiner"

    # Check for common prose verbs that wouldn't appear in file paths
    prose_patterns = (
        " is ", " are ", " was ", " were ", " has ", " have ", " had ",
        " running ", " configured ", " enabled ", " installed ", " stored ",
        " verified ", " completed ", " generated ", " created ",
    )
    for pattern in prose_patterns:
        if pattern in path.lower():
            return False, f"contains verb phrase '{pattern.strip()}'"

    # Check if it has path-like characteristics
    has_path_separator = "/" in path or "\\" in path
    has_extension = "." in path.split("/")[-1] if "/" in path else "." in path
    has_glob = "*" in path
    starts_valid = path[0].isalnum() or path.startswith((".", "./", "../", "/"))

    if not starts_valid:
        return False, "doesn't start with valid path character"

    if not has_path_separator and not has_extension and not has_glob:
        # Single word without extension might be a directory
        if len(path) > 30:
            return False, "too long for single directory name"

    return True, "valid"


def find_similar_paths(
    missing_path: str,
    project_root: "Path",
    max_suggestions: int = 3,
) -> list[str]:
    """
    Find similar files that might be the intended artifact.

    Searches for:
    - Common path variations (packages vs apps, misc vs root)
    - Does NOT do expensive filesystem searches (rglob)

    This is a fast, heuristic-based approach that checks known path variations.
    """
    from pathlib import Path

    suggestions: list[str] = []

    # Extract the filename
    if "/" in missing_path:
        filename = missing_path.split("/")[-1]
        # Handle glob patterns
        if "*" in filename:
            filename = filename.replace("*", "")
    else:
        filename = missing_path

    if not filename or filename == "*":
        return suggestions

    # Common path variations to check (fast, no filesystem search)
    path_variations = [
        # Original might be in artifacts/misc, actual might be at root
        ("artifacts/misc/", ""),
        ("artifacts/", ""),
        # packages vs apps variations
        ("packages/ai/", "apps/ai-worker/"),
        ("packages/api/", "apps/api/"),
        ("packages/api/src/", "apps/api/src/"),
        # Different component locations
        ("apps/web/components/", "apps/web/src/components/"),
        ("apps/web/components/", "packages/ui/src/components/"),
        ("apps/web/components/ui/", "packages/ui/src/components/"),
        # Prisma location variations
        ("artifacts/misc/prisma/", "packages/db/prisma/"),
        # Documentation variations
        ("artifacts/misc/", "docs/"),
    ]

    # Try path variations (fast - just checks if alternative exists)
    for old_prefix, new_prefix in path_variations:
        if old_prefix in missing_path:
            alternative = missing_path.replace(old_prefix, new_prefix)
            if not alternative:
                alternative = filename

            alt_path = project_root / alternative.lstrip("/")

            # For glob patterns, check if the parent directory exists
            if "*" in alternative:
                dir_part = alternative.split("*")[0].rstrip("/")
                check_path = project_root / dir_part
            else:
                check_path = alt_path

            if check_path.exists():
                if alternative not in suggestions:
                    suggestions.append(alternative)
                    if len(suggestions) >= max_suggestions:
                        return suggestions

    # Also try the root directly for files that might be at project root
    if "artifacts/misc/" in missing_path or "artifacts/" in missing_path:
        root_path = project_root / filename
        if root_path.exists() and filename not in suggestions:
            suggestions.append(filename)

    return suggestions
