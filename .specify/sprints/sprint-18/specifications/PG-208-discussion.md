# PG-208 spec session — discussion log

Session: 2026-10-20/21, lane session `100745b3`, worktree `pg-208`, base origin/main `3d285c261`.

## Phases run

| Phase | What happened | Evidence |
|---|---|---|
| 0 Hydration | `hydrateContext('PG-208')` (tools/scripts/lib/stoa/context-hydration.ts) | `context/PG-208/hydrated-context.{json,md}` |
| Owner ruling 1 | modal before exploration: scope of the runtime | `context/PG-208/PG-208-owner-ruling.md` (ruling 1 = B, all three triggers) |
| 0.5 Agent selection | Backend-Architect, Security-Lead, Frontend-Lead, Domain-Expert, Test-Engineer | `context/PG-208/PG-208-agent-selection.json` |
| 0.75 Exploration | `/spec-exploration`: 5 `Explore` subagents in parallel (46/60/39/64/68 tool uses) | `context/PG-208/PG-208-spec-exploration.md` |
| Owner rulings 2-5 | modal after exploration (event path, owner, task events, closed links) | owner-ruling file |
| 0.76 / 0.77 | shared-component and route-conflict audits (Frontend-Lead exploration) | spec "Shared component reuse", exploration E10 |
| 0.9 / 0.92 / 0.95 | chain section planned; route reachable (sidebar + panel); PG-178 / PG-191 verified | spec "Dependencies Verified", "Navigation" |
| 0.97 | PRD addendum (extend `prd-module-settings.md`), ADR-084 created | `docs/architecture/adr/ADR-084-task-automation-engine.md` |
| Round 1 ANALYSIS | the five exploration reports are the analysis round (each line-cited, with "Implications for PG-208") | exploration file |
| Round 2 PROPOSAL | lead synthesis of the five analyses into spec draft v1 | spec v1 (superseded) |
| Round 3 CHALLENGE | 5 persona agents (`backend-architect`, `security-lead`, `frontend-lead`, `domain-expert`, `test-engineer`) challenged v1 against the code; all **APPROVE WITH CHANGES** | below |
| Owner rulings 6-7 | modal after Round 3 (assignee visibility; conversion cascade, asked twice) | owner-ruling file |
| Spec v2 | every finding resolved below | `PG-208-spec.md` |
| Round 4 CONSENSUS | `/spec-consensus PG-208` | appended below |

## Round 3 findings and resolutions

Severity as reported. "Spec" = where v2 resolves it.

### Backend-Architect (R3-B)

| # | Sev | Finding (evidence) | Resolution |
|---|---|---|---|
| B1 | BLOCKER | `dueInDays: 0` always fails `TaskService.ts:144-147` | `computeAutomationDueDate` end of UTC day, floor now + 15 min (Domain) |
| B2 | BLOCKER | 11 `Task.reconstitute` sites omit `assigneeId`; fixing only save/findById nulls assignees on `bulkComplete` | one `toDomain` mapper for all 11 sites + reader tests |
| B3 | MAJOR (owner) | assignees cannot see their task (`task.router.ts:150-185, 279-286`) | owner ruling 6 → list/getById owner OR assignee |
| B4 | MAJOR | duplicate-by-action-type blocks legit rules | `ruleKey` = trigger key + normalised actions; partial unique index |
| B5 | MAJOR | stuck RUNNING runs | `reapStaleRuns` → FAILED `interrupted` |
| B6 | MAJOR | body consumed at `http-server.ts:495` before routing | route matched before the global read; `readRequestBody(req, maxBytes)` |
| B7 | MAJOR | rolled-back qualify/convert still drain | postconditions per event |
| B8 | MAJOR | refused link targets fail the run | link fallback to unlinked + outcome; `toStage` never CLOSED_* |
| B9 | MAJOR | bare-read RLS assumption unstated | stated in spec + ADR-084 with ADR-078 check; dropped reads logged/counted |
| B10 | MAJOR | per-IP backstop on shared edge IP | failure-only limiter; valid signed calls never gated by IP |
| B11 | MINOR | lifecycle: SIGTERM stop; intake only when runner enabled | `main.ts` stop; intake in `startApiServer` when interval > 0; no container change |
| B12 | MINOR | raw SQL avoidable | store uses model API (`updateMany` CAS, `create` + P2002), no raw SQL |
| B13 | MINOR | encryption: create returns ciphertext; map is explicit | plaintext from memory; `ENCRYPTED_FIELDS` + tests |
| B14 | MINOR | assign at create; `findById` has no tenant | `assigneeId` at create; `assignTask` compares tenant |
| B15 | MINOR | token in URL path vs Sentry | Sentry scrub |
| B16 | MINOR | bulk paths publish nothing; conversion amplification | AC-TA-004 reworded, issue filed; ruling 7 |
| B17 | MINOR | owner liveness, lead display name, createdBy ON DELETE, notify_failed, runNow scope | all in v2 |
| Q1 | TRUE | all v1 events on the one container bus (`container.ts:376, 545-581, 643-665`) | event table uses `toPayload()` ids |

