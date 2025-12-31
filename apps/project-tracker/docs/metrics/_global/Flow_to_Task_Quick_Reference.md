# 🔗 Flow-to-Task Reference

| Flow ID    | Flow Name                           | Primary Tasks                                                 | Key Artifacts                                                                                                           | Sprint |
| ---------- | ----------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------ |
| FLOW-001   | Login com Autenticação Multifator   | IFC-001, IFC-002, IFC-003                                     | `apps/web/app/login/page.tsx`<br>`apps/api/src/routers/auth.router.ts`<br>`apps/web/middleware.ts`                      | 1      |
| FLOW-002   | Gestão de Usuários e Permissões     | IFC-004, IFC-005, IFC-006                                     | `apps/api/src/routers/users.router.ts`<br>`apps/web/app/admin/users/page.tsx`                                           | 1      |
| FLOW-003   | Recuperação de Senha                | IFC-007, IFC-008                                              | `apps/api/src/routers/auth.router.ts`<br>`apps/web/components/auth/forgot-password.tsx`                                 | 1      |
| FLOW-004   | Troca de Tenant/Workspace           | IFC-009, IFC-010                                              | `apps/web/components/workspace/selector.tsx`<br>`apps/api/src/services/tenant.service.ts`                               | 2      |
| FLOW-005   | Criação de Novo Lead                | IFC-013, IFC-014, IFC-089                                     | `apps/api/src/modules/crm/leads.router.ts`<br>`apps/web/app/(crm)/leads/new/page.tsx`                                   | 1      |
| FLOW-005-A | Lead Capture & Validation           | IFC-089                                                       | `apps/api/src/modules/crm/contacts.router.ts`<br>`apps/web/components/leads/create-lead-modal.tsx`                      | 5      |
| FLOW-005-B | Lead API Backend                    | IFC-013                                                       | `apps/api/src/modules/crm/leads.router.ts`<br>`apps/api/src/trpc.ts`                                                    | 6      |
| FLOW-005-C | Lead Management UI                  | IFC-014                                                       | `apps/web/app/(crm)/leads/new/page.tsx`<br>                                    | 7      |
| FLOW-006   | Conversão Lead para Contato e Deal  | IFC-089, IFC-064, IFC-065                                     | `apps/api/src/modules/crm/contacts.router.ts`<br>`apps/web/app/(crm)/contacts/page.tsx`                                 | 4      |
| FLOW-007   | Gestão de Pipeline Kanban           | IFC-069, IFC-070, IFC-071                                     | `apps/web/app/(crm)/accounts/page.tsx`<br>`apps/web/components/shared/account-list.tsx`                                 | 4      |
| FLOW-008   | Criação e Atualização de Deal       | IFC-091, IFC-073, IFC-076                                     | `apps/api/src/modules/crm/deals.router.ts`<br>`apps/web/app/(crm)/pipeline/page.tsx`                                    | 4      |
| FLOW-009   | Fechamento de Deal Won/Lost         | IFC-081, IFC-082, IFC-105                                     | `apps/web/app/(crm)/tasks/page.tsx`<br>`apps/web/components/tasks/task-form.tsx`                                        | 5      |
| FLOW-010   | Renovação de Contrato               | IFC-094, IFC-089, IFC-090                                     | `apps/web/app/(crm)/documents/page.tsx`<br>`artifacts/reports/e-signature-test.pdf`                                     | 5      |
| FLOW-010-A | Renewal Preparation                 | IFC-089                                                       | `apps/api/src/modules/crm/contacts.router.ts`<br>`apps/web/components/contracts/renewal-detection.tsx`                  | 5      |
| FLOW-010-B | Renewal Engagement                  | IFC-090                                                       | `apps/web/app/(crm)/contacts/page.tsx`<br>`apps/web/components/contracts/renewal-proposals.tsx`                         | 6      |
| FLOW-010-C | Renewal Execution                   | IFC-094                                                       | `apps/web/app/(crm)/documents/page.tsx`<br>`artifacts/reports/e-signature-test.pdf`                                     | 8      |
| FLOW-011   | Abertura de Ticket de Suporte       | IFC-005                                                       | `apps/ai-worker/src/chains/scoring.chain.ts`<br>`apps/api/src/shared/scoring-output-schema.zod.ts`                      | 2      |
| FLOW-012   | Roteamento Automático de Tickets    | IFC-084, IFC-085                                              | `apps/web/app/(crm)/emails/page.tsx`<br>`apps/web/components/emails/email-composer.tsx`                                 | 5      |
| FLOW-013   | Gestão de SLA e Escalation          | IFC-086, IFC-087                                              | `apps/api/src/services/sla-monitor.service.ts`<br>`apps/web/components/sla/status-indicators.tsx`                       | 5      |
| FLOW-014   | Resolução e Fechamento de Ticket    | IFC-088, IFC-089                                              | `apps/api/src/services/solution-implementer.service.ts`<br>`apps/web/components/tickets/solution-builder.tsx`           | 4      |
| FLOW-015   | Coleta e Análise de Feedback        | IFC-090                                                       | `apps/api/src/services/feedback-analyzer.service.ts`<br>`apps/web/components/feedback/survey-form.tsx`                  | 6      |
| FLOW-016   | Envio de Email com Tracking         | IFC-092, IFC-093                                              | `apps/api/src/services/email-tracker.service.ts`<br>`apps/web/components/emails/tracking-dashboard.tsx`                 | 5      |
| FLOW-017   | Integração de Chat Bidirecional     | IFC-094, IFC-095                                              | `apps/api/src/integrations/whatsapp.service.ts`<br>`apps/web/components/chat/agent-interface.tsx`                       | 5      |
| FLOW-018   | Registro de Chamadas Telefônicas    | IFC-096, IFC-097                                              | `apps/api/src/integrations/voip.service.ts`<br>`apps/web/components/phone/dialer.tsx`                                   | 5      |
| FLOW-019   | Agendamento de Reuniões             | IFC-098, IFC-099                                              | `apps/api/src/integrations/calendar.service.ts`<br>`apps/web/components/calendar/meeting-scheduler.tsx`                 | 5      |
| FLOW-020   | Feed de Atividade Unificado         | IFC-100, IFC-101                                              | `apps/api/src/services/activity-feed.service.ts`<br>`apps/web/components/activity/unified-feed.tsx`                     | 5      |
| FLOW-021   | Gestão de Documentos                | IFC-102, IFC-103                                              | `apps/api/src/services/document-manager.service.ts`<br>`apps/web/components/documents/upload-wizard.tsx`                | 5      |
| FLOW-022   | Dashboard Executivo                 | IFC-104, IFC-105                                              | `apps/api/src/services/dashboard-aggregator.service.ts`<br>`apps/web/app/dashboard/page.tsx`                            | 5      |
| FLOW-023   | Construtor de Relatórios            | IFC-106, IFC-107                                              | `apps/api/src/services/report-builder.service.ts`<br>`apps/web/components/reports/builder-canvas.tsx`                   | 5      |
| FLOW-024   | Insights com IA                     | IFC-108, IFC-109                                              | `apps/ai-worker/src/chains/insights.chain.ts`<br>`apps/web/components/insights/ai-recommendations.tsx`                  | 5      |
| FLOW-025   | Construtor de Workflows             | IFC-110, IFC-111                                              | `apps/api/src/services/workflow-builder.service.ts`<br>`apps/web/components/workflows/visual-builder.tsx`               | 6      |
| FLOW-026   | Execução de Workflows               | IFC-112, IFC-113                                              | `apps/api/src/engines/workflow-executor.engine.ts`<br>`apps/web/components/workflows/execution-monitor.tsx`             | 6      |
| FLOW-027   | Engine de Regras de Negócio         | IFC-114, IFC-115                                              | `apps/api/src/engines/rule-engine.ts`<br>`apps/web/components/rules/rule-builder.tsx`                                   | 6      |
| FLOW-028   | Sistema de Auditoria e Logs         | IFC-116, IFC-117                                              | `apps/api/src/services/audit-logger.service.ts`<br>`apps/web/components/audit/search-interface.tsx`                     | 0      |
| FLOW-029   | Gestão de Acesso e Permissões       | IFC-118, IFC-119                                              | `apps/api/src/services/access-manager.service.ts`<br>`apps/web/components/admin/permissions-matrix.tsx`                 | 0      |
| FLOW-030   | Backup e Disaster Recovery          | IFC-120, IFC-121                                              | `infra/backup/automated-backup.sh`<br>`apps/api/src/services/backup-manager.service.ts`                                 | 0      |
| FLOW-031   | Health Checks e Monitoramento       | IFC-122, IFC-123                                              | `apps/api/src/services/health-checker.service.ts`<br>`infra/monitoring/health-dashboard.yml`                            | 0      |
| FLOW-032   | Distributed Tracing                 | IFC-124, IFC-125                                              | `apps/api/src/middleware/tracing.middleware.ts`<br>`infra/tracing/jaeger-config.yml`                                    | 1      |
| FLOW-033   | Application Performance Monitoring  | IFC-126, IFC-127                                              | `apps/infra/apm/datadog-agent.yml`<br>`apps/api/src/services/performance-monitor.service.ts`                            | 1      |
| FLOW-034   | Webhooks e Integrações Event-Driven | IFC-128, IFC-129                                              | `apps/api/src/webhooks/event-webhook.handler.ts`<br>`apps/api/src/services/webhook-manager.service.ts`                  | 2      |
| FLOW-035   | Rate Limiting e Gestão de Quotas    | IFC-130, IFC-131, IFC-077                                     | `apps/api/src/middleware/rate-limiter.middleware.ts`<br>`apps/api/src/services/quota-manager.service.ts`                | 4      |
| FLOW-041   | Documentation Infrastructure        | IFC-079, IFC-080                                              | `docs/docusaurus.config.js`<br>`docs/sidebars.js`<br>`docs/templates/`                                                  | 7      |
| FLOW-036   | Versionamento de APIs               | IFC-132, IFC-133                                              | `apps/api/src/versioning/version-strategy.ts`<br>`apps/api/src/middleware/version-middleware.ts`                        | 2      |
| FLOW-037   | Testes Automatizados                | IFC-134, IFC-135                                              | `apps/web/vitest.config.ts`<br>`apps/api/src/tests/unit/`                                                               | 0      |
| FLOW-038   | Testes de Performance e Load        | IFC-136, IFC-137                                              | `infra/performance/test-scripts/`<br>`apps/infra/performance/load-generators/`                                          | 2      |
| FLOW-039   | Domain Architecture Foundation      | IFC-101, IFC-102, IFC-103, IFC-104, IFC-105, IFC-106, IFC-107 | `packages/domain/src/aggregates/`<br>`packages/adapters/src/repositories/`<br>`docs/architecture/hex-boundaries.md`     | 1      |
| FLOW-040   | Infrastructure Foundation           | IFC-072, IFC-073, IFC-074, IFC-085                            | `docs/security/zero-trust-design.md`<br>`docs/security/owasp-checklist.md`<br>`infra/monitoring/`<br>`infra/ai/ollama/` | 0      |

