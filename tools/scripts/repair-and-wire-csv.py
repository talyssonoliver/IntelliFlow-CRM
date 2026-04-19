#!/usr/bin/env python3
"""
Repair Sprint_plan.csv: move artifacts from col12 back to col10,
restore original estimate values, and add new ARTIFACT entries to col10.

The previous run mistakenly appended ARTIFACT entries to col12 (Estimate)
instead of col10 (Artifacts To Track).
"""

import csv
import io
import os

CSV_PATH = os.path.join(
    os.path.dirname(__file__), '../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'
)

# Original estimate values (col12) for each affected task — extracted from the
# original CSV before the bad run corrupted them.
ORIGINAL_ESTIMATES = {
    'AI-SETUP-001':    '60/120/240',
    'ENV-002-AI':      '30/60/120',
    'ENV-003-AI':      '45/90/180',
    'ENV-004-AI':      '60/120/240',
    'ENV-009-AI':      '60/120/240',
    'EP-001-AI':       '180/360/720',
    'AUTOMATION-001':  '120/240/480',
    'IFC-042':         '60/120/240',
    'IFC-045':         '90/180/360',
    'IFC-073':         '60/120/240',
    'IFC-074':         '90/180/360',
    'IFC-076':         '120/240/480',
    'IFC-089':         '90/180/360',
    'PG-006':          '60/120/240',
    'BRAND-001':       '120/240/480',
    'IFC-101':         '120/240/480',
    'IFC-106':         '90/180/360',
    'IFC-127':         '180/360/720',
    'IFC-146':         '90/180/360',
    'IFC-160':         '60/120/240',
    'EXP-REPORTS-002': '30/60/120',
    'EXP-REPORTS-004': '30/60/120',
    'PG-164':          '60/120/240',
}

# New ARTIFACT entries to add to col10 for each task
NEW_ARTIFACTS: dict[str, list[str]] = {
    'BRAND-001': [
        'ARTIFACT:docs/design/mockups/*',
        'ARTIFACT:docs/company/brand/design-system-preview.html',
        'ARTIFACT:apps/web/public/fonts/MaterialSymbolsOutlined.woff2',
    ],
    'AUTOMATION-001': [
        'ARTIFACT:tools/plan/*',
        'ARTIFACT:tools/audit/*',
        'ARTIFACT:tools/scripts/attest-sprint.ts',
        'ARTIFACT:tools/scripts/detect-phantom-completions.ts',
        'ARTIFACT:tools/scripts/quality-report.ts',
        'ARTIFACT:tools/plan-linter/package.json',
        'ARTIFACT:tools/scripts/lib/stoa/waiver.ts',
        'ARTIFACT:docs/planning/plan-change-log.md',
        'ARTIFACT:docs/planning/plan-governance.md',
    ],
    'AI-SETUP-001': [
        'ARTIFACT:tools/integrations/codex/*',
        'ARTIFACT:tools/integrations/jules/*',
    ],
    'ENV-003-AI': [
        'ARTIFACT:apps/workers/events-worker/Dockerfile',
        'ARTIFACT:apps/workers/ingestion-worker/Dockerfile',
        'ARTIFACT:apps/workers/notifications-worker/Dockerfile',
        'ARTIFACT:docs/setup/docker-compose-overlays.md',
    ],
    'ENV-002-AI': [
        'ARTIFACT:packages/ai/tsconfig.json',
        'ARTIFACT:packages/search/tsconfig.json',
        'ARTIFACT:tests/utils/test-helpers.ts',
        'ARTIFACT:artifacts/reports/code-analysis/knip-report.json',
    ],
    'ENV-004-AI': [
        'ARTIFACT:packages/db/.env.example',
        'ARTIFACT:scripts/reset-test-db.ps1',
        'ARTIFACT:scripts/reset-test-db.sh',
    ],
    'IFC-101': [
        'ARTIFACT:packages/domain/src/shared/__tests__/AggregateRoot.test.ts',
        'ARTIFACT:packages/domain/src/shared/__tests__/DomainEvent.test.ts',
        'ARTIFACT:packages/domain/src/shared/__tests__/Entity.test.ts',
        'ARTIFACT:packages/domain/src/shared/__tests__/ValueObject.test.ts',
        'ARTIFACT:packages/domain/src/shared/__tests__/Guard.test.ts',
    ],
    'IFC-089': [
        'ARTIFACT:packages/adapters/src/calendar/__tests__/CalendarAdapter.test.ts',
        'ARTIFACT:packages/adapters/src/calendar/__tests__/CalendarIntegration.test.ts',
    ],
    'IFC-106': [
        'ARTIFACT:packages/application/src/errors/ApplicationErrors.ts',
        'ARTIFACT:docs/architecture/adr/001-hexagonal-architecture.md',
        'ARTIFACT:docs/architecture/overview.md',
        'ARTIFACT:tests/architecture/dependency-rules.ts',
    ],
    'IFC-074': [
        'ARTIFACT:apps/api/src/tracing/example.ts',
    ],
    'EXP-REPORTS-004': [
        'ARTIFACT:apps/web/src/app/api/quality-reports/job-storage.ts',
        'ARTIFACT:artifacts/missing-attestations.json',
    ],
    'IFC-076': [
        'ARTIFACT:apps/web/src/components/billing/checkout-form.stories.tsx',
        'ARTIFACT:apps/web/src/components/shared/email-verification.stories.tsx',
        'ARTIFACT:apps/web/src/components/shared/mfa-qr-generator.stories.tsx',
        'ARTIFACT:apps/web/src/components/shared/mfa-verification.stories.tsx',
    ],
    'PG-006': [
        'ARTIFACT:apps/web/src/data/partner-benefits.json',
    ],
    'ENV-009-AI': [
        'ARTIFACT:docs/setup/sonarqube-setup.md',
    ],
    'EP-001-AI': [
        'ARTIFACT:docs/operations/runbooks/easypanel-runbook.md',
    ],
    'EXP-REPORTS-002': [
        'ARTIFACT:artifacts/reports/review-queue.json',
        'ARTIFACT:artifacts/reports/stoa-review-queue.json',
    ],
    'IFC-042': [
        'ARTIFACT:artifacts/misc/autocomplete-demo.gif.md',
    ],
    'IFC-073': [
        'ARTIFACT:docs/planning/compliance-calendar.json',
    ],
    'IFC-146': [
        'ARTIFACT:artifacts/reports/traceability-matrix.json',
    ],
    'IFC-160': [
        'ARTIFACT:apps/project-tracker/docs/metrics/schemas/attestation-schema.yaml',
        'ARTIFACT:apps/project-tracker/docs/metrics/schemas/evidence-pack-schema.yaml',
    ],
    'IFC-045': [
        'ARTIFACT:tests/integration/api.test.ts',
        'ARTIFACT:tests/integration/README.md',
    ],
    'IFC-127': [
        'ARTIFACT:packages/db/prisma/migrations/add-multi-tenancy-diff.sql',
        'ARTIFACT:infra/supabase/migrations/20260103000000_add_tenant_isolation.sql',
        'ARTIFACT:infra/supabase/rls-policies.sql',
    ],
    'PG-164': [
        'ARTIFACT:tests/e2e/global-teardown.ts',
    ],
}

