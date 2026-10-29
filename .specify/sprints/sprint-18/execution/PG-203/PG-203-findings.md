# PG-203 — Findings

Running log for the exec phase. Every entry gives its evidence path. Times are UTC from `date -u`.

## Review findings fixed during exec

| # | Source | Finding | Resolution | Evidence |
|---|---|---|---|---|
| F1 | codex (run 3, 2026-10-20T23:45Z), fingerprint 14dc88a3 | `bookingPrivacyUrlSchema` accepted `HTTPS://x` and `https:x`, which the DB CHECK `LIKE 'https://%'` rejects | `isHttpsUrl` now requires the literal `https://` prefix and a parseable URL; two regression cases added | `exec-PG-203-20261020/codex-3.txt`, `packages/validators/src/__tests__/event-types.test.ts` |
| F2 | Independent SQL review (data-engineer subagent, Class A gate 1) — D1 | VALIDATE CONSTRAINT ran in the same transaction as ADD COLUMN / ADD FOREIGN KEY, so a scan ran under ACCESS EXCLUSIVE / SHARE ROW EXCLUSIVE | All VALIDATEs moved to the new migration `20261021120500_validate_booking_constraints` (own transaction, SHARE UPDATE EXCLUSIVE), and the headers corrected. Re-review: **SQL REVIEW: APPROVED** | `exec-PG-203-20261020/migrate-deploy-ephemeral.txt` (fresh apply of all six; all six constraints `convalidated=t`) |
| F3 | pre-commit lint (sonarjs/slow-regex) | backtracking regexes in `splitBookerName` and the enum-consistency comment stripper | replaced with `search(/\s/)`/`indexOf` | commit hook output |
| F4 | codex (run 16, 2026-10-21), fp 0bdc0c4b | `EventTypeDialog` reset its draft from a `useEffect` keyed on the parent's `defaultHost` object, which the parent recreates every render, so typing was wiped when a save started or failed | the reset effect is gone; `EventTypeList` remounts the dialog per opening (`key={session}`); regression test "keeps the typed draft when the parent re-renders" | `codex-16.txt`, `EventTypeDialog.test.tsx` |
| F5 | codex (run 17), fp 1bb01d8c | `addMinutesLocal` parsed the `datetime-local` value as local time but `toLocalDateTimeString` formats with UTC getters, so outside UTC the event-type end time was shifted (London: 10:00 + 30 → 09:30) | the value is read as UTC so both sides agree; test passes under `TZ=UTC`, `Europe/London` and `America/New_York` | `codex-17.txt`, `AppointmentForm.test.tsx` |

## Independent SQL review (Class A gate 1)

- Reviewer: `data-engineer` subagent, read-only. It ran catalog queries only, against an ephemeral local DB.
- First pass: CHANGES REQUIRED (D1, above).
- Second pass: **APPROVED**.
- The reviewer verified that all of these pass:
  - Class A compliance;
  - CHECK parity with the domain constants;
  - FK semantics (column-list SET NULL, NO ACTION host FK, composite tenant safety);
  - RLS;
  - the CONCURRENTLY single-statement pattern;
  - Prisma/SQL parity (`exec-PG-203-20261020/prisma-drift.sql.txt` shows only the documented SQL-only FKs plus three pre-existing drifts unrelated to PG-203);
  - the recovery plans.
- Production PG version (runner projects-8c, 2026-10-21): production Supabase is Postgres 17.6 (pg_dump 17.6 restores on 13/10 and 16/10), i.e. ≥ 150000. The runner re-confirms read-only before the apply. The original requirement was to run `SHOW server_version_num;` on production Supabase and require ≥ 150000. The column-list `ON DELETE SET NULL (col)` form needs PG 15. `supabase/config.toml:34` says 17 and `infra/supabase/config.toml:21` says 15.
- Non-blocking: `event_types.hostUserId` references `users(id)` only, because `users` has no `(tenantId, id)` key. Host tenant membership is enforced in the API (spec AC-005), and tests cover it.

## Step 19 reviews (2026-10-21)

**a11y-expert (WCAG 2.1 AA): FAIL, then fixed.** 1 blocker, 4 major and 6 minor findings, all in the PG-203 UI:

