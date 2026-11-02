# PG-208 owner ruling

**Date:** 2026-10-20 (AskUserQuestion modal, asked by the PG-208 lane during /spec-session Phase 0)

## Question

Nothing in the repo executes stored automation rules today (`WorkflowDefinition` rows are only
recorded; no executor reads them). How much of the Task Automation rule runtime ships in PG-208?

- A. Rule builder + backend + live engine for entity-event triggers only; schedule and webhook
  triggers in a registered follow-up task.
- B. All three triggers in this PR: entity events (outbox handler in events-worker), schedule
  (events-worker scheduled job) and webhook (new signed inbound endpoint, per-rule secret).
- C. Config only; the whole runtime becomes a follow-up task.

## Answer

**B. All three triggers.**

## Consequences for the spec

- Entity-event, schedule and webhook triggers must all execute in this PR, with the three actions
  (create task, assign by round-robin, notify).
- The webhook trigger adds a public inbound endpoint: it needs per-rule secrets (stored hashed or
  encrypted, never logged), signature verification, replay protection, rate limiting and a
  security-lead review in the spec.
- No trigger type may be saved in the UI without a runtime that acts on it.

---

# Rulings 2-5 (2026-10-20, second AskUserQuestion modal, after /spec-exploration)

Exploration found that the API publishes domain events on an in-memory bus only (`apps/api/src/container.ts:376`),
nothing but `subscription-sync.ts:102` writes the outbox, and the events-worker is not deployed
(`.github/workflows/deploy-workers.yml:8-14`). So ruling 1's "outbox handler in events-worker" wording needed a
delivery decision.

| # | Question | Answer |
|---|---|---|
| 2 | How are event triggers delivered? | **A. Inside the API**: subscribe to the API's in-process bus, write a durable run row, and a locked runner in the API process executes it (approval-sweep pattern, `approval-sweep-scheduler.ts`). No outbox switch, no worker deploy. |
| 3 | Owner of an automation task; empty round-robin pool | **A. Record owner**: owner = trigger record's owner; schedule/webhook (no record) = rule creator. Empty pool: assign to that owner and log why. |
| 4 | May rules trigger on task events? | **A. Exclude in v1**: triggers are lead/contact/deal/account events only. |
| 5 | deal won/lost and lead converted (TaskService refuses those links) | **A. Link related record**: lead.converted links the new contact; deal won/lost creates the task unlinked with the deal named in the description. |

Ruling 1 (all three trigger types execute in this PR) stands: entity events in-process, schedule via an
API-side locked interval, webhook via a signed raw HTTP route on the API server.

---

# Rulings 6-7 (2026-10-20, third modal, after Round 3 CHALLENGE)

| # | Question | Answer |
|---|---|---|
| 6 | Round-robin sets `assigneeId`, but non-admins only see tasks they own (`task.router.ts:150-185, 279-286`; `tenant-context.ts:371-375`). Should assignees see tasks assigned to them? | **A. Owner or assignee**: task list and task detail show tasks the user owns OR is assigned to. |
| 7 | A lead conversion raises `lead.converted`, `contact.created` and `account.created` together (`LeadService.convertLead`). | Owner first asked "Can we consolidate it? Or keep only lead.convert as you recommended?"; asked again with both options spelled out, answered **A. lead.converted only**: contact/account records created by a conversion never fire `contact.created` / `account.created` rules; the run is recorded as skipped "covered by lead conversion". |

---

# Ruling 8 (2026-10-21, exec Step 23, Codex review finding `non-atomic-run-cap`)

| # | Question | Answer |
|---|---|---|
| 8 | Concurrent signed webhook calls could briefly exceed a rule's hourly or per-minute run cap (counts read, then the run inserted separately). Spec M8 / ADR-084 already accept cross-replica cap overshoot. Waive on that basis, or fix now? | **Fix now** (owner's answer). Implemented as one admission for every run path: the webhook route, the engine (events and schedule slots) and Test Rule all check the idempotency key, count the caps and insert under the same per-tenant `pg_advisory_xact_lock` transaction (`TaskAutomationStore.admitRun`; `runNow` uses the same lock key in its own transaction), with a real-DB race test. This supersedes spec M8's accepted cross-replica overshoot. |

---

# Ruling 9 (2026-10-21, exec Step 23, Codex review convergence)

| # | Question | Answer |
|---|---|---|
| 9 | After 10 Codex rounds (about 25 fixes) it still raised 2-3 new medium edge cases per round. Round 10: (1) pending runs executed a rule's newly edited actions; (2) a schedule slot due while automation was off could run after re-enable; (3) runs failing by an exception skipped the rule-owner failure notice. How to converge? | **Fix all 3, then stop** (owner's answer in this lane's modal; relayed identically by runner projects-8c from its modal, ~14:25 UTC). Each fix gets a RED-first test (`red-green/23-ruling9.red.txt` then `.green.txt`): runs carry an `actions` snapshot (additive column in the PG-208 migration) and execute it; slots that fell due before `automationEnabledAt` are consumed without a run; returned and thrown failures both send the failure notice. Then ONE confirming Codex round; any further findings become tracked issues, not fixes. |

---

# Ruling 10 (2026-10-21, exec Step 26, Security STOA dependency audit)

| # | Question | Answer |
|---|---|---|
| 10 | The Security STOA passes every code check but FAILs on `pnpm audit --prod --audit-level high`: 3 HIGH advisories (follow-redirects GHSA-q3jh-wrc6-jgq8 and GHSA-8r9p-f939-6h3c via `@scalar/api-reference-react`; vite GHSA-587h-7wmj-h5pm via `@sentry/node`), identical on `origin/main`. PG-208 changes no `package.json` or lockfile, and pre-ship and CI treat the audit as advisory. Filed as #974. Record as inherited, fix the dependencies in PG-208, or mark the task Failed? | The first modal answer was "Fix deps in PG-208". Runner projects-8c then relayed its call, "Inherited, tracked", because PG-207 and PG-203 hit the same three advisories. The lane put the conflict back to the owner with both options spelled out, and the answer was **Runner: separate PR**. No overrides in PG-208. The Security STOA's FAIL stays verbatim in `matop/stoa-verdicts/security.json`. The MATOP verdict and the attestation are NEEDS_HUMAN, citing #974 alongside Lighthouse, screenshots and Sonar. The CSV stays In Progress. The runner fixes #974 once on main. |

**Ruling 10 follow-up (2026-10-22).** The runner fixed #974 on main in #975 (`e7ce625b2`, follow-redirects 1.16.1 and vite 7.3.7; #974 closed). PG-208 merged `origin/main` in `5f11ac307`. `pnpm audit --prod --audit-level high` on the merged branch exits 0 (0 high, 2 moderate): `execution/PG-208/20261020231931-3d9aa8b9/matop/gates/final-10-audit-after-merge.txt`. The Security STOA was re-run after the merge, and its new verdict replaces the FAIL that was based on the audit.
