# ADR-076: Case Types Applied at Case Creation

**Status:** Proposed (2026-10-13; accepted at the end of `/exec` once the GREEN
validations pass)

**Date:** 2026-10-13

**Deciders:** Talysson Oliveira (owner ruling Q1=A, Q2=Yes, 2026-10-13); PG-204
spec session (Backend-Architect, Data-Engineer, Frontend-Lead, Domain-Expert,
Test-Engineer, Security-Lead, A11y-Expert, STOA-Domain)

**Technical Story:** PG-204 — Module Settings: Case Types

## Context and Problem Statement

Cases have no type (`packages/db/prisma/schema.prisma`, `model Case`). PG-204
asks for a case-type taxonomy carrying a default priority, a default SLA,
required fields and a resolution workflow. PG-190 already stores a tenant
`CaseSettings.defaultPriority` and `CaseRequiredField` rows, but nothing reads
them: `cases.create` (`apps/api/src/modules/legal/cases.router.ts`) writes the
request straight to the database. Cases also have no SLA (the `SLAPolicy` model
is ticket-only) and no workflow engine runs on case events.

The owner ruled (2026-10-13) that case types are **applied when a case is
created**, and that the PG-190 module defaults apply when no type is picked,
with the type taking precedence.

Where should the "effective defaults" decision live, what are its precedence
rules, and how do types relate to cases over their lifetime?

## Decision Drivers

- Playbook §8: every persisted setting needs a runtime consumer.
- Hexagonal rule: business decisions in `packages/domain`, zero infra deps.
- Tenant isolation: `prismaWithTenant` does not inject `tenantId`; RLS is not
  FORCEd, so app-level scoping is the real boundary.
- Never silently lose classification; never trap admins.
- Class A migration only (ADR-069): additive, nullable column, new tables.

## Considered Options

1. **Apply at creation (chosen).** Type defaults are materialised onto the case
   when it is created (priority, deadline, tasks); later type edits affect only
   future cases.
2. **Live inheritance.** Cases read defaults from their type at display time.
   Rejected: priority and deadline are first-class case columns used by lists,
   filters and overdue logic; live reads would make history change when an admin
   edits a type.
3. **Resolution workflow via `WorkflowDefinition`.** Rejected by the owner (Q1
   option B): nothing runs workflows on case events, so the field would be
   stored and do nothing.

## Decision Outcome

Chosen option 1.

- **Precedence.** Priority: explicit input > type default > PG-190
  `CaseSettings.defaultPriority` (validated) > `MEDIUM`. Deadline: explicit
  input > 23:59:59.999 local on the calendar day N days ahead, in the case
  timezone (UTC when none) > none. Required fields follow the same "type first,
  then module defaults" rule: a type with a non-empty required-field set uses
  that set; otherwise the tenant's PG-190 rows apply (or the PG-190 defaults
  when the tenant has none). Values are checked after defaults are applied, and
  a blank or whitespace-only string counts as missing. The union reading (a type
  adds to the tenant set) was considered and rejected as not what the ruling
  says.
- **Checklist.** The type's resolution checklist is seeded as `PENDING`
  `CaseTask`s in the same transaction as the case.
- **Decision code.** A pure `resolveCaseCreateDefaults` in
  `packages/domain/src/legal/cases/case-type-defaults.ts`; the router does only
  I/O and timezone date maths.
- **Lifecycle.** `caseTypeId` is set at creation only. A type used by cases
  cannot be deleted (deactivate instead); the default type must be active.
- **Tenant-consistent link.** `cases ("tenantId", "caseTypeId")` references
  `case_types ("tenantId", "id")` (MATCH SIMPLE, ON DELETE NO ACTION). Prisma
  cannot express an optional relation over the required `tenantId`, so the
  column is a plain scalar in Prisma and the FK is a documented SQL-only object,
  as with PG-197's partial indexes.
- **Default type** is a picker preselection; the server never infers a type, so
  an omitted type always means the PG-190 module defaults.

### Consequences

- Good: PG-190 defaults stop being dead config; one rule for every case write.
- Good: history is stable; editing a type never rewrites existing cases.
- Bad: changing a case's type after creation is not supported (out of scope).
- Bad: the API's `createCaseSchema.priority` loses its `MEDIUM` default; a
  caller that relied on the default now gets the module default instead (the
  same value for tenants without settings).

## Links

- Owner ruling:
  `.specify/sprints/sprint-18/context/PG-204/PG-204-owner-ruling.md`
- Spec: `.specify/sprints/sprint-18/specifications/PG-204-spec.md`
- PRD: `docs/planning/prd-module-settings.md` (PG-204 Addendum)
- Related: ADR-069 (migration risk classes), ADR-074 (PG-197 precedent)