- the selected day/time card relied on colour alone, at about 4.1:1 (now a 2px primary border, a tint and a check icon, with foreground text);
- the honeypot was exposed to assistive tech (now `aria-hidden` on its wrapper);
- the "Copied" state was never announced (now a live region and a matching name);
- the host field had no group name or error link (now a `fieldset`/`legend` with `aria-describedby`);
- on submit, focus did not move to the first error, and the time group had no error link (fixed in both the booking form and the dialog);
- there was no `<form>` and no required hint (now a real form, Enter submits, and "All fields are required");
- slot names were redundant (the firm time only shows when its zone differs, and the group is labelled per day);
- the live region now stays mounted;
- the new-tab link now has a warning;
- the confirmation now sets `document.title`, and the loading states have an h1.

All are covered by tests in `BookingContent.test.tsx`, `EventTypeDialog.test.tsx` and `EventTypesContent.test.tsx`.

**security-lead (public booking): REJECTED, then fixed.**

- F1, timing oracle on "already a client": owner Q20. The lead is now created after the reply, under the same lock.
- F2, no pre-database throttle: per-IP limiters now run on `getEventType` and `book` before any read, plus a lock-free cap pre-check.
- F3, the IP cap was bypassable: IPv6 is now reduced to /64. The header choice was then revised after codex (fp 07766f8e, after the main merge). The first fix used the rightmost XFF hop only. Codex showed that a CDN in front would make that hop shared by every visitor, and the repo's own `rate-limit.ts` documents that risk.
  - The browser calls Railway directly (`providers.tsx` → `NEXT_PUBLIC_API_URL`). Per Railway staff answers and a measured spoof test, Railway's edge writes `X-Real-IP` and overwrites `X-Forwarded-For`.
  - So `X-Real-IP` comes first and the rightmost hop is the fallback.
  - Railway has no formal contract for these headers. Verifying with a spoofed header against the deployed API is a NEEDS_HUMAN item, because it touches production.
- F4: the host email now flags a link to an earlier booking lead.
- F5: plain-text injection in the host email (line breaks stripped and notes quoted).
- F7: privacy and meeting URLs with credentials or control characters are rejected.
- F8: logs carry error classes only.

Accepted, not changed:

- F6: the email cap counts failed attempts. That deliberately bounds abuse; a victim lockout costs the attacker 3 attempts per address per day.
- F7 (part): the consent record stores the version only, not the privacy URL. That needs a schema change, so it goes to the PG-213 retention/consent follow-up.

Evidence: `apps/api` calendar suite 184/184; integration 71/71 (`tdd/green-integration.txt`, NF-004 2046 ms).

## Non-functional measurements (2026-10-22, fresh ephemeral DB)

- **NF-001** `listSlots`, 14 days, 10 runs: p95 **135.6 ms**, median **92.5 ms**. Target < 300 ms: met. The repo-wide tracing middleware logs `SLOW REQUEST` above a generic 50 ms target for every call. That log carries only a correlation id, so no PII. It is noted here rather than silenced.
- **NF-004** lock wait: the booking gave up after **1980-2046 ms** at the 2 s `lock_timeout`, with CONFLICT "Please try again." and no write.
- **Diff coverage** (pre-ship, Sonar `new_coverage` parity): **88.1%** (1254/1424). Files below 80%:
  - `appointment-side-effects.ts`, 0/69: moved verbatim out of `appointments.router.ts`, and its callers' tests mock it;
  - `EventTypesContent.tsx`, 74.6%;
  - `lead.router.ts`, 1/2 (the new rejection handler);
  - `components/appointments/types.ts`, 0/2 (type-only).

## DB integration test (plan Step 8) — what it proves and where it deviates

Evidence: `exec-PG-203-20261020/tdd/green-integration.txt` (fresh ephemeral DB via `pnpm test:db:run`, every migration applied; event-types 18/18 plus rls-tenant-isolation, availability and contact-types: 70/70, 0 skipped).

