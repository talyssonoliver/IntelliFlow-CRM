# PG-207 — Delivery report

**Task:** Module Settings - Email (`/email/email-settings`)
**Branch:** `feat/pg-207-email-settings` (31 commits ahead of `origin/main`, not pushed: the runner pushes)
**Run:** `20261021-090734-fb30029c`
**Spec / plan:** `.specify/sprints/sprint-18/specifications/PG-207-spec.md`, `.specify/sprints/sprint-18/planning/PG-207-plan.md`
**Decision record:** ADR-085 (Accepted), owner rulings Q1–Q11 (`context/PG-207/PG-207-owner-ruling.md`)
**Findings, deviations, reviews:** `execution/PG-207/PG-207-findings.md`

## What shipped

User mail now leaves only from the sender's own mailbox (owner ruling Q6), never from an IntelliFlow address:

- **Mailboxes:**
  - Each user has one personal mailbox; each tenant has one company mailbox.
  - A mailbox is SMTP (plus IMAP for bounces), Gmail OAuth or Microsoft OAuth.
  - Secrets are field-encrypted and never returned. Saving one is refused when the encryption key is absent.
  - OAuth uses PKCE with a hashed single-use state, minimal scopes and a granted-scope check. Disconnecting revokes the grant and deletes the secrets.
- **Single send path** (`dispatchUserMail`):
  1. Resolve the mailbox: own mailbox, then the company fallback if the admin allows it; an ERROR mailbox refuses, a disconnected one counts as none.
  2. Drop suppressed recipients (Q9).
  3. Apply the per-mailbox hourly cap, then the quota.
  4. Upload attachments to the private bucket (Q11), checked again at send.
  5. Build the MIME with `X-IntelliFlow-Record` and a Message-ID.
  6. A failure records FAILED with no fallback (Q4), and the email is never marked SENT unless it was sent. SMTP partial refusals are returned and recorded; temporary refusals are never hard bounces.
- **Bounce reader** (Q8):
  - It runs on a lease-claimed scheduler in the API process, claiming each mailbox just before its scan; writes are fenced by the lease.
  - It reads IMAP sizes first, Gmail with window narrowing, and Graph in receive-time groups.
  - A DSN is accepted only when its record id and original Message-ID both match a recent record from the same mailbox and tenant.
  - Hard and soft bounce rules apply, with a tenant-wide soft threshold serialised by an advisory lock. Suppression is capped per scan with rollback.
  - The sender is notified in the receipt's transaction.
- **Pages:**
  - `/email/email-settings`: the bento settings shell with My mailbox, Company mailbox, Reply-to and tracking, Bounce rules and the Suppression list.
  - `/email/oauth/callback`: completes the OAuth exchange; noindex.
  - `/email/signatures`: personal and org signatures, sanitised HTML, a default, at most 20 per owner.
  - Compose prefills the default signature (Q5; the server appends nothing), uploads attachments and shows coded refusals that take focus.

## Prisma migrations (Class A, ADR-069): manual production apply

`packages/db/prisma/migrations/`:

| Migration | Change |
|---|---|
| `20261020120000_email_mailboxes` | mailbox table, RLS, CHECKs |
| `20261020120100_email_settings_signatures` | |
| `20261020120200_email_suppression_receipts` | |
| `20261020120300_email_record_message_ids` | NOT VALID constraints under `lock_timeout` |
| `20261020120310_email_records_provider_check_validate` | |
| `20261020120320_email_records_mailbox_fk_validate` | |
| `20261020120400_email_records_message_id_idx` | |
| `20261020120500_email_records_mailbox_id_idx` | CREATE INDEX CONCURRENTLY |

- Apply with `prisma migrate deploy` before the API ships.
- Afterwards, confirm `pg_index.indisvalid` for both concurrent indexes.
- All eight apply to a fresh database, and `migrate diff` is clean on PG-207 objects.

### Applying the migrations safely

**No overlap with PG-208.** None of the 8 migrations references or alters any `task_*` table (checked with `grep -il task_` over all eight). PG-208's `20261020120000_task_automation` only shares a timestamp prefix. Prisma orders and records migrations by full folder name, so both apply.

**The two CONCURRENTLY migrations** (`20261020120400_email_records_message_id_idx` and `20261020120500_email_records_mailbox_id_idx`):

- Each file has exactly one SQL statement, `CREATE INDEX CONCURRENTLY IF NOT EXISTS …`, plus comments. There is no `BEGIN`/`COMMIT`.
- Prisma runs a single-statement migration without wrapping it in a transaction. The precedent is `20261017120100_contacts_type_idx`, already applied in production.
- If a build fails and leaves an INVALID index, drop it with `DROP INDEX CONCURRENTLY` and rerun `migrate deploy`. `IF NOT EXISTS` makes the rerun safe.
- After deploy, check that `pg_index.indisvalid` is true for `email_records_tenantId_messageIdHeader_idx` and `email_records_mailboxId_idx`.

