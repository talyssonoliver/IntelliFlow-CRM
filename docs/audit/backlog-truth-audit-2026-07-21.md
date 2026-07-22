# Backlog-Truth Audit — Sprint 18

**Date:** 2026-07-21  
**Scope:** Every `Sprint_plan.csv` row with `Target Sprint = 18` AND status
`Backlog` or empty.  
**Method:** For each Task ID — `gh pr list --search "<id> in:title,body"`
(merged + open) and `git log --all --grep <id>`. A merged/open PR whose
**title** contains the Task ID counts as real work; body-only mentions and bulk
task-registration commits are treated as noise and downgraded.  
**Read-only:** no CSV writes performed.

## Category counts

| Category  | Meaning                                      | Count  |
| --------- | -------------------------------------------- | ------ |
| A         | Already shipped, CSV stale                   | 7      |
| B         | In progress, PR open                         | 0      |
| C         | Genuinely unstarted (no PR)                  | 2      |
| D         | Ambiguous (commits/partial, no dedicated PR) | 2      |
| **Total** | Sprint-18 backlog rows audited               | **11** |

## CATEGORY A — Already shipped, CSV stale (merged PR mentions Task ID)

### IFC-212 — AI/ML

- **Description:** Wire API container to QueueAIService for BullMQ-backed lead
  scoring
- **Merged PRs (title hit):** #59
- **All merged search matches:** #481 chore(metrics): attest + mark IFC-214
  Completed (Redis AI-monitoring bridge) · #543 test(IFC-214): run AI monitoring
  cross-process bridge verification in CI integration lane · #59 feat(IFC-212):
  Redis monitoring snapshot bridge for AI metrics [rebased] · #93 fix(test):
  exclude \*.crossprocess.test.ts from Unit Tests — fixes main CI · #82
  fix(audit): exempt dependabot[bot] from commitlint + waive PR #59 commits
- **Commit trail:**
  `ef4365537 test(IFC-214): run AI monitoring cross-process bridge verification in CI integration lane`
  ·
  `1d90766e6 feat(IFC-212): Redis monitoring snapshot bridge for AI metrics (#59)`
  ·
  `ef7a9f0c5 fix(IFC-212): wire QueueAIService as default provider; thread tenantId+leadId`
- **Audit note:** Shipped via #59 "feat(IFC-212): Redis monitoring snapshot
  bridge" (title hit) + follow-up commit ef7a9f0c5 wiring QueueAIService as
  default. CSV row stale.

### IFC-271 — Core CRM

- **Description:** Account Domain Model Fixes. (1) No AccountDeletedEvent —
  deletions produce no domain event; audit handler has mapping but event never
  emitted (D-01). (2) Account.toJSON() omits tenantId (B-15). (3)
  updateAccountInfo return value (Result) discarded by service — silent
  validation failures (B-16). (4) user!.userId non-null assertion in router
  (B-06). Audit: docs/audit/account-detail-wiring-audit.md sections 11-13.
- **Merged PRs (title hit):** #381
- **All merged search matches:** #409 fix(account): account update fields +
  revenue/employees/industry procedures (IFC-270) · #381 fix(IFC-271): account
  domain model fixes (D-01, B-15, B-16, B-06)
- **Commit trail:**
  `045a87a41 fix(IFC-271): account domain model fixes for the accounts aggregate`
- **Audit note:** Shipped via #381 "fix(IFC-271): account domain model fixes
  (D-01, B-15, B-16, B-06)" — exactly the row DoD. CSV row stale.

### INFRA-TF-002 — Infrastructure

- **Description:** Provision the three apps/workers (events-worker,
  ingestion-worker, notifications-worker) as first-class Railway services in
  Terraform. Closes GH #230/#259/#270 (workers built/tested but never deployed).
- **Merged PRs (title hit):** #289
- **All merged search matches:** #289 feat(infra):
  events/ingestion/notifications workers + strictly-free cost guards
  (INFRA-TF-002) · #298 ci(infra): add gated railway-deploy workflow for the 3
  workers · #291 ci(infra): build + push the 3 worker images (INFRA-TF-005) ·
  #309 ci(process): add PR-body task-id gate + correct ADR-035 OCR claim (D4)
- **Commit trail:**
  `5289aa9a4 feat(infra): events/ingestion/notifications workers + strictly-free cost guards (INFRA-TF-002) (#289)`
- **Audit note:** Shipped via #289 "feat(infra): events/ingestion/notifications
  workers ... (INFRA-TF-002)". CSV row stale.

