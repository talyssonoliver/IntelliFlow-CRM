### 3.1 Abertura de Ticket (via contato ou portal)

**Cenário**: Cliente encontra problema e abre ticket através do portal de
suporte.

**Especificações Técnicas**:

```yaml
id: FLOW-011
name: Abertura de Ticket de Suporte
category: Relacionamento e Suporte
priority: High
sprint: 2

actors:
  - Cliente/Usuário
  - Agente de Suporte
  - Sistema de IA
  - Sistema de Roteamento

pre_conditions:
  - Cliente identificado/autenticado
  - Canal de entrada configurado
  - SLAs definidos
  - Agentes disponíveis

flow_steps:
  1_ticket_entry_channels:
    description: "Canais de entrada de ticket"
    customer_portal:
      - Login required
      - Pre-populated user data
      - Category selection
      - Priority self-assessment
      - File attachments
    email_integration:
      - Support email parsing
      - Auto-ticket creation
      - Sender verification
      - Thread management
      - Attachment handling
    api_webhooks:
      - External system integration
      - Automated ticket creation
      - Data mapping
      - Validation rules
      - Error handling
    chat_bots:
      - AI-powered triage
      - Self-service options
      - Escalation to human
      - Context preservation
      - Satisfaction surveys
    artifacts:
      - apps/web/app/support/portal/page.tsx
      - apps/api/src/routers/ticket-creation.router.ts
      - apps/api/src/services/email-parser.service.ts

  2_ticket_categorization:
    description: "Categorização automática"
    ai_categorization:
      - Natural language processing
      - Intent classification
      - Sentiment analysis
      - Urgency detection
      - Language identification
    rule_based_categorization:
      - Keyword matching
      - Pattern recognition
      - Source-based routing
      - Time-based priority
      - Business rules application
    manual_override:
      - Agent review capability
      - Category correction
      - Priority adjustment
      - Tag management
      - Custom field updates
    artifacts:
      - apps/ai-worker/src/chains/ticket-categorization.chain.ts
      - apps/api/src/services/categorization.service.ts
      - apps/api/src/rules/ticket-routing.rules.ts

  3_priority_assignment:
    description: "Atribuição de prioridade"
    priority_matrix:
      - Critical: System down, data loss
      - High: Major feature broken
      - Medium: Feature request, minor bug
      - Low: General question, enhancement
    ai_priority_boost:
      - Customer value assessment
      - Business impact analysis
      - Historical resolution time
      - Support history review
      - SLA consideration
    vip_customer_handling:
      - Account tier recognition
      - Priority escalation
      - Dedicated agent assignment
      - Fast-track processing
      - Executive notification
    artifacts:
      - apps/api/src/services/priority-calculator.service.ts
      - apps/api/src/models/priority-matrix.model.ts
      - apps/api/src/services/vip-detection.service.ts

edge_cases:
  - spam_detection: "Content filtering and blocking"
  - duplicate_tickets: "Similarity matching and merging"
  - language_barriers: "Translation services integration"
  - attachment_issues: "File validation and virus scanning"
  - authentication_failures: "Guest ticket creation with verification"

technical_artifacts:
  performance:
    - ticket_creation_time: <3s
    - categorization_accuracy: >85%
    - priority_assignment: <1s

  scalability:
    - concurrent_users: 1000+
    - ticket_volume: 10k/day
    - attachment_size: 50MB max
    - api_rate_limits: 100/minute

  integrations:
    - email_providers: Gmail, Outlook
    - chat_platforms: Intercom, Zendesk
    - monitoring: DataDog, New Relic

success_metrics:
  - first_response_time: <2h for high priority
  - customer_satisfaction: >4.2/5
  - resolution_time: <24h average
  - automation_rate: >60%
```

**Cenário**: Gabriela, cliente, reporta problema crítico no sistema às 22h.

**Passos Detalhados**:

```yaml
1. Canais de Entrada:
  - Email para support@
  - Portal self-service
  - Widget in-app
  - WhatsApp Business

2. Captura de Informações:
  - Assunto e descrição
  - Categoria (Bug/Question/Feature)
  - Prioridade (cliente sugere)
  - Screenshots/vídeos
  - Ambiente afetado

3. Auto-Classificação:
  - NLP analisa conteúdo
  - Urgência detectada
  - Categoria confirmada
  - SLA atribuído

4. Criação e Roteamento:
  - Ticket ID gerado
  - Cliente notificado
  - Fila apropriada
  - Owner assigned

5. Enriquecimento:
  - Conta vinculada
  - Histórico carregado
  - Contratos ativos
  - Health score
```

**Edge Cases**:

- Cliente não encontrado → Criar lead
- Anexo muito grande → Upload alternativo
- Múltiplos problemas → Split tickets

**Sistemas**:

- `apps/web/app/portal/ticket/new/page.tsx`
- `apps/api/src/tickets/intake.service.ts`
- `apps/ai-worker/src/nlp/classifier.ts`
