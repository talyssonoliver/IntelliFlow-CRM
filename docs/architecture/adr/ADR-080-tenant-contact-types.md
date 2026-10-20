# ADR-080: Tenant-Defined Contact Types Keyed by the Existing `contactType` Column

**Status:** Accepted (2026-10-18 — implemented on `feat/pg-205-contact-types`;
GREEN validations passed: typecheck, lint, full suites of every touched package,
build)

**Date:** 2026-10-17

**Deciders:** Talysson Oliveira (owner ruling 2026-10-17: type set A, behaviour
A, default labels = default tags, default fields = default values); PG-205 spec
session

**Technical Story:** PG-205 — Module Settings: Contact Types

## Context and Problem Statement

`Contact.contactType` is a free `String?` column
(`packages/db/prisma/schema.prisma`, `model Contact`) that the validator limits
to a fixed enum `customer | prospect | partner | vendor | investor | other`
(`packages/domain/src/crm/contact/Contact.ts` `CONTACT_TYPES`,
`packages/validators/src/contact.ts` `contactTypeSchema`). Only those six values
(or NULL) can have been written through the API. Nothing reads the value
downstream.

PG-205 makes contact types tenant-configurable. The owner ruled (2026-10-17)
that each tenant **starts with the current six**, can rename, add, recolour or
deactivate types, that **existing contacts keep their stored values (no data
migration)**, and that a type is **applied when a contact is created** (default
values, extra required fields, default tags), like PG-204 / ADR-076.

How do configurable types relate to the existing column without rewriting
`contacts`?

## Decision Drivers

- Owner ruling: no backfill or rewrite of `contacts` (that would be a Class B
  migration, ADR-069).
- Class A only: new table, additive; per-tenant seeding must not be a
  cross-tenant data write in the migration.
- Playbook §8: every stored setting has a runtime consumer.
- Tenant isolation: `prismaWithTenant` does not inject `tenantId`; RLS is not
  FORCEd.
- One source of truth for the system keys (DRY: domain constant, not a second
  list).

## Considered Options

1. **Stable key, string match (chosen).** New `ContactType` table with an
   immutable `key` (unique per tenant) and an editable display `name`.
   `Contact.contactType` keeps storing the key. The six system keys are seeded
   per tenant on first use (idempotent upsert, no `skipDuplicates`). Contact
   create/update validates the key against the caller's tenant's **active**
   types instead of the fixed enum.
2. **New `contactTypeId` FK + backfill.** Rejected: rewrites existing `contacts`
   rows (Class B) and contradicts the owner's "no data migration" answer.
3. **Fixed enum with per-key settings only.** Rejected: the owner wants tenants
   to add and rename types.

## Decision Outcome

Chosen option 1 (PG-205 spec consensus 7/7, 2026-10-17). Accepted 2026-10-18
after the implementation passed its validations.

- `contact_types` table with an immutable server-generated `key`, editable
  `name`; the six `CONTACT_TYPES` are system rows (`isSystem`), seeded lazily
  per tenant under a tenant advisory lock; custom rows can never take a reserved
  key (DB CHECK).
- `contacts.contactType` keeps storing the key (no FK, no backfill).
  Create/update accept a key only if it is an active type of the caller's
  tenant; an unchanged stored key is accepted on update even if inactive.
- Defaults are applied at creation only (ADR-076): status and department
  (explicit input > type), owner rule CREATOR | ACCOUNT_OWNER (same-tenant
  account owner validated by `tenantUserWhere`, else the creator), default tags
  (active same-tenant `ContactTag` rows, merged with input). Required fields =
  tenant-wide rules ∪ the type's fields (real columns), checked after defaults;
  a type change on update checks the new type's fields.
- System types are deactivate-only; custom types can be deleted only when unused
  and not the default.
- Non-behaviours (deliberate): linking an account later never reassigns the
  owner; lead conversion creates untyped contacts; auto-merge keeps the
  survivor's own type; `ContactCreatedEvent` is unchanged.

### Consequences

- **Deploy order (L13):** both Class A migrations,
  `20261017120000_contact_types` and `20261017120100_contacts_type_idx`
  (`CREATE INDEX CONCURRENTLY`), must be applied to production with
  `prisma migrate deploy` **before** the API that reads `contact_types` is
  promoted. The production apply is manual.

- No FK: deleting a type that contacts still use is refused at the application
  layer (count by `tenantId` + `contactType = key`); deactivating is the safe
  path.
- **Accepted risk (owner ruling 8, 2026-10-17):** with no FK, a contact saved at
  the same moment a type is deleted can keep the deleted key. It then behaves
  like any legacy key (neutral badge, filterable, editable), and
  `contactTypes.create` never re-issues a key that contacts still carry. Closing
  the window needs contact writes and the type check in one transaction under
  the contact-types lock (codex waivers `0f290e25` / `148dd60f`).
- **Update save ordering:** `contact.update` writes the account change and the
  other fields in two `ContactService` saves. A link or replace (one
  `replaceAccount` save, target checked in the tenant) runs before the fields,
  and an unlink runs after them, so a failure between the saves never leaves a
  type without an account it requires.
- Renaming a type changes only its label; stored contacts follow automatically.
- Contacts holding a key with no type row (pre-seed data) remain readable; they
  are shown with the key's default label.
- Precedence on create mirrors ADR-076: explicit input > type default > module
  default.

## Links

- ADR-069 (migration risk classes), ADR-076 (case types applied at creation)
- `docs/planning/prd-module-settings.md` — PG-205 Addendum
- `.specify/sprints/sprint-18/context/PG-205/PG-205-owner-ruling.md`