### INFRA-TF-003 — Infrastructure

- **Description:** Replace the Supabase null_resource + curl scaffolding with
  the official supabase/supabase Terraform provider so Supabase
  auth/storage/extensions config is genuinely drift-detected.
- **Merged PRs (title hit):** #299
- **All merged search matches:** #299 feat(infra): migrate supabase module to
  official supabase/supabase provider (INFRA-TF-003) · #296 docs(infra):
  terraform import runbook + import-blocks template (INFRA-TF-005) · #308
  fix(infra): supabase prod-import safety — region + ignore_changes + jwt_secret
  404 · #300 fix(infra): supabase DATABASE_URL -> transaction pooler +
  DIRECT_URL for migrations
- **Commit trail:**
  `15bcc0fc8 feat(infra): migrate supabase module to official supabase/supabase provider (INFRA-TF-003) (#299)`
- **Audit note:** Shipped via #299 "feat(infra): migrate supabase module to
  official provider (INFRA-TF-003)". CSV row stale.

### INFRA-TF-004 — Infrastructure

- **Description:** Environment tfvars (dev/staging/prod) + remote state
  backend + a monitoring Terraform module (Grafana/Prometheus/Loki/Tempo as
  observability-as-code) + wire ai-worker OpenTelemetry (IFC-032).
- **Merged PRs (title hit):** #286
- **All merged search matches:** #286 feat(infra): terraform SSOT — HCP backend,
  schema fix, tfvars + monitoring (INFRA-TF-004)
- **Commit trail:**
  `906430d0a feat(infra): terraform SSOT — HCP backend, schema fix, tfvars + monitoring (INFRA-TF-004) (#286)`
- **Audit note:** Shipped via #286 "feat(infra): terraform SSOT — HCP backend,
  schema fix, tfvars + monitoring (INFRA-TF-004)". CSV row stale.

### INFRA-TF-005 — Infrastructure

- **Description:** CI + import + runbooks: add the three workers to
  build-images.yml and railway-deploy.yml; terraform import existing live
  Vercel/Railway/Supabase infra into state; update railway-deploy / workers /
  observability runbooks.
- **Merged PRs (title hit):** #296, #291
- **All merged search matches:** #296 docs(infra): terraform import runbook +
  import-blocks template (INFRA-TF-005) · #291 ci(infra): build + push the 3
  worker images (INFRA-TF-005) · #284 docs(infra): add ADR-064 terraform SSOT,
  INFRA-TF tasks + iac plan · #298 ci(infra): add gated railway-deploy workflow
  for the 3 workers · #297 ci(infra): retry build-images buildx on transient
  Docker Hub timeouts
- **Commit trail:**
  `f7df61d0a docs(infra): terraform import runbook + import-blocks template (INFRA-TF-005) (#296)`
  ·
  `382b63a65 ci(infra): build + push the 3 worker images (INFRA-TF-005) (#291)`
- **Audit note:** Shipped via #296 (import runbook) + #291 (build 3 worker
  images) — both title hits. CSV row stale.

### IFC-314 — Integration

- **Description:** CRM-to-portal delivery & billing sync (Leangency 14-day
  flow). On deal-won, provision the portal tenant + push initial delivery state,
  then mirror billing as it changes. Adds SetupInstalment model + DeliveryTier
  enum + tenantSlug on Opportunity; Stripe invoice create/finalize for the 3x
  GBP167 Setup fee (D0/7/14); StripeSubscription persistence on
  customer.subscription.\* webhooks; a PortalDeliverySync service that POSTs
  /api/internal/tenants then /api/internal/delivery via the domain_events
  outbox; extends CloseDealWonUseCase; registers a deal_won_enriched handler in
  events-worker; adds a daily portal-delivery-sweep BullMQ job in ai-worker; and
  verifies the Stripe webhook signature (handleSubscriptionWebhook moved off
  tRPC).
- **Merged PRs (title hit):** #333, #215, #367
- **All merged search matches:** #575 feat(PG-191): task settings module page +
  tRPC router · #333 feat(IFC-314): CRM→portal delivery & billing sync · #515
  chore(IFC-032): attest OTel observability + refresh sprint-18 orchestrator
  state · #215 feat(db): add N+1 query-budget detector and remediate 56 findings
  (IFC-314) · #367 feat(IFC-314): setup-fee invoicing — bill instalments at
  deal-won + invoice.paid sync
