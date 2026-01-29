# Plan Governance Tools

Python-based tooling for validating and maintaining the IntelliFlow sprint plan.

## Architecture

This package follows **Hexagonal Architecture** (Ports & Adapters):

```
tools/plan/
├── src/
│   ├── domain/           # Business logic (no dependencies)
│   │   ├── task.py       # Task entity, Tier, GateProfile, Status
│   │   ├── dependency_graph.py  # Cycle detection, cross-sprint validation
│   │   ├── validation_rules.py  # Rule definitions, ValidationResult
│   │   └── debt.py       # DebtEntry, DebtLedger
│   │
│   ├── application/      # Use cases (orchestrates domain)
│   │   ├── lint_plan.py  # LintPlanUseCase
│   │   └── migrate_schema.py  # MigrateSchemaUseCase
│   │
│   └── adapters/         # Infrastructure (I/O, CLI)
│       ├── csv_repository.py  # CSV read/write
│       ├── yaml_loader.py     # plan-overrides.yaml, validation.yaml
│       ├── json_writer.py     # Report generation
│       └── cli.py             # Click CLI commands
│
└── tests/
    ├── unit/             # Domain logic tests
    ├── integration/      # CLI integration tests
    └── fixtures/         # Test CSV files
```

## Installation

```bash
cd tools/plan
pip install -e .
```

## CLI Commands

### lint - Validate Sprint Plan

```bash
# Validate Sprint 0 (default)
plan-lint --sprint 0

# Validate all sprints
plan-lint --all-sprints

# Verbose output with fix suggestions
plan-lint --sprint 0 --verbose

# Custom plan path
plan-lint --plan-path /path/to/Sprint_plan.csv
```

**Exit Codes:**

- `0` - No hard errors (CI passes)
- `1` - Hard errors detected (CI fails)
- `2` - File not found

**Hard Rules (Errors):** | Rule | Description | |------|-------------| |
CYCLE-001 | Dependency cycle detected | | XSPRINT-001 | Forward cross-sprint
dependency | | UNRESOLVED-001 | Dependency task ID not found | | TIER-A-001 |
Tier A missing gate_profile | | TIER-A-002 | Tier A missing acceptance_owner | |
DUP-001 | Duplicate task ID |

**Soft Rules (Warnings):** | Rule | Description | |------|-------------| |
FANOUT-001 | High fan-out (3+ dependents) | | VALIDATION-001 | Missing
validation.yaml entry | | TIER-B-001 | Tier B missing gate_profile | |
WAIVER-001 | Waiver expiring within 30 days |

### migrate - Add Schema v2 Columns

```bash
# Preview changes
plan-migrate --dry-run

# Execute migration
plan-migrate

# Custom path
plan-migrate --plan-path /path/to/Sprint_plan.csv
```

Adds these columns if missing:

- `Tier` (A/B/C)
- `Gate Profile`
- `Evidence Required`
- `Acceptance Owner`

### digest - Generate Daily Digest

```bash
# Generate digest for Sprint 0
plan-digest --sprint 0

# Custom output path
plan-digest --sprint 0 --output /path/to/digest.json
```

## Configuration Files

### plan-overrides.yaml

Override task properties without modifying CSV:

```yaml
schema_version: '1.0'

TASK-001:
  tier: A
  gate_profile: [lint, test, security]
  acceptance_owner: tech-lead
  evidence_required:
    - artifacts/reports/coverage.json
    - artifacts/benchmarks/perf.json
  debt_allowed: false
  waiver_expiry: '2025-03-01'
```

### validation.yaml

Define validation rules per task:

```yaml
TASK-001:
  validators:
    - command: 'pnpm test --coverage'
      expected_exit: 0
    - file_exists: 'artifacts/coverage/lcov.info'
      min_coverage: 90
```

## Reports

### plan-lint-report.json

```json
{
  "meta": {
    "generated_at": "2025-12-17T10:00:00Z",
    "schema_version": "1.0.0",
    "sprint_scope": 0
  },
  "summary": {
    "total_tasks": 27,
    "tier_breakdown": {"A": 5, "B": 10, "C": 12},
    "error_count": 0,
    "warning_count": 3
  },
  "errors": [],
  "warnings": [...],
  "review_queue": [...]
}
```

### review-queue.json

Tasks requiring human attention:

```json
{
  "items": [
    {
      "task_id": "EXC-SEC-001",
      "tier": "A",
      "priority": "critical",
      "reasons": ["Tier A task - requires explicit validation"]
    }
  ]
}
```

## Testing

```bash
# Run all tests
cd tools/plan
python -m pytest tests/ -v

# Run with coverage
python -m pytest tests/ --cov=src --cov-report=html

# Run only unit tests
python -m pytest tests/unit/ -v

# Run only integration tests
python -m pytest tests/integration/ -v
```

## Development

### Adding a New Validation Rule

1. Add rule constant in `src/domain/validation_rules.py`:

   ```python
   RULE_NEW_CHECK = "NEW-001"
   ```

2. Create factory function:

   ```python
   def create_new_check_error(task_id: str) -> ValidationResult:
       return ValidationResult(
           rule_id=RULE_NEW_CHECK,
           severity=RuleSeverity.ERROR,
           message=f"Task {task_id} failed new check",
           tasks=(task_id,),
       )
   ```

3. Add check in `src/application/lint_plan.py`:

   ```python
   def _check_new_rule(self, tasks: list[Task]) -> list[ValidationResult]:
       # Implementation
   ```

4. Call from `execute()`:

   ```python
   result.errors.extend(self._check_new_rule(scoped_tasks))
   ```

5. Add tests in `tests/unit/test_lint_plan.py`

### Sprint Scope Logic

The linter uses sprint scope to filter validation:

- **Scoped sprint**: Only validate tasks in that sprint
- **Cross-sprint deps**: Sprint N cannot depend on Sprint M where M > N
- **Tier A tasks**: Always validated regardless of scope

## Related Documentation

- [ADR-002: CSV as Source of Truth](../../docs/planning/adr/ADR-002-csv-source-of-truth.md)
- [ADR-003: Sprint-Scoped Validation](../../docs/planning/adr/ADR-003-sprint-scoped-validation.md)
- [Sprint Plan CSV](../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv)
- [Data Sync Documentation](../../apps/project-tracker/docs/DATA_SYNC.md)