### Security-Lead (R3-S)

| # | Sev | Finding | Resolution |
|---|---|---|---|
| S1 | BLOCKER | Idempotency-Key not signed → replay with a new key | sign `${t}.${key}.${rawBody}`; store body hash; 409 on key reuse with a different body |
| S2 | BLOCKER | 64 KB cap not implementable; pre-auth work unthrottled | 9-step pipeline: method → IP failure limiter → Content-Length → bounded read → token format → lookup → … |
| S3 | MAJOR | AC said one response for all failures | AC-TA-006: identical 404 class and identical 401 class |
| S4 | MAJOR | `stripeVerify` NaN `t` | strict header regex, one `t`/`v1`, hex length check |
| S5 | SAFE | hash lookup timing | kept; format pre-check first |
| S6 | MINOR | URL in proxy logs; Host header | `API_PUBLIC_URL`; noted in ADR |
| S7 | MAJOR | rate limiting | failure-only IP limiter (Redis when configured), per-rule cap |
| S8 | MINOR | CORS | no CORS on the path |
| S9 | MINOR | logging | handler logs `{ruleId, tenantId, code}` only; spy test |
| S10 | MINOR | prototype keys; 4 KB vs 20×500 | `Map` variables, own keys; store only referenced keys |
| S11 | MINOR | grace cannot cut off | `revokePrevious` |
| S12 | MAJOR | create/update return ciphertext | plaintext from memory; select allow-lists |
| S13 | MAJOR | encryption bypass paths | model-API-only writes/reads; extension tests |
| S14 | MAJOR | plaintext fallback / missing key | 503 when not encrypted outside test; key-change runbook in ADR |
| S15 | MAJOR | cited admin gate writes no audit | `logPermissionDenied` pattern (`account-reassign.ts:161-165`) |
| S16 | MAJOR | role set too broad for webhook secrets | `TASK_AUTOMATION_WEBHOOK_ADMIN_ROLES` (no MANAGER) |
| S17 | MAJOR | sensitive mutations; runNow on inactive | strict limiter 10/min; runNow refused when inactive/disabled |
| S18 | MAJOR | listRuns exposes webhook vars to all | `listRuns` admin-only; strict output schemas |
| S19 | MINOR | racy cap | count under a tenant settings-row lock in `$transaction` |
| S20 | MAJOR | link id from payload | link target loaded with `{id, tenantId}` |
| S21 | MAJOR | owner/creator liveness | fallback chain with `tenantUserWhere` |
| S22 | SAFE | cross-tenant via events | kept; cross-tenant engine tests |
| S23 | SAFE+ | XSS paths | task UI renders text; actionUrl server-built; agent-access note in ADR |
| S24 | MAJOR | caps after insert | caps at insert; `suppressedCount`; drain ≤ 500 |
| S25 | MAJOR | global buffer cross-tenant hazard | watched-type buffering; drop metric |
| S26 | MINOR | stuck RUNNING; bad cron aborts tick; lock key | reaper; per-rule try/catch + deactivate; no advisory lock needed (no raw SQL) |
| S27 | MINOR | secret-scan strings | runtime-built strings, placeholders in docs |
| S28 | MAJOR | missing security tests | all listed in Test Requirements |
| S29 | MINOR | key reuse after purge | documented in ADR |
| S30 | — | extra pre-existing issues | added to the file-issues list |

### Frontend-Lead (R3-F)

| # | Sev | Finding | Resolution |
|---|---|---|---|
| F1 | MAJOR | cadence "fieldset" is private `CadenceFields` coupled to ids | pure extraction with `idPrefix`, `cronHint`; PG-201 tests unmodified |
| F2 | MAJOR | MemberMultiSelect legend; rotation order ambiguity | `legend` prop, test moved; pool order = rotation order |
| F3 | MAJOR | VariablePicker must be extended | EXTENDS with optional a11y props + test |
| F4 | MAJOR | overflow menu has no precedent; delete focus | inline ghost buttons (PG-201 row); focus to heading after delete |
| F5 | MAJOR | reorder has no UI | Move Up / Move Down + live announcement |
| F6 | MAJOR | settings clobbered by list invalidation | seeded from `data.settings` only, never while dirty; local fieldset |
| F7 | MAJOR | secret in mutation cache | component state only, `gcTime: 0`, `reset()`, no toast; CopyField fallback |
| F8 | MINOR | registry lines, contradictory copy, settings-search 13→14 | registries list corrected |
| F9 | MINOR | no DESIGN prefix | stated in row reconciliation |
| F10 | MINOR | Lighthouse recipe | AC-TA-019 names it |
| F11 | MINOR | 5th TagsTab copy | copy + duplication check + follow-up issue |
| F12 | MINOR | tags placement | right column under Settings |
| F13 | MINOR | Test Rule underspecified | `aria-disabled` + description; result via toast + Runs |
| F14 | MINOR | `(list)/loading.tsx` flashes task skeleton | `automation/loading.tsx` |
| F15 | MINOR | axe on portals; label-in-name | axe on `document.body`; issue filed |

