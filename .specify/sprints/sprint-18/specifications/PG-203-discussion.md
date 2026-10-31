# PG-203 — Spec Session Discussion Log

Task: PG-203, Module Settings - Event Types (`/calendar/event-types`). Sprint 18, persona frontend-lead.
Session lead: the PG-203 lane ("AURORA PG-203", Claude Code, Opus 5.5), runner projects-8c.
Started 2026-10-20 ~22:13Z (lane launch; CSV moved to Specifying ~22:20Z). Consensus was reached 2026-10-20 ~23:05Z (UTC; 2026-10-21 00:05 owner local time).

Related files:
- Owner rulings Q1-Q12 and runner requirements R1-R7: `.specify/sprints/sprint-18/context/PG-203/PG-203-owner-ruling.md`.
- Exploration record: `.specify/sprints/sprint-18/context/PG-203/PG-203-spec-exploration.md`.
- Agent selection: `.specify/sprints/sprint-18/context/PG-203/PG-203-agent-selection.json`.

## How the rounds actually ran

The session did not run four separate fan-outs, one per round. This is what happened:

| Round | What ran |
|---|---|
| Phase 0 | `hydrateContext` from `tools/scripts/lib/stoa/context-hydration` via tsx (hash `4472bc47…`, 2 dependencies, 0 patterns). Dependency attestations PG-178 and PG-189 are both COMPLETE. |
| Phase 0.75 + Round 1 ANALYSIS | 6 `Explore` subagents ran in parallel. Each one read code with tools and returned file:line findings, concerns and interpretation. Tool calls: backend-architect 23, data-engineer 18, frontend-lead 28, security-lead 25, domain-expert 27, test-engineer 20. Their exploration output served as their Round 1 analysis. |
| Owner modals | Q1-Q3 before exploration, Q4-Q6 during it, Q7-Q8 after the security findings, Q9-Q12 after Round 3. |
| Round 2 PROPOSAL | The lead synthesised the draft spec from the agents' proposals. These were the data-engineer table design, security-lead's ranked requirements, test-engineer's test matrix, frontend-lead's registry list and domain-expert's rules. The agents did not author separate Round 2 texts. |
| Round 3 CHALLENGE | 6 named agents (`backend-architect`, `data-engineer`, `frontend-lead`, `security-lead`, `domain-expert`, `test-engineer`) each read the draft and the code in parallel. 26 blocking items were raised in total. |
| Round 4 CONSENSUS | The same 6 agents were resumed with their context. Round 4.1 gave 5 APPROVED and 1 REJECTED (backend). After the fixes, Round 4.2 gave backend APPROVED and security APPROVED, the latter with one wording fix that was then applied. Final result 6/6. |

## Round 3 CHALLENGE: tallies and resolutions

The full agent texts are in the lead session transcript. Every resolution is reflected in the spec.

**domain-expert: 6 blocking, 6 non-blocking.**
1. Lead creation must go through the domain, not raw Prisma. → `LeadService.createLeadInTransaction`, added in 4.2.
2. A contact match should link `contactId`. → Superseded by Q11: no auto-link, host flag.
3. Drop the AI toggle. → Q9: always score, no switch.
4. The booker is not an attendee; busy-time predicate. → Stated, ADR-083.
5. Status, buffers, reminder and title. → SCHEDULED, snapshot buffers, `defaultReminderMinutes`, title capped at 200.
6. Legacy-rule mismatch for unconfigured firms. → Q10: no booking until availability is saved.

Non-blocking items: constants, name split and phone fallback, duration drift, the cancel follow-up, the PRD addendum
and a domain event.

**backend-architect: 3 blocking, 6 non-blocking.**
- B1: the use case and repository cannot join the transaction. → Direct `tx.appointment.create` with an ADR-083
  exception, and a post-write `eventTypeId` update on `appointments.create`.
- B2: RLS SET does not reach the interactive transaction. → `set_config(...,true)` as the first statement, plus a
  real-DB test.
- B3: the cross-host cap race. → A per-tenant lock.
- B4-B9: `listOpenSlots` composes `generateCandidates`; the scoring enqueue and `onAppointmentCreated` are extracted;
  `isAvailabilityAdminRole` is reused with audit logging; #890 is an open issue, not code; the email port fields are
  `htmlBody`/`textBody`.

**security-lead: 6 blocking, 6 non-blocking.**
1. Tenant binding inside the transaction. → `set_config` local.
2. A P2002 inside the transaction aborts it. → Per-tenant serialisation; the residual staff race maps to CONFLICT.
3. Anonymous linking of existing leads. → Q11.
4. NOT_FOUND timing. → Single query; gates selected in the same query (4.2).
5. `listSlots` unbounded. → `fromDate` bounded, limiter.
6. Consent and retention. → Consent columns, Q12, DSAR, 48 h attempts prune, PII purge as a follow-up.