- **Commit trail:**
  `17105de2d fix(ifc-214): stabilize T-I3 ttl-expiry test under coverage instrumentation`
  ·
  `1e891d2b0 chore(plan-linter): waive AUTOMATION-003 tier-a pre-existing landmine (unblocks PG-191)`
  ·
  `e30d98714 feat(IFC-314): setup-fee invoicing — bill instalments at deal-won + invoice.paid sync (#367)`
  · `0a0398740 feat(IFC-314): wire CRM->portal delivery and billing sync (#333)`
  ·
  `e78e162a2 feat(db): add N+1 query-budget detector and remediate 56 findings (IFC-314) (#215)`
- **Audit note:** Shipped across #333 (CRM→portal delivery & billing sync), #367
  (setup-fee invoicing), #215 (N+1 detector portion). Multiple title hits. CSV
  row stale.

## CATEGORY B — In progress, PR open

_None._

## CATEGORY C — Genuinely unstarted (no PR at all)

### DOC-016 — Documentation

- **Description:** Docs Integrity CI Gate - Automated cross-document route-total
  drift detection and PR enforcement
- **All merged search matches:** #543 test(IFC-214): run AI monitoring
  cross-process bridge verification in CI integration lane
- **Audit note:** Sole "merged PR" match (#543) is a body mention from an
  IFC-214 test PR, not an implementation. No title hit, no commits.
  Docs-integrity CI gate is unbuilt.

### IFC-211 — Core CRM

- **Description:** Goal Settings RBAC - Role-based permissions for daily goal
  management (manager team goals and admin org defaults)
- **All merged search matches:** #534 feat(IFC-302): render help article page
  from the database · #528 feat(PG-181): help article editor page — Tiptap
  editor, draft/publish, getById · #41 chore(db): add tenant goal default +
  workflowId to routing audit migrations · #46 fix(ci): build deps before
  typecheck, unblock project-tracker route, add validator schemas, sync metrics
  · #44 docs: update architecture ADRs, design docs, planning PRD, state reports
- **Commit trail:**
  `c060bd40e chore(project-tracker): update components, API routes, lib, metrics (sprint-0 through sprint-29); add new task files sprint-14 through sprint-24 (IFC-211-287, DOC-015/016, PG-160)`
- **Audit note:** All "merged PR" matches are unrelated/body mentions (#534
  IFC-302, #528 PG-181, old #41/#44/#46). Only commit is task-registration
  c060bd40e. Goal Settings RBAC not implemented. (#41 added a tenant goal
  DEFAULT migration — adjacent, not the RBAC task.)

## CATEGORY D — Ambiguous (commits but no PR, or partial/bundled evidence)

### DOC-015 — Documentation

- **Description:** Docs Integrity Reconciliation - Regenerate and sync
  conflicting design-document route totals from filesystem source of truth
- **Commit trail:**
  `c060bd40e chore(project-tracker): update components, API routes, lib, metrics (sprint-0 through sprint-29); add new task files sprint-14 through sprint-24 (IFC-211-287, DOC-015/016, PG-160)`
- **Audit note:** Only evidence is bulk task-registration commit c060bd40e
  (created the task file; not implementation). No PR. A DOC-015 rescue session
  is active as of 2026-07-21 but has not opened a PR yet — in progress,
  unmerged.

### INFRA-TF-001 — Infrastructure

- **Description:** Fix Terraform provider-schema drift (Railway + Vercel
  modules) so `terraform validate` is green. Migrate
  railway_deployment->railway_service source_image, default_environment object,
  and Vercel env->vercel_project_environment_variable / vercel_webhook /
  edge-config to the current provider schemas.
- **All merged search matches:** #284 docs(infra): add ADR-064 terraform SSOT,
  INFRA-TF tasks + iac plan · #309 ci(process): add PR-body task-id gate +
  correct ADR-035 OCR claim (D4)
- **Audit note:** No dedicated implementing PR / title hit. #284 is only the
  task-DEFINITION doc (ADR-064). The provider-schema fix appears folded into
  #286 (INFRA-TF-004, whose title says "schema fix") and the module migrations
  in #289/#299. Likely done-but-bundled — needs owner confirmation that
  `terraform validate` is green.

## Bottom line

- **7 of 11** Sprint-18 "backlog" rows are actually **shipped** — the CSV is
  stale and should be flipped to Completed (separate task; this audit is
  read-only).
- **Genuinely remaining Sprint-18 work (Category C): DOC-016, IFC-211.**
- **Needs a human decision (Category D): DOC-015, INFRA-TF-001** — see per-task
  notes.
