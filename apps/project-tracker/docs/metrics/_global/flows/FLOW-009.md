### 2.5 Fechamento de Deal (Won/Lost) + Notificações

**Cenário**: Deal chega à fase final e precisa ser fechado como ganho ou
perdido.

**Especificações Técnicas**:

```yaml
id: FLOW-009
name: Fechamento de Deal Won/Lost
category: Comercial Core
priority: Critical
sprint: 5

actors:
  - Sales Rep (Owner)
  - Sales Manager
  - Finance Team
  - Customer Success
  - Entire Sales Team

pre_conditions:
  - Deal in final stage
  - Required fields complete
  - Approvals obtained
  - Documents signed (if won)

flow_steps:
  1_closure_initiation:
    description: 'Iniciação do fechamento'
    ui_triggers:
      - Move to Closed Won/Lost
      - Quick action button
      - Bulk close option
      - API update
      - Email command
    validation_pre_close:
      won_requirements:
        - Contract signed
        - PO received
        - Payment terms set
        - Products configured
        - Commission split defined
      lost_requirements:
        - Loss reason selected
        - Competitor identified
        - Feedback captured
        - Revival date set
        - Lessons learned
    artifacts:
      - apps/web/components/deals/close-deal-modal.tsx
      - apps/web/components/deals/closure-form.tsx
      - apps/api/src/validators/deal-closure.validator.ts

  2_won_processing:
    description: 'Processamento Won'
    immediate_actions:
      - Update forecast to 100%
      - Calculate final commission
      - Create implementation project
      - Generate invoice
      - Schedule kickoff
    automated_workflows:
      - Customer success handoff
      - Welcome email sequence
      - Onboarding task creation
      - Account setup
      - Training scheduling
    notifications:
      - Team celebration post
      - Slack/Teams announcement
      - Commission notification
      - Executive summary
      - Customer notification
    integrations:
      - ERP: Create customer
      - Billing: Setup subscription
      - Support: Create account
      - LMS: Enable training
      - Documentation: Access granted
    artifacts:
      - apps/api/src/workflows/deal-won.workflow.ts
      - apps/api/src/services/commission-calculator.service.ts
      - apps/api/src/integrations/erp-sync.service.ts

  3_lost_processing:
    description: 'Processamento Lost'
    required_information:
      - Primary loss reason
      - Specific feedback
      - Competitor won
      - Price point lost
      - Decision criteria missed
    analysis_capture:
      - What went wrong
      - Could we have won
      - Lessons learned
      - Product gaps
      - Process improvements
    revival_planning:
      - Set follow-up date
      - Archive materials
      - Maintain relationship
      - Monitor triggers
      - Nurture sequence
    team_learning:
      - Loss review meeting
      - Pattern analysis
      - Compete strategy
      - Product feedback
      - Process refinement
    artifacts:
      - apps/api/src/workflows/deal-lost.workflow.ts
      - apps/web/components/deals/loss-analysis-form.tsx
      - apps/api/src/services/loss-analysis.service.ts

  4_celebration_communication:
    description: 'Celebração e comunicação (Won)'
    internal_celebration:
      - Gong/bell animation
      - Confetti effect
      - Team feed post
      - Leaderboard update
      - Achievement badges
    communication_cascade:
      Email:
        - Team announcement
        - Executive summary
        - Commission statement
        - Customer welcome
      Slack/Teams:
        -  #wins channel
        - Celebration GIF
        - Deal details
      Dashboard:
        - Forecast update
        - Metrics refresh
        - Goal progress
    recognition:
      - Rep spotlight
      - Manager kudos
      - Monthly club
      - Annual achievement
      - Peer voting
    artifacts:
      - apps/web/components/celebrations/won-animation.tsx
      - apps/api/src/services/notification-cascade.service.ts
      - apps/api/src/templates/won-notifications/

  5_handoff_procedures:
    description: 'Procedimentos de handoff'
    won_handoff:
      to_implementation:
        - Technical requirements
        - Success criteria
      to_customer_success:
        - Account strategy
        - Growth opportunities
        - Health metrics
      to_finance:
        - Revenue recognition
        - Contract terms
        - Payment schedule
    lost_preservation:
      - Archive all materials
      - Document journey
      - Save preferences
      - Maintain permissions
      - Enable quick revival
    artifacts:
      - apps/api/src/services/handoff.service.ts
      - apps/api/src/templates/handoff-documents/
      - apps/web/components/handoff/summary-generator.tsx

  6_analytics_impact:
    description: 'Impacto em analytics'
    individual_metrics:
      - Win rate
      - Average deal size
      - Sales cycle
      - Activity ratio
      - Quota attainment
    team_metrics:
      - Pipeline velocity
      - Forecast accuracy
      - Competition win rate
      - Product mix
      - Territory performance
    company_metrics:
      - Revenue realized
      - Market share
      - Customer acquisition
      - Churn prediction
      - Growth trajectory
    insights_generation:
      - AI pattern detection
      - Success factors
      - Risk indicators
      - Best practices
      - Coaching opportunities
    artifacts:
      - apps/api/src/services/analytics-update.service.ts
      - apps/api/src/services/metrics-calculator.service.ts
      - apps/ai-worker/src/chains/win-loss-analysis.chain.ts

edge_cases:
  - partial_win: 'Multi-product with partial success'
  - conditional_close: 'Pending final approval'
  - backdated_close: 'Quarter-end considerations'
  - split_commission: 'Complex team selling'
  - customer_ghost: 'Won but no response'

technical_artifacts:
  workflows:
    - orchestration: Temporal
    - events: Event-driven
    - idempotency: Ensured

  notifications:
    - channels: 5+ integrated
    - delivery: Guaranteed
    - preferences: Customizable

  analytics:
    - real_time: Yes
    - historical: Preserved
    - ml_models: Updated

success_metrics:
  - close_process_time: <5min
  - handoff_completeness: >95
  - celebration_engagement: >90
  - data_accuracy: 100%
  - notification_delivery: 99.9%
```

**Cenário**: Elena fecha grande contrato após 3 meses de negociação.

**Passos Detalhados**:

```yaml
1. Ação de Fechamento:
  - Botão "Mark as Won/Lost"
  - Modal de confirmação
  - Reason code (se Lost)
  - Valor final confirmado

2. Para Deals Won:
  - Data de assinatura
  - Upload do contrato
  - Início da vigência
  - Criação de projeto (opcional)

3. Para Deals Lost:
  - Motivo principal (dropdown)
  - Comentários adicionais
  - Competitor que ganhou
  - Lições aprendidas

4. Automações Triggered:
  - Email para todo time
  - Atualização de forecast
  - Comissões calculadas
  - Handoff para Customer Success

5. Celebração/Análise:
  - Confetti animation (Won)
  - Ring bell (física/virtual)
  - Post no Slack
  - Case study prompt
```

**Edge Cases**:

- Reabrir deal fechado → Audit + approval
- Valor diferente do forecast → Explicação
- Contrato pendente → Status "Verbal Won"

**Sistemas**:

- `apps/web/components/deal-closure-modal.tsx`
- `apps/api/src/deals/closure.service.ts`
- `apps/api/src/notifications/celebration.ts`
