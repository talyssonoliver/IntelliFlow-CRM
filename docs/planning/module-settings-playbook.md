# Module Settings Playbook

**Status**: Canonical. Created 2026-04-14 after the PG-182 / PG-183 audit
rounds.

Any new `Module Settings - <Entity>` task (PG-184 Deals, PG-185 Tickets, PG-186
Documents, PG-187 Reports, PG-188 Billing, PG-189 Appointments, PG-190 Cases,
PG-191 Tasks, etc.) MUST follow this playbook from day one. Every item below is
a real audit finding that already cost a hardening round on PG-182 and PG-183.

Reference implementations:

- Frontend: `apps/web/src/app/contacts/(list)/contact-settings/**` and
  `apps/web/src/app/accounts/(list)/account-settings/**`.
- Backend: `apps/api/src/modules/contact/contact-settings.router.ts` +
  `contact-automation.ts` and the account equivalents.
- Validators: `packages/validators/src/contact-settings.ts` +
  `account-settings.ts`.
- Prisma models: `Contact*` and `Account*` suffix families in
  `packages/db/prisma/schema.prisma`.
- Migration structure:
  `packages/db/prisma/migrations/20260414120000_contact_settings_hardening` and
  `20260414140000_account_settings_hardening`.

## 1. Page layout (frontend)

- Use **`PageHeader`** (`apps/web/src/components/shared/page-header.tsx`) with
  breadcrumbs + title + description + `actions` array. DO NOT use
  `ModuleSettingsLayout` (tabs + sticky sidebar) — that pattern is deprecated
  for module settings.
- Wrap everything in a **12-column bento grid**:
  `grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5`.
- Each section is a `<Card>` with a `SectionHeader` (icon tile + title +
  description + optional `action` slot). Padding: `p-4 sm:p-5`, not `p-6`.
- Full-width wrapper (`w-full`). No `max-w-7xl`.
- **`SectionHeader` exposes `action?: ReactNode`** so CTAs like "New Tag" sit
  aligned with the title row, not below it. Match the `page-header.tsx`
  action-slot shape.
- Mobile: everything stacks to single column at `<lg`. Duplicate-rule row uses
  `grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1fr_140px_auto_auto]` so rows
  don't cram between md and lg.
- Loading skeleton (`{Entity}SettingsLoading.tsx`) must mirror the bento shape
  so there is no layout shift when data resolves.

## 2. Empty states

- Use
  **`<EmptyState entity="…" phase="passive" size="sm" className="py-4 px-3 gap-2" />`**
  with project SVGs from
  `packages/ui/src/components/empty-state-illustrations.tsx`.
- Suggested entity mappings (when no exact match exists):
  - Tags → `entity="pinned"`
  - Duplicate rules → `entity="rules"`
  - Required fields / policy → `entity="notes"` via `illustration` prop
- **No action button inside the empty state** if the parent Card already renders
  the CTA in the SectionHeader. Duplicate CTAs violate system design.

## 3. Buttons

- **"Add Rule" / "Add X"** inside a tab: `<Button size="sm">Add Rule</Button>`
  wrapped in `<div className="flex justify-end">`. No `variant="outline"`, no
  leading material-symbols icon, Title Case label.
- **"New Tag" / "New X"** in a SectionHeader action slot: `<Button size="sm">`,
  no icon, Title Case label.
- Save Changes button disabled when `!isDirty || isSaving || hasConflict` — the
  conflict flag comes from local client-side validation (e.g., duplicate
  `(field, matchStrategy)` pairs in duplicate-rule rows).

### Save button behaviour (mandatory — PG-189 follow-on, 2026-04-19)

When a module-settings page is built on the legacy `ModuleSettingsLayout` (still
used by `/calendar/calendar-settings` and similar), the page owner MUST:

1. Track an `initialSettings` snapshot captured from the tRPC `get` query.
2. Compute `isDirty` from a stable comparator (e.g. `JSON.stringify` of a
   normalized value object — normalize `''`/`undefined` on nullable fields to
   `null` so empty-input round-trips do not produce false positives).
3. Pass the computed `isDirty` to `ModuleSettingsLayout` via its `isDirty` prop.
4. After a successful save or reset, refresh `initialSettings` from the mutation
   response (via `onSuccess(data)`) so Save re-disables correctly.