---

## ⚠️ Important: Architecture vs User Flows

**FLOW-039, FLOW-040, FLOW-041** are **NOT user-facing flows**. They are
**architectural phases** that document internal implementation patterns.

| ID       | Type         | Description                                         | Documentation Location                                    |
| -------- | ------------ | --------------------------------------------------- | --------------------------------------------------------- |
| FLOW-039 | Architecture | Domain Architecture (DDD, aggregates, repositories) | `docs/planning/adr/ADR-002-domain-driven-design.md`       |
| FLOW-040 | Architecture | Infrastructure (zero-trust, monitoring, security)   | `docs/security/zero-trust-design.md`, `infra/monitoring/` |
| FLOW-041 | Architecture | Documentation Infrastructure                        | `docs/docusaurus.config.js`, `docs/templates/`            |

**Do NOT create new FLOW-039/040/041.md files** - these are documented in ADRs
and infrastructure docs.

Tasks that reference `IMPLEMENTS:FLOW-039` in the CSV refer to the **PHASE-039**
pattern for domain aggregates, not a user flow specification.

---

## 🎯 Implementation Priority Order

### Sprint 0 (Foundation & Security)

1. **FLOW-001** → IFC-001 (Authentication)
2. **FLOW-003** → IFC-007 (Password Recovery)
3. **FLOW-040** → IFC-072, IFC-073, IFC-074, IFC-085 (Infrastructure Foundation)
4. **FLOW-028** → IFC-116 (Audit & Logs)
5. **FLOW-029** → IFC-118 (Access Management)
6. **FLOW-030** → IFC-120 (Backup & Recovery)
7. **FLOW-031** → IFC-122 (Health Monitoring)
8. **FLOW-037** → IFC-134 (Automated Testing)

