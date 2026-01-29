### 2.2 Conversão de Lead → Contato + Deal

**Cenário**: Lead qualificado precisa ser convertido em contato oficial e
oportunidade de venda.

**Especificações Técnicas**:

```yaml
id: FLOW-006
name: Conversão Lead para Contato e Deal
category: Comercial Core
priority: Critical
sprint: 4

actors:
  - Sales Rep
  - Sales Manager
  - AI Assistant
  - Notification System

pre_conditions:
  - Lead qualificado (score > 60)
  - Informações mínimas preenchidas
  - Usuário com permissão lead:convert

flow_steps:
  1_qualify_decision:
    description: 'Decisão de qualificação'
    ui_triggers:
      - Button "Convert Lead" na página do lead
      - Bulk action em lista
      - Auto-trigger por score
      - Via workflow automation
    qualification_check:
      - Required fields filled
      - Score threshold met
      - Manager approval (if needed)
      - No blockers/flags
    artifacts:
      - apps/web/components/leads/convert-button.tsx
      - apps/web/components/leads/qualification-modal.tsx

  2_conversion_wizard:
    description: 'Wizard de conversão'
    step_1_contact:
      title: 'Create/Update Contact'
      fields:
        - Company name (required)
        - Contact role/title
        - Additional contacts
        - Parent company
      actions:
        - Search existing companies
        - Create new company
        - Link to parent
    step_2_opportunity:
      title: 'Create Opportunity'
      fields:
        - Deal name (auto-suggested)
        - Pipeline selection
        - Initial stage
        - Estimated value
        - Expected close date
        - Probability %
      ai_assist:
        - Suggest deal size
        - Predict close date
        - Recommend products
    step_3_tasks:
      title: 'Next Actions'
      auto_tasks:
        - Schedule discovery call
        - Send proposal
        - Technical assessment
        - Contract preparation
      custom_tasks:
        - Add manual tasks
        - Assign to team
        - Set due dates
    artifacts:
      - apps/web/components/conversion/conversion-wizard.tsx
      - apps/web/components/conversion/step-*.tsx
      - apps/api/src/services/conversion.service.ts

  3_data_transformation:
    description: 'Transformação dos dados'
    contact_creation:
      - Map lead → contact fields
      - Preserve all history
      - Maintain relationships
      - Transfer attachments
      - Keep source tracking
    company_handling:
      - Create if not exists
      - Update if exists
      - Handle subsidiaries
      - Industry classification
      - Size/revenue data
    deal_initialization:
      - Generate deal name
      - Set initial stage
      - Calculate probability
      - Create timeline
      - Set milestones
    artifacts:
      - packages/domain/src/conversion/lead-converter.ts
      - apps/api/src/mappers/lead-to-contact.mapper.ts
      - apps/api/src/mappers/lead-to-deal.mapper.ts

  4_maintain_relationships:
    description: 'Preservação de relacionamentos'
    history_preservation:
      - All activities
      - Email threads
      - Call logs
      - Notes/comments
      - File attachments
    link_management:
      - Lead → Contact link
      - Related contacts
      - Influence map
      - Decision makers
      - Champions
    campaign_attribution:
      - Original source
      - Campaign tags
      - UTM parameters
      - Referral info
      - Marketing qualified
    artifacts:
      - apps/api/src/services/relationship.service.ts
      - apps/api/src/services/activity-transfer.service.ts
      - packages/db/src/migrations/preserve-lead-data.ts

  5_automation_triggers:
    description: 'Automações pós-conversão'
    immediate_actions:
      - Notify account owner
      - Update forecasting
      - Trigger workflows
      - Send internal alerts
      - Update dashboards
    ai_powered_actions:
      - Generate deal summary
      - Suggest next steps
      - Risk assessment
      - Competitor analysis
      - Win probability
    integration_updates:
      - Sync to ERP
      - Update marketing
      - Notify Slack/Teams
      - Calendar booking
      - Document generation
    artifacts:
      - apps/api/src/workflows/post-conversion.workflow.ts
      - apps/ai-worker/src/agents/deal-assistant.agent.ts
      - apps/api/src/integrations/sync-manager.ts

  6_validation_rollback:
    description: 'Validação e rollback'
    success_validation:
      - All entities created
      - Relationships intact
      - History preserved
      - Workflows triggered
      - Notifications sent
    rollback_capability:
      - Transaction support
      - Undo within 24h
      - Audit trail
      - Data recovery
      - Status restoration
    confirmation_ui:
      - Success message
      - Quick actions
      - Go to contact/deal
      - View in pipeline
      - Share with team
    artifacts:
      - apps/api/src/transactions/conversion.transaction.ts
      - apps/api/src/services/rollback.service.ts
      - apps/web/components/conversion/success-screen.tsx

edge_cases:
  - existing_contact: 'Merge or create new decision'
  - duplicate_company: 'Company matching algorithm'
  - missing_required: 'Progressive form with validation'
  - concurrent_conversion: 'Locking mechanism'
  - permission_change_mid_flow: 'Graceful handling'

technical_artifacts:
  transaction_handling:
    - database: 'Full ACID compliance'
    - rollback: 'Soft delete + restore'
    - audit: 'Every field change logged'

  performance:
    - wizard_load: <1s
    - conversion_time: <5s
    - rollback_time: <10s

  data_integrity:
    - validation_rules: 20+
    - relationship_preservation: 100%
    - history_retention: 100%

success_metrics:
  - conversion_rate: >30
  - data_accuracy: >95
  - time_to_convert: <2min
  - rollback_usage: <1%
```

**Cenário**: Bruno qualificou lead e precisa converter em oportunidade real.

**Passos Detalhados**:

```yaml
1. Lead Qualificado:
  - Lead score >70
  - Email/call realizado
  - Botão "Convert Lead" ativo

2. Wizard de Conversão:
  Step 1 - Validar Contato:
    - Confirmar dados pessoais
    - Adicionar cargo/departamento
    - LinkedIn URL

  Step 2 - Empresa:
    - Criar ou selecionar existente
    - Porte, segmento, website
    - Endereço e timezone

  Step 3 - Criar Deal:
    - Nome da oportunidade
    - Valor estimado
    - Pipeline e estágio inicial
    - Data prevista fechamento
    - Probabilidade inicial

3. Processamento:
  - Transação atômica
  - Lead → archived
  - Contact + Company + Deal criados
  - Histórico preservado

4. Pós-conversão:
  - Redirect para novo Deal
  - Email ao time
  - Tasks migradas
  - AI recalcula insights
```

**Edge Cases**:

- Empresa já existe → Duplicate check
- Conversão parcial → Rollback
- Múltiplos deals → Loop no wizard

**Sistemas**:

- `apps/web/components/lead-conversion-wizard.tsx`
- `apps/api/src/leads/conversion.service.ts`
- `packages/domain/src/lead-conversion.ts`
