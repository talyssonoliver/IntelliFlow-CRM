# PG-203 PR 1: event types + appointment picker + public booking (slice report)

Branch: `feat/pg-203-event-types`. HEAD: `4e0f032bf`. 16 commits ahead of `origin/main` (main merged twice, last at
`e7ce625b2` #975).

**PR 1 is not the whole of PG-203.** DSAR end to end (owner Q13/Q14/Q16-Q19) is PR 2 (`feat/pg-203-dsar`, cut from
this head). Because of that:

- the CSV row stays **In Progress**;
- the canonical `attestation.json` and `generate-final-report` come with PR 2;
- no COMPLETE verdict is claimed for this slice.

## What ships

- `/calendar/event-types`: the event type catalogue (playbook layout, dialog, booking link card), reached from the
  calendar sidebar.
- The event type picker in New Appointment.
- `/book/<handle>/<slug>`: public booking (date strip, times in the visitor's zone, required answers, consent,
  honeypot, confirmation). Chrome-free, noindex and disallowed in robots.
- The `calendar.eventTypes` router (6 procedures) and `publicBooking` (3), with ADR-083.

## Prisma migrations (L13) — must reach production before the API is promoted

`20261021120000`..`20261021120500`, six migrations, all Class A:

- the enum value;
- `event_types` and `booking_attempts` with RLS;
- a CONCURRENTLY handle index;
- a CONCURRENTLY `leads(tenantId,id)` index;
- the lead FK (NOT VALID);
- a separate VALIDATE migration.

The SQL review is APPROVED (findings F2). Column-list `ON DELETE SET NULL` needs PG >= 15; production is PG 17.6.
**None is applied to production.**

## Validation evidence (all under `exec-PG-203-20261020/`)

| Check | Result | Evidence |
|---|---|---|
| Package suites | domain 3145, validators 2818, application 1501, db 224 (+14 skipped), api 8043 (+18 skipped), web 13187: all pass | `validation/test-*.txt` |
| Real-DB integration (fresh ephemeral DB) | 72/72 (event-types, rls-tenant-isolation, availability, contact-types) | `tdd/green-integration.txt` |
| NF-001 `listSlots` 14 days | p95 135.6 ms, median 92.5 ms (target < 300) | same |
| NF-004 lock wait | gave up at 1980-2046 ms, CONFLICT, no write | same |
| Typecheck (after both main merges) | 38/38 | `validation/typecheck.txt`; code-review run 20261022-003840 |
| Lint | 36/36; `lint-promises` PASS | `validation/lint.txt` |
| Builds | api and web exit 0 | `validation/build-*.txt` |
| Pre-ship subset (fresh DB) | format, lint-promises, governance-schema, lint-artifacts, lint-runtime-paths, a11y-routes, docs-integrity, flaky-test-gate, architecture, validate-sprint-data, coverage, diff-coverage: PASS | `validation/preship-subset*.txt` |
| Diff coverage | **88.1%** (1254/1424); files below 80% are listed in the findings | `artifacts/preship/logs/diff-coverage.log` |
| Codex semantic review | PASS (35 runs); waivers tied to #913, #967 and verified false positives | `codex-*.txt`, `tools/audit/codex-review-waivers.yaml` |
| a11y review (WCAG 2.1 AA) | FAIL → fixed (1 blocker, 4 major, 6 minor) | findings "Step 19 reviews" |
| Security review (public booking) | REJECTED → fixed: F1 (owner Q20), F2, F3 (revised after codex), F4/F5/F7/F8 | findings "Step 19 reviews" |
| Lighthouse `/book` | perf 93, a11y 100 (not-available state) | `artifacts/lighthouse/PG-203/` |
| Icons / L14 | subset verify OK (371); 0 tracked log/coverage/tsbuildinfo | plan Step 19 |

## NEEDS_HUMAN

1. Lighthouse for `/calendar/event-types` with authentication (Path C). It needs a local API, Supabase and a seeded
   admin without production credentials.
2. Lighthouse for `/book` in its slot, form and confirmation states. It needs a reachable API with a seeded tenant.
3. On the deployed API, send a spoofed `X-Real-IP` and confirm Railway's edge replaces it. The booking caps rely on
   that header (ADR-083; Railway publishes no formal contract).
4. Apply the six migrations through the gated `prisma migrate deploy` before the API is promoted.

## Owner rulings recorded this lane

Q1-Q12 (spec), Q13/Q14 (DSAR into PG-203), Q15 (event-type cap counts landed bookings), Q16-Q19 (DSAR design,
for PR 2) and Q20 (lead created after the reply). All are in `context/PG-203/PG-203-owner-ruling.md`.

## Issues and follow-ups filed

- **Bugs:**
  - #966 outbox never written;
  - #967 reminders never scheduled;
  - #972 playbook "AI defaults off" rule;
  - #973 ICS invites to fabricated addresses;
  - #977 merge-aware silencer guard, fixed here in `.husky/pre-commit` and cherry-pickable.
- **Comments on existing issues:**
  - #913 now includes the attendee race;
  - #889 now links #966.
- **Follow-up tasks:** PG-211 booker cancel/reschedule, PG-212 per-type notice/horizon, PG-213 booker PII purge.

## Working-tree note

The test and coverage runs rewrote these tracked, generated files:

- `artifacts/benchmarks/IFC-310-merge.json`
- `artifacts/coverage/{coverage-final.json,coverage-summary.json,lcov.info}`
- `artifacts/reports/{a11y-route-reconcile.json,plan-lint-report.json}`

They are **not** part of PR 1 and are left unstaged. The repo's destructive-git guard blocks discarding them from
this lane.