### Sprint 1 (Core CRM)

9. **FLOW-002** → IFC-004 (User Management)
10. **FLOW-039** → IFC-101, IFC-102, IFC-103, IFC-104, IFC-105, IFC-106, IFC-107
    (Domain Architecture)
11. **FLOW-005-A** → IFC-089 (Lead Capture)
12. **FLOW-006** → IFC-089 (Contact Management)
13. **FLOW-007** → IFC-069 (Account Management)
14. **FLOW-008** → IFC-091 (Deal Management)
15. **FLOW-011** → IFC-005 (Support Tickets)
16. **FLOW-012** → IFC-084 (Ticket Routing)
17. **FLOW-013** → IFC-086 (SLA Management)
18. **FLOW-014** → IFC-088 (Ticket Resolution)
19. **FLOW-016** → IFC-092 (Email Integration)
20. **FLOW-020** → IFC-100 (Activity Feed)
21. **FLOW-021** → IFC-102 (Document Management)
22. **FLOW-022** → IFC-104 (Executive Dashboard)
23. **FLOW-032** → IFC-124 (Distributed Tracing)
24. **FLOW-033** → IFC-126 (Performance Monitoring)
25. **FLOW-035** → IFC-130, IFC-077 (Rate Limiting)

### Sprint 2 (Enhancement & Communication)

