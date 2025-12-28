# IntelliFlow CRM - Flow Index

> **Location**: `apps/project-tracker/docs/metrics/_global/flows/flow-index.md`
> **Last Updated**: 2025-12-27
> **Total Flows**: 38

This document serves as the master index linking all user flows to sitemap routes,
UI components, and style guide patterns.

---

## Quick Navigation

| Category | Flows | Sprint Range |
|----------|-------|--------------|
| [Acesso e Identidade](#acesso-e-identidade) | FLOW-001 to FLOW-004 | 1-2 |
| [Comercial Core](#comercial-core) | FLOW-005 to FLOW-010 | 1-5 |
| [Relacionamento e Suporte](#relacionamento-e-suporte) | FLOW-011 to FLOW-015 | 2-6 |
| [Comunicação](#comunicação) | FLOW-016 to FLOW-022 | 5-7 |
| [Analytics e Insights](#analytics-e-insights) | FLOW-023 to FLOW-028 | 5-9 |
| [Segurança e Compliance](#segurança-e-compliance) | FLOW-029 to FLOW-033 | 0-3 |
| [Qualidade e Testes](#qualidade-e-testes) | FLOW-034 to FLOW-038 | 2-4 |

---

## Acesso e Identidade

### FLOW-001: Login com Autenticação Multifator

| Property | Value |
|----------|-------|
| **Priority** | Critical |
| **Sprint** | 1 |
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

| Property | Value |
|----------|-------|
| **Priority** | High |
| **Sprint** | 1 |
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

| Property | Value |
|----------|-------|
| **Priority** | High |
| **Sprint** | 1 |
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

| Property | Value |
|----------|-------|
| **Priority** | Medium |
| **Sprint** | 2 |
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

| Property | Value |
|----------|-------|
| **Priority** | Critical |
| **Sprint** | 1 |
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

| Property | Value |
|----------|-------|
| **Priority** | Critical |
| **Sprint** | 4 |
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

| Property | Value |
|----------|-------|
| **Priority** | Critical |
| **Sprint** | 4 |
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

| Property | Value |
|----------|-------|
| **Priority** | Critical |
| **Sprint** | 4 |
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

| Property | Value |
|----------|-------|
| **Priority** | Critical |
| **Sprint** | 5 |
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

| Property | Value |
|----------|-------|
| **Priority** | High |
| **Sprint** | 5 |
| **Category** | Comercial Core |

**Routes (Sitemap)**:
- `/deals` → Renewal deals view
- `/accounts/[id]` → Renewal history

**Key Artifacts**:
- `apps/web/app/renewals/dashboard/page.tsx`
- `apps/api/src/services/renewal-identification.service.ts`
- `apps/ai-worker/src/chains/renewal-strategy.chain.ts`

---

## Relacionamento e Suporte

### FLOW-011: Abertura de Ticket de Suporte

| Property | Value |
|----------|-------|
| **Priority** | High |
| **Sprint** | 2 |
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

| Property | Value |
|----------|-------|
| **Priority** | High |
| **Sprint** | 5 |
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

| Property | Value |
|----------|-------|
| **Priority** | High |
| **Sprint** | 5 |
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

| Property | Value |
|----------|-------|
| **Priority** | High |
| **Sprint** | 4 |
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

| Property | Value |
|----------|-------|
| **Priority** | Medium |
| **Sprint** | 6 |
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

| Property | Value |
|----------|-------|
| **Priority** | High |
| **Sprint** | 5 |
| **Category** | Comunicação |

**Routes (Sitemap)**:
- Email composer modal (from contacts, leads, deals)

**Key Artifacts**:
- `apps/web/components/email/composer.tsx`
- `apps/api/src/services/tracking-pixel.service.ts`
- `apps/api/src/services/email-deliverer.service.ts`

---

### FLOW-017: Integração de Chat Bidirecional

| Property | Value |
|----------|-------|
| **Priority** | Medium |
| **Sprint** | 5 |
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

| Property | Value |
|----------|-------|
| **Priority** | Medium |
| **Sprint** | 5 |
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

| Property | Value |
|----------|-------|
| **Priority** | Medium |
| **Sprint** | 5 |
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

| Property | Value |
|----------|-------|
| **Priority** | High |
| **Sprint** | 5 |
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

| Property | Value |
|----------|-------|
| **Priority** | High |
| **Sprint** | 5 |
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

### FLOW-030: Backup e Disaster Recovery

| Property | Value |
|----------|-------|
| **Priority** | Critical |
| **Sprint** | 0 |
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

| Property | Value |
|----------|-------|
| **Priority** | High |
| **Sprint** | 2 |
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

| Route Pattern | Primary Flows | Category |
|---------------|---------------|----------|
| `/login`, `/forgot-password`, `/reset-password` | FLOW-001, FLOW-003 | Acesso e Identidade |
| `/admin/users`, `/admin/roles` | FLOW-002 | Acesso e Identidade |
| `/workspaces`, header dropdown | FLOW-004 | Acesso e Identidade |
| `/leads`, `/leads/new` | FLOW-005 | Comercial Core |
| `/leads/[id]` (convert) | FLOW-006 | Comercial Core |
| `/deals` (Kanban) | FLOW-007 | Comercial Core |
| `/deals/new`, `/deals/[id]` | FLOW-008 | Comercial Core |
| `/deals/[id]` (close) | FLOW-009 | Comercial Core |
| `/renewals`, `/accounts/[id]` | FLOW-010 | Comercial Core |
| `/tickets`, `/tickets/new` | FLOW-011 | Relacionamento e Suporte |
| `/tickets/[id]` (routing) | FLOW-012 | Relacionamento e Suporte |
| `/tickets/[id]` (SLA) | FLOW-013 | Relacionamento e Suporte |
| `/tickets/[id]` (resolve) | FLOW-014 | Relacionamento e Suporte |
| `/survey/*`, NPS dashboard | FLOW-015 | Relacionamento e Suporte |
| Email composer | FLOW-016 | Comunicação |
| `/support/chat`, chat widget | FLOW-017 | Comunicação |
| Call logging | FLOW-018 | Comunicação |
| Meeting scheduler | FLOW-019 | Comunicação |
| `/contacts/[id]` (timeline) | FLOW-020 | Comunicação |
| `/cases/timeline` | FLOW-020 | Comunicação |
| `/reports/builder` | FLOW-023 | Analytics e Insights |
| `/ops/monitoring` (backup) | FLOW-030 | Segurança e Compliance |
| `/ops/monitoring` (perf) | FLOW-038 | Qualidade e Testes |

---

## Related Documents

- **Sitemap**: `docs/design/sitemap.md` - All application routes
- **Style Guide**: `docs/company/brand/style-guide.md` - Component patterns
- **Visual Identity**: `docs/company/brand/visual-identity.md` - Design tokens
- **Page Registry**: `docs/design/page-registry.md` - Detailed page specs
- **Sprint Plan**: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- **Accessibility**: `docs/company/brand/accessibility-patterns.md` - ARIA patterns
- **Do's and Don'ts**: `docs/company/brand/dos-and-donts.md` - Best practices