Without step 3, the Save button is permanently disabled — the exact defect
PG-189's remediation fixed. Sibling tasks inherit this rule automatically by
reading this playbook during `/spec-session` Phase 0.97 (PRD/playbook
resolution).

## 4. Tags card

- `TagsTab` MUST use **`forwardRef<TagsTabHandle, TagsTabProps>`** with
  `useImperativeHandle(ref, () => ({ openCreate }))`. DO NOT lift the open state
  to the parent via a callback prop.
- Parent renders the "New Tag" button in the SectionHeader action slot and calls
  `tagsTabRef.current?.openCreate()` on click.
- `TagRow.colorToken` typed as **`string`** (widened) with a helper
  `swatchClass(token) => COLOR_SWATCH_CLASSES[token] ?? COLOR_SWATCH_CLASSES.slate`.
  Never cast `as TagColorToken` without a fallback.
- `openEdit(tag)` normalises legacy tokens: if the DB row has a value outside
  the enum allowlist, narrow to `'slate'` before seeding the draft state.
- Prisma column gets a **CHECK constraint** in the hardening migration against
  the 18-color allowlist.

## 5. Backend router — destructive writes

- **Always wrap multi-row writes in `ctx.prismaWithTenant.$transaction`**:
  `duplicateRules.updateAll`, `duplicateRules.resetToDefaults`,
  `requiredFields.updateAll`, `requiredFields.resetToDefaults`. Both array form
  and callback form are fine — just no unprotected delete-then-create pairs.
- **Never pass `skipDuplicates: true`** on `createMany`. That flag silently
  drops rows that violate the unique constraint — data loss the UI won't see.
  Let Prisma throw P2002, catch it, map to `TRPCError({ code: 'CONFLICT' })`
  with an actionable message.
- Every tenant-scoped mutation uses `where: { id, tenantId }` on
  `update`/`delete`. Tests must include a negative case (P2025 when a
  foreign-tenant id is passed).

## 6. Validator — duplicate-pair de-dup

- `update{Entity}DuplicateRulesSchema` MUST end with a `.superRefine` that
  rejects duplicate `(field, matchStrategy)` pairs before the router gets them,
  with a "rows N and M" error path pointing at the second offender.
- Copy the shape from `packages/validators/src/contact-settings.ts` and
  `account-settings.ts`. Do not invent a new shape.

## 7. Automation model

- Every {Entity}AutomationSetting MUST include an
  **`automation.resetToDefaults`** router procedure and it MUST be called from
  the UI "Reset to Defaults" action alongside the duplicate-rules and
  required-fields resets.
- Confirmation dialog text must explicitly enumerate what is reset and what is
  preserved.
- **AI toggle defaults are `false` in the Prisma schema** (opt-in privacy
  stance). Create a hardening migration that restates `SET DEFAULT false` for
  EVERY AI column — even no-op restatements keep migration history
  self-documenting.
- AI defaults OFF, data-hygiene defaults ON (normalization etc), delete guards
  default ON, notify defaults OFF unless explicit product reason.

## 8. Policy → runtime wiring (HARDEST)

**This is the audit finding that generated the most churn. Get it right from day
one.**

Every Boolean toggle you add to `{Entity}AutomationSetting` MUST fall into one
of three categories, and the category MUST be declared in the plan:

1. **Wired now** — the code that enforces it ships in the same PR as the
   settings page. Add a consumer in `{entity}.router.ts`
   (create/update/delete/admin-only-tag) and an `{entity}-automation.ts` helper
   file that exposes `loadXxxAutomation`, `assertCanXxx`, `normalizeXxx`,
   `capitalizeXxx`, etc. Mirror the shapes used by `contact-automation.ts` and
   `account-automation.ts`.

2. **Bundled follow-up** — the toggle is wired by an explicit follow-up task
   already registered in `Sprint_plan.csv` (e.g. IFC-310 for
   duplicate-detection, IFC-311 for reassign, IFC-312 for AI chains). The
   follow-up task's artifact list must name the specific chain/service that
   consumes this toggle.

3. **Drop it** — if the toggle has no owner and no runtime plan, remove it from
   the schema. A persisted Boolean that nothing reads is a false promise.

**Pending badges in the UI are not a substitute for runtime wiring.** If a
toggle ships unwired, it either has a concrete follow-up (category 2) or it
should not be on the page (category 3).

## 9. Owner-change notification helper

