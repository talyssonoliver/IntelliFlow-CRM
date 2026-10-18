# PG-205 findings (Contact Types, 2026-10-17)

Red flags and out-of-scope defects found while building contact types. Each one is either fixed in this task or
tracked in all three places: a gh issue, `artifacts/metrics/debt-ledger.yaml`, and this file.

## Fixed in PG-205

| # | Finding | Evidence | Fix |
|---|---|---|---|
| F1 | (B14) The tenant-wide "job title required" rule checked a `jobTitle` field that does not exist on the contact payload. It could never pass when on, and never checked the real `title` column. | `contact-automation.ts` policy key `jobTitle`; Contact column `title` | `CONTACT_POLICY_FIELD_TO_COLUMN` (`jobTitle → title`) in the domain; `toContactRequiredFieldPayload` in the API; AC-CTY-012 tests on create and update |
| F2 | Fake taxonomy: `/contacts/new` hard-coded six type options plus an "Other — please specify" text box. The text was discarded (`contactType: 'other'` was sent, the free text never was). | old `new/page.tsx:116-124`, `:270-279` | Tenant types from `contactTypes.listActive` (`ContactTypeSelect`); "Other" free text removed (owner ruling 6) |
| F3 | Dead sidebar links: the Contacts sidebar segments `?segment=vip|partners|vendors` were ignored by the list page. | `sidebar/configs/contacts.ts` segments; `ContactsPageClient` never read `useSearchParams` | `segmentToFilter`; partners/vendors → Type filter, vip → server tag segment with a removable chip (ruling 5) |
| F4 | `/contacts/contact-types` was a "coming soon" stub, linked from the sidebar and the Contact Settings panel. | old `contact-types/page.tsx` (16 lines) | Real settings page (Suspense shell + ContactTypesContent) |
| F5 | The CSV KPI "backend exists, UI stub only" was false: there was no ContactType model, router or validator (exploration B15). | spec "Row reconciliation" | Row corrected (Category A), old → new below |
| F6 | The Contact Edit form had no way to change a contact's type, even though the API accepted one. | `ContactForm.tsx` (no type field) | `ContactTypeSelect` on the last step; an unchanged inactive key is submitted unchanged |

## Tracked (out of scope)

| # | Finding | gh issue | Debt ledger |
|---|---|---|---|
| T1 | `contact-settings.router.ts` writes (policy `updateAll`/`resetToDefaults`, tags create/update/delete) have no role gate (lines 63-278) | #908 (item 1) | `PG-205-CONTACT-SETTINGS-NO-ROLE-GATE-001` |
| T2 | Tag `update` spreads the validated input into Prisma `data` (`:224-230`) | #908 (item 2) | `PG-205-CONTACT-TAG-UPDATE-SPREAD-001` |
| T3 | Bulk lead conversion `createMany(... as any, skipDuplicates: true)` drops conflicts silently (`lead.router.ts:1584`, `:1589`) | #908 (item 3) | `PG-205-LEAD-BULK-CONVERT-SKIP-DUPLICATES-001` |
| T4 | `ContactService.ts:92` echoes the caller's `accountId` in the client-facing error | #908 (item 4) | `PG-205-CONTACT-SERVICE-ACCOUNT-ID-ECHO-001` |
| T5 | `scripts/test-db.mjs` stderr sink calls itself, so `test:db:run` crashed after applying migrations and left `intelliflow_test_run_tn2ab0_jhc_4tom` on the local :5433 server (not dropped: lanes must not reset the shared containers) | #905 (already open, filed by another lane) | (owned by #905) |

## Notes (no defect, recorded on purpose)

- **Declined: event payload (spec D11).** No `contactType` field was added to `ContactCreatedEvent`, and no
  type-changed event was introduced, because nothing consumes one today. The contact CREATE audit `afterState`
  records `contactType`, `appliedDefaults` (field names only) and `ownerFallback`.
- **Lead conversion stays untyped.** Bulk lead → contact conversion (`lead.router.ts:1584`,
  `PrismaLeadRepository.ts:438`) and `ConvertLeadToDeal` create contacts with no type, and the tenant default type
  is not applied there. The owner did not ask for that. Auto-merge keeps the surviving contact's own type.
- **VIP spelling caveat.** The VIP segment matches the tenant's tag names equal to `vip` case-insensitively (plus
  `vip` itself), capped at 20 spellings, and applies them as `tags: { hasSome }`. Contacts tagged with a variant
  that is not a tenant tag (for example a free-typed `V.I.P.`) are not matched.
