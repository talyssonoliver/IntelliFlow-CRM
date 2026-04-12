### 2.4 Criação/Atualização de Deal (com Forecast)

**Cenário**: Vendedor cria nova oportunidade com forecast automático e
colaboração em equipe.

**Especificações Técnicas**:

```yaml
id: FLOW-008
name: Criação e Atualização de Deal
category: Comercial Core
priority: Critical
sprint: 4

actors:
  - Sales Rep
  - Sales Manager
  - AI Forecasting
  - Finance Team

pre_conditions:
  - Contact/Company exists
  - Pipeline selected
  - User has deal:create permission

flow_steps:
  1_deal_initiation:
    description: "Iniciação do deal"
    creation_methods:
      - From contact page (+Deal)
      - From pipeline (+New)
      - From lead conversion
      - API/Integration
      - Email parsing
    initial_data:
      required:
        - Deal name
        - Contact/Company
        - Pipeline
        - Stage
        - Owner
      optional:
        - Value
        - Close date
        - Probability
        - Description
        - Competition
    ai_assistance:
      - Name suggestion
      - Value prediction
      - Timeline estimate
      - Product recommendation
    artifacts:
      - apps/web/components/deals/create-deal-modal.tsx
      - apps/web/components/deals/deal-form.tsx
      - apps/api/src/routers/deal.router.ts

  2_deal_enrichment:
    description: "Enriquecimento de dados"
    automatic_fields:
      - Company details
      - Industry classification
      - Company size
      - Previous deals
      - Relationship strength
    ai_predictions:
      - Deal size (based on company)
      - Close probability
      - Timeline to close
      - Risk factors
      - Competitor presence
    validation_rules:
      - Value within limits
      - Close date realistic
      - Required approvals
      - Duplicate check
      - Budget availability
    artifacts:
      - apps/api/src/services/deal-enrichment.service.ts
      - apps/ai-worker/src/models/deal-prediction.model.ts
      - apps/api/src/validators/deal.validator.ts

  3_product_configuration:
    description: "Configuração de produtos"
    product_selection:
      - Product catalog browse
      - Quick search
      - Bundles/packages
      - Custom items
      - Recurring vs one-time
    pricing_calculation:
      - List price
      - Volume discounts
      - Custom pricing
      - Multi-currency
      - Tax calculation
    margin_analysis:
      - Cost calculation
      - Margin percentage
      - Approval thresholds
      - Profitability score
      - Commission impact
    artifacts:
      - apps/web/components/deals/product-selector.tsx
      - apps/api/src/services/pricing.service.ts
      - apps/api/src/services/margin-calculator.service.ts

  4_forecast_integration:
    description: "Integração com forecast"
    forecast_categories:
      - Omitted: 0%
      - Pipeline: 10%
      - Best Case: 25%
      - Commit: 75%
      - Closed: 100%
    weighted_value:
      - Category weight
      - Probability override
      - Stage multiplier
      - AI confidence
      - Manual adjustment
    rollup_calculation:
      - Individual contribution
      - Team aggregate
      - Regional rollup
      - Company total
      - Period comparison
    artifacts:
      - apps/api/src/services/forecast.service.ts
      - apps/api/src/models/forecast-category.model.ts
      - apps/web/components/forecast/deal-forecast.tsx

  5_collaboration_features:
    description: "Recursos de colaboração"
    team_selling:
      - Add team members
      - Define roles (AE, SE, CSM)
      - Split commission
      - Task assignment
      - @ mentions
    activity_tracking:
      - Auto-log emails
      - Call recording links
      - Meeting notes
      - Document shares
      - Status updates
    deal_room:
      - Shared documents
      - Mutual action plan
      - Stakeholder map
      - Decision criteria
      - Timeline/milestones
    artifacts:
      - apps/web/components/deals/team-selector.tsx
      - apps/web/components/deals/activity-feed.tsx
      - apps/web/components/deals/deal-room.tsx

  6_update_workflows:
    description: "Workflows de atualização"
    field_changes:
      - Amount: forecast impact
      - Date: timeline alerts
      - Stage: automation trigger
      - Probability: review needed
      - Competition: strategy alert
    approval_routing:
      - Discount > 20%: manager
      - Deal > $100k: VP
      - Non-standard terms: legal
      - New product: product team
      - Payment terms: finance
    notifications:
      - Real-time updates
      - Daily digest
      - Milestone alerts
      - Risk notifications
      - Win/loss immediate
    artifacts:
      - apps/api/src/workflows/deal-update.workflow.ts
      - apps/api/src/services/approval.service.ts
      - apps/api/src/events/deal-updated.event.ts

edge_cases:
  - currency_conversion: "Real-time rates with fallback"
  - retroactive_dating: "Audit trail with justification"
  - split_deals: "Parent-child relationship handling"
  - contingent_deals: "Probability adjustments"
  - renewal_vs_new: "Different workflows/fields"

technical_artifacts:
  data_model:
    - tables: deals, deal_products, deal_team
    - audit: all_changes_tracked
    - soft_delete: 30_day_recovery

  performance:
    - create_time: <1s
    - update_time: <500ms
    - forecast_calc: <2s

  integrations:
    - erp_sync: real-time
    - calendar_sync: bidirectional
    - email_tracking: automatic

success_metrics:
  - forecast_accuracy: >80%
  - deal_velocity: improving
  - data_completeness: >90%
  - collaboration_score: >4/5
```

**Cenário**: Diego fecha negociação complexa com múltiplos produtos e pagamento
faseado.

**Passos Detalhados**:

```yaml
1. Criação de Deal:
  - Formulário em steps
  - Informações básicas
  - Produtos (multiple select)
  - Condições comerciais

2. Cálculo de Forecast:
  - Probabilidade por estágio (auto)
  - Override manual com justificativa
  - Valor ponderado calculado
  - Timeline com marcos

3. Produtos e Pricing:
  - Catálogo com busca
  - Quantidade e descontos
  - Margem calculada
  - Approval rules

4. Faseamento:
  - Split em parcelas
  - Datas de reconhecimento
  - Comissões calculadas
  - Impacto no forecast

5. Colaboração:
  - Mentions @team
  - Comentários threaded
  - Anexos (propostas)
  - Activity tracking
```

**Edge Cases**:

- Desconto >30% → Manager approval
- Produto descontinuado → Alternativa sugerida
- Forecast impossível → Data validation

**Sistemas**:

- `apps/web/app/deals/[id]/edit/page.tsx`
- `apps/api/src/deals/forecast.service.ts`
- `apps/ai-worker/src/forecast/predictor.ts`
