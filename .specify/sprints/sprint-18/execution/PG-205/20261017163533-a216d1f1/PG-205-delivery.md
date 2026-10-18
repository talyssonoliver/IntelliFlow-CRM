# PG-205 delivery report: Module Settings - Contact Types

Run `20261017163533-a216d1f1`, branch `feat/pg-205-contact-types`. Exec started 2026-10-17T16:35:33Z (first lane,
session 476f3de8, killed mid-exec around 20:02Z). The recovery lane (session ffa3728c) resumed at 20:49:35Z and
continued on 2026-10-18 (idle between 22:04Z and 08:34Z).

## What shipped

- **Tenant contact types** (ADR-080 Accepted): `contact_types` + `contact_type_default_tags` (two Class A
  migrations, RLS), keyed by the existing `contacts.contactType` string, with no FK and no backfill. The six existing
  `CONTACT_TYPES` are system rows, seeded lazily per tenant under an advisory lock.
- **API** `contactTypes.list / listActive / create / update / delete / setDefault`. Writes are restricted to admins
  and managers, every query is tenant-scoped, inputs are `.strict()`, and audit payloads carry ids and field names
  only.
- **contact.create** applies the type's defaults: status, department, owner rule (creator or account owner), default
  tags, plus the tenant-wide and type required fields.
- **contact.update** checks a changed key against active types and enforces the stored type's rules. `null` clears
  the type. Account link and replace run before the field save and unlink runs after it; a replace is one
  `ContactService.replaceAccount` save.
- **contact.list** gains a `contactType` filter and `segment: 'vip'`.
- **Web** `/contacts/contact-types` replaces the stub with the list, the create/edit dialog (18 colours, required
  fields, owner rule, default tags) and delete with an in-use guard. A default-type picker is saved by a "Save
  default" button.
- **Other web changes:** a type picker and an account field on New and Edit Contact; the contacts list gets a Type
  filter, badges and the sidebar `?segment=partners|vendors|vip` links.
- **Fixed red flags:** B14 (`jobTitle` rule now checks `title`), the fake "Other — please specify" field, the dead
  sidebar segments and the stub page (see the findings doc).

## TDD log

RED/GREEN evidence is in `.specify/sprints/sprint-18/attestations/PG-205/red-green/` (index: `red-green-index.md`).
There are 14 RED logs and each is followed by a GREEN. The recovery lane added rounds 20-23:

- 20: atomic account replace (codex a3d0b852)
- 21: unlink ordering (068bafef) and the stale segment filter (0dc7d185)
- 22: a11y review fixes
- 23: tag length (2f19f195)

Round 19 (18941caa) was re-verified GREEN; its RED came from the first lane.

## Acceptance criteria

Per the plan's AC traceability table, all AC-CTY items are covered by tests in the Step 1-6 suites (green in Step
19). **DoD 12 (Lighthouse ≥ 90) is NEEDS_HUMAN**: both routes require authentication, Path A only reaches `/login`,
and no non-production `LHCI_TEST_*` credentials exist (`artifacts/lighthouse/PG-205/waiver-evidence.md`).

## Validation commands that actually ran (logs under `matop/gates/`)

| Check | Result | Log |
|---|---|---|
| Typecheck, 7 packages | exit 0 | `step19-typecheck-*.log`; web/api/application/validators re-run after later commits (`stoa-foundation-*recheck*`, red-green 23) |
| Lint, 7 packages | exit 0 | `step19-lint-*.log`; branch-wide sonar-guard `sonar-guard-branch.log` (62 files) |
| Tests, full suites at `e929eb220` | all exit 0 | domain 3060, validators 2741, db 224 (+14 skipped), application 1486, adapters 2982, api 7801 (+18 skipped), web 12990 (825 files), tools 33, integration 440 (+50 skipped), contact-types integration 24/24 |
| Tests after later commits | exit 0 | contacts (list) web 142 → contact-types 60; validators 2743; api contact 398; web contacts 521 |
| Build: packages + web at `7319f0d2c` | exit 0 | `step19-build-{packages,web}.log` |
| knip | 0 PG-205 issues | `step19-knip.log` |
| Diff coverage (Sonar new_coverage) | 95.4% | `step19-diff-coverage.log` |
| Domain package coverage | lines 95.25% | `step19-coverage-domain.log` |
| Scoped coverage, created files | S 96.46 / B 90.91 / F 92.40 / L 97.21 | `gate-3b-scoped-coverage.log`; contact-types web after follow-ups 97.24 / 85.07 / 96.05 / 98.46 |
| prisma validate | exit 0 | `step19-prisma-validate.log` |
| Codex review | round 14 PASS | `../gates/codex-review-1{0..4}.log` |
| Duplication (jscpd) | ≈2.0% new | `jscpd-touched.txt` |

**Not run here:** pre-ship at the final SHA. The runner owns it and runs it once, after the attestation commit.

## Reviews

| Review | Result | Record |
|---|---|---|
| /simplify | 4 sub-agents | `matop/step15-simplify.md` |
| a11y-expert, WCAG 2.1 AA | PASS_WITH_FIXES, fixed | `matop/a11y-review.md` |
| /code-review | quick: 0 TS errors, 0 lint problems | `matop/code-review-summary.json` |
| /sonarqube-fix | 3 fixed, 0 open | `matop/sonarqube-fix-report.md` |
| STOA | Foundation PASS (after a prettier fix), Domain PASS, Security PASS, Quality WARN; aggregate WARN | `matop/stoa-aggregate.json` |
| /compliance-check | see record | `matop/compliance-check.md` |

## Files changed beyond the plan (review-driven)

- `packages/domain/src/crm/contact/Contact.ts`: `replaceAccount`.
- `packages/application/src/services/ContactService.ts`: `replaceAccount` and the shared `changeAccount`.
- `packages/validators/src/contact-settings.ts`: `CONTACT_TAG_NAME_MAX_LENGTH`.
- `docs/compliance-and-governance/compliance/vpat-2.5.md`: row 1.10.0.

## Migrations (L13, loud)

**`20261017120000_contact_types` and `20261017120100_contacts_type_idx` (`CREATE INDEX CONCURRENTLY`) must be
applied to production with `prisma migrate deploy` BEFORE the API is promoted.** The production apply is manual.

## NEEDS_HUMAN

1. Lighthouse DoD 12: run `lighthouse:auth` with non-production credentials, or approve a waiver.
2. Gate 4b (push) is runner-owned: one pre-ship plus one push after this attestation.
3. Production migration apply, as above.