24. **FLOW-004** → IFC-009 (Workspace Switching)
25. **FLOW-009** → IFC-081 (Deal Closure)
26. **FLOW-017** → IFC-094 (Chat Integration)
27. **FLOW-018** → IFC-096 (Call Logging)
28. **FLOW-019** → IFC-098 (Meeting Scheduling)
29. **FLOW-023** → IFC-106 (Report Builder)
30. **FLOW-024** → IFC-108 (AI Insights)
31. **FLOW-034** → IFC-128 (Webhooks)
32. **FLOW-036** → IFC-132 (API Versioning)
33. **FLOW-038** → IFC-136 (Load Testing)

### Sprint 3 (Intelligence & Automation)

34. **FLOW-025** → IFC-110 (Workflow Builder)
35. **FLOW-026** → IFC-112 (Workflow Execution)
36. **FLOW-027** → IFC-114 (Business Rules Engine)

### Sprint 5 (Advanced CRM Features)

37. **FLOW-005-A** → IFC-089 (Lead Capture)
38. **FLOW-010-A** → IFC-089 (Renewal Preparation)
39. **FLOW-009** → IFC-081 (Deal Closure)
40. **FLOW-015** → IFC-090 (Feedback Collection)

### Sprint 6 (Enhanced User Experience)

41. **FLOW-005-B** → IFC-013 (Lead API Backend)
42. **FLOW-010-B** → IFC-090 (Renewal Engagement)
43. **FLOW-006** → IFC-064 (Lead Conversion)
44. **FLOW-007** → IFC-070 (Pipeline Management)
45. **FLOW-008** → IFC-073 (Deal Management)
46. **FLOW-015** → IFC-090 (Feedback Collection)

### Sprint 7 (Advanced UI Components)

47. **FLOW-005-C** → IFC-014 (Lead Management UI)
48. **FLOW-041** → IFC-079, IFC-080 (Documentation Infrastructure)

