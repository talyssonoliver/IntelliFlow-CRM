# PG-201 — findings and follow-ups

Task: Module Settings — Scheduled Reports (`/analytics/scheduled-reports`). Sprint 18.

## Decisions taken with the owner

| # | Question | Ruling | Where |
|---|---|---|---|
| Q1 | Where schedules live | Evolve `report_schedules` in place, additively; nothing dropped | owner ruling 2026-10-13 |
| Q2 | Schedule shape | Cron + IANA timezone; presets keep legacy columns consistent | owner ruling 2026-10-13 |
| Q3 | Report Settings delivery card | Replace with a link + one-time copy in the migration | owner ruling 2026-10-13 |
| Q4 | Tags / AI defaults | Add tags (TagsTab via forwardRef); AI defaults N/A (no AI toggle) | owner ruling 2026-10-13 |
| Q5 | Recipient restriction | Keep: any address, manager-only writes; record a follow-up | owner's delegate 2026-10-13 |

## PRODUCTION DATA WRITE (L13)

Migration `packages/db/prisma/migrations/20261013120000_report_schedules_pg201/migration.sql`
copies each tenant's enabled or recipient-bearing `report_settings.scheduledDelivery`
into one **inactive** `report_schedules` row (`id = 'rs-migrated-<tenantId>'`). The
copy is idempotent (deterministic id + `NOT EXISTS` + `ON CONFLICT DO NOTHING`),
tenant-scoped, guards every cast against malformed JSON, and never writes
`report_settings`. Proven by `tests/integration/report-schedules-migration.test.ts`
(run twice, no duplicates, field-for-field mapping, legacy JSON unchanged) on a
migration-built and a `db push`-built database. The production apply is manual and
needs the owner; the additive migration must be applied before the code ships.

## Follow-ups (tracked)

| Item | Category | Tracked in |
|---|---|---|
| Restrict recipients to tenant members or approved domains | security follow-up | GitHub #869; debt-ledger `PG-201-SCHEDULE-RECIPIENT-RESTRICTION` |
| `ReportSchedule.isActive` has no runtime effect until IFC-308 | playbook §8 category 2 | debt-ledger `PG-201-SCHEDULE-ISACTIVE-CATEGORY-2`; IFC-308 CSV row note; ADR-075 |
| `report_executions.scheduleId` FK + index | IFC-308 scope | ADR-075 "Left to IFC-308" |
| Two route-local `SectionHeader` copies remain (territory-mapping, task-settings); a shared `components/shared/section-header.tsx` exists (PG-196). Scheduled Reports now uses the shared one (5745a9266). | DRY follow-up | this file; moving the other two is a separate refactor (L1) |

## Review fixes (2026-10-13)

- Codex semantic review (4 findings, all real, all fixed): cron whitespace normalised
  to match the DB CHECK; an unchanged (possibly another user's private) template is no
  longer re-checked on update; the active-schedule cap is enforced inside the write
  transaction under a per-tenant advisory lock; clearing a tag description stores NULL.
- a11y-expert WCAG 2.1 AA pass: error text and the template link moved to AA-contrast
  colours; cards are `<section aria-labelledby>` regions; focus moves to the first
  invalid field after errors render; required fields marked (`*` + `aria-required`);
  radio group named by its legend; timezone error associated; loading skeleton is an
  `<output>`; the row switch stays focusable while saving; focus returns to the card
  heading after a delete; the tag dialog has a description.
- Pre-existing shared-token contrast (input border, primary button text, destructive
  text token) filed as GitHub #871 — shared tokens, not changed here (L1).

## Observations outside PG-201 (not changed, L1)

- The shared local test DB (`localhost:5433/intelliflow_test`) has the PG-196
  `account_tier_definitions` table without the `20261007120000_account_tiers`
  migration recorded, so `prisma migrate deploy` there fails P3018 (another
  session hit the same at 00:36). I marked my own failed attempt rolled back,
  restoring the prior state, and verified PG-201 on throwaway databases
  (`intelliflow_test_pg201` migrated from scratch; `intelliflow_test_pg201_push`
  built by `db push`, like CI's integration lane).
- `artifacts/reports/content-audit-results.json` on main predates #849 (canonical
  domain); regenerating it shows ~250 unrelated `og_url` changes. PG-201 commits
  only its own line (the route's new `file_path`).
- Drift check (`prisma migrate diff`, migrated DB vs schema) shows three
  pre-existing differences unrelated to PG-201: `report_templates_tenantId_name_idx`,
  `document_type_definitions.updatedAt` default, `users.locale` default.
