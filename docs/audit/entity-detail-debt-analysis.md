# Entity Detail Pages — Wiring Debt Analysis

**Date**: 2026-03-04 (created), 2026-03-05 (updated — follow-up tasks created)
**Scope**: Lead, Contact, Account, Deal detail pages **Trigger**: Lead 360
wiring audit found 16 unwired features traceable to completed tasks **Follow-up
status**: 7 debt entries logged, 6 follow-up tasks created (IFC-216 to IFC-221),
5 backlog tasks amended

---

## Why Completed Tasks Left Wiring Debt

### Pattern 1 — Infrastructure-only scope (IFC-094, IFC-144, IFC-099, IFC-039)

Tasks built adapters/chains/services but their acceptance criteria were
transport-layer or model-accuracy metrics, not frontend page wiring. The plan
correctly separates concerns, but no follow-up "wire into 360" task was created.

### Pattern 2 — Oversight in scope definition (PG-141, IFC-095, IFC-069)

Tasks built UI components or services with explicit intent to wire into 360
views, but the detail-page button handlers (Compose, Upload, reactions) weren't
in the acceptance criteria or were deferred with "coming soon" intent.

### Pattern 3 — Scaffolded page never completed (Deal detail)

A page was created with sample data and a comment "In production, fetch..." but
the corresponding backend task (IFC-186) and planned page task (PG-074) are both
Backlog. The gap between the scaffold and production code was never closed.

---

## Per-Task Analysis

| Task ID | Sprint | Original Scope                                                                                                                                                | What it built                                                                                                                                                         | What's unwired on Lead detail                                                                                          | Why                                                                                                                                                                          | Remediation                        |
| ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| IFC-094 | 8      | Documents Management — e-signature, upload, version history, inline preview                                                                                   | Backend: DocuSign/Adobe Sign integration, document storage infrastructure                                                                                             | Upload button (no handler), Download button (no URL/handler) on Lead detail (and Contact, Deal)                        | Infrastructure-only: Scope was backend storage/signing service. PG-089 (Backlog, Sprint 23) is the "Files" page task — standalone, not detail-page wiring.                   | **WIRE-IFC-094-001** → **IFC-216** |
| IFC-144 | 6→10   | Inbound/outbound email flows — SPF/DKIM/DMARC, inbound parsing, attachments, webhooks, OpenAPI spec                                                           | Email adapter layer: outbound.ts, inbound.ts, dkim-signer.ts, attachments.ts, EmailServiceAdapter.ts                                                                  | Compose button on Lead detail (no handler), Email list derived from activities (not real email integration)            | Infrastructure-only: Scope was transport layer and adapter. PG-141 built standalone Email page, not detail-page buttons.                                                     | **WIRE-IFC-144-001** → **IFC-217** |
| IFC-099 | 10     | ERP/Payment/Email Connectors — SAP, Stripe, PayPal, Gmail, Outlook, Slack, Teams                                                                              | Adapter clients for all providers                                                                                                                                     | Email compose on all entity detail pages (uses activity-derived email list, not real Gmail/Outlook adapter)            | Infrastructure-only: Scope was adapter layer with integration tests.                                                                                                         | **WIRE-IFC-099-001** → **IFC-221** |
| PG-141  | 11     | Email Compose & History Page — thread view, compose, attachments, templates                                                                                   | Standalone `/email` page with EmailCompose.tsx, EmailList.tsx, EmailThread.tsx, AttachmentManager.tsx, TemplateSelector.tsx, RecipientPicker.tsx                      | Compose button on Lead/Contact/Deal/Account detail pages not wired to EmailCompose component                           | Oversight: EmailCompose component exists and works. Scope said "Email Compose Page" not "wire into 360 views."                                                               | **WIRE-PG-141-001** → **IFC-217**  |
| IFC-039 | 6      | Advanced AI Features (RAG) — embeddings, sentiment analysis, next best action; pgvector integration                                                           | AI chain infrastructure, embeddings quality tests, sentiment accuracy                                                                                                 | "Run AI Analysis" button missing when aiInsight is null; no fallback indicator                                         | Infrastructure-only: Scope was AI model evaluation and chain quality, not frontend UX for null-state.                                                                        | **WIRE-IFC-039-001** → **IFC-218** |
| IFC-069 | 14     | Unified Activity Feed Service — 7 sources, 17 types, cursor pagination, tRPC router, React component, useActivityFeed() hook                                  | Full hexagonal implementation: domain, validators, application service, Prisma adapter (7-table UNION), tRPC router, ActivityFeed.tsx component, useActivityFeed hook | Activity reactions/comments arrays always []; action buttons (Reply, React, Add Note, Share) are no-ops                | Oversight + schema gap: Person filter is a UI concern not in the service spec. Reactions/comments require schema additions. Action buttons need separate mutation endpoints. | **WIRE-IFC-069-001** → **IFC-219** |
| IFC-095 | 8      | Churn Risk & Next Best Action — AI chains, domain value objects, intelligence.router.ts, ChurnRiskCard, NextBestActionCard, wired to Contact 360 and Lead 360 | AI prediction chain, 6 tRPC procedures, 2 UI components integrated into both 360 views                                                                                | No "Run AI Analysis" button when insight is null; no visual indicator that fallback values are defaults not AI-derived | Oversight: Spec focused on AI model accuracy and rendering, not null-state UX.                                                                                               | **WIRE-IFC-095-001** → **IFC-220** |

