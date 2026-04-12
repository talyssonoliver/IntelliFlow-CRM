### 2.1 Criação de Novo Lead

**Cenário**: Ana, SDR, captura lead quente de webinar e precisa cadastrar
rapidamente.

**Passos Detalhados**:

```yaml
1. Acesso Rápido:
  - Hotkey "L" ou botão "New Lead"
  - Modal ou página dedicada
  - Auto-focus no primeiro campo

2. Informações Básicas:
  - Nome* e Sobrenome
  - Email* (validação em tempo real)
  - Empresa (autocomplete de DB)
  - Telefone (máscara internacional)
  - Origem: Webinar Q3 2024

3. Enriquecimento Automático:
  - Email → domínio → empresa
  - API Clearbit/Hunter enriquece
  - LinkedIn scraping (se permitido)
  - Timezone detectado

4. AI Scoring Inicial:
  - Queue para LangChain scoring
  - Score provisório em 2s
  - Confidence level mostrado
  - Sugestão de próxima ação

5. Atribuição e Follow-up:
  - Auto-assign por regras (round-robin)
  - Task criada: 'Contact in 1h'
  - Email de boas-vindas queued
  - Notificação ao owner
```

**Edge Cases**:

- Email duplicado → Merge prompt
- Empresa não encontrada → Create new
- API enrichment falha → Campos manuais
- Score indisponível → Default médio

**Sistemas Envolvidos**:

- `apps/web/app/leads/new/page.tsx`
- `apps/api/src/leads/lead.service.ts`
- `apps/ai-worker/src/scoring/lead-scorer.ts`
- BullMQ job queue

**Especificações Técnicas**:

```yaml
id: FLOW-005
name: Criação de Novo Lead
category: Comercial Core
priority: Critical
sprint: 1

actors:
  - Sales Rep
  - Marketing (via form)
  - Sistema AI Scoring
  - Automation Engine

pre_conditions:
  - Usuário com permissão lead:create
  - Workspace selecionado
  - Dados mínimos do lead

flow_steps:
  1_lead_capture_methods:
    description: "Múltiplas formas de captura"
    channels:
      manual_entry:
        - UI: "+ New Lead" button
        - Form: Quick vs Detailed
        - Import: CSV/Excel upload
      automated:
        - Web forms (embedded)
        - API webhook
        - Email parser
        - Chat/WhatsApp
        - Social media
    artifacts:
      - apps/web/components/leads/create-lead-modal.tsx
      - apps/web/components/leads/import-wizard.tsx
      - apps/api/src/routers/lead-capture.router.ts

  2_data_validation:
    description: "Validação e enriquecimento"
    required_fields:
      - email OR phone
      - source (auto-detected)
      - workspace_id
    optional_fields:
      - name (parsed from email)
      - company (domain lookup)
      - job_title
      - location
      - notes
    enrichment:
      - Email validation service
      - Company data (Clearbit)
      - Social profiles
      - Technology stack
    artifacts:
      - packages/validators/src/lead.schema.ts
      - apps/api/src/services/lead-enrichment.service.ts
      - apps/api/src/integrations/clearbit.ts

  3_duplicate_detection:
    description: "Detecção de duplicatas"
    matching_rules:
      - Exact email match
      - Phone normalization + match
      - Company + name fuzzy match
      - Domain + similar name
    merge_options:
      - Update existing
      - Create new
      - Merge fields
      - Link as related
    ui_feedback:
      - Show potential matches
      - Highlight differences
      - Suggest action
    artifacts:
      - apps/api/src/services/deduplication.service.ts
      - apps/web/components/leads/duplicate-handler.tsx
      - packages/algorithms/src/fuzzy-match.ts

  4_ai_scoring_pipeline:
    description: "Pontuação com IA"
    data_points:
      - Explicit: form fields
      - Implicit: behavior data
      - Enriched: 3rd party data
      - Historical: similar leads
    scoring_process:
      - Queue job in BullMQ
      - Aggregate data points
      - Run through LangChain
      - Calculate confidence
      - Generate insights
    output:
      - Score: 0-100
      - Confidence: 0-1
      - Factors: top 5 reasons
      - Recommendations: next actions
    artifacts:
      - apps/ai-worker/src/chains/lead-scoring.chain.ts
      - apps/ai-worker/src/models/scoring.model.ts
      - apps/api/src/queues/scoring.queue.ts

  5_assignment_routing:
    description: "Roteamento inteligente"
    routing_rules:
      - Round-robin: equal distribution
      - Score-based: high scores to seniors
      - Geographic: by territory
      - Skill-based: industry expertise
      - Capacity: current workload
    notifications:
      - Email to assigned rep
      - Desktop/mobile push
      - Slack/Teams message
      - In-app notification
    sla_start:
      - Clock starts on assignment
      - Grace period: 15 min
      - First response: 1 hour
    artifacts:
      - apps/api/src/services/lead-routing.service.ts
      - apps/api/src/rules/assignment.rules.ts
      - apps/api/src/events/lead-assigned.event.ts

  6_initial_actions:
    description: "Ações automáticas iniciais"
    automated_tasks:
      - Welcome email (if score > 70)
      - Calendar link (if requested demo)
      - Slack notification to team
      - Add to nurture sequence
      - Schedule follow-up task
    ai_recommendations:
      - Best time to contact
      - Suggested talking points
      - Relevant case studies
      - Competitor mentions
      - Objection handling
    artifacts:
      - apps/api/src/workflows/new-lead.workflow.ts
      - apps/api/src/services/task-automation.service.ts
      - apps/ai-worker/src/agents/recommendation.agent.ts

edge_cases:
  - api_limit_exceeded: "Queue for delayed processing"
  - enrichment_failure: "Proceed with available data"
  - no_available_rep: "Assign to manager queue"
  - duplicate_simultaneous: "Lock + merge carefully"
  - invalid_email_format: "Parse and suggest corrections"

technical_artifacts:
  performance:
    - lead_creation_time: <500ms
    - enrichment_timeout: 3s
    - scoring_completion: <5s

  scalability:
    - bulk_import: 10k leads/minute
    - api_rate_limit: 1000/minute
    - queue_capacity: 100k jobs

  data_quality:
    - validation_rules: 15 checks
    - enrichment_rate: >80%
    - duplicate_prevention: >95%

success_metrics:
  - lead_capture_rate: >95%
  - scoring_accuracy: >85%
  - assignment_time: <2min
  - data_completeness: >70%
```