- **No RED capture.** The integration file was written after the migrations (Steps 13-14), so there is no failing run on record. The assertions were checked against the real constraints: the first run had four failures, all in the test's own seeding, which were fixed.
- **Outbox (plan said "the LeadCreated outbox row exists").** False for this runtime. `apps/api/src/container.ts:376` wires `InMemoryEventBus`. Its `publishAll(events, tx)` ignores `tx` and writes no outbox row, although the `LeadService` comments (DDD-002) say the save and the outbox share the transaction. The test asserts what is true: the Lead row commits in the booking transaction, and `lead.created` is published on the bus. This pre-existing gap goes to Red flags.
- **Double-booking is already blocked at the DB.** `appointments_no_overlap_per_organizer` (20260530000000) excludes overlapping non-cancelled appointments per (tenant, organizer). So the advisory lock is not what stops one host being double-booked. It serialises the whole re-check (buffers, the tenant daily cap, host availability) and returns a clean CONFLICT. The lock-free control therefore races a tenant-wide one-per-day check across two hosts (both land), not one host's slot.
- **NF-004.** This run uses the router's real `lock_timeout` of 2s, not a test-only 200ms parameter: adding a test hook to production code was not worth it. Measured: the booking gave up after 1925 ms with CONFLICT "Please try again." and wrote no appointment.
- **Non-bypass role.** RLS is proven by `SET LOCAL ROLE authenticated` sessions, on both new tables, in both files. `book` runs as the API's own (BYPASSRLS) connection, which is the production path; it is not re-run under the non-bypass role.

## Environment notes

- The shared test DB `intelliflow_test` (localhost:5433) has a FAILED migration `20261008000000_help_article_system_scope`, started 2026-10-17 20:50:29 UTC by another lane. `prisma migrate deploy` therefore refuses it (P3009). PG-203 does not touch the shared DB. It uses its own ephemeral DB from `pnpm test:db:up` and drops it at the end. Not PG-203's to resolve; reported to the runner, which repaired it on 2026-10-21 (the column and index already existed, so it marked the row finished).
- Preflight false green: `check-page-doc-cochange.mjs` and `check-nav-wiring.mjs` report "plan does not create any page.tsx". In fact the plan creates `apps/web/src/app/(public)/book/[handle]/[slug]/page.tsx`. Their parser misses route-group and dynamic segments. The docs co-change and reachability are covered manually (plan Step 18) and filed as an issue (see Red flags).

## Red flags (tracked in gh issue + debt ledger + this doc)

| Flag | Verified evidence | Tracking |
|---|---|---|
| (a) Playbook "AI defaults OFF" vs owner Q8 | `docs/planning/module-settings-playbook.md:131-136` | gh #972, debt `PG-203-PLAYBOOK-AI-DEFAULT-OFF-001` |
| (b) PUBLIC tier keys on leftmost XFF; pass-through without Redis | `apps/api/src/middleware/rate-limit.ts:410-426` documents the leftmost hop as deliberate (a rightmost-hop key would put all anonymous traffic in one bucket); `trpc.ts:88-96` pass-through is the documented dev/test fallback | Not a bug. Recorded here only. Public booking does not rely on it: its caps are DB-counted under advisory locks |
| (c) Placeholder ICS recipients | `packages/application/src/services/AppointmentIcsEventHandler.ts:245-258` (`${organizerId}@intelliflow-crm.com`; attendee ids as addresses) | gh #973, debt `PG-203-ICS-FABRICATED-RECIPIENTS-001`. Public bookings pass `sendIcs:false` |
| (d) DSAR keyed on `ownerId = subjectId` | `apps/api/src/workflow/dsar-workflow.ts:299-330, :419-422` | Being fixed by the PG-203 DSAR change (PR 2, owner Q13/Q14) |
| (e) DSAR router returns `error.message` | `apps/api/src/modules/privacy/dsar.router.ts:112-119` | Being fixed by the PG-203 DSAR change (PR 2) |
| Outbox never written (found in exec) | `apps/api/src/container.ts:376` InMemoryEventBus | gh #966, debt `PG-203-OUTBOX-NOT-WIRED-001` |
| Reminders never scheduled (found in exec) | `apps/api/src/services/appointment-domain.service.ts:71-126`; `ReminderSchedulerService.ts:34,52` | gh #967, debt `PG-203-REMINDERS-NEVER-SCHEDULED-001` |
| Preflight false green on route-group pages | `check-page-doc-cochange.mjs`, `check-nav-wiring.mjs` | Already tracked: gh #877 |

Follow-up tasks (owner-approved, `/create-task`): PG-211 booker cancel/reschedule, PG-212 per-type notice/horizon, and PG-213 booker PII purge.

## DSAR (PR 2): preflight (2026-10-22)