Non-blocking items: limiter ordering, DB caps (→ `booking_attempts`), `escapeHtml` (none exists), headers,
CORS/redirects, slot membership check, answers allowlist, no host name in the DTO, fake honeypot success.

**data-engineer: 4 blocking, 5 non-blocking.**
1. ADD VALUE used in the same transaction (55P04). → A separate migration.
2. The `leadId` FK is not tenant-safe. → CONCURRENTLY `leads(tenantId,id)` plus a composite FK with SET NULL column list.
3. Plain UNIQUE on the hot `tenants` table. → A CONCURRENTLY migration.
4. Host FK RESTRICT breaks tenant cascade. → NO ACTION plus a membership check.

Non-blocking items: `eventTypeId` SET NULL column list, NOT NULLs on the CHECK columns, RLS role, `ensureMigrationSql`
handling, the Class A statement.

**frontend-lead: 3 blocking, 6 non-blocking.**
1. Marketing chrome on the booking page. → Chrome-free list and a navigation hide.
2. Picker label collision and prefill semantics. → Lowercase "Event type" and explicit rules.
3. Slot timezone and accessibility. → Visitor timezone primary, radiogroups, states.
4. Registry accuracy. → 214→215 with exact files.

Non-blocking items: the forwardRef AC, a loading skeleton, the CTA slot, EmptyState props, `user.list` for the host,
Lighthouse and L11.

**test-engineer: 4 blocking, 4 non-blocking.**
- An AC→test table. → Added.
- A deterministic lock test. → `pg_locks` wait plus a lock-free control.
- L2 unit coverage of DB-only branches. → Listed.
- DST and time-bomb fixtures. → `now` injected, London and New York.

Non-blocking items: NOT_FOUND by shape and call sequence (not timing), mocking strategy, count tests, Lighthouse seeding.

## Round 4 CONSENSUS verdicts

| Agent | Verdict | Must-fix raised | Resolution |
|---|---|---|---|
| data-engineer | APPROVED (4.1) | none (plan notes: `ensureMigrationSql`, RLS test rows, DB role) | carried to the plan items |
| frontend-lead | APPROVED (4.1) | none (navigation hide list) | added to the spec |
| domain-expert | APPROVED (4.1) | none (booking-created lead lookup test) | added to the spec |
| test-engineer | APPROVED (4.1) | none (recording-prisma helper) | carried to the plan items |
| security-lead | APPROVED (4.1) → APPROVED (4.2) | 4.1: gate fields in the single query; retention. 4.2: prune ordering | all applied |
| backend-architect | REJECTED (4.1) → APPROVED (4.2) | the LeadCreated outbox is lost via `save` | `LeadService.createLeadInTransaction` |

**Result: 6/6 APPROVED, no unresolved blocking issue.** The spec is Spec Complete.

## Self-check (spec-consensus)

1. Each agent called Read/Grep. The tool-use counts above come from the task notifications.
2. Analysis cites file:line throughout.
3. Discrepancies are recorded in the exploration record:
   - the row owner/STOA;
   - "AI defaults FALSE";
   - IFC-310/311/312 scope;
   - the sidebar config file name;
   - the `Tenant.slug` UUID leak;
   - `LeadService` failing on an existing email;
   - no slot lister;
   - no `escapeHtml`.
4. Proposals build on the cited patterns: contact-types, availability, public-feedback and scheduled-reports locks.

## Addendum A (DSAR): review rounds R1-R4

*Added 2026-10-29 at the D12 close-out.* The rounds below ran on 2026-10-21 and 22 and were not written here at the
time; an adversarial review of PR #1056 found the gap. This section is rebuilt from the session transcripts, not
from memory. The full texts are preserved in the lane's local Claude Code transcripts, which are not in the
repository: the main session `f7d22516-a758-41d6-8916-a2c4accfdecc.jsonl` and its `subagents/` folder under
`~/.claude/projects/C--Users-talys-projects-intelliFlow-CRM-worktrees-pg-203/`. The spec's sign-off table
(`PG-203-spec.md`, "Addendum A sign-off") matches them exactly. Times are UTC; the spec dates are BST, so R2-R4
fall on 22 Oct local time.

### How the rounds ran

