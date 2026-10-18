# PG-205 owner ruling

Asked by the PG-205 lane in an AskUserQuestion modal; answered by Talysson on 2026-10-17
(recorded 2026-10-17T15:56:40Z). Evidence for each question is in `PG-205-spec-exploration.md`.

## Why a ruling was needed

The row says "taxonomy: person/organization/vendor/partner, required fields per type, default
fields, default labels" and the KPI note says "backend exists, UI stub only". The code disagrees:

- No contact-type backend exists (no model, router or validator). `Contact.contactType` is a free
  `String?` column (`packages/db/prisma/schema.prisma:800`) limited by the validator to a fixed
  enum `customer | prospect | partner | vendor | investor | other`
  (`packages/domain/src/crm/contact/Contact.ts:18-25`, `packages/validators/src/contact.ts:9`).
- Organisations are already modelled as `Account` (`packages/domain/src/crm/account/Account.ts:171`).
- "Labels" do not exist; only tags (`Contact.tags String[]` and the tenant `ContactTag` list).
- Nothing reads `contactType` downstream; the edit form has no type picker; the sidebar
  `?segment=partners|vendors|vip` links are read by nothing.

## Answers

1. **Type set → A: the current six.** Each tenant starts with customer, prospect, partner, vendor,
   investor, other, and can rename, add, recolour or deactivate types. Existing contacts keep their
   stored values: no data migration / backfill of `contacts`.
2. **Behaviour → A: applied on create (PG-204 precedent).** Type picker on New and Edit contact.
   The server fills the type's default values, enforces the type's required fields on top of the
   tenant-wide `ContactRequiredField` rules, and adds the type's default tags. The contacts list gets
   a type filter and column, and the dead `?segment=` sidebar links get fixed.
3. **"Default labels" → default tags.** Each type picks tags from the existing `ContactTag` list;
   they are added automatically when a contact of that type is created.
4. **"Default fields" → default values.** Values pre-filled when blank on create (status,
   department, owner choice). Precedence: explicit input, then the type, then module defaults.

## Consequences recorded for the spec

- The row's person/organization wording is superseded; the CSV row is corrected (Category A
  adaptation) with old → new recorded.
- The KPI note "backend exists, UI stub only" is false and is corrected.
- Scope is full-stack (table + additive Class A migration `20261017120000`, router, validators,
  contact create/update wiring, list filter/column, sidebar segments). The migration's prod apply
  is manual and must happen before the API is promoted (L13).

## Second ruling (recorded 2026-10-17T16:03:59Z, after spec Round 1)

Asked in a second AskUserQuestion modal after Round 1 ANALYSIS raised three product questions:

5. **Sidebar VIP segment → filter by the 'vip' tag.** `/contacts?segment=vip` opens the list filtered to contacts
   whose tags include `vip` (case-insensitive). Partners / Vendors map to `contactType=partner|vendor`.
6. **"Other — please specify" → remove the free text.** "Other" stays a normal type; the discarded
   `contactTypeOther` input is removed from New Contact.
7. **Owner default → per-type choice "creator" or "account owner".** `ACCOUNT_OWNER` uses the owner of the linked
   account and falls back to the creator when there is no account (the account must be in the caller's tenant).
   Never an arbitrary user id.

## Third ruling (recorded 2026-10-17T19:49:33Z, at exec, codex-review-05)

Asked in an AskUserQuestion modal after `node scripts/codex-review.mjs` re-raised finding `0f290e25`
(`contact-types.router.ts` delete: a type deleted at the same moment a contact is saved with it leaves that contact
holding the deleted key, because contacts have no FK to contact types, ADR-080).

Options offered: accept and waive with the evidence (recommended) / fix it properly by running contact create/update
and the type lookup in one transaction under the contact-types lock / stop as NEEDS_HUMAN.

8. **"Accept and waive (Recommended)."** The waiver is added to `tools/audit/codex-review-waivers.yaml` under the
   owner's handle with this ruling as its evidence. Existing mitigations: a key that contacts still carry is never
   re-issued to a new type; such a key is shown as plain text in the list; and Edit can clear or change it. The PR
   body and `PG-205-findings.md` state the residual risk.
   The reviewer re-anchored the same finding on the in-use count line (fingerprint `148dd60f`, codex-review-07);
   it is waived under this same ruling, cross-referencing `0f290e25`.

## Fourth ruling (recorded 2026-10-17T19:56:01Z, at exec, codex-review-08)

Codex finding `183f8dca`: a type can require "Account" and default the owner to the account's owner, but neither
the New nor the Edit contact form had an account field, so those options could not be used from the UI. Options
offered: add an account picker (recommended) / drop the Account required-field option / keep, warn and waive.

9. **"Add account picker (Recommended)."** New and Edit Contact gain a searchable Account field over the tenant's
   accounts (`account.list`, the PG-204 case-form pattern) and send `accountId`, so account-required types and the
   ACCOUNT_OWNER owner rule work from the UI.

## Ruling 8 re-confirmed (recorded 2026-10-18T10:36:29Z)

Relayed by the runner (Aurora) in its PR #915 fix-round message on 2026-10-18: "Ruling 8 is confirmed by Talysson
today, so waivers 0f290e25 and 148dd60f stand." It was not asked in a modal in this session; recorded as relayed.

