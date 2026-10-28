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