### Domain-Expert (R3-D)

| # | Sev | Finding | Resolution |
|---|---|---|---|
| D1 | MAJOR | (trigger, action) guard is the cross-rule check; TOCTOU | `ruleKey` partial unique index |
| D2/D3 | MINOR | AI N/A; tag rename | N/A in PRD + ADR; rename rewrites rules |
| D3b | BLOCKER | conversion fires three events | owner ruling 7 |
| D4 | BLOCKER | `changeStage` closes deals without won/lost | stage_changed CLOSED_* → won/lost; `toStage` open stages only; issue filed |
| D5/D6 | MAJOR | converted with null contact; link failures | link fallback to unlinked |
| D7 | MINOR | pass tenantId to createTask | done |
| D8-D10 | MAJOR/MINOR | owner liveness; pool emptiness after filtering; createdBy FK | fallback chain; dropped count; ON DELETE SET NULL |
| D11 | MAJOR | round-robin order and cursor | pool order; increment even on later failure |
| D12 | BLOCKER | dueInDays 0 | = B1 |
| D13-D15 | MAJOR | notification type, recipients, preferences | new `task_automation` type; fixed action order; `filtered` = success; `notify_failed` |
| D16 | MAJOR | too few tokens; display names | tokens extended; display-name rules |
| D17 | MAJOR | system-owned inbound leads | owner fallback skips non-live owners; caps visible |
| D18-D20 | MINOR | buffer drops visible; rules apply after save; show owner rule on the row | all in v2 |
| US | — | US-TA1..5 | PRD addendum |

### Test-Engineer (R3-T)

| # | Sev | Finding | Resolution |
|---|---|---|---|
| T1 | BLOCKER | SQL correctness untested | `task-automation-store.ts` seam; fake-store engine tests; real-DB concurrency integration cases |
| T2 | MAJOR | db push caveat incomplete | rebuild all four tables; extra CHECK/unique assertions; injected clock |
| T3 | MAJOR | AC gaps | every AC mapped (Test Requirements) |
| T4 | MAJOR | diff-coverage + wiring tests; body-cap sequencing | wiring tests (runner start, SIGTERM, intake); store prismaMock tests |
| T5 | MAJOR | encryption silently skipped without key | extension tests; integration `v1:` assertion; 503 guard |
| T6 | MAJOR | count tests | settings-search 13→14, notifications 55→56, ui-flow header + total, IA, smoke |
| T7 | MAJOR | move, not copy, MemberMultiSelect test | moved |
| T8 | MAJOR | pinned clocks | clock rule in Test Requirements |
| T9 | MINOR | gitleaks strings | secret rule in Test Requirements |
| T10 | MINOR | over-scope | schema-AI test dropped |
| T11/T12 | MINOR | runner isolation; no vacuous mocks | in Test Requirements |

## Round 4 CONSENSUS

`/spec-consensus PG-208`, 2026-10-21: the five Round 3 agents were resumed with their context (SendMessage) and asked
to verify their own findings against spec v2 and the code.

| Agent | Verdict | Non-blocking modifications |
|---|---|---|
| Frontend-Lead | APPROVED | Test Rule scope; Move Up/Down focus + announcement; settings-survive-toggle test; run PG-201 suites after the extraction |
| Backend-Architect | APPROVED | ruling-6 `AND/OR` query shape; `lead.qualified` status set; 413 then destroy; enum entry; conversion correlation across ticks; watched-set delay; assignee edit gap |
| Domain-Expert | APPROVED | due-date timezone; system-owned inbound leads; prominent `no_eligible_owner`; manual contact with `leadId`; correlation set lost on restart |
| Security-Lead | APPROVED | Sentry scrub scope; limiter counting + key; prime watched set; cap count per tick; `API_PUBLIC_URL` required; 503-guard integration case |
| Test-Engineer | APPROVED | export encryption helpers from `@intelliflow/db`; Sentry scrub tests; valid requests never IP-limited |

Result: **5/5 APPROVED (100%)**, consensus in round 1. Modifications folded into the spec as M1-M13.