### Sprint 8 (Document & Contract Management)

49. **FLOW-010-C** → IFC-094 (Renewal Execution)

## 📍 Artifact Location Patterns

### API Layer

```
apps/api/src/modules/crm/{entity}.router.ts
apps/api/src/modules/ai/{feature}.router.ts
apps/api/src/modules/communication/{feature}.router.ts
```

### Web Layer

```
apps/web/app/(crm)/{entity}/page.tsx
apps/web/app/(crm)/{entity}/new/page.tsx
apps/web/components/{entity}/{component}.tsx
```

### Validation Layer

```
packages/validators/src/{entity}.schema.ts
```

### AI Worker Layer

```
apps/ai-worker/src/chains/{feature}.chain.ts
```

## 📊 Summary Statistics

- **Total Flows**: 38 (100% coverage)
- **Sprint 0**: 7 flows (Foundation & Security)
- **Sprint 1**: 16 flows (Core CRM)
- **Sprint 2**: 12 flows (Enhancement & Communication)
- **Sprint 3**: 3 flows (Intelligence & Automation)

## 🏷️ Contract Tags Reference

Contract tags are used in Sprint_plan.csv to enforce deterministic validation of
task requirements.

### Pre-requisites Column Tags

| Tag           | Purpose                             | Example                             |
| ------------- | ----------------------------------- | ----------------------------------- |
| `FILE:`       | Exact file path required to exist   | `FILE:docs/planning/adr/ADR-001.md` |
| `DIR:`        | Directory required to exist         | `DIR:packages/domain/src/`          |
| `ENV:`        | Environment configuration required  | `ENV:Supabase configured`           |
| `POLICY:`     | Policy or approval required         | `POLICY:Budget approved`            |
| `GLOB:`       | Wildcard pattern (multiple files)   | `GLOB:apps/api/**/*.router.ts`      |
| `IMPLEMENTS:` | **References user flow (FLOW-XXX)** | `IMPLEMENTS:FLOW-001`               |

### Artifacts To Track Column Tags

| Tag         | Purpose                   | Example                                                   |
| ----------- | ------------------------- | --------------------------------------------------------- |
| `ARTIFACT:` | File that must be created | `ARTIFACT:apps/web/app/login/page.tsx`                    |
| `EVIDENCE:` | Governance evidence file  | `EVIDENCE:artifacts/attestations/PG-015/context_ack.json` |

### Validation Method Column Tags

| Tag         | Purpose                       | Example                  |
| ----------- | ----------------------------- | ------------------------ |
| `VALIDATE:` | Command to run for validation | `VALIDATE:pnpm test`     |
| `AUDIT:`    | Manual or tool audit required | `AUDIT:manual-review`    |
| `GATE:`     | Quality gate that must pass   | `GATE:lighthouse-gte-90` |

### IMPLEMENTS: Tag Details

The `IMPLEMENTS:` tag links tasks to user flows:

- **Format**: `IMPLEMENTS:FLOW-XXX` (e.g., `IMPLEMENTS:FLOW-001`)
- **Location**: Pre-requisites column in Sprint_plan.csv
- **Validation**: Parser checks that referenced FLOW-XXX.md file exists
- **Purpose**: Ensures implementation follows the detailed user journey defined
  in the flow

**Example Tasks with IMPLEMENTS:**

- `PG-015` (Sign In) → `IMPLEMENTS:FLOW-001`
- `PG-021` (MFA Setup) → `IMPLEMENTS:FLOW-001`
- `PG-058` (Dashboard) → `IMPLEMENTS:FLOW-002`
- `PG-059` (Leads List) → `IMPLEMENTS:FLOW-003`

---

## ✅ Quick Validation

- [x] Each task references its flow via IMPLEMENTS: tag
- [ ] Artifacts created in CSV-expected locations
- [ ] Flow specifications drive implementation
- [ ] Dependencies properly mapped
- [ ] Validation methods match CSV requirements</content>
      <parameter name="filePath">c:\taly\intelliFlow-CRM\apps\project-tracker\docs\metrics_global\Flow_to_Task_Quick_Reference.md