---

## Cross-Entity Gap Analysis

| Gap                               | Lead Detail                                                               | Contact Detail                                     | Account Detail                                                | Deal Detail                                                                              |
| --------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **File upload handler**           | Not wired (button exists, no onClick)                                     | Not wired (button exists, hardcoded doc list)      | No file tab exists                                            | No file handler (SAMPLE_DEAL.files hardcoded)                                            |
| **File download handler**         | Not wired (button exists, no download URL)                                | Not wired (hardcoded docs, download button no URL) | No file tab                                                   | No handler (files static)                                                                |
| **Email compose button**          | Not wired (button exists)                                                 | Not wired (button exists)                          | No email compose button                                       | Not present                                                                              |
| **Email list from real service**  | Partially wired (activities filtered for EMAIL type)                      | Partially wired (same pattern)                     | Not present                                                   | Not wired (SAMPLE_ACTIVITIES)                                                            |
| **Similar entity sidebar**        | Empty state (mock removed; needs vector API)                              | Not present                                        | Not present                                                   | Not present                                                                              |
| **Activity reactions/comments**   | Not wired (always [])                                                     | Not wired (always [])                              | Not applicable                                                | Not wired (SAMPLE_ACTIVITIES)                                                            |
| **Activity action buttons**       | Not wired (no onClick handlers)                                           | Not wired (no onClick handlers)                    | Not present                                                   | Not present                                                                              |
| **AI insight fallback indicator** | Fixed 2026-03-04 (Run AI Analysis button)                                 | Not wired (silent fallback)                        | No AI insights section                                        | Not applicable                                                                           |
| **Person filter populated**       | Already implemented (useMemo from activities)                             | Partially wired (only "All People")                | Not applicable                                                | Not applicable                                                                           |
| **Loading skeleton**              | Fixed 2026-03-04                                                          | Has skeleton (lines 665-682)                       | Has skeleton (lines 149-182)                                  | None (no loading state, uses SAMPLE_DEAL)                                                |
| **Deal entire data layer**        | N/A                                                                       | N/A                                                | N/A                                                           | **Fully hardcoded** — SAMPLE_DEAL and SAMPLE_ACTIVITIES, no API query, all buttons no-op |
| **Account owner name**            | N/A                                                                       | N/A                                                | Shows "Owner Assigned" text (only ownerId, no owner relation) | N/A                                                                                      |
| **Account header buttons**        | N/A                                                                       | N/A                                                | "Create Deal" and "Add Contact" — no onClick handlers         | N/A                                                                                      |
| **Map view**                      | Placeholder (gradient + non-functional "View Map" button)                 | Not present                                        | Not present                                                   | Not present                                                                              |
| **Company/Account link**          | Plain `<span>` — no link to Account page                                  | Plain text — no link                               | N/A (is the Account page)                                     | Plain text — no link                                                                     |
| **Owner reassignment**            | Read-only card — no reassign UI                                           | Read-only                                          | Read-only                                                     | Read-only (SAMPLE_DEAL)                                                                  |
| **Convert lead UX**               | Button visible for all statuses; no confirmation; no createAccount option | N/A                                                | N/A                                                           | N/A                                                                                      |
| **Engagement null-state**         | "Unknown" badge when no AI insight                                        | "Unknown" badge when no AI insight                 | No AI section                                                 | N/A                                                                                      |
| **Recent Activity CTA**           | Generic "No activities yet" — no log CTA in overview                      | Generic empty state                                | Not present                                                   | Hardcoded SAMPLE_ACTIVITIES                                                              |