- **Characterisation.** The existing DSAR tests pass, 88/88: `dsar-workflow.test.ts`, `dsar-search-purge.test.ts` and `dsar.router.test.ts` (`exec-PG-203-20261020/tdd/dsar/characterization-api.txt`). They pass only because they mock Prisma accessors that do not exist (scoping report).
- **`tests/compliance/data-governance.spec.ts` never runs.** It is excluded from the root vitest project at `vitest.config.ts:264` ("TDD RED-phase tests that import unimplemented modules"), and `vitest run` on it prints "No test files found". Its DSAR imports and `describe` blocks are removed in D6; the rest of the file is left as it is.
- **Allowlist rule.** `tests/architecture/tenant-procedure-enforcement.test.ts` flags a router only when it contains `protectedProcedure` but not `tenantProcedure` (lines 123-131), or when it reads `ctx.user?.tenantId` in a `tenantProcedure` router. So:
  - `privacy-public.router.ts` (publicProcedure only) needs no entry;
  - `privacy-admin.router.ts` (`adminTenantProcedure`, no `protectedProcedure`) needs no entry and must not read `ctx.user?.tenantId`;
  - the stale `'dsar.router.ts'` entry (line 37) is removed in D6.
- **Approval sweep.** `apps/api/src/agent/approval-escalation-sweep.ts` creates no drafts: a grep for `AutoResponseDraft.create`, `draftRepository.save/create` and `.create(` finds nothing (sign-off 7).

## DSAR (PR 2): D5-D7 decisions and evidence (2026-10-22)

- **Codex round on D3-D6 (3 blocking, all real, all fixed):**
  1. *Automatic scoring bypassed restrictions.* `enqueueLeadScoring` now takes a required restriction reader
     and skips (fails closed on a read error); both callers pass it. The worker re-reads the lead in
     `processScoringJob` (missing, erased, email changed, restricted) and the scheduled dispatcher drops
     erased (query) and restricted (per-tenant set) leads. Tests: `lead-scoring-enqueue.test.ts`,
     `scoring.job.test.ts`, `scoring.dispatch-data-requests.test.ts`, `data-request-guard.test.ts`.
  2. *A failed Art 18(3) notice still let a restriction lift.* `DsarNotificationPort.send` now resolves
     `true` only when the provider accepted the message. `liftRestriction` answers REFUSED
     `NOTICE_NOT_SENT`; `reject` of a RESTRICTION keeps the restriction (`restrictionKept: true`) and the
     admin lifts it later. Tests in the service, router and email suites.
  3. *Exports silently truncated at 500 rows.* Each category asks for 501 rows; past the cap it counts
     the rest as the new withheld category `EXCESS_ROWS`, so `accessCompletesAtVerify` keeps the request
     open for the firm to deliver the remainder.
