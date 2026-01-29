### 2.6 Renovação de Contrato (Deal Renewal)

**Cenário**: CSM identifica contrato próximo ao vencimento e inicia processo de
renovação.

**Especificações Técnicas**:

```yaml
id: FLOW-010
name: Renovação de Contrato
category: Comercial Core
priority: High
sprint: 5

actors:
  - Customer Success Manager
  - Account Executive
  - Customer (Decision Maker)
  - Finance Team
  - Legal Team

pre_conditions:
  - Contrato existente próximo ao vencimento
  - Customer health score calculado
  - Usage data disponível
  - Renewal playbook ativo

flow_steps:
  1_renewal_identification:
    description: "Identificação de renovações"
    automatic_triggers:
      - 120 days before expiry
      - 90 days reminder
      - 60 days escalation
      - 30 days critical
      - 15 days urgent
    identification_sources:
      - Contract end dates
      - Subscription terms
      - Auto-renewal flags
      - Customer notices
      - Usage thresholds
    risk_assessment:
      - Health score <70
      - Usage decline >20%
      - Support tickets spike
      - Competition active
    artifacts:
      - apps/api/src/services/renewal-identification.service.ts
      - apps/api/src/models/contract-renewal.model.ts
      - apps/web/components/renewals/renewal-alerts.tsx

  2_renewal_preparation:
    description: "Preparação da renovação"
    account_analysis:
      - Current usage vs committed
      - Feature adoption rates
      - Support interaction history
      - Expansion opportunities
      - Churn risk factors
    stakeholder_mapping:
      - Decision maker identification
      - Influencer analysis
      - Champion identification
      - New contacts discovery
    renewal_strategy:
      - Auto-renewal eligibility
      - Discount strategy
      - Expansion focus
      - Win-back approach
    documentation:
      - Current contract terms
      - Usage reports
      - Success stories
      - Reference customers
    artifacts:
      - apps/api/src/services/account-analysis.service.ts
      - apps/ai-worker/src/chains/renewal-strategy.chain.ts
      - apps/api/src/templates/renewal-proposals/

  3_customer_engagement:
    description: "Engajamento com cliente"
    outreach_sequence:
      - 90d: Usage report + value summary
      - 60d: Renewal discussion scheduling
      - 30d: Proposal delivery
      - 15d: Negotiation (if needed)
    meeting_agenda:
      - Current value assessment
      - Future roadmap alignment
      - Pricing discussion
      - Terms negotiation
      - Success metrics review
    ai_assistance:
      - Optimal contact timing
      - Personalized messaging
      - Objection anticipation
      - Cross-sell recommendations
    multi_channel:
      - Email sequences
      - Account reviews
      - Executive sponsorship
      - Procurement prep
    artifacts:
      - apps/api/src/services/customer-engagement.service.ts
      - apps/ai-worker/src/agents/renewal-agent.ts
      - apps/api/src/templates/engagement-emails/

  4_proposal_generation:
    description: "Geração de proposta"
    proposal_components:
      - Current term summary
      - Renewal pricing options
      - Expansion recommendations
      - Terms and conditions
      - Success metrics
    pricing_strategies:
      - Loyalty discounts
      - Volume commitments
      - Multi-year options
      - Payment terms
      - Service level adjustments
    approval_workflow:
      - CSM recommendation
      - AE review and approval
      - Finance discount approval
      - Legal terms review
      - Executive sign-off
    delivery_options:
      - Digital signature (DocuSign)
      - Physical delivery
      - Portal access
      - Email attachment
    artifacts:
      - apps/api/src/services/proposal-generator.service.ts
      - apps/api/src/workflows/renewal-approval.workflow.ts
      - apps/web/components/proposals/renewal-proposal-builder.tsx

  5_negotiation_management:
    description: "Gestão da negociação"
    common_objections:
      - Price increase concerns
      - Feature gaps
      - Competitor pressure
      - Budget constraints
      - Internal politics
    negotiation_tools:
      - Discount approval matrix
      - Term flexibility options
      - Value demonstration
      - Risk mitigation
      - Alternative solutions
    escalation_paths:
      - CSM → AE escalation
      - AE → Manager review
      - Manager → VP approval
      - VP → C-Level involvement
    win_strategies:
      - Value reinforcement
      - Relationship leverage
      - Timing optimization
      - Concession management
      - Quick wins identification
    artifacts:
      - apps/api/src/services/negotiation-tracker.service.ts
      - apps/web/components/negotiations/objection-handler.tsx
      - apps/api/src/rules/discount-approval.rules.ts

  6_renewal_execution:
    description: "Execução da renovação"
    contract_finalization:
      - Digital signature collection
      - Payment method confirmation
      - System access continuation
      - Terms activation
      - Notification dispatch
    system_updates:
      - Contract database update
      - Billing system sync
      - Access permissions refresh
      - Feature entitlements update
      - Reporting dashboards refresh
    celebration_recognition:
      - Team notification
      - Customer thank you
      - Success metrics update
      - Commission calculation
      - Performance recognition
    artifacts:
      - apps/api/src/services/contract-execution.service.ts
      - apps/api/src/integrations/billing-sync.service.ts
      - apps/api/src/events/renewal-completed.event.ts

edge_cases:
  - auto_renewal_failure: "Payment method expired"
  - partial_renewal: "Subset of products/users"
  - competitive_displacement: "Win-back workflow"
  - merger_acquisition: "Contract assignment"
  - emergency_extension: "Short-term bridge"

technical_artifacts:
  automation:
    - triggers: Date-based + event-based
    - workflows: Multi-step sequences
    - notifications: Multi-channel delivery

  integrations:
    - billing_systems: Stripe, Zuora
    - contract_management: Ironclad, DocuSign
    - calendar_systems: Google, Outlook

  analytics:
    - health_scoring: Usage + engagement metrics
    - churn_prediction: ML models
    - renewal_forecasting: Probability models

success_metrics:
  - renewal_rate: >90%
  - expansion_rate: >110%
  - on_time_renewal: >85%
  - discount_management: <10%
  - customer_satisfaction: >4.5/5
```

**Cenário**: Felipe gerencia renovações e tem 15 contratos vencendo em 60 dias.

**Passos Detalhados**:

```yaml
1. Dashboard de Renovações:
  - Lista contratos próximos vencer
  - Health score de cada conta
  - Valor em risco
  - Dias para vencimento

2. Iniciar Renovação:
  - Clone deal original
  - Atualiza datas e valores
  - Histórico preservado
  - Link parent-child

3. Análise de Conta:
  - Usage metrics
  - Tickets histórico
  - NPS/CSAT scores
  - Expansion potential

4. Proposta de Renovação:
  - Reajuste automático (índice)
  - Upsell suggestions (AI)
  - Desconto por fidelidade
  - Multi-year incentivos

5. Negotiation Track:
  - Timeline específica
  - Playbook renovação
  - Approval simplificado
  - Auto-renewal clause
```

**Edge Cases**:

- Cliente em churn risk → Alert especial
- Contrato auto-renewal → Notificação apenas
- Mudança de decisor → Research needed

**Sistemas**:

- `apps/web/app/renewals/dashboard/page.tsx`
- `apps/api/src/contracts/renewal.service.ts`
- `apps/ai-worker/src/churn/predictor.ts`
