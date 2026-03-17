#!/usr/bin/env python3
"""
Wire RED orphan audit artifacts to Sprint_plan.csv tasks.
Adds ARTIFACT: entries to existing task rows without duplicating.
"""

import csv
import io
import sys
import os

CSV_PATH = os.path.join(
    os.path.dirname(__file__), '../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'
)

# Maps task_id -> list of ARTIFACT: entries to add
WIRINGS: dict[str, list[str]] = {
    # ==========================================================================
    # Batch A: docs/design/mockups/ -> BRAND-001
    # ==========================================================================
    'BRAND-001': [
        'ARTIFACT:docs/design/mockups/*',
        'ARTIFACT:docs/company/brand/design-system-preview.html',
        'ARTIFACT:apps/web/public/fonts/MaterialSymbolsOutlined.woff2',
    ],

    # ==========================================================================
    # Batch B: tools/ -> AUTOMATION-001
    # ==========================================================================
    'AUTOMATION-001': [
        'ARTIFACT:tools/plan/*',
        'ARTIFACT:tools/audit/*',
        'ARTIFACT:tools/scripts/attest-sprint.ts',
        'ARTIFACT:tools/scripts/detect-phantom-completions.ts',
        'ARTIFACT:tools/scripts/quality-report.ts',
        'ARTIFACT:tools/plan-linter/package.json',
        'ARTIFACT:tools/scripts/lib/stoa/waiver.ts',
        'ARTIFACT:docs/plan-change-log.md',
        'ARTIFACT:docs/plan-governance.md',
    ],

    # tools/integrations -> AI-SETUP-001
    'AI-SETUP-001': [
        'ARTIFACT:tools/integrations/codex/*',
        'ARTIFACT:tools/integrations/jules/*',
    ],

    # ==========================================================================
    # Batch C: scattered files
    # ==========================================================================

    # Docker workers -> ENV-003-AI
    'ENV-003-AI': [
        'ARTIFACT:apps/workers/events-worker/Dockerfile',
        'ARTIFACT:apps/workers/ingestion-worker/Dockerfile',
        'ARTIFACT:apps/workers/notifications-worker/Dockerfile',
        'ARTIFACT:docs/setup/docker-compose-overlays.md',
    ],

    # packages tsconfig + test helpers -> ENV-002-AI
    'ENV-002-AI': [
        'ARTIFACT:packages/ai/tsconfig.json',
        'ARTIFACT:packages/search/tsconfig.json',
        'ARTIFACT:tests/utils/test-helpers.ts',
        'ARTIFACT:artifacts/reports/code-analysis/knip-report.json',
    ],

    # packages/db .env.example + scripts/reset-test-db -> ENV-004-AI
    'ENV-004-AI': [
        'ARTIFACT:packages/db/.env.example',
        'ARTIFACT:scripts/reset-test-db.ps1',
        'ARTIFACT:scripts/reset-test-db.sh',
    ],

    # shared DDD base tests -> IFC-101
    'IFC-101': [
        'ARTIFACT:packages/domain/src/shared/__tests__/AggregateRoot.test.ts',
        'ARTIFACT:packages/domain/src/shared/__tests__/DomainEvent.test.ts',
        'ARTIFACT:packages/domain/src/shared/__tests__/Entity.test.ts',
        'ARTIFACT:packages/domain/src/shared/__tests__/ValueObject.test.ts',
        'ARTIFACT:packages/domain/src/shared/__tests__/Guard.test.ts',
    ],

    # calendar adapter tests -> IFC-089
    'IFC-089': [
        'ARTIFACT:packages/adapters/src/calendar/__tests__/CalendarAdapter.test.ts',
        'ARTIFACT:packages/adapters/src/calendar/__tests__/CalendarIntegration.test.ts',
    ],

    # hexagonal architecture -> IFC-106
    'IFC-106': [
        'ARTIFACT:packages/application/src/errors/ApplicationErrors.ts',
        'ARTIFACT:docs/architecture/adr/001-hexagonal-architecture.md',
        'ARTIFACT:docs/architecture/overview.md',
        'ARTIFACT:tests/architecture/dependency-rules.ts',
    ],

    # observability tracing example -> IFC-074
    'IFC-074': [
        'ARTIFACT:apps/api/src/tracing/example.ts',
    ],

    # quality reports -> EXP-REPORTS-004
    'EXP-REPORTS-004': [
        'ARTIFACT:apps/web/src/app/api/quality-reports/job-storage.ts',
        'ARTIFACT:artifacts/missing-attestations.json',
    ],

    # stories -> IFC-076 (Component Library)
    'IFC-076': [
        'ARTIFACT:apps/web/src/components/billing/checkout-form.stories.tsx',
        'ARTIFACT:apps/web/src/components/shared/email-verification.stories.tsx',
        'ARTIFACT:apps/web/src/components/shared/mfa-qr-generator.stories.tsx',
        'ARTIFACT:apps/web/src/components/shared/mfa-verification.stories.tsx',
    ],

    # partner benefits -> PG-006
    'PG-006': [
        'ARTIFACT:apps/web/src/data/partner-benefits.json',
    ],

    # E2E global teardown -> PG-164
    'PG-164': [
        'ARTIFACT:tests/e2e/global-teardown.ts',
    ],

    # integration tests -> IFC-045
    'IFC-045': [
        'ARTIFACT:tests/integration/api.test.ts',
        'ARTIFACT:tests/integration/README.md',
    ],

    # autocomplete demo -> IFC-042
    'IFC-042': [
        'ARTIFACT:artifacts/misc/autocomplete-demo.gif.md',
    ],

    # compliance calendar -> IFC-073
    'IFC-073': [
        'ARTIFACT:artifacts/misc/compliance-calendar.json',
    ],

    # review queues -> EXP-REPORTS-002
    'EXP-REPORTS-002': [
        'ARTIFACT:artifacts/reports/review-queue.json',
        'ARTIFACT:artifacts/reports/stoa-review-queue.json',
    ],

    # traceability matrix -> IFC-146
    'IFC-146': [
        'ARTIFACT:artifacts/reports/traceability-matrix.json',
    ],

    # attestation/evidence schemas -> IFC-160
    'IFC-160': [
        'ARTIFACT:docs/attestation-schema.yaml',
        'ARTIFACT:docs/evidence-pack-schema.yaml',
    ],

    # easypanel runbook -> EP-001-AI
    'EP-001-AI': [
        'ARTIFACT:docs/operations/easypanel-runbook.md',
    ],

    # sonarqube setup -> ENV-009-AI
    'ENV-009-AI': [
        'ARTIFACT:docs/setup/sonarqube-setup.md',
    ],

    # multi-tenancy migration files -> IFC-127
    'IFC-127': [
        'ARTIFACT:packages/db/prisma/migrations/add-multi-tenancy-diff.sql',
        'ARTIFACT:packages/db/prisma/migrations/add_multi_tenancy_manual.sql',
        'ARTIFACT:packages/db/prisma/migrations/tenant-rls.sql',
    ],
}


