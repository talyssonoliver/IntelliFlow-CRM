# PG-203 delivery report

Task: PG-203, Module Settings - Event Types (`/calendar/event-types`), with public booking (PR 1, #1003, merged)
and data subject requests (PR 2, #1056). Sprint 18. Written 2026-10-29 at the D12 close-out.

## What was delivered

- **PR 1 (#1003, merged):** tenant event types (`/calendar/event-types`), the appointment-form picker, and an
  unauthenticated public booking page (`/book/<handle>/<slug>`) with slot listing, abuse caps, booker emails and lead
  creation. Six Class A migrations. ADR-083.
- **PR 2 (#1056):** data subject requests end to end. Public request, verify and export pages (`/dsar/<handle>`), the
  ADMIN queue (`/settings/privacy-requests`), erasure, export, and processing restriction that stops every AI path
  (owner Q21, Q22). One Class A migration (`20261022120000_dsar_requests`). The old broken DSAR router and workflow
  are removed.
- **D12 close-out (this round):**
  - the `/book` layout-shift defect fixed (CLS 0.25 to 0.003);
  - a structural timing-parity test;
  - the canonical EmptyState on the privacy queue;
  - the migration lock fix from the SQL review;
  - the missing evidence committed (context ack, coverage baseline, audits, review rounds, execution logs).

## TDD and validation actually run

The logs are under `exec-PG-203-20261020/tdd/` (red, green and characterisation runs per step) and
`exec-PG-203-20261020/tdd/d12-closeout/`.

| What | Result | Evidence |
|---|---|---|
| Full-scope pre-ship at `4db3266f1` | PASS: unit 41195, integration 622 (20 skipped), coverage, diff coverage 81.2%, typecheck, lint, build, codex | `artifacts/preship/last-run.json`, `artifacts/preship/logs/` |
| `pnpm run typecheck` (2026-10-29 10:51Z) | PASS; the first run failed on 6 test mocks, which were fixed | `d12-closeout/typecheck.txt`, `typecheck-first-failed.txt` |
| `pnpm run lint` (2026-10-29 10:49Z) | PASS | `d12-closeout/lint.txt` |
| `lint:sonar:guard` against origin/main | PASS (161 files plus 31 a11y files) | `d12-closeout/sonar-guard.txt` |
| EmptyState fix | red, then 27/27 | `d12-closeout/empty-state-*.txt` |
| Timing parity | red probe, then the privacy module 120/120 | `d12-closeout/parity-*.txt` |
| `/book` CLS fix | red, green, red (isPending), green: 29/29; then book and privacy 56/56 | `d12-closeout/book-cls-*.txt`, `web-book-privacy-final.txt` |
| Migration as edited, fresh DB | `migrate deploy` applied all 93 migrations | `d12-closeout/migrate-deploy-run9.txt` |
| knip unused files | none of the branch's new files flagged | `d12-closeout/knip-files.txt` |
| Lighthouse run 9 (driver v3) | all six pages perf 92-95, a11y 93-100, final screenshots checked | `artifacts/lighthouse/PG-203/local-run-note.md` |
| Independent SQL review (DSAR migration) | APPROVED WITH NOTES, no must-fix | `../PG-203-dsar-sql-review.md` |
| STOA validation (this run) | Intelligence PASS; Domain, Foundation, Quality WARN; Security FAIL (no owner acceptance for #1010, #1015, #1063) | `matop/stoa-verdicts/*.json` |

The final pre-ship on the close-out head runs at push; its result is published as the PR's pre-ship attestation.

## Acceptance criteria

Path shorthands (all relative to repo root):
- CAL = `apps/api/src/modules/calendar/__tests__/`
- PRIV = `apps/api/src/modules/privacy/__tests__/`
- ET = `apps/web/src/app/calendar/event-types/`
- BK = `apps/web/src/app/(public)/book/[handle]/[slug]/__tests__/`
- INT = `tests/integration/`
- ADP = `packages/adapters/src/repositories/__tests__/`
- APP = `packages/application/src/services/__tests__/`
- AIW = `apps/ai-worker/src/`
- LH = `artifacts/lighthouse/PG-203/local-run-note.md` (run 9, 2026-10-29, driver v3, the only valid scores)
- FND = `.specify/sprints/sprint-18/execution/PG-203/PG-203-findings.md`

## Part 1: AC-001..AC-027 (event types and public booking, PR 1, merged as #1003)

| AC | Criterion | Met? | Evidence |
|---|---|---|---|
| AC-001 | `/calendar/event-types` renders header, bento, skeleton, no stub | yes | ET`__tests__/EventTypesContent.test.tsx:90` (header, 8+4 bento, real data), `:102` skeleton; `page.test.tsx:17` stub gone; LH row: 95/93 |
| AC-002 | Empty state passive, no action button, CTA in SectionHeader | yes | `EventTypesContent.test.tsx:126` "canonical empty state with no action button (AC-002)" |
| AC-003 | ADMIN/MANAGER write; others read-only; server FORBIDDEN | yes | `EventTypesContent.test.tsx:214` (read-only UI); CAL`event-types.router.test.ts:186,187,198` (writes need ADMIN/MANAGER) |
| AC-004 | Name/slug/duration/VIDEO/IN_PERSON/colour/fields/max 50 validation | yes | CAL`event-types.router.test.ts:239,245,256,266,277,293`; `packages/validators/src/__tests__/event-types.test.ts:47-158,194-244`; `EventTypeDialog.test.tsx:138-182`; INT`event-types.test.ts:372,399,408,448` (DB CHECKs, uniques) |
| AC-005 | Host must be active member; foreign host NOT_FOUND; inactive host flagged, public page unavailable | yes | CAL`event-types.router.test.ts:283`; `EventTypesContent.test.tsx:149` (flag); CAL`public-booking.router.test.ts:165-193` case "host no longer in the firm" |
| AC-006 | Delete in `$transaction` with ownership check; appointments keep, link NULL; foreign id NOT_FOUND | yes | CAL`event-types.router.test.ts:432,447`; INT`event-types.test.ts:463` (link cleared, appointment survives) |
| AC-007 | Booking link: handle 3..40, reserved, unique, optional https privacy URL, card shows URL or off reason | yes | CAL`event-types.router.test.ts:472,506,518,528`; `BookingLinkCard.test.tsx:34,47,53,62,86,102`; validators `event-types.test.ts:246-291` |
| AC-008 | `EventTypeList` forwardRef `{openCreate}`, CTA uses it | yes | `EventTypesContent.test.tsx:137` "opens the create dialog from the section header through the list handle" |
| AC-009 | `isActive` wired; no other Boolean, no AI toggle | yes | CAL`event-types.router.test.ts:165` listActive only active; `EventTypeDialog.test.tsx:99` "no AI switch (owner Q9)"; validators `event-types.test.ts:152` strict, no AI toggle |
| AC-010 | New Appointment form lists active types, prefill rules, stores `eventTypeId`, foreign/inactive NOT_FOUND, old tests green | yes | `apps/web/src/components/appointments/__tests__/AppointmentForm.test.tsx:251-367`; `apps/api/src/modules/legal/__tests__/appointments.router.caller.test.ts:250-314` (268 rejects foreign/inactive, 281 stores); `apps/web/src/app/appointments/new/__tests__/page.onsuccess.test.tsx:85` |
| AC-011 | 14 days of slots via `listOpenSlots`: availability, closures, buffers (ConflictDetector parity), busy time, 60 min notice, 60-day horizon, daily cap; visitor + firm tz | yes | `packages/domain/src/legal/appointments/__tests__/listOpenSlots.test.ts:62-318` (parity :191, notice :128, cap :246, DST :264); CAL`public-booking.router.test.ts:255-399`; CAL`recurring-busy.test.ts:23-237`; BK`BookingContent.test.tsx:110,128,166`; CAL`public-booking.router.test.ts:975` closures |
| AC-012 | One SCHEDULED appointment with all fields; re-check in tx under advisory lock; two concurrent books = 1 success + 1 CONFLICT | yes | CAL`public-booking.router.test.ts:483,552,602`; INT`event-types.test.ts:602` (real DB, lock serialises two bookings), `:673` control without lock |
| AC-013 | Tenant scope only from handle; body with tenantId/hostId/hostUserId/leadId fails strict validation on all 3 procedures | yes | CAL`public-booking.router.test.ts:209`; validators `event-types.test.ts:310` |
| AC-014 | Five not-found cases give identical NOT_FOUND and the same DB-call sequence | yes | CAL`public-booking.router.test.ts:165-193` (cases: unknown handle, unknown slug, inactive type, no settings row, host gone) |
| AC-015 | Length caps, control chars stripped, required answer BAD_REQUEST, consent, honeypot fake success with 0 DB calls, `fromDate`/`days` bounds | yes | CAL`public-booking.router.test.ts:427,443,399`; validators `event-types.test.ts:326,344,365,371`; BK`BookingContent.test.tsx:199` |
| AC-016 | Two emails to right addresses, fixed subjects, CR/LF stripped, HTML-escaped, no free text to booker, host flags unverified/matching, failed email does not undo | yes | CAL`booking-email.test.ts:53,61,78,112,125,138,148,164,195`; `public-booking.router.test.ts:904,959`; `apps/api/src/security/__tests__/html-escape.test.ts:8,30`. Mock adapter only (LH "Stack") |
| AC-017 | Caps from `booking_attempts` with salted hashes: email 3/24h, IP 10/h, type 30/h (landed-booking adaptations), `listSlots` limiter, prod needs `BOOKING_IP_SALT` | yes | CAL`booking-abuse.test.ts:35-57,81,94,107,126,142,157,169`; `public-booking.router.test.ts:410,452,465,747,762` |
| AC-018 | No match: Lead with type source + host owner via `createLeadInTransaction`, LeadCreated in outbox same tx; booking lead linked; other records not linked; identical response shape | yes | CAL`public-booking.router.test.ts:622,647,661,690`; INT`event-types.test.ts:558` (Lead created in same tx, real DB); `APP/LeadService.createLeadInTransaction.test.ts:71,88`. Outbox is not wired in prod, tracked as gh #966 (FND "Red flags"): the tx writes it, nothing reads it yet |
| AC-019 | New booking lead queued via shared `enqueueLeadScoring`; `lead.create` still enqueues | yes | CAL`public-booking.router.test.ts:904,951`; `apps/api/src/modules/lead/__tests__/lead.router.test.ts:80` ("queues AI scoring ... (PG-203 regression)"); `apps/api/src/modules/lead/__tests__/lead-scoring-enqueue.test.ts:63` |
| AC-020 | Public responses are allowlisted DTOs (snapshot test) | yes | CAL`public-booking.router.test.ts:225` "returns only the public DTO" (asserts the DTO; I did not check whether it is a literal snapshot) |
| AC-021 | `/book` noindex, robots-disallowed, not in sitemap, no login, no marketing chrome | yes | BK`page.test.tsx:29`; `apps/web/src/app/__tests__/robots.test.ts:114`; `sitemap.test.ts:127`; `apps/web/src/__tests__/root-proxy.test.ts:114`; `apps/web/src/app/(public)/_components/__tests__/PublicLayoutShell.test.tsx:171` |
| AC-022 | Consent time/version stored; privacy link firm URL else `/privacy`; DSAR export + erasure cover booker fields; no raw IP/email in `booking_attempts` | yes | CAL`public-booking.router.test.ts:552` (booking fields); BK`BookingContent.test.tsx:174,185`; CAL`booking-abuse.test.ts:169` "records hashes only"; ADP`PrismaDsarAdapters.test.ts:780`; INT`dsar.test.ts:1168` (erasure). Erasure of booker fields of an erased person: see D-AC-06 caveats |
| AC-023 | Cross-tenant tests: router unit NOT_FOUND/scoped; real-DB RLS; B's handle books into B; non-bypass role; tenant delete works | yes | CAL`event-types.router.test.ts:319,447`; INT`event-types.test.ts:519` (RLS hides B), `:558` (handle books only into its tenant), `:496` (tenant delete) |
| AC-024 | Six migrations Class A: named CHECKs, RLS, lock notes, recovery; suite applies SQL itself without replaying `ALTER TYPE`; CONCURRENTLY alone | yes | INT`event-types.test.ts:372,508` and its header comment (line ~89, "ALTER TYPE ... ADD VALUE is never replayed"); `FND` "Independent SQL review" (PR 1, section at line 15). Not applied in production: NEEDS_HUMAN |
| AC-025 | Registries updated (214 to 215), PRD addendum, ADR-083, follow-up tasks and issues exist | yes | `apps/web/src/app/__tests__/sitemap-reconciliation.test.ts:57-67` (count now 220, includes DSAR +4); `docs/planning/prd-module-settings.md:1117`; `docs/architecture/adr/ADR-083-event-types-public-booking.md`; `Sprint_plan.csv` rows PG-211, PG-212, PG-213 (lines 621-623); issues #966 #967 #972 #973. The literal "215" in the spec is stale: PG-207 and the DSAR pages moved it |
| AC-026 | WCAG 2.1 AA: axe-clean, keyboard radiogroups and dialog, labelled controls, focus | yes | BK`BookingContent.test.tsx:125` (axe), `:254` (Enter submit), `:93,117,121` (radiogroups); `EventTypesContent.test.tsx:99,132` (axe); `BookingLinkCard.test.tsx` (axe-core imported); `EventTypeDialog.test.tsx:159,149` (focus). Colour contrast is disabled in the axe helpers; Lighthouse a11y 93/96 covers it (LH) |
| AC-027 | Lighthouse >= 90 on both pages; else NEEDS_HUMAN, never faked | yes | LH run 9: `/calendar/event-types` perf 95 / a11y 93 (CLS 0.003); `/book/e2e-firm/intro` perf 93 / a11y 96 (CLS 0.003, was 81 / 0.25 before the `isPending` fix, test `BookingContent.test.tsx:416,432`); reports in `artifacts/lighthouse/PG-203/*.report.json` with sha256 in the note. Caveats: local production build and local test DB, not the deployed site; Best Practices 78 and SEO 66 are not in the AC; the 2026-10-25 and 2026-10-21 scores are invalid (note's own correction) |

## Part 2: Addendum A, D-AC-01..D-AC-12 (DSAR)

| AC | Criterion | Met? | Evidence |
|---|---|---|---|
| D-AC-01 | Two tables Class A, SQL review passes, Prisma/SQL parity, RLS hides other tenant under `SET LOCAL ROLE authenticated` | yes | `.specify/sprints/sprint-18/execution/PG-203/PG-203-dsar-sql-review.md` (APPROVED WITH NOTES, no must-fix, static review run 2026-10-29, no DB); INT`dsar.test.ts:250-282` (CHECKs), `:303,315` (RLS, B hidden from A); `exec-PG-203-20261020/tdd/dsar/migrate-deploy-and-drift.txt`; ADP`PrismaDsarAdapters.test.ts:1009` (delegates exist). Open note: lock-order item 3 can abort one tx with no retry (FND). Not applied in production: NEEDS_HUMAN |
| D-AC-02 | `submit` identical response/calls matched or not; unknown handle booking-identical NOT_FOUND; honeypot fake success; 3 caps + cooldown hold under concurrency (real DB) | yes | APP`DataSubjectRequestService.test.ts:282,295,308`; PRIV`privacy-public.router.test.ts:105,122,130,148`; INT`dsar.test.ts:358,376 (global cap, folded email),397,410 (two concurrent, cap 1 admits 1)`; INT`dsar-abuse.test.ts:204,212,232` (per-firm daily cap, Q24) |
| D-AC-03 | Token 32 bytes, HMAC only, `timingSafeEqual`, single-use, 24 h, one generic error, unknown id same reads | yes | PRIV`dsar-token.test.ts:11,20,27,34,41`; APP`DataSubjectRequestService.test.ts:319,345`; PRIV`dsar-timing-parity.test.ts:107` (same reads, one compare, same bytes; red probe in `tdd/d12-closeout/parity-red-probe.txt`) |
| D-AC-04 | ACCESS/PORTABILITY: verify completes + emails link; export 72 h, live, allowlist + processingInformation; tenant + exact-email scoped (no +tag); no-data still answers | partly | APP`DataSubjectRequestService.test.ts:402,420,427,455,470`; INT`dsar.test.ts:1018` (exact address, own firm, free text withheld), `:1362`; domain `dsar.test.ts:235` (no +tag folding). Gaps: no test found by name for the "no-data still answers" case; open #1020 (auto-completed access export can withhold data added after verification, with the wrong note) |
| D-AC-05 | Deadline one calendar month (end-of-month clamp) from verification/logging; confirmation email states it; extension emails new date; staff `receivedOn`; late reject; ICO wording | yes | `packages/domain/src/legal/privacy/__tests__/dsar.test.ts:84,90,115,122,140`; APP`DataSubjectRequestService.test.ts:334,582,594,1007,1190`; PRIV`dsar-email.test.ts:65,153` |
| D-AC-06 | Erasure: Q19 fields, embeddings, search vectors, booker fields, that tenant+email only; one tx with `FOR UPDATE`, run once; full rollback (real DB); audit counts only; checklist returned | partly | INT`dsar.test.ts:1120` (rolls back), `:1168` (every Q19 column, others untouched), `:1518,1579` (address races); APP`DataSubjectRequestService.test.ts:762,836`; PRIV`privacy-admin.router.test.ts:248` (audit, counts only); `ai-worker embedding-purge.service.test.ts:42`. Gaps, all open: #1063 (unlinked AI insights naming the person), #1010 (AI-created tasks keep insight text), #1015 (conversations/messages not tagged, RAG/export/erasure cannot reach them), #1009 (checklist not kept on completed requests); follow-up IFC-316 (comms erasure automation) |
| D-AC-07 | Admin procedures ADMIN only; MANAGER and other tenant's ADMIN refused; every query tenant-scoped | yes | PRIV`privacy-admin.router.test.ts:96,104,113`; INT`dsar.test.ts:315,614` (lift within firm only) |
| D-AC-08 | Restriction: RESTRICTION/OBJECTION create active restriction; scoring/embedding/drafts refuse; insights/predictions not generated/written (Q21); no AI path sends restricted/erased data or stores output (Q22); banner; lift informs first | partly | Service: APP`DataSubjectRequestService.test.ts:363,851,879,924,1217,1266`; `LeadService.restriction.test.ts:58,86,121,146`; `ContactService.restriction.test.ts:35`; `lead-scoring-enqueue.test.ts:168,181`; `apps/api/src/agent/tools/__tests__/draft-message.test.ts:77,90`; `autoresponse.router.policies.test.ts:103`. AI worker: `AIW/lib/__tests__/data-request-guard.test.ts:36-341`, `AIW/jobs/__tests__/insights-predictions-data-requests.test.ts` (prediction :265, insight :536, contact insight :671, enrichment :750, tag suggestions :805, reply drafts :838, deals :972), `scoring.dispatch-data-requests.test.ts:59`, `AIW/workers/__tests__/contact-embed-worker.test.ts:229,262`. Real DB: INT`dsar.test.ts:986,1651,1699,1769`. UI: `apps/web/src/components/privacy/__tests__/RestrictionBanner.test.tsx:53`. Open: #1007 (rejected restriction survives on a changed address), #1027 (rejection announces a lift while another request keeps it), #1021 (RAG filters restricted people after the 100-row limit; Q22 retrieval path), #1010. Addendum B has no numbered ACs; it is plan section "Plan Addendum B" (plan line 1545) and is covered by these Q21/Q22 bullets |
| D-AC-09 | SLA job alerts ADMINs once per request inside 7 days/overdue, no PII, replica-safe | yes | PRIV`dsar-sla-scheduler.test.ts:176,195,234,288,324`; INT`dsar.test.ts:1847` (due, overdue, repeat after 3 days), `:1909,1927,1951,1982` (replica lock, SKIP LOCKED); `apps/api/src/__tests__/http-server.dsar-sla.test.ts:28,46` |
| D-AC-10 | No token in server-visible URL/log/output; `/dsar/*` no-referrer + no-store; pages pass axe | yes | `apps/web/src/__tests__/dsar-headers.test.ts:21,33`; PRIV`privacy-public.router.test.ts:302` (no body/address/token to any logger); `apps/web/src/lib/sentry/__tests__/scrub.test.ts:56`; `dsar-shared.test.tsx:33,43` and Verify `:34`, Export `:56` (fragment stripped); axe in DsarRequestContent `:62`, Verify, Export, PrivacyRequestsContent `:114`; PrivacyRequestsContent `:127` |
| D-AC-11 | Old workflow, mocks, GET-that-processes gone; delegate guard passes; ports wired in container.ts and context.ts with runtime check | yes | `apps/api/src/workflow/dsar-workflow.ts` and `modules/privacy/dsar.router.ts` do not exist (checked on disk); ADP`PrismaDsarAdapters.test.ts:1009` (delegate guard); `apps/api/src/__tests__/container.test.ts:687,694,792` (runtime wiring); `apps/api/src/context.ts:86,243` (`dsar` in context). I did not find a test that asserts `context.ts` itself |
| D-AC-12 | Docs match code: `dsar-process.md`, `gdpr-compliance.md`, checklist rows, security-claims-audit, ADR-007 addendum, ADR-083 DSAR section, registries/IA, follow-ups recorded | yes | `docs/compliance-and-governance/data-governance/dsar-process.md` (v2.0, 2026-10-24); `gdpr-compliance.md:21-33` (controller/processor); `gdpr-compliance-checklist.csv` rows GDPR-005..011, 021, 023, 031 rewritten; `docs/security/security-claims-audit.md:340`; `ADR-007-data-governance.md:363` (superseded note); `ADR-083` mentions DSAR (8 hits); `docs/design/PAGE_MAP_AND_FLOWS.md:396`; `settings-search.test.ts:19`; `Sprint_plan.csv:624-627` IFC-315..318. Docs were read for presence, not audited line by line against code |

## Open items and how they map

- Tracked open issues (all OPEN today): #1007, #1027 (D-AC-08), #1009, #1010, #1015, #1063 (D-AC-06), #1020 (D-AC-04), #1021 (D-AC-08 retrieval), #1014 (failed rejection/completion email not retried or shown to admin; no AC names it, touches D-AC-04/05 notices), #1019 (no legal-hold registry; docs cite `anonymize_record()` and `docs/legal` that do not exist; touches D-AC-12 wording, verify the new docs do not repeat the claim).
- Follow-ups recorded as rows: IFC-315 marketing suppression, IFC-316 comms erasure automation, IFC-317 CSV export + Art 20(2), IFC-318 Art 19 notification (`Sprint_plan.csv:624-627`); PG-211/212/213 for PR 1. Their gaps are not ACs.
- Other PR 1 trackers (FND "Red flags"): #972 playbook AI default, #973 placeholder ICS recipients, #966 outbox not wired, #967 reminders never scheduled, #877 gate false green.

## NEEDS_HUMAN (production steps, not code gaps)

1. Apply the PR 1 migrations (six) and the DSAR migration `20261022120000_dsar_requests` to production (Class A, `prisma migrate deploy`).
2. Production function grants: `dsar_subject_lock` is revoked from PUBLIC in the migration; `dsar_normalise_email` is not (SQL review item 6). The grants on the production database are unverified.
3. Live email: all email tests and the Lighthouse e2e run use the mock adapter, so nothing was sent (LH "Stack"). Verification, export and SLA alert mails have never gone through the real provider.
4. Production smoke (plan line 13, step 10) and the spoofed-header check against the deployed API behind Railway (FND line 55).
5. Lighthouse is measured locally (production build, local stack); the deployed pages are unmeasured.

## Tally

- AC-001..AC-027: 27 yes, 0 partly, 0 no.
- D-AC-01..D-AC-12: 9 yes, 3 partly (D-AC-04, D-AC-06, D-AC-08), 0 no.
- Addendum B: no numbered ACs; covered under D-AC-08 (Q21/Q22), which is "partly".
- Total: 36 yes, 3 partly, 0 no (39 criteria).