---

## Critical Finding: Deal Detail Page is Fully Unwired

`apps/web/src/app/deals/[id]/page.tsx` is the most severe case:

- **No API calls**: Zero useQuery / useMutation calls
- **No tRPC usage**: imports useParams but never calls api.opportunity.\*
- **Fully hardcoded**: SAMPLE_DEAL constant (line 115) with static "Acme Corp"
  data; SAMPLE_ACTIVITIES (line 151)
- **All action buttons no-ops**: Won, Lost, Edit, Clone Deal, Archive, Delete —
  all `onClick: () => {}`
- **Comment in code**: `// In production, fetch deal data based on dealId`
  (line 682)

Depends on IFC-186 (Deal/Opportunity tRPC Router, Backlog) and PG-074
(Opportunity Detail, Backlog Sprint 20).

---

## Existing Tasks That Could Be Amended — DONE 2026-03-05

All suggested amendments have been applied to Sprint_plan.csv:

| Entity  | Task ID | Title                        | Sprint | Status    | Amendment Applied                                                                                                                                            |
| ------- | ------- | ---------------------------- | ------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Deal    | PG-074  | Opportunity Detail           | 20     | Backlog   | **Amended**: CRITICAL note added — must replace SAMPLE_DEAL with real API, wire all 6 action buttons, add real activity timeline, remove hardcoded constants |
| Deal    | IFC-186 | Deal/Opportunity tRPC Router | 5      | Completed | Prerequisite already done — router built with moveStage, getHistory, getProducts, getPipeline endpoints                                                      |
| All     | PG-089  | Files Page                   | 23     | Backlog   | **Amended**: Cross-entity scope added — wire file upload/download on Lead, Contact, Deal detail pages                                                        |
| All     | PG-084  | Emails Page                  | 22     | Backlog   | **Amended**: Cross-entity scope added — wire EmailCompose into Lead/Contact detail Compose buttons                                                           |
| Contact | PG-162  | AI Insights from ML model    | 16     | Backlog   | **Amended**: Null-state UX scope added — Run AI Analysis button for Contact detail                                                                           |
| All     | PG-145  | NBA Dashboard                | 26     | Backlog   | **Amended**: Multi-factor impact scoring scope added                                                                                                         |

---

## Recommended New Tasks — CREATED 2026-03-05

All recommended tasks have been created in Sprint_plan.csv with debt ledger
entries:

| Entity              | Created Task                                     | Debt Entry                        | Sprint | Rationale                                                                                   |
| ------------------- | ------------------------------------------------ | --------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| Lead, Contact       | **IFC-217** — Entity Detail Email Compose Wiring | WIRE-IFC-144-001, WIRE-PG-141-001 | 22     | Wire EmailCompose into Lead/Contact detail Compose buttons. Pre-fill recipient.             |
| Lead, Contact, Deal | **IFC-216** — Entity Detail File Upload/Download | WIRE-IFC-094-001                  | 23     | Wire file upload (Supabase Storage) and download (presigned URLs) on 3 entity detail pages. |
| Lead, Contact       | **IFC-218** — Similar Entity API (pgvector)      | WIRE-IFC-039-001                  | 20     | Build lead.getSimilar and contact.getSimilar tRPC queries using embedding similarity.       |
| Lead, Contact       | **IFC-219** — Activity Feed Interactions         | WIRE-IFC-069-001                  | 20     | Add ActivityReaction and ActivityComment models + mutations. Wire action buttons.           |
| Contact             | **IFC-220** — AI Insight Null-State UX           | WIRE-IFC-095-001                  | 16     | "Run AI Analysis" button when aiInsight is null on Contact detail (Lead already done).      |
| Lead, Contact       | **IFC-221** — Email Open Tracking Integration    | WIRE-IFC-099-001                  | 22     | Real email open/click tracking via pixel + URL wrapper. Replace activity-derived open rate. |
| Deal                | **PG-074** (amended)                             | N/A                               | 20     | CRITICAL: Replace SAMPLE_DEAL with real API. Wire all 6 action buttons.                     |

### Remaining gaps (not yet tasked) — updated 2026-03-05

| Entity        | Gap                                                        | Priority | Task Created            | Notes                                                                                                                                      |
| ------------- | ---------------------------------------------------------- | -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Lead          | Convert Lead button always visible for non-QUALIFIED leads | P1       | **IFC-225** (Sprint 16) | Backend requires QUALIFIED status; button should be disabled/hidden with guidance. Missing confirmation dialog and `createAccount` option. |
| Lead, Contact | Engagement/ChurnRisk/Sentiment show raw "Unknown" string   | P1       | **IFC-226** (Sprint 16) | When `aiInsight` is null, `'Unknown'` renders as badge label. Should show styled "Not analyzed" state.                                     |
| Lead, Contact | Recent Activity empty state has no CTA                     | P1       | **IFC-236** (Sprint 16) | Overview tab shows "No activities yet" — should prompt "Log your first activity".                                                          |
| Lead          | Company name not linked to Account page                    | P2       | **IFC-227** (Sprint 18) | Plain `<span>` in profile card and info panel. Needs `accountId` in lead transform + `<Link>`                                              |
| Lead          | Owner reassignment not available                           | P2       | **IFC-228** (Sprint 20) | Owner card is read-only. MANAGER/ADMIN should be able to reassign via user picker.                                                         |
| Lead          | Map view placeholder non-functional                        | P2       | **IFC-229** (Sprint 20) | "View Map" button has no handler. Either integrate map library or remove placeholder.                                                      |
| Lead          | Create/Edit lead form inconsistency                        | P2       | **IFC-230** (Sprint 18) | Create page (1029 lines) and Edit page (464 lines) share no components, different API clients, BANT silently dropped.                      |
| Lead          | Lead list saved views not wired                            | P3       | **IFC-231** (Sprint 22) | Sidebar view params (?view=my, ?view=starred) completely ignored. No saved views, column picker, or persistent filters.                    |
| All           | Sidebar broken links (17 nav + 6 settings)                 | P1       | **IFC-232** (Sprint 16) | 23 sidebar links lead to 404 pages.                                                                                                        |
| All           | ~20 unused backend tRPC endpoints                          | P2       | **IFC-233** (Sprint 20) | Lead (5), Contact (8), Opportunity (6), Account (2), Task (3) procedures built but never consumed.                                         |
| All           | Settings pages hardcoded/inert                             | P2       | **IFC-234** (Sprint 18) | Team/Integrations/Notifications/Account settings all hardcoded with inert buttons.                                                         |
| Lead          | AI Chat panel missing                                      | P3       | **IFC-235** (Sprint 22) | conversation.router.ts fully built (13 endpoints) but not registered. Need LeadChatPanel UI component.                                     |
| Contact       | Replace hardcoded documents in Contact detail              | P3       | —                       | Depends on IFC-216 file infrastructure                                                                                                     |
| Account       | Fetch and display account owner name                       | P3       | —                       | Minor — include owner relation in query                                                                                                    |
| Account       | Wire "Create Deal" and "Add Contact" buttons               | P3       | —                       | Navigate to /deals/new?accountId=X and /contacts/new?accountId=X                                                                           |