- `{entity}-automation.ts` ships a `notifyXxxReassignment` helper that reads the
  `notifyOnOwnerChange` flag and emits notifications to both old and new owners.
- Add a matching `xxx_reassigned` entry to `NOTIFICATION_TYPES` in
  `packages/validators/src/notifications.ts` AND bump the length assertion in
  `packages/validators/src/__tests__/notifications.test.ts`.
- The reassign endpoint itself ships in IFC-311 (or the task that broadens
  IFC-311 to cover this entity).

## 10. Prisma `@intelliflow/db` barrel

- When you add new Prisma models, ADD the type names to the explicit
  `export type` allowlist in `packages/db/src/index.ts`. If you skip this,
  external packages (api, web) will hit TS2305 "Module has no exported member".
- Then rebuild: `pnpm --filter @intelliflow/db build`.

## 11. Domain value-objects at the router boundary

- If the entity uses value-objects (e.g. `PhoneNumber` on contacts,
  `WebsiteDomain` on accounts, any VO added later), the validator will transform
  string → VO on input. The router MUST unwrap `.value` before handing to policy
  helpers that expect primitives, and MUST rewrap (or pass a raw string when the
  domain service accepts `string | VO`).
- Mirror the pattern in `apps/api/src/modules/contact/contact.router.ts`
  create/update (unwrap `rawPhone = input.phone?.value ?? null`).

## 12. Tests

- **Scoped tests must mock `prismaMock.$transaction`** with
  `mockResolvedValue([...])` or `mockImplementation(async (cb) => cb(tx))` —
  otherwise the destructive-write tests hit `undefined.map(...)` or similar.
- **Cross-tenant negative test** per mutation: pass a foreign tenant's id,
  assert Prisma P2025 is translated to a tRPC error.
- **Zod superRefine test**: a duplicate `(field, matchStrategy)` pair payload
  must reject at the validator layer.
- **Admin-only tag test**: non-ADMIN/OWNER caller with
  `restrictTagCreationToAdmins=true` receives `FORBIDDEN`.
- **Empty state tests** use `entity=` or `illustration=` and do NOT rely on an
  `action={...}` button (the page header owns the CTA).
- **resetToDefaults test** asserts all three resets (duplicate rules, required
  fields, automation) are invoked from handleReset in the content component.
- Existing entity router tests (e.g. `contact.router.test.ts`) need `beforeEach`
  stubs for `{entity}AutomationSetting.findUnique` → null and
  `{entity}RequiredField.findMany` → [] — otherwise `load{Entity}Automation`
  crashes on `undefined.map`.

## 13. PRD + attestation

- Extend `docs/planning/prd-module-settings.md` (do not create a new PRD) with a
  `PG-NNN Addendum` section listing the user stories and acceptance criteria
  specific to the entity. Include AC numbers in the `AC-C…` / `AC-D…` scheme to
  avoid collisions.
- Attestation hashes MUST include the new migrations for the entity's hardening
  layer (CHECK constraint + AI-default flip) — not just the initial `_settings`
  migration.
- CSV status flows
  `Backlog → Specifying → Spec Complete → Planning → Plan Complete → In Progress → In Review → Completed`.
  Do NOT flip to `Completed` until compliance-check, build, and Lighthouse have
  all run.

## 14. Spec-session / plan-session must cite this playbook

Any new module-settings spec MUST include in its **Related Documents** section:

- `docs/planning/prd-module-settings.md`
- **`docs/planning/module-settings-playbook.md`** (this file)
- PG-182 and PG-183 spec/plan paths as reference implementations.

The plan MUST enumerate, per Boolean toggle in the schema, which of the three
categories (§8) it falls into.

## 15. Order of operations recommendation

If you are planning multiple PG-18x settings pages:

- You can ship PG-184, PG-185, PG-186 in parallel — they don't depend on each
  other.
- You should NOT block PG-184+ on IFC-310/311/312 completing. Instead, have each
  new PG-18x either (a) wire category-1 toggles in the same PR or (b) register
  category-2 follow-ups against the relevant broader IFC-\* task, whose scope
  will grow to include the new entity.
- Whenever a new entity ships, broaden IFC-310 (rule evaluator), IFC-311
  (reassign), and IFC-312 (AI chains) to cover it — same pattern used to extend
  them from "contacts-only" to "contacts + accounts" on 2026-04-14.