**The other migration with a validation step:** `120300` adds the CHECK and FK as `NOT VALID` under `SET lock_timeout = '5s'`. `120310` and `120320` then validate them, each in its own migration.

## Ships dark when the owner has configured nothing

**Question (runner, c):** with no `PRISMA_FIELD_ENCRYPTION_KEY`, no attachments bucket and no OAuth apps, does the API still boot and serve every existing route, and does email settings fail visibly?

**Answer: yes, with one boot rule that predates PG-207.** `packages/db/src/client.ts` already refuses to start in production without `PRISMA_FIELD_ENCRYPTION_KEY`; that rule dates from M4 (2026). The production API already runs with that key, so PG-207 adds no new boot requirement.

Everything PG-207 adds is lazy or gated:

- The OAuth clients exist only when their env is set.
- The `email-attachments` bucket is created on first upload, never at boot.
- The bounce scanner logs a failed tick and never throws.
- No module throws at import.

`apps/api/src/modules/email/__tests__/dark-launch.test.ts` (6 tests, passing, `artifacts/logs/pg-207/dark-launch.txt`) uses the real transports built from an environment where nothing is configured:

| Path | Outcome |
|---|---|
| Building the transports | does not throw; Gmail and Microsoft are reported off and no client exists |
| Settings page (`getMine`) | no mailbox, both providers unavailable |
| Connect with Google | `PRECONDITION_FAILED`, nothing written |
| Saving SMTP credentials without the key | `PRECONDITION_FAILED`, nothing written |
| Sending with no mailbox | `NO_MAILBOX`, no email record created |
| A failing bounce-scan tick (for example, tables not yet migrated) | logged, not thrown |

Two existing tests back the boot side:

- `container.test.ts` builds the full container with no OAuth env, so the transports are wired and unconfigured.
- `http-server.bounce-scheduler.test.ts` shows `createApiServer` never starts the scanner.

**What still has to happen in order:** the migrations must run before the API ships. If they don't, the new email routers return errors on their own tables at request time, but the API still boots and every existing route still works.

## Validation (all run in this session, Node 22.14.0, logs in `artifacts/logs/pg-207/`)

| Check | Result | Log |
|---|---|---|
| Typecheck (monorepo, 38 tasks) | exit 0 | `typecheck-r14.txt` |
| Lint (eslint on touched files each round; `/code-review` quick on 26 packages, 0 TS / 0 lint errors) | exit 0 | `code-review-quick.txt` |
| Sonar guard (cognitive complexity, slow regex) | 0 findings, every commit | `sonar-guard-r14.txt` |
| Build (`pnpm build`, 20 tasks) at `bd7b4b1c1` | exit 0 | `build-final.txt` |
| domain / validators / application / ui | 3240 / 2866 / 1494 / 1253 passed | `full-*.txt` |
| adapters (at `bd7b4b1c1`) | 3111 passed | `full-adapters.txt` |
| db (local test DB) | 235 passed, 5 skipped (same as before) | `full-db.txt` |
| api (at `bd7b4b1c1`) | 8153 passed, 18 skipped (same skips as main) | `full-api.txt` |
| web (at `bd7b4b1c1`) | 13301 passed | `full-web.txt` |
| integration `tests/integration/email-settings.test.ts` (local DB, at `6f7a81f4e`; nothing it covers changed after) | 36 passed | `integration-final.txt` |
| tools (route totals, content audit, docs integrity) | 78 passed | `tools-final.txt` |
| Secret scan (`.gitleaks/scan.sh staged`) | clean before every commit | — |
| `pnpm audit --prod` / OSV for nodemailer, imapflow, sanitize-html | no advisories in the new deps at the time | `osv-new-deps.txt` |
| `pnpm audit --prod` after merging #975 (2026-10-22) | no high or critical; 2 moderate left, both outside PG-207 (sprintf-js via ai-worker > mammoth, hono via @prisma/dev); `--audit-level=high` exits 0 | `audit-prod-final.txt` |
| Icon subset verify | OK, 370 icons | `material-symbols-verify.txt` |
| Tracked `*.log`/`*.coverage`/`*.tsbuildinfo` | 0 | — |

Changed-line coverage (istanbul, `changed-line-cov.py` vs `origin/main`):

| Package | Statements | Branches |
|---|---|---|
| API email + quota-guard | 96.7% | 90.2% |
| Web email pages and components | 95.4% | 90.5% |
| Adapters email + storage | 93.4% | 87.3% |
| Domain email | 100% | 100% |
| Validators | 100% | 93.5% |