def read_csv_raw(path: str) -> str:
    with open(path, 'r', encoding='utf-8', newline='') as f:
        return f.read()


def write_csv_raw(path: str, content: str) -> None:
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(content)


def wire_artifacts(csv_content: str, wirings: dict[str, list[str]]) -> tuple[str, dict[str, int]]:
    """
    Parse the CSV line by line, find task rows, and append missing ARTIFACT entries.
    Returns (updated_csv_content, stats_dict).
    """
    lines = csv_content.split('\n')
    # First line is header
    header_line = lines[0] if lines else ''

    # Parse header to find column indices
    # Use csv reader on header
    header_reader = csv.reader(io.StringIO(header_line))
    headers = next(header_reader, [])

    # Find the Deliverables column (column 12, 0-indexed = column M typically)
    # Based on the CSV structure seen, column 0=Task ID, column 12=Deliverables (artifacts)
    # Let's detect by scanning header
    task_id_col = 0
    deliverables_col = None
    for i, h in enumerate(headers):
        hl = h.strip().lower()
        if hl in ('deliverables', 'deliverable', 'artifacts'):
            deliverables_col = i
            break

    if deliverables_col is None:
        # Try index 12 (0-based) based on CSV structure observed
        deliverables_col = 12
        print(f"Warning: Could not find Deliverables header, using column {deliverables_col}")

    stats: dict[str, int] = {}
    updated_lines = [lines[0]]  # keep header

    for line_no, line in enumerate(lines[1:], start=2):
        if not line.strip():
            updated_lines.append(line)
            continue

        # Parse this row
        reader = csv.reader(io.StringIO(line))
        try:
            row = next(reader)
        except StopIteration:
            updated_lines.append(line)
            continue

        if not row:
            updated_lines.append(line)
            continue

        task_id = row[0].strip()

        if task_id not in wirings:
            updated_lines.append(line)
            continue

        # Get deliverables cell
        while len(row) <= deliverables_col:
            row.append('')

        deliverables = row[deliverables_col]

        # Find existing ARTIFACT entries
        existing = set(part.strip() for part in deliverables.split(';') if part.strip())

        added_count = 0
        for artifact in wirings[task_id]:
            if artifact not in existing:
                existing.add(artifact)
                added_count += 1

        stats[task_id] = added_count

        if added_count > 0:
            # Rebuild deliverables keeping original order, appending new ones at end
            original_parts = [p.strip() for p in deliverables.split(';') if p.strip()]
            new_parts = wirings[task_id]
            for p in new_parts:
                if p not in set(original_parts):
                    original_parts.append(p)
            row[deliverables_col] = ';'.join(original_parts)

            # Re-serialize the row as CSV
            out = io.StringIO()
            writer = csv.writer(out, lineterminator='')
            writer.writerow(row)
            updated_lines.append(out.getvalue())
        else:
            updated_lines.append(line)

    return '\n'.join(updated_lines), stats


def main():
    if not os.path.exists(CSV_PATH):
        print(f"ERROR: CSV not found at {CSV_PATH}", file=sys.stderr)
        sys.exit(1)

    content = read_csv_raw(CSV_PATH)
    updated, stats = wire_artifacts(content, WIRINGS)

    total_added = sum(stats.values())
    if total_added == 0:
        print("No changes needed — all artifacts already wired.")
        return

    write_csv_raw(CSV_PATH, updated)
    print(f"Wired artifacts to {len(stats)} tasks ({total_added} new entries):")
    for task_id, count in sorted(stats.items()):
        if count > 0:
            print(f"  {task_id}: +{count} artifact(s)")


if __name__ == '__main__':
    main()
