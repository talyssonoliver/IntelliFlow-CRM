# PG-204 — open question for the owner (spec-session paused, 2026-10-13)

The spec cannot be written until the owner decides what a case type *does*.
Do not guess; do not re-run the spec rounds until this file records an answer.

## What the code says today (origin/main 47f1b5d84)

- `Case` has **no type field** (`packages/db/prisma/schema.prisma:2124`). Nothing
  in the schema, domain (`packages/domain/src/legal/cases/Case.ts`) or UI has a
  category / matter type / practice area. A case-types page needs a new
  `CaseType` table, which means an additive Prisma migration (Class A).
- The row's taxonomy fields overlap existing PG-190 settings, and those settings
  are **dead config**: `CaseSettings.defaultPriority` and `CaseRequiredField` are
  read only by the settings page itself. `cases.create`
  (`apps/api/src/modules/legal/cases.router.ts:343`) takes priority from the
  form and enforces no required fields.
- "Default SLA": cases have no SLA. `SLAPolicy` (`schema.prisma:2512`) is
  ticket-only (response/resolution minutes per priority). Cases only have
  `deadline`.
- "Resolution workflow": `WorkflowDefinition` (`schema.prisma:4392`) has no
  `case` category, and nothing runs workflows on case events.
- Path: the page lives at `apps/web/src/app/cases/(list)/case-types/page.tsx`
  (stub, served at `/cases/case-types`); case routers live in
  `apps/api/src/modules/legal/`, not `modules/case/` as the row says. The spec
  will record both corrections. The sidebar entry already exists.

## The question: what does a case type do once configured?

- **A (recommended)** — case types are real and applied on case creation.
  New `CaseType` table (name, category, colour, default priority, default SLA in
  days, required fields, resolution checklist, active/default). `Case` gets a
  nullable `caseTypeId`. The New Case form gets a type picker; the server fills
  priority and deadline (today + SLA days) from the type when the user leaves
  them blank, enforces the type's required fields, and on create adds the
  type's resolution checklist as the case's tasks (`CaseTask`). Existing cases
  stay untyped. Biggest scope: settings page plus case-create wiring.
- **B** — same table and type picker, but "resolution workflow" is a reference
  to an existing `WorkflowDefinition`, and running it on case events is a
  follow-up task (it is not built anywhere today). Smaller, but that field would
  be stored and do nothing until the follow-up lands.
- **C** — settings page only: build the configuration (table, router, page) but
  do not touch case creation; applying types to cases becomes a follow-up task.
  Smallest, but it ships configuration that no case reads, which the
  dead-endpoint policy and the PG-196/197 precedent argue against.

Second, smaller question (answer with the letter above):

- **Dead PG-190 settings** — under A or B, should case creation also start
  honouring `CaseSettings.defaultPriority` and the tenant-wide required fields
  when no type is chosen? **Yes (recommended)** keeps one consistent rule;
  **No** means it gets tracked as a separate issue and debt-ledger entry.

## Answer

Talysson, 2026-10-13 (runner modal; full record in `PG-204-owner-ruling.md`):

- **Q1 → A.** Case types are applied at case creation: new `CaseType` table
  (name, category, colour, default priority, default SLA days, required fields,
  resolution checklist, active/default flags); `Case` gets optional
  `caseTypeId`; the New Case form gets a type picker; the server fills blank
  priority/deadline (today + SLA days) from the type, enforces the type's
  required fields, and seeds the type's resolution checklist as `CaseTask`s.
  Additive Prisma migration (manual prod apply, L13).
- **Q2 → Yes.** With no type picked, case creation also applies PG-190
  `defaultPriority` and the tenant-wide required fields. Precedence: type
  first, then PG-190 module defaults.

Consequence: spec rounds may proceed.