The whole API email module, including files PG-207 did not touch, is at 90.38% lines and 80.04% branches.

Lighthouse (local `next start` on :3400, desktop preset, no session; the base `lighthouserc.js` uses the same method for authenticated routes):

| Route | Performance | Accessibility |
|---|---|---|
| `/email/email-settings` | 94 | 90 |
| `/email/signatures` | 93 | 90 |

The reports are in `artifacts/lighthouse/PG-207/`.

## Reviews

- **Spec:** 5/5 consensus.
- **Plan-reviewer subagent:** APPROVE at iteration 3.
- **SQL review:** F1 and F2 fixed. F3–F6 are documented as accepted.
- **Security review:** fixed. #962 was closed in this PR. #961 was fixed per owner ruling Q12 and then hardened (see below), with the relaxing follow-up as #965.
- **a11y-expert:** 3 high and 6 medium findings fixed.
- **Simplify review:** applied. Preset drift is filed as #963.
- **Codex review**, 19 rounds:
  - Rounds 1–14 found 32 findings, all fixed with tests.
  - Round 15 was skipped (OpenAI usage limit).
  - Rounds 16–17 found HIGHs in the #961 bounce-trust code; both were fixed.
  - Round 18 found two MEDIUMs, filed as #970 and #971 under the runner's stop rule.
  - Round 19 found two MEDIUMs, both fixed in `bd7b4b1c1`.
  - RED was seen first except where the findings doc notes otherwise.
  - No round has run on `bd7b4b1c1`. The runner's pre-ship review at push runs the final one.
- **Security STOA**, re-run 4 times:
  - The open findings (#961, #962, N-1, N-2, N-3) were each fixed.
  - The verdict file holds the last Security STOA result. Its only FAIL was the `pnpm audit` highs then on main (follow-redirects, vite, markdown-it); none came from a PG-207 dependency.
  - After merging #975, those highs are cleared.
  - The same audit then showed a new moderate advisory in `sanitize-html` 2.18.0 (GHSA-c9rx-x947-fp3h, unbounded recursion). The pin was bumped to the patched 2.18.1, published 2026-10-14 by the same maintainer; OSV shows no advisories for it.

## Gates

- **Passed:**
  - Preflights: page-doc, plan-reviewer, exec-readiness, nav-wiring, task-JSON schemas.
  - Knip: none of the 51 new files is unused.
  - Plan checkboxes: 107 of 111.
  - Accessibility docs: WCAG statement at 184 routes, VPAT at 93.
- **Blocked:**
  - Gate 4b, worktree landed: the branch is not pushed. Pushing is the runner's step.
    - The `agent/<id>` branch-name check is a **waived precondition, not a pass** (runner ruling, 2026-10-21): this repo's lane branches are `feat/<id>-<slug>`, as with PG-199 (#935).
  - Codex review: round 19's findings are fixed, but no round has run on `bd7b4b1c1`. The runner's pre-ship review runs it at push.
- **Unchecked plan boxes (4):**
  - Step 1 live header spike: NEEDS_HUMAN.
  - Codex until clean.
  - The exec-gates/attestation box and the SendMessage box, ticked when done.

## NEEDS_HUMAN

1. **OAuth apps:**
   - Register the Google and Microsoft apps and set the `EMAIL_OAUTH_*` env vars.
   - Google's restricted-scope assessment for `gmail.readonly`.
2. **Live header spike:** check that `X-IntelliFlow-Record` and the Message-ID survive into real Gmail and Microsoft DSNs.
3. **Production before the API ships:**
   - Apply the 8 migrations and check `indisvalid`.
   - Set `PRISMA_FIELD_ENCRYPTION_KEY`.
   - Create the private `email-attachments` bucket.
4. **Lighthouse with a session:** needs `LHCI_TEST_EMAIL` and `LHCI_TEST_PASSWORD`.

## Open issues

- #955: IFC-144 false completion.
- #956: DSAR coverage of the email data.
- #957: RecipientPicker `aria-controls`.
- #958: body size limit.
- #961: forged DSN by an insider recipient.
- #962: `processEmail` archive/delete ownership.
- #963: SMTP presets drift from the domain presets.
- #964: a forward with an over-long subject or body returns 500.
- #965: D5 live header spike that relaxes the bounce-trust rule (#961 follow-up).
- #970: Exchange NDR senders (`MicrosoftExchange<hex>@`) are record-only.
- #971: AUTH_FAILED after an OAuth token rotation leaves the mailbox ACTIVE.
- #877: preflight blind spot on pages; the PG-207 pages were checked by hand.