- **One-transaction deviation (SEC-6 / CA-7).** The account-owner lookup and the insert cannot share one
  transaction, because `ContactService` writes through the container repository. The lookup runs immediately
  before the insert, and a test asserts that order. Recorded as a plan revision at Step 4.
- **Accepted near-duplication with PG-204.** `ContactTypeList`, `DeleteContactTypeDialog`, `ContactTypesLoading`
  and `ContactTypesContent` follow the PG-204 case-types files module by module (different payload; cross-module
  imports avoided on purpose). The colour map is **not** duplicated: `contact-type-colors.ts` imports the shared
  18-token map from `apps/web/src/lib/color-tokens.ts`.
- **Native select.** `ContactTypeSelect` is a native `<select>`, not the Radix `Select`, because both host forms
  (New Contact, ContactForm) use native selects.
- **Test correction at GREEN.** The Dialog arrow-key test now awaits focus (`waitFor`), because Radix roving focus
  moves it on the next tick. The behaviour under test is unchanged.

## Accepted risk (owner ruling 8, codex 0f290e25 / 148dd60f)

`contactTypes.delete` counts the contacts that use a key and deletes the type in one transaction. Contacts have
no FK to `contact_types` (ADR-080), so a contact saved at the same moment can keep the deleted key. That contact
then looks like any legacy key: the list shows the raw key as a neutral badge, the Type filter still works, and
Edit can clear or change it. `contactTypes.create` never re-issues a key that contacts still carry. Closing the
window fully would need contact create/update and the type check in one transaction under the contact-types
lock, a refactor of the shared `ContactService` save path. The owner chose not to take it in PG-205 (waivers in
`tools/audit/codex-review-waivers.yaml`).

## Codex review fixes at exec (recovery lane, 2026-10-17)

| fp | Finding | Fix |
|---|---|---|
| a3d0b852 | Replacing a contact's account unlinked and linked in two saves, so a failed link left the contact unlinked | `Contact.replaceAccount` + `ContactService.replaceAccount`: target checked in the tenant, one save (`red-green/20-*`) |
| 068bafef | Unlinking an account and clearing a type that requires it were two saves; a failure between them could leave the type without its account | `contact.update` orders the saves: link/replace before the other fields, unlink after them (`red-green/21-*`) |
| 0dc7d185 | Navigating from `?segment=` to plain `/contacts` kept the segment filter | The list re-seeds the filters on any URL change except its own URL cleanup (`red-green/21-*`) |

The remaining non-atomicity (fields and account are still two `ContactService` saves) is ordered so that neither
intermediate state breaks a type rule. A single save for both would need a combined `ContactService` operation,
which is out of PG-205's scope.

## Lighthouse status (DoD 12): NEEDS_HUMAN

Path A ran once (2026-10-17T22:03-22:04Z, Lighthouse 12.6.1). Both `/contacts/contact-types` and `/contacts/new`
redirect to `/login`, so the scores (perf 0.87/0.88, a11y 0.93) measure the login page, not PG-205. No
non-production `LHCI_TEST_*` credentials exist for Path C. Evidence and the owner's options are in
`artifacts/lighthouse/PG-205/waiver-evidence.md`. No waiver approver is named.

## CSV corrections (Category A, `Sprint_plan.csv` row PG-205; splits regenerated)

| Field | Old | New | Why |
|---|---|---|---|
| Definition of Done (taxonomy clause) | `taxonomy: person/organization/vendor/partner` | `taxonomy: tenant contact types seeded from the six existing CONTACT_TYPES per owner ruling 2026-10-17 - organisations are Accounts` | Owner ruling 1 ("A: Current six"). Organisations are `Account` (`packages/domain/src/crm/account/Account.ts:171`). No other criterion was changed or dropped. |
| KPIs | `backend exists, UI stub only; scoped build-out; #615` | `UI stub only, no backend existed (ContactType model/router/validator built by PG-205); scoped build-out; #615` | Exploration B15: no model, router or validator existed on main. |
| Artifacts To Track | 4 artifacts + `context_ack.json` | + `contact-type-defaults.ts`, `contact-type-resolver.ts`, `ContactTypeSelect.tsx`, both migration files | Files that carry the delivered behaviour. |

Impact: wording and tracking only. No acceptance criterion, outcome or dependency changed.
