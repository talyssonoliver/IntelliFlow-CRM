# IntelliFlow CRM - Flow Index

> **Location**: `apps/project-tracker/docs/metrics/_global/flows/flow-index.md`
> **Last Updated**: 2026-02-09 **Total Flows**: 47

This document serves as the master index linking all user flows to sitemap
routes, UI components, and style guide patterns.

---

## Quick Navigation

| Category                                              | Flows                                    | Sprint Range |
| ----------------------------------------------------- | ---------------------------------------- | ------------ |
| [Acesso e Identidade](#acesso-e-identidade)           | FLOW-001 to FLOW-004                     | 1-2          |
| [Comercial Core](#comercial-core)                     | FLOW-005 to FLOW-010                     | 1-5          |
| [Relacionamento e Suporte](#relacionamento-e-suporte) | FLOW-011 to FLOW-015                     | 2-6          |
| [Comunicação](#comunicação)                           | FLOW-016 to FLOW-022                     | 5-7          |
| [Analytics e Insights](#analytics-e-insights)         | FLOW-023 to FLOW-028, FLOW-042, FLOW-043 | 5-9          |
| [Segurança e Compliance](#segurança-e-compliance)     | FLOW-029 to FLOW-033, FLOW-040, FLOW-044 | 0-3, 11-12   |
| [Qualidade e Testes](#qualidade-e-testes)             | FLOW-034 to FLOW-038                     | 2-4          |
| [Search & AI](#search--ai)                            | FLOW-039, FLOW-041                       | 12-13        |
| [AI & Configuration](#ai--configuration)              | FLOW-045                                 | 14           |
| [Billing & Payments](#billing--payments)              | FLOW-048                                 | 14           |
| [Dashboard](#dashboard)                               | FLOW-047                                 | 13-14        |

---

## Acesso e Identidade

### FLOW-001: Login com Autenticação Multifator

| Property     | Value               |
| ------------ | ------------------- |
| **Priority** | Critical            |
| **Sprint**   | 1                   |
| **Category** | Acesso e Identidade |

**Routes (Sitemap)**:

- `/login` → [PG-015] Sprint 13
- `/sso/callback` → OAuth callback
- `/verify-email` → [PG-020] Sprint 13

**Key Artifacts**:

- `apps/web/app/login/page.tsx`
- `apps/web/components/auth/login-form.tsx`
- `apps/api/src/routers/auth.router.ts`
- `apps/api/src/services/mfa.service.ts`

---

### FLOW-002: Gestão de Usuários e Permissões

| Property     | Value               |
| ------------ | ------------------- |
| **Priority** | High                |
| **Sprint**   | 1                   |
| **Category** | Acesso e Identidade |

**Routes (Sitemap)**:

- `/admin/users` → [IFC-098]
- `/admin/users/new`
- `/admin/users/[id]`
- `/admin/roles` → [IFC-098]
- `/settings/users`

**Key Artifacts**:

- `apps/web/app/settings/users/page.tsx`
- `apps/api/src/rbac/rbac.service.ts`
- `packages/db/prisma/schema-rbac.prisma`

---

### FLOW-003: Recuperação de Senha

| Property     | Value               |
| ------------ | ------------------- |
| **Priority** | High                |
| **Sprint**   | 1                   |
| **Category** | Acesso e Identidade |

**Routes (Sitemap)**:

- `/forgot-password` → [PG-018] Sprint 13
- `/reset-password` → [PG-019] Sprint 13

**Key Artifacts**:

- `apps/web/components/auth/forgot-password.tsx`
- `apps/api/src/services/reset-token.service.ts`
- `apps/web/app/reset-password/[token]/page.tsx`

---

### FLOW-004: Troca de Tenant/Workspace

| Property     | Value               |
| ------------ | ------------------- |
| **Priority** | Medium              |
| **Sprint**   | 2                   |
| **Category** | Acesso e Identidade |

**Routes (Sitemap)**:

- Header workspace dropdown
- `/workspaces`
- Shortcut: Cmd/Ctrl + K

**Key Artifacts**:

- `apps/web/components/workspace/workspace-switcher.tsx`
- `apps/api/src/middleware/workspace.middleware.ts`
- `apps/web/hooks/use-workspace.ts`

---

## Comercial Core

### FLOW-005: Criação de Novo Lead

| Property     | Value          |
| ------------ | -------------- |
| **Priority** | Critical       |
| **Sprint**   | 1              |
| **Category** | Comercial Core |

**Routes (Sitemap)**:

- `/leads` → [IFC-014] Sprint 7
- `/leads/new` → [IFC-004] Sprint 5

**Key Artifacts**:

- `apps/web/app/leads/new/page.tsx`
- `apps/api/src/leads/lead.service.ts`
- `apps/ai-worker/src/scoring/lead-scorer.ts`
- `apps/web/components/leads/create-lead-modal.tsx`

---

### FLOW-006: Conversão Lead para Contato e Deal

| Property     | Value          |
| ------------ | -------------- |
| **Priority** | Critical       |
| **Sprint**   | 4              |
| **Category** | Comercial Core |

**Routes (Sitemap)**:

- `/leads/[id]` → Lead detail (convert action)
- `/deals/new` → Create from conversion

**Key Artifacts**:

- `apps/web/components/leads/convert-button.tsx`
- `apps/web/components/conversion/conversion-wizard.tsx`
- `apps/api/src/services/conversion.service.ts`
- `packages/domain/src/conversion/lead-converter.ts`

---

### FLOW-007: Gestão de Pipeline Kanban

| Property     | Value          |
| ------------ | -------------- |
| **Priority** | Critical       |
| **Sprint**   | 4              |
| **Category** | Comercial Core |

**Routes (Sitemap)**:

- `/deals` → [IFC-091] Sprint 6 (Kanban view)
- Menu: Sales > Pipeline

**Key Artifacts**:

- `apps/web/app/pipeline/page.tsx`
- `apps/web/components/pipeline/kanban-board.tsx`
- `apps/web/components/pipeline/deal-card.tsx`
- `apps/api/src/services/stage-transition.service.ts`

---

### FLOW-008: Criação e Atualização de Deal

| Property     | Value          |
| ------------ | -------------- |
| **Priority** | Critical       |
| **Sprint**   | 4              |
| **Category** | Comercial Core |

**Routes (Sitemap)**:

- `/deals/new`
- `/deals/[id]`
- `/deals/[id]/edit`
- `/deals/[id]/forecast` → [IFC-092] Sprint 7

**Key Artifacts**:

- `apps/web/components/deals/create-deal-modal.tsx`
- `apps/web/components/deals/deal-form.tsx`
- `apps/api/src/services/forecast.service.ts`
- `apps/web/components/deals/deal-room.tsx`

---

### FLOW-009: Fechamento de Deal Won/Lost

| Property     | Value          |
| ------------ | -------------- |
| **Priority** | Critical       |
| **Sprint**   | 5              |
| **Category** | Comercial Core |

**Routes (Sitemap)**:

- `/deals/[id]` → Close action
- Pipeline Kanban → Drag to Closed Won/Lost

**Key Artifacts**:

- `apps/web/components/deals/close-deal-modal.tsx`
- `apps/api/src/workflows/deal-won.workflow.ts`
- `apps/api/src/workflows/deal-lost.workflow.ts`
- `apps/web/components/celebrations/won-animation.tsx`

---

### FLOW-010: Renovação de Contrato

| Property     | Value          |
| ------------ | -------------- |
| **Priority** | High           |
| **Sprint**   | 5              |
| **Category** | Comercial Core |

**Routes (Sitemap)**:

- `/deals` → Renewal deals view
- `/accounts/[id]` → Renewal history
- `/contacts/[id]` → Contact 360 AI Insights (IFC-095)
- `/leads/[id]` → Lead 360 AI Insights (IFC-095)

**Key Artifacts**:

- `apps/web/app/renewals/dashboard/page.tsx`
- `apps/api/src/services/renewal-identification.service.ts`
- `apps/ai-worker/src/chains/renewal-strategy.chain.ts`

**AI Intelligence (IFC-095)**:

- `apps/api/src/modules/intelligence/intelligence.router.ts` - tRPC predictions
  router
- `apps/ai-worker/src/chains/churn-risk.chain.ts` - Churn prediction chain
- `packages/domain/src/intelligence/ChurnRiskScore.ts` - Churn risk value object
- `packages/domain/src/intelligence/NextBestAction.ts` - NBA value object
- `packages/ui/src/components/intelligence/ChurnRiskCard.tsx` - Churn risk UI
- `packages/ui/src/components/intelligence/NextBestActionCard.tsx` - NBA UI

---

## Relacionamento e Suporte

### FLOW-011: Abertura de Ticket de Suporte

| Property     | Value                    |
| ------------ | ------------------------ |
| **Priority** | High                     |
| **Sprint**   | 2                        |
| **Category** | Relacionamento e Suporte |

**Routes (Sitemap)**:

- `/tickets` → [IFC-093] Sprint 7
- `/tickets/new`
- `/support/portal`

**Key Artifacts**:

- `apps/web/app/support/portal/page.tsx`
- `apps/api/src/routers/ticket-creation.router.ts`
- `apps/ai-worker/src/chains/ticket-categorization.chain.ts`

---

### FLOW-012: Roteamento Automático de Tickets

| Property     | Value                    |
| ------------ | ------------------------ |
| **Priority** | High                     |
| **Sprint**   | 5                        |
| **Category** | Relacionamento e Suporte |

**Routes (Sitemap)**:

- `/tickets/[id]` → Auto-assigned
- Admin routing configuration

**Key Artifacts**:

- `apps/api/src/services/skill-matcher.service.ts`
- `apps/api/src/services/ticket-router.service.ts`
- `apps/api/src/services/load-balancer.service.ts`

---

### FLOW-013: Gestão de SLA e Escalation

| Property     | Value                    |
| ------------ | ------------------------ |
| **Priority** | High                     |
| **Sprint**   | 5                        |
| **Category** | Relacionamento e Suporte |

**Routes (Sitemap)**:

- `/tickets/[id]` → SLA countdown
- `/support/status` → [IFC-093] SLA dashboard

**Key Artifacts**:

- `apps/api/src/services/sla-monitor.service.ts`
- `apps/api/src/services/escalation-engine.service.ts`
- `apps/web/components/sla/status-indicators.tsx`

---

### FLOW-014: Resolução e Fechamento de Ticket

| Property     | Value                    |
| ------------ | ------------------------ |
| **Priority** | High                     |
| **Sprint**   | 4                        |
| **Category** | Relacionamento e Suporte |

**Routes (Sitemap)**:

- `/tickets/[id]` → Resolve action
- `/tickets/[id]/resolve`

**Key Artifacts**:

- `apps/web/app/tickets/[id]/resolve/page.tsx`
- `apps/api/src/services/ticket-closure.service.ts`
- `apps/api/src/services/knowledge-capture.service.ts`

---

### FLOW-015: Coleta e Análise de Feedback (NPS/CSAT)

| Property     | Value                    |
| ------------ | ------------------------ |
| **Priority** | Medium                   |
| **Sprint**   | 6                        |
| **Category** | Relacionamento e Suporte |

**Routes (Sitemap)**:

- `/survey/[token]` → Survey page
- `/analytics` → [IFC-096] NPS dashboard

**Key Artifacts**:

- `apps/web/app/survey/[token]/page.tsx`
- `apps/api/src/services/feedback-collector.service.ts`
- `apps/ai-worker/src/chains/feedback-analysis.chain.ts`

---

## Comunicação

### FLOW-016: Envio de Email com Tracking

| Property     | Value       |
| ------------ | ----------- |
| **Priority** | High        |
| **Sprint**   | 5           |
| **Category** | Comunicação |

**Routes (Sitemap)**:

- Email composer modal (from contacts, leads, deals)

**Key Artifacts**:

- `apps/web/components/email/composer.tsx`
- `apps/api/src/services/tracking-pixel.service.ts`
- `apps/api/src/services/email-deliverer.service.ts`

---

### FLOW-017: Integração de Chat Bidirecional

| Property     | Value       |
| ------------ | ----------- |
| **Priority** | Medium      |
| **Sprint**   | 5           |
| **Category** | Comunicação |

**Routes (Sitemap)**:

- `/support/chat` → [IFC-047]
- Chat widget in Contact 360

**Key Artifacts**:

- `apps/api/src/integrations/whatsapp.service.ts`
- `apps/api/src/integrations/teams.service.ts`
- `apps/web/components/chat/unified-inbox.tsx`

---

### FLOW-018: Registro de Chamadas Telefônicas

| Property     | Value       |
| ------------ | ----------- |
| **Priority** | Medium      |
| **Sprint**   | 5           |
| **Category** | Comunicação |

**Routes (Sitemap)**:

- `/contacts/[id]` → Call log tab
- Click-to-call integration

**Key Artifacts**:

- `apps/web/components/phone/dialer.tsx`
- `apps/api/src/integrations/voip.service.ts`
- `apps/ai-worker/src/chains/call-transcription.chain.ts`

---

### FLOW-019: Agendamento de Reuniões

| Property     | Value       |
| ------------ | ----------- |
| **Priority** | Medium      |
| **Sprint**   | 5           |
| **Category** | Comunicação |

**Routes (Sitemap)**:

- Schedule meeting button (contacts, leads, deals)
- Calendar integration

**Key Artifacts**:

- `apps/web/components/calendar/meeting-scheduler.tsx`
- `apps/api/src/integrations/calendar.service.ts`
- `apps/api/src/services/availability-checker.service.ts`

---

### FLOW-020: Feed de Atividade Unificado

| Property     | Value       |
| ------------ | ----------- |
| **Priority** | High        |
| **Sprint**   | 5           |
| **Category** | Comunicação |

**Routes (Sitemap)**:

- `/contacts/[id]` → [IFC-090] Activity Timeline tab
- `/accounts/[id]` → Account timeline
- `/deals/[id]` → Deal timeline
- `/cases/timeline` → [IFC-147] Case timeline with deadline engine

**Key Artifacts**:

- `apps/web/components/activity-timeline.tsx`
- `apps/api/src/services/activity-aggregator.service.ts`
- `apps/web/hooks/use-activity-feed.ts`
- `apps/web/src/app/cases/timeline/page.tsx`
- `apps/web/lib/cases/reminders-service.ts`
- `packages/domain/src/legal/deadlines/deadline-engine.ts`

---

## Analytics e Insights

### FLOW-023: Construtor de Relatórios

| Property     | Value                |
| ------------ | -------------------- |
| **Priority** | High                 |
| **Sprint**   | 5                    |
| **Category** | Analytics e Insights |

**Routes (Sitemap)**:

- `/reports/builder` → Report builder
- `/reports/custom` → [IFC-096] Sprint 9
- `/analytics/custom`

**Key Artifacts**:

- `apps/web/app/reports/builder/page.tsx`
- `apps/api/src/reports/query-builder.service.ts`
- `apps/web/components/reports/builder-canvas.tsx`

---

### FLOW-042: Insights Dashboard

| Property     | Value                |
| ------------ | -------------------- |
| **Priority** | High                 |
| **Sprint**   | 9                    |
| **Category** | Analytics e Insights |

**Routes (Sitemap)**:

- `/analytics` → [IFC-096] Sprint 9 (main dashboard)
- `/reports/custom` → [IFC-096] Custom reports

**Key Artifacts**:

- `apps/api/src/modules/analytics/analytics.router.ts` (EXISTS)
- `apps/api/src/modules/analytics/__tests__/analytics.router.test.ts` (EXISTS)
- `apps/web/src/components/sidebar/configs/analytics.ts` (EXISTS)
- `apps/web/src/components/analytics/WidgetBuilder.tsx` [IFC-037]
- `apps/web/src/components/analytics/ExportButton.tsx` [IFC-037]
- `docs/planning/prd-analytics-reporting.md` (EXISTS)
- `docs/planning/adr/ADR-016-analytics-integrity.md` (EXISTS)

**Backend Dependencies (IFC-096)**:

- Analytics router with deals won trend, growth metrics, traffic sources
- Supabase realtime channels with fallback polling
- Tenant-scoped analytics service

**Implementation Tasks**:

- IFC-096: Custom Dashboards (COMPLETED)
- IFC-037: Analytics UI (PLANNED)
- IFC-038: Advanced Analytics (PLANNED)

---

### FLOW-043: Revenue Forecasting

| Property     | Value                |
| ------------ | -------------------- |
| **Priority** | High                 |
| **Sprint**   | 7                    |
| **Category** | Analytics e Insights |

**Routes (Sitemap)**:

- `/deals/[id]/forecast` → [IFC-092] Sprint 7
- `/analytics` → Forecast widget [IFC-096]
- `/reports/forecast` → Executive summary

**Key Artifacts**:

- `apps/api/src/shared/forecast-algorithm.test.ts` (EXISTS)
- `artifacts/metrics/accuracy-backtest.csv` (EXISTS)
- `docs/planning/adr/ADR-019-core-crm-foundation.md` (EXISTS)
- `apps/web/src/app/deals/forecast/page.tsx` [PLANNED]
- `apps/web/src/components/analytics/StageBreakdownChart.tsx` [PLANNED]

**Backend Dependencies (IFC-092)**:

- Weighted pipeline computation with stage probabilities
- Historical win-rate analysis (96.2% accuracy)
- Monthly projection with variance tracking

**Implementation Tasks**:

- IFC-092: Deal Forecasting (COMPLETED)
- IFC-091: Opportunity Aggregate (COMPLETED)
- Forecast UI: (NOT STARTED)

---

### FLOW-030: Backup e Disaster Recovery

| Property     | Value                  |
| ------------ | ---------------------- |
| **Priority** | Critical               |
| **Sprint**   | 0                      |
| **Category** | Segurança e Compliance |

**Routes (Sitemap)**:

- `/ops/monitoring` → [IFC-097] Sprint 9
- `/admin/system` → [AUTOMATION-002]

**Key Artifacts**:

- `apps/api/src/services/backup-scheduler.service.ts`
- `apps/api/src/services/dr-tester.service.ts`
- `apps/infra/backup/terraform/main.tf`

---

### FLOW-038: Testes de Performance e Load

| Property     | Value              |
| ------------ | ------------------ |
| **Priority** | High               |
| **Sprint**   | 2                  |
| **Category** | Qualidade e Testes |

**Routes (Sitemap)**:

- `/ops/monitoring` → [IFC-097] Performance dashboards
- `/admin/features` → Feature flags

**Key Artifacts**:

- `apps/infra/performance/test-plans/`
- `apps/api/src/services/performance-monitor.service.ts`
- `apps/web/components/performance/optimization-dashboard.tsx`

---

## Routes → Flows Quick Reference

| Route Pattern                                   | Primary Flows      | Category                 |
| ----------------------------------------------- | ------------------ | ------------------------ |
| `/login`, `/forgot-password`, `/reset-password` | FLOW-001, FLOW-003 | Acesso e Identidade      |
| `/admin/users`, `/admin/roles`                  | FLOW-002           | Acesso e Identidade      |
| `/workspaces`, header dropdown                  | FLOW-004           | Acesso e Identidade      |
| `/leads`, `/leads/new`                          | FLOW-005           | Comercial Core           |
| `/leads/[id]` (convert)                         | FLOW-006           | Comercial Core           |
| `/deals` (Kanban)                               | FLOW-007           | Comercial Core           |
| `/deals/new`, `/deals/[id]`                     | FLOW-008           | Comercial Core           |
| `/deals/[id]` (close)                           | FLOW-009           | Comercial Core           |
| `/renewals`, `/accounts/[id]`                   | FLOW-010           | Comercial Core           |
| `/contacts/[id]` (AI Insights)                  | FLOW-010, IFC-095  | Comercial Core           |
| `/leads/[id]` (AI Insights)                     | FLOW-010, IFC-095  | Comercial Core           |
| `/tickets`, `/tickets/new`                      | FLOW-011           | Relacionamento e Suporte |
| `/tickets/[id]` (routing)                       | FLOW-012           | Relacionamento e Suporte |
| `/tickets/[id]` (SLA)                           | FLOW-013           | Relacionamento e Suporte |
| `/tickets/[id]` (resolve)                       | FLOW-014           | Relacionamento e Suporte |
| `/survey/*`, NPS dashboard                      | FLOW-015           | Relacionamento e Suporte |
| Email composer                                  | FLOW-016           | Comunicação              |
| `/support/chat`, chat widget                    | FLOW-017           | Comunicação              |
| Call logging                                    | FLOW-018           | Comunicação              |
| Meeting scheduler                               | FLOW-019           | Comunicação              |
| `/contacts/[id]` (timeline)                     | FLOW-020           | Comunicação              |
| `/cases/timeline`                               | FLOW-020           | Comunicação              |
| `/reports/builder`                              | FLOW-023           | Analytics e Insights     |
| `/ops/monitoring` (backup)                      | FLOW-030           | Seguranca e Compliance   |
| `/ops/monitoring` (perf)                        | FLOW-038           | Qualidade e Testes       |
| `/search`, header search                        | FLOW-039           | Search & AI              |
| `/privacy/dsar`                                 | FLOW-040           | Seguranca e Compliance   |
| `/agent/chat`, `/cases/[id]` (RAG)              | FLOW-041           | Search & AI              |
| `/analytics`                                    | FLOW-042, FLOW-023 | Analytics e Insights     |
| `/deals/[id]/forecast`, `/reports/forecast`     | FLOW-043           | Analytics e Insights     |
| Vault API (infrastructure)                      | FLOW-044           | Seguranca e Compliance   |
| `/settings/ai`                                  | FLOW-045           | AI & Configuration       |
| `/billing`, `/billing/*`                        | FLOW-048           | Billing & Payments       |
| `/` (authenticated)                             | FLOW-047           | Dashboard                |

---

## Billing & Payments

### FLOW-048: Billing & Subscription Management

| Property     | Value              |
| ------------ | ------------------ |
| **Priority** | High               |
| **Sprint**   | 14                 |
| **Category** | Billing & Payments |

**Routes (Sitemap)**:

- `/billing` → [PG-025] Billing Portal Sprint 14
- `/billing/checkout` → [PG-026] Checkout
- `/billing/invoices` → [PG-027] Invoice List
- `/billing/invoices/[id]` → [PG-028] Invoice Detail
- `/billing/settings` → [PG-029] Payment Methods
- `/billing/subscriptions` → [PG-030] Subscription Manager
- `/billing/receipts` → [PG-031] Receipts

**Key Artifacts**:

- `apps/web/src/components/billing/billing-portal.tsx` (EXISTS)
- `apps/web/src/components/billing/checkout-form.tsx` (EXISTS)
- `apps/web/src/components/billing/invoice-list.tsx` (EXISTS)
- `apps/web/src/components/billing/subscription-manager.tsx` (EXISTS)
- `apps/web/src/components/billing/payment-methods.tsx` (EXISTS)
- `apps/web/src/components/billing/receipt-list.tsx` (EXISTS)
- `apps/api/src/modules/billing/billing.router.ts` (EXISTS)
- `packages/domain/src/crm/billing/Invoice.ts` (EXISTS - IFC-198)
- `packages/adapters/src/payments/stripe/StripeAdapter.ts` (EXISTS - IFC-099)

**Backend Dependencies (IFC-198, IFC-099)**:

- Billing domain: Invoice/Receipt aggregates with state machine
- Stripe adapter: PaymentServicePort via custom HTTP client
- tRPC billing router with subscription, invoice, payment method endpoints

**Implementation Tasks**:

- IFC-198: Billing Domain Core (COMPLETED)
- IFC-099: Stripe Payment Adapter (COMPLETED)
- PG-025: Billing Portal (BACKLOG)
- PG-026: Checkout (BACKLOG)
- PG-027: Invoices (BACKLOG)
- PG-028: Invoice Detail (BACKLOG)
- PG-029: Payment Methods (BACKLOG)
- PG-030: Subscriptions (BACKLOG)
- PG-031: Receipts (COMPLETED)

---

## AI & Configuration

### FLOW-045: AI Chain Versioning Admin UI

| Property     | Value              |
| ------------ | ------------------ |
| **Priority** | High               |
| **Sprint**   | 14                 |
| **Category** | AI & Configuration |

**Routes (Sitemap)**:

- `/settings/ai` → [PG-128] Sprint 14
- `/settings/ai/versions` → Chain versions management
- `/settings/ai/experiments` → A/B testing
- `/settings/ai/budget` → Zep memory budget

**Key Artifacts**:

- `apps/web/src/app/(settings)/settings/ai/page.tsx`
- `apps/web/src/app/(settings)/settings/ai/components/ChainVersionsDashboard.tsx`
- `apps/web/src/app/(settings)/settings/ai/components/ChainVersionsTable.tsx`
- `apps/web/src/app/(settings)/settings/ai/components/ZepBudgetGauge.tsx`
- `apps/web/src/app/(settings)/settings/ai/components/VersionAuditLog.tsx`
- `apps/api/src/modules/chain-version/chain-version.router.ts` (IFC-086)

**Backend Dependencies (IFC-086)**:

- Chain version tRPC router with lifecycle management
- ChainVersionService for version orchestration
- ZepMemoryAdapter with persistence
- Zod validators for all inputs

---

## Search & AI

### FLOW-039: Document Search (FTS + Semantic)

| Property                | Value                 |
| ----------------------- | --------------------- |
| **Priority**            | Critical              |
| **Sprint**              | 12                    |
| **Category**            | Search/AI             |
| **Implementation Task** | **IFC-161** (Planned) |

**Routes (Sitemap)**:

- `/search` → Search results page [IFC-161]
- Header search bar → Global search [IFC-161]

**Key Artifacts**:

- `apps/ai-worker/src/services/retrieval-service.ts` (EXISTS - IFC-155)
- `apps/ai-worker/src/services/document-indexer.ts` (EXISTS - IFC-155)
- `apps/api/src/modules/search/search.router.ts` [IFC-161]
- `apps/web/src/components/search/SearchBar.tsx` [IFC-161]
- `apps/web/src/app/search/page.tsx` [IFC-161]

**Backend Dependencies (IFC-155)**:

- RetrievalService with FTS, semantic, and hybrid search
- DocumentIndexer with embedding generation
- ACL filtering enforced on all queries

**Implementation Tasks**:

- IFC-155: Backend retrieval service (COMPLETED)
- **IFC-161**: Search Router + Frontend UI (PLANNED - Sprint 12)

---

### FLOW-040: DSAR Data Erasure (GDPR Article 17)

| Property                | Value                  |
| ----------------------- | ---------------------- |
| **Priority**            | Critical               |
| **Sprint**              | 11-12                  |
| **Category**            | Seguranca e Compliance |
| **Implementation Task** | **IFC-162** (Planned)  |

**Routes (Sitemap)**:

- `/privacy/dsar` → DSAR request form [IFC-162]
- `/privacy/dsar/[requestId]` → Request status [IFC-162]

**Key Artifacts**:

- `apps/api/src/workflow/dsar-workflow.ts` (EXISTS - IFC-140)
- `apps/ai-worker/src/services/embedding-purge.service.ts` (EXISTS - IFC-155)
- `apps/api/src/modules/privacy/dsar.router.ts` [IFC-162]
- `apps/web/src/app/privacy/dsar/page.tsx` [IFC-162]

**Backend Dependencies (IFC-140, IFC-155)**:

- DSARWorkflow for erasure processing
- EmbeddingPurgeService for search index purge
- Legal hold enforcement
- Audit logging

**Implementation Tasks**:

- IFC-140: DSAR Workflow backend (IN PROGRESS)
- IFC-155: Embedding purge service (COMPLETED)
- **IFC-162**: Privacy Router + DSAR Form (PLANNED - Sprint 12)

---

### FLOW-044: Encryption Key Management

| Property     | Value                  |
| ------------ | ---------------------- |
| **Priority** | Critical               |
| **Sprint**   | 0-1                    |
| **Category** | Seguranca e Compliance |

**Routes (Sitemap)**:

- No direct UI routes (infrastructure service)
- `/admin/system` → Vault health status [AUTOMATION-002]

**Key Artifacts**:

- `artifacts/misc/vault-config.yaml` (EXISTS - EXC-SEC-001)
- `docs/security/zero-trust-design.md` (EXISTS - IFC-072)
- `apps/project-tracker/docs/metrics/sprint-0/.../EXC-SEC-001.json` (EXISTS)
- `packages/adapters/src/security/vault-client.ts` [PLANNED]
- `apps/api/src/middleware/encryption.ts` [PLANNED]
- `scripts/security/rotate-keys.sh` [PLANNED]

**Backend Dependencies (EXC-SEC-001, IFC-113)**:

- HashiCorp Vault v1.21.1 with Transit secrets engine
- AES-256-GCM data key, RSA-4096 key wrapping, Ed25519 signing
- Monthly auto-rotation with 5-version retention
- KV v2 for secret storage with version history

**Implementation Tasks**:

- EXC-SEC-001: Vault Setup (COMPLETED)
- IFC-072: Zero Trust Model (COMPLETED)
- IFC-113: Secrets Management (COMPLETED)
- Vault Client Adapter: (NOT STARTED)

---

### FLOW-041: Case RAG Retrieval (Agent Tool)

| Property                | Value                 |
| ----------------------- | --------------------- |
| **Priority**            | Critical              |
| **Sprint**              | 12-13                 |
| **Category**            | AI Assistant          |
| **Implementation Task** | **IFC-176** (Planned) |

**Routes (Sitemap)**:

- `/agent/chat` → Agent chat interface (PARTIAL)
- `/cases/[id]` → Case detail with RAG sidebar [IFC-176]

**Key Artifacts**:

- `packages/ai/tools/retrieve-case-context.ts` (EXISTS - IFC-156)
- `apps/ai-worker/src/services/retrieval-service.ts` (EXISTS - IFC-155)
- `apps/api/src/shared/prompt-sanitizer.ts` (EXISTS)
- `docs/agent/case-rag.md` (EXISTS - IFC-156)
- `apps/web/src/components/agent/CitationCard.tsx` [IFC-176]
- `apps/web/src/components/agent/SourcePreview.tsx` [IFC-176]
- `apps/web/src/components/agent/CitationHighlighter.tsx` [IFC-176]

**Backend Dependencies (IFC-156)**:

- RAG tool with citations and source tracing
- Prompt injection hardening
- ACL-constrained retrieval

**Implementation Tasks**:

- IFC-156: RAG retrieval tool (COMPLETED)
- IFC-155: Retrieval service backend (COMPLETED)
- **IFC-176**: Citation UI Components (PLANNED - Sprint 12)

**Implementation Status**: Backend COMPLETE, Frontend PARTIAL

---

## Dashboard

### FLOW-047: Authenticated Home Page

| Property     | Value     |
| ------------ | --------- |
| **Priority** | High      |
| **Sprint**   | 13-14     |
| **Category** | Dashboard |

**Routes (Sitemap)**:

- `/` → Authenticated home (when logged in) [PG-129]
- `/` → Public home (when visitor) [PG-001]

**Key Artifacts**:

- `apps/web/src/components/home/AuthenticatedHomePage.tsx` (EXISTS)
- `apps/web/src/components/home/PinnedItemsSheet.tsx` (EXISTS)
- `apps/web/src/components/home/PublicHomePage.tsx` (EXISTS)
- `apps/web/src/components/home/HomePageContent.tsx` (EXISTS)
- `docs/planning/prd-home-page.md` (EXISTS)
- `docs/specs/HOME-PAGE-SPEC.md` [PLANNED]
- `docs/planning/adr/ADR-027-authenticated-home-composition.md` [PLANNED]

**Backend Dependencies (IFC-182)**:

- Home router: dashboard stats, activity feed, AI insights, daily goals, pinned
  items
- AI insights engine for contextual recommendations
- Activity feed aggregation from all CRM entities

**Implementation Tasks**:

- IFC-182: Home Router Backend (IN PROGRESS)
- PG-129: Authenticated Home UI (PLANNED)
- PG-001: Public Home Page (PLANNED)
- IFC-069: Activity Feed (PLANNED)
- IFC-095: AI Insights Engine (PLANNED)

---

## Related Documents

- **Sitemap**: `docs/design/sitemap.md` - All application routes
- **Style Guide**: `docs/company/brand/style-guide.md` - Component patterns
- **Visual Identity**: `docs/company/brand/visual-identity.md` - Design tokens
- **Page Registry**: `docs/design/page-registry.md` - Detailed page specs
- **Sprint Plan**: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- **Accessibility**: `docs/company/brand/accessibility-patterns.md` - ARIA
  patterns
- **Do's and Don'ts**: `docs/company/brand/dos-and-donts.md` - Best practices
- **Gap Analysis**:
  `.specify/sprints/sprint-12/attestations/IFC-155/gap-analysis.md` -
  Implementation gaps