ALL_AFFECTED = set(ORIGINAL_ESTIMATES.keys())


def strip_artifact_suffix(estimate_val: str) -> str:
    """Remove anything after the first ARTIFACT: token in an estimate string."""
    idx = estimate_val.find(';ARTIFACT:')
    if idx != -1:
        return estimate_val[:idx]
    idx = estimate_val.find('ARTIFACT:')
    if idx == 0:
        # whole col is artifacts — should not happen but handle it
        return ''
    return estimate_val


def repair_and_wire(csv_content: str) -> tuple[str, dict]:
    lines = csv_content.split('\n')
    updated_lines = [lines[0]]  # keep header unchanged
    stats = {}

    for line in lines[1:]:
        if not line.strip():
            updated_lines.append(line)
            continue

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

        if task_id not in ALL_AFFECTED:
            updated_lines.append(line)
            continue

        # Extend row if needed
        while len(row) <= 12:
            row.append('')

        col10_original = row[10]
        col12_current  = row[12]

        # --- Step 1: Restore col12 to clean estimate value ---
        clean_estimate = ORIGINAL_ESTIMATES.get(task_id, strip_artifact_suffix(col12_current))
        row[12] = clean_estimate

        # --- Step 2: Remove any ARTIFACT entries that were appended to col12
        #             and should have gone to col10 (they're already in NEW_ARTIFACTS) ---
        # col10 may already have the bad data from the first run - let's clean it:
        # Extract parts of col10 that are legitimately there (not from our bad run)
        col10_parts = [p.strip() for p in col10_original.split(';') if p.strip()]

        # The new artifacts we want to add
        new_arts = NEW_ARTIFACTS.get(task_id, [])

        # Build final col10: keep original parts + add new ones that aren't already present
        existing_set = set(col10_parts)
        final_parts = list(col10_parts)
        added = 0
        for art in new_arts:
            if art not in existing_set:
                final_parts.append(art)
                added += 1

        row[10] = ';'.join(final_parts)
        stats[task_id] = {'estimate_fixed': clean_estimate, 'artifacts_added': added}

        # Re-serialize
        out = io.StringIO()
        writer = csv.writer(out, lineterminator='')
        writer.writerow(row)
        updated_lines.append(out.getvalue())

    return '\n'.join(updated_lines), stats


def main():
    with open(CSV_PATH, 'r', encoding='utf-8', newline='') as f:
        content = f.read()

    updated, stats = repair_and_wire(content)

    with open(CSV_PATH, 'w', encoding='utf-8', newline='') as f:
        f.write(updated)

    print(f"Repaired {len(stats)} rows:")
    for task_id, s in sorted(stats.items()):
        print(f"  {task_id}: estimate restored to '{s['estimate_fixed']}', +{s['artifacts_added']} new artifact(s) in col10")


if __name__ == '__main__':
    main()