- **`moveEmail` became `followEmail` (copy, not move).** Moving a restriction off the old address would
  unrestrict any other record of the firm still using it (a lead and a contact share an email; only the
  contact's email changes). The new address now gets the restriction (merged) and the old row stays
  active; over-restricting is the safe direction. `ContactService.updateContactEmail` calls it before the
  save and refuses the change if it fails. Integration test updated.
- **`listActive` added to the restriction port** (`privacy.admin.restrictions`): the admin page needs
  restriction ids to lift them, and `restrictionFor` returns booleans and a date only (sign-off 3).
- **Admin counting and alerts** use the firm's own ADMIN users whose membership is not revoked;
  partner-granted memberships are not counted (second-admin rule, alerts).
- **`previewErasure` is by request id**, so the admin never types an email to probe.
- **`tests/compliance/data-governance.spec.ts` now runs.** The `vitest.config.ts` exclusion is removed; its
  DSAR blocks were rewritten as real assertions (schema no-hold refusal, calendar-month deadline, the six
  request types) importing sources by relative path. It ran 10/10.
- **Lead email is immutable** (plan revision 2): `updateLeadSchema` drops `email` (pinned by a validators
  test). Grep of every other lead writer (`lead.update|updateMany|upsert` in api, ai-worker, application,
  adapters): `lead.router.ts:920` isStarred, `:1569/:1690/:1760` status, `:1901` lastContactedAt;
  `routing.router.ts:422` and `LeadRoutingService.ts:293` ownerId/status; `PrismaLeadRepository.ts:143`
  status, `:155` aggregate upsert (no email setter on Lead), `:318/:429` status. None writes `email`.
- **Contact writers** (sign-off 4): only `ContactService.updateContactEmail` changes an email (covered).
  `contact.router.ts:2044` lastContactedAt, `:2596` tags, `contact-reassign.ts:67` ownerId,
  `account-duplicate-detection.service.ts:359` and `PrismaContactRepository.ts:429` accountId,
  `PrismaContactRepository.ts:360` merge fields (title, phone, department, accountId). Bulk paths: no
  `contact.createMany` or `lead.createMany` under `apps/api/src/modules` or `apps/workers` writes an
  email change; creating a record does not move a restriction. *Residual:* merging a restricted secondary
  contact into a primary with another email leaves the restriction on the secondary's address only;
  noted for the follow-up on communications.
- **Vitest dynamic-import race (test-infra, fixed in code):** two concurrent scoring jobs each
  `await import('@intelliflow/db')`; vitest handed the second the real module instead of the mock
  (SASL errors). `scoring.job.ts` now imports the module once (`loadDb`). The prediction-job tests log
  the same SASL error on their own dynamic imports; they catch and pass, and are not PG-203's to change.
- **`DsarRequestDto.receivedOn`** is the UTC date of `receivedAt`.
- **Known limitation (documented, not fixed):** `reject` of a RESTRICTION merged with an OBJECTION sends
  the "lifting" notice although the OBJECTION keeps the row active. Rare (needs both on one address);
  the restriction itself is never lifted early.

## DSAR (PR 2): codex rounds 2-3 and D9 (2026-10-22)

- **Codex round 2 (fixed):** `liftForRequest` now releases every active row a request holds (followEmail can
  create two); an access request is marked issued/completed only after the export email was accepted, else
  the token is cleared and the request stays open for `exportData` + `completeAccess`.
- **Codex round 3 (fixed):** the export now carries every profile field and the AI-derived data (scores
  with factors, lead/contact insights, generic insights) and counts the contact's inline staff note as
  withheld; an in-flight scoring job writes its insight only under the lead row lock after re-checking
  (`writeIfStillEligible`), so an erasure cannot be undone by a late job; one extension is enforced in the
  conditional update (`onlyIfNotExtended`).
- **Gate weakness found and filed (gh #980):** `codex-review.mjs` fingerprints a finding as the minimum
  per-line hash over ±2 lines, so a trivial `}` line anchored the waiver drafted for the D9 pages finding and
  it suppressed an unrelated real finding (the extension race). The waiver was withdrawn; the D9 pages were
  built instead so the finding no longer applies. Existing waivers were not audited (issue asks for it).
- **D9 pages:** `/dsar/[handle]` (form), `/verify` and `/export` (fragment read once into a ref and stripped
  with `history.replaceState`; StrictMode-safe; export rendered as text nodes, saved from memory, no
  storage), `/settings/privacy-requests` (ADMIN; dialogs keep server refusals inside), `RestrictionBanner`
  on lead and contact pages (by record id). `next.config.js` `/dsar/:path*`: `Referrer-Policy: no-referrer`,
  `Cache-Control: no-store` (after `/:path*`, tested). Sentry scrub also strips the transaction name.
  Booking page footer and booking confirmation email link `/dsar/<handle>` (a missing APP_URL drops the
  link, not the email).
- **Router registration:** the composed `privacy` router lives in `privacy.router.ts`, because the
  `ia-reconciliation` / `ui-flow-mapping` router counters stop at the first `})` in `router.ts`.
- **Lead/contact page tests** stub `RestrictionBanner` (as they stub PinButton and the action sheet); the
  banner has its own tests.

## DSAR (PR 2): D12 close-out (2026-10-29)

An adversarial review of PR #1056 at `4db3266f1` found no code defect but several process-evidence gaps. A
box-by-box check of the plan against the code found more. What was found and what was done:

### Independent SQL review of `20261022120000_dsar_requests` (plan D3, Class A gate)

- **Missed at the time.** No review of the DSAR migration was on record; the only SQL review on file was the
  PR 1 one above. It was run on 2026-10-29 by a read-only data-engineer subagent (static review, no database).
  Its output is kept verbatim in `PG-203-dsar-sql-review.md` next to this file.
- **Verdict: APPROVED WITH NOTES, no must-fix.**
- **Item 2 (should-fix), fixed:** the eight `DROP TRIGGER IF EXISTS` lines are removed. They took an ACCESS
  EXCLUSIVE lock on `leads`, `contacts` and the `ai_*` tables even with no trigger present, which blocks reads;
  `CREATE TRIGGER` alone takes SHARE ROW EXCLUSIVE. The migration is unapplied in production
  (NEEDS_HUMAN 1), so the file can still change. The real-DB suite tolerates 42710 when it re-applies the SQL.
- **Item 3 (should-fix), checked and not changed:** the review describes an AI write that takes the address
  lock and then a `FOR KEY SHARE` on the lead row (the erasure guard trigger), against an erasure that takes
  the row lock and then the address lock. Every caller that takes the address lock and then touches a lead or
  contact row takes the row first:
  - `LeadService.scoreLead`: the score UPDATE (row lock), then `status(…, tx)` (address lock);
  - `writeIfStillEligible` / `writeContactIfStillEligible`: `FOR UPDATE` on the row, then the address;
  - `writeIfAddressesStillClear` and `writeIfQueuedAddressStillClear` write insights with no lead or contact
    `entityId`, so the guard trigger takes no row lock.

  `status(…, tx)` has one caller (`LeadService.ts:313`). The case the migration header already names (an
  insight UPDATE against an erasure) ends with Postgres aborting one transaction; nothing is half-written, and
  the erasure can be run again. A retry on 40P01 was not added.
- **Item 10 (recovery), applied:** the migration header now says to drop `dsar_subject_lock` and
  `dsar_carry_restriction` only after the API that calls them is rolled back.
- **Notes left as they are (no change in this PR):** RLS shape matches `event_types` (item 4); tenant
  CASCADE deletes DSAR records on a hard tenant delete (item 5); item 6 is partly wrong: `dsar_subject_lock`
  is revoked from PUBLIC (migration.sql, `REVOKE ALL ON FUNCTION dsar_subject_lock`), while
  `dsar_normalise_email` is not and is marked IMMUTABLE; `UPDATE OF email` triggers
  fire whenever the column is in the SET list (item 7); `LEAST`/`GREATEST` in the carry use the database
  collation while `liftForRequest` sorts `COLLATE "C"` (item 8); drift is the documented users FKs (item 9).

### Deviations from the plan, now recorded

- **No `kind` column on `processing_restrictions`.** A restriction carries its type as `blocksMarketing` plus
  the request ids in `dsarRequestIds` (spec sign-off condition 1); nothing reads a kind. The unused
  `RESTRICTION_KINDS` constant is removed from the domain.
- **Timing parity was not tested.** It is now: `apps/api/src/modules/privacy/__tests__/dsar-timing-parity.test.ts`
  runs the real public router, service and token port with a recording repository and a spied
  `timingSafeEqual`. For an unknown request and a known one with a wrong token, `verify` and `downloadExport`
  make the same reads (`findById` only), compare exactly once, and answer with the same status and the same
  bytes. Red first: with the compare skipped for an unknown request, both cases fail (`expected +0 to be 1`,
  `tdd/d12-closeout/parity-red-probe.txt`); restored, the privacy module passes 120/120
  (`parity-green-privacy-module.txt`).
- **Admin schema shape:** `complete` is one flat strict schema; the ERASURE no-hold, marketing-stop and
  backdate-reason rules are enforced and tested in `DataSubjectRequestService`. `receivedOn` is stored as
  `receivedAt`. `moveEmail` became `followEmail` (copies). Every staff-logged erasure waits 24 hours (Q25).
  `processingInformation` is built in the service. `restrictionFor` is a `tenantProcedure` (the banner read).
- **Evidence logs that do not match the plan's commands.** The migrate-deploy log is
  `tdd/dsar/migrate-deploy-and-drift.txt`; there is no standalone `db typecheck` or DSAR build log; the last
  single-file `dsar.test.ts` log has 22 tests (the file now has 42) and there is no RED capture for it. The
  evidence for these is the full-scope pre-ship at `4db3266f1` (typecheck, lint, build, unit 41195 passed,
  integration 622 passed, diff coverage 81.2%), not the plan's exact commands.

### Playbook deviation fixed

- `/settings/privacy-requests` showed its two empty lists as plain text. They now use the canonical
  `<EmptyState phase="passive">` (`tickets` for requests, `rules` for restrictions), hidden while loading or on a
  load error. Red first, then 27/27 (`tdd/d12-closeout/empty-state-*.txt`).

### Provenance gaps closed

- `context_ack.json` and `artifacts/coverage/PG-203-before.json` were written on 2026-10-20 in the PR 1 worktree
  and never committed (gitignore, untracked). Committed byte-for-byte; all 19 ack hashes match `d4db133c9`.
- The hydrated context had no `shared_component_audit` or `route_conflict_audit` (the hydrator never writes
  them). Both added, marked retrospective and dated.
- The discussion log had no Addendum A rounds. Added from the session transcripts (all 11 verdict texts).
- This evidence folder was gitignored and never committed; it is committed with the close-out.
