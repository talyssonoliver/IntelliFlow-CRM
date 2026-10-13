# ADR-075: Report Schedule Contract (report_schedules for the IFC-308 cron)

**Status:** Accepted (2026-10-13 — implemented on
`feat/pg-201-scheduled-reports`; GREEN validations passed)

**Date:** 2026-10-13

**Deciders:** Talysson Oliveira (owner ruling, 2026-10-13); PG-201 spec session
(Data-Engineer, Security-Lead, Frontend-Lead, Test-Engineer)

**Technical Story:** PG-201 — Module Settings: Scheduled Reports. Consumer:
IFC-308 — Scheduled Report Generation (Backlog, Sprint 24).

## Context and Problem Statement

PG-201 lets a tenant schedule report delivery at `/analytics/scheduled-reports`.
Its task row says IFC-308's BullMQ cron READS these schedules, but IFC-308 does
not exist yet: there is no report-generation job, worker or scheduler. Two
storage shapes already existed and nothing read either of them:

- `report_schedules` (`ReportSchedule`, baseline migration): one row per
  schedule, tied to `report_definitions` (seed-only), with frequency/day/time
  columns.
- `report_settings.scheduledDelivery` (PG-187): one tenant-wide delivery setting
  stored as JSON on the Report Settings page.

The other cron jobs in this repo register with
`queue.upsertJobScheduler(id, { pattern }, { name, data })`
(`apps/ai-worker/src/ai-worker.ts`). What should a schedule row look like so
that IFC-308 can register it directly, without a second scheduler?

## Decision

1. **One table.** `report_schedules` is evolved in place, additively (owner
   ruling: "a new table beside the old one is an anti-pattern"). Nothing is
   dropped; the legacy columns stay. Migration
   `20261013120000_report_schedules_pg201` adds `name`, `description`,
   `cronExpression`, `templateId`, `createdBy`, `colorToken`, `tags`, and makes
   `reportId` and `timeOfDay` nullable.
2. **The cron is the source of truth.** `cronExpression` (5 fields) plus
   `timezone` (IANA) is exactly BullMQ's `{ pattern, tz }`. Presets (daily,
   weekly, monthly, quarterly) are derived to a cron on the server and keep the
   legacy `frequency/dayOfWeek/dayOfMonth/timeOfDay` columns consistent; custom
   crons set `frequency = 'custom'`.
3. **What to deliver.** `templateId` references PG-200 `report_templates`
   through a tenant-consistent composite FK `(tenantId, templateId)`,
   `ON DELETE RESTRICT`. The legacy `reportId` stays.
   `CHECK (NOT isActive OR templateId IS NOT NULL OR reportId IS NOT NULL)`: an
   active schedule always has something to render.
4. **Limits.** At most one run per hour (checked across the coming year's DST
   changes), at most 100 active and 500 total schedules per tenant, and valid
   recipients on activation, all enforced by the API under a per-tenant advisory
   lock, so IFC-308 cannot be turned into a mail cannon.
5. **No scheduler in PG-201.** PG-201 stores `nextRunAt` for display and as a
   starting point. Registering and removing BullMQ job schedulers is IFC-308's
   job.
6. **Run history.** `report_executions` gains a nullable `templateId` and its
   `reportId` becomes nullable, so a template-only schedule can record its runs.

## The contract IFC-308 reads

```sql
SELECT * FROM report_schedules
WHERE "isActive"
  AND "cronExpression" IS NOT NULL
  AND ("templateId" IS NOT NULL OR "reportId" IS NOT NULL);
```

For each row:

```ts
await queue.upsertJobScheduler(
  `report-schedule:${row.id}`,
  { pattern: row.cronExpression, tz: row.timezone },
  {
    name: 'scheduled-report',
    data: { tenantId: row.tenantId, scheduleId: row.id },
  }
);
```

On deactivate or delete: `queue.removeJobScheduler(`report-schedule:${id}`)`.
The job renders `templateId` (a PG-200 layout) or `reportId` (a definition) in
`format` (`pdf | csv | email_body | excel`), emails `recipients` (a JSON array
of addresses), writes a `report_executions` row (`scheduleId`, `templateId` or
`reportId`, status), and updates `lastRunAt` and `nextRunAt`. A schedule's
status is derived from its executions; there is no status column on the
schedule.

Left to IFC-308: the `report_executions.scheduleId` FK and index, and a way for
the API to tell the worker when a schedule changes (the API owns writes; the
worker owns BullMQ).

## Consequences

- Positive: one schedule table; IFC-308 registers rows without translation; the
  rows are tenant-isolated (RLS from the baseline plus the composite FK).
- Positive: the legacy Report Settings delivery setting is not lost — the
  migration copies it once into an inactive schedule (idempotent,
  tenant-scoped).
- Negative: until IFC-308 ships, `isActive` has no runtime effect. The page says
  so.
- Negative: deleting a PG-200 template that a schedule uses is now refused.
- Risk: the copy in the migration is a production data write; the owner applies
  the migration manually.

## Alternatives considered

- A new `scheduled_reports` table — rejected by the owner (duplicate concept).
- Presets only, converted to cron by IFC-308 — rejected: the owner asked for
  cron plus timezone, which BullMQ consumes directly.
- A polling dispatcher (one cron that scans `nextRunAt`) — possible inside
  IFC-308; the contract above supports both, but PG-201 adds neither.