| Round | What ran |
|---|---|
| Owner rulings | Q13 "Fix DSAR in PG-203" (asked 21 Oct 00:17, answered 00:22). Q14 "Full end to end in PG-203" (00:25, answered 07:50). Q16/Q17 "Firm booking handle", "Export auto, erase on approval" (14:38, answered 16:46). |
| R1 | 3 fresh subagents (security-lead, compliance, backend-architect), launched 16:49:37-16:49:55, on spec lines 612-783 in the PR 1 worktree. All REJECTED (16:50:43-16:51:18). |
| Owner rulings | Q18/Q19 "Restriction flag now", "CRM core auto, comms checklist" (asked 16:51:35 straight after the R1 verdicts, answered 16:56). They scoped R2. |
| R2 | 3 fresh subagents ("re-review round 2"), launched 23:52:37-23:52:52, on the `pg-203-dsar` spec. All REJECTED (23:53:45-23:54:24). |
| R3 | Not new agents: SendMessage to the same three R2 agents (23:55:18-23:55:25), with the round 3 amendments. Backend APPROVED with conditions; security and compliance REJECTED. |
| R4 | SendMessage to security and compliance only (23:56:23-23:56:26). Both APPROVED (23:56:36, 23:56:45). Backend had already approved, so it had no R4. |

Transcript files (`subagents/`): security `agent-a05871def0d9572b4` (R1), `agent-afcaf17df25bb9c6f` (R2-R4);
compliance `agent-ae239493cec5f8bb5` (R1), `agent-a92a5c17bd8ac6251` (R2-R4); backend-architect
`agent-a43d679a9952ec547` (R1), `agent-ab930e2a688a986ba` (R2-R3).

### Verdicts

| Reviewer | R1 | R2 | R3 | R4 |
|---|---|---|---|---|
| security-lead | REJECTED | REJECTED | REJECTED | **APPROVED** (2 conditions) |
| compliance | REJECTED | REJECTED | REJECTED | **APPROVED** (2 non-blocking notes) |
| backend-architect | REJECTED | REJECTED | **APPROVED** (plan conditions) | n/a |

### Must-fix items by round (summarised from the transcripts)

**security-lead**
- R1: tokens in the URL query string (move to the fragment, no-referrer and no-store, POST download); email bombing
  through `submit` (a global per-email cap counted before any send); admin authz (`adminTenantProcedure`, ADMIN
  only, tested against MANAGER and another tenant's ADMIN); enumeration and timing in verify and download
  (constant reads, dummy hash, `timingSafeEqual`, a DSAR-specific secret).
- R2: the global cap could be bypassed with `+tags` and might be blind under RLS (a separate `capEmailHash`, counted
  on the unscoped client, lock order); no per-IP limiter on the four public procedures; `/dsar/` missing from the
  chrome-free shell and the header config; the fragment could reach scripts before it is stripped (read once,
  strip, scrub `#r=` in Sentry).
- R3: a RESTRICTION must apply at verification, and a rejection must lift it and tell the person (Art 18(3));
  late rejection must be possible and flagged; "nothing withheld" restated as "all withheld counts are zero";
  `mergeRouters` for the public procedures; a mandatory marketing-stop tick on objections.
- R4 conditions: one active restriction row per `(tenantId, subjectEmail)` with upsert merge; the export summary
  rendered as React text nodes only, never stored in the browser.

**compliance**
- R1: the clock is a calendar month (`addCalendarMonths`), with extension fields; the acknowledgement states the
  deadline; Art 15 needs processing information and the AI data; restriction and objection need system state that
  stops AI and marketing; a statement on backups.
- R2: an ACCESS request stays open until the firm has reviewed it, and the export lists what is withheld; free
  text (activity titles, ticket subjects, feedback) withheld; minimum Art 21(3) (objection scope, gate the marketing
  paths or require a stated manual stop); an editable `receivedOn` for logged requests.
- R3: a tick alone could make a false "marketing has stopped" statement, so a stated stop method is required and
  `blocksMarketing` is stored on the restriction; the cancel path needs an audit entry and an email; worker re-checks
  are mandatory; the checklist counts every relation.
- R4 notes: flag late rejections as clock breaches; link the marketing follow-up task to `blocksMarketing`.

**backend-architect**
- R1: embeddings and search vectors survive anonymisation; other PII holders (tickets, emails, chats, feedback,
  notifications, drafts) missing from export and erasure; more PII columns on the listed tables; a unique,
  tenant-safe anonymised email; hexagonal placement (application service, port, container wiring).
- R2: `ContactActivity.description` is NOT NULL; the restriction check belongs in `LeadService.scoreLead`; the
  contact embedding check belongs in `ContactEmbedWorker.processForTenant`; the draft check belongs in
  `autoresponse.router.ts`; how the public and admin routers merge into one `privacy` namespace.
- R3 conditions: the second `AutoResponseDraft.create` site; a mandatory worker-side re-check in
  `processScoringJob`, covering `handleScheduledDispatch`; queued jobs re-read the lead and skip it when erased.

The 8 conditions in the spec sign-off map to these: 1-4 from security R4, 5-6 from compliance R4, 7-8 from backend
R3. The plan-reviewer for Plan Addendum A started at 23:58:31 (see the plan's "Plan-Reviewer Sign-off: Addendum A").
