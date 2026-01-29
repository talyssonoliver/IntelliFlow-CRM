### 2.3 Gestão de Pipeline (Kanban Drag-and-Drop)

**Cenário**: Equipe de vendas visualiza e movimenta deals no pipeline Kanban.

**Especificações Técnicas**:

```yaml
id: FLOW-007
name: Gestão de Pipeline Kanban
category: Comercial Core
priority: Critical
sprint: 4

actors:
  - Sales Rep
  - Sales Manager
  - AI Analytics
  - Finance (forecast)

pre_conditions:
  - Pipeline configurado
  - Deals existentes
  - Permissões de visualização/edição

flow_steps:
  1_pipeline_view_access:
    description: 'Acesso à visão do pipeline'
    navigation:
      - Menu: Sales > Pipeline
      - Shortcut: P key
      - Widget: Dashboard
      - Mobile: Swipe view
    view_options:
      - Kanban board (default)
      - Table view
      - Forecast view
      - Analytics view
      - Calendar view
    filters:
      - My deals only
      - Team deals
      - Date range
      - Deal size
      - Probability
      - Tags/labels
    artifacts:
      - apps/web/app/pipeline/page.tsx
      - apps/web/components/pipeline/view-selector.tsx
      - apps/web/components/pipeline/filter-bar.tsx

  2_kanban_board_render:
    description: 'Renderização do board Kanban'
    stage_columns:
      - Prospecting
      - Qualification
      - Proposal
      - Negotiation
      - Closed Won
      - Closed Lost
    card_information:
      - Company + Contact name
      - Deal value
      - Age in stage
      - Next action due
      - Owner avatar
      - Probability badge
      - AI risk indicator
    visual_indicators:
      - Color: deal size
      - Border: overdue
      - Badge: hot deal
      - Icon: activity type
      - Pulse: recent update
    performance:
      - Virtual scrolling
      - Lazy loading
      - Optimistic updates
      - Skeleton loading
    artifacts:
      - apps/web/components/pipeline/kanban-board.tsx
      - apps/web/components/pipeline/deal-card.tsx
      - apps/web/hooks/use-pipeline-data.ts

  3_drag_drop_interaction:
    description: 'Interação drag-and-drop'
    drag_initiation:
      - Long press (mobile)
      - Click and hold (desktop)
      - Visual feedback
      - Ghost element
      - Drop zones highlight
    validation_rules:
      - Can move forward/back
      - Skip stages allowed
      - Closed → reopen needs confirm
      - Permission per stage
      - Bulk drag (multi-select)
    drop_feedback:
      - Valid: green highlight
      - Invalid: red highlight
      - Auto-scroll near edges
      - Snap to position
      - Smooth animation
    artifacts:
      - apps/web/components/pipeline/drag-layer.tsx
      - apps/web/hooks/use-drag-drop.ts
      - apps/web/utils/drag-validators.ts

  4_stage_change_processing:
    description: 'Processamento da mudança'
    immediate_updates:
      - Update deal stage
      - Record timestamp
      - Calculate velocity
      - Update probability
      - Trigger automations
    business_rules:
      - Required fields check
      - Approval workflows
      - Document requirements
      - Stage entry criteria
      - SLA adjustments
    ai_processing:
      - Recalculate score
      - Update forecast
      - Risk assessment
      - Next action suggestion
      - Win probability
    artifacts:
      - apps/api/src/services/stage-transition.service.ts
      - apps/api/src/rules/pipeline-rules.ts
      - apps/ai-worker/src/chains/deal-analysis.chain.ts

  5_automation_cascade:
    description: 'Cascata de automações'
    stage_based_triggers:
      Proposal:
        - Generate document
        - Schedule review
        - Notify manager
        - Start approval
      Negotiation:
        - Legal review
        - Discount approval
        - Competition check
        - Risk assessment
      Closed_Won:
        - Create project
        - Billing setup
        - Success email
        - Commission calc
    notifications:
      - Owner: in-app + email
      - Manager: dashboard
      - Team: Slack/Teams
      - Customer: automated email
    artifacts:
      - apps/api/src/workflows/stage-automations.ts
      - apps/api/src/templates/stage-emails/
      - apps/api/src/events/deal-stage-changed.event.ts

  6_analytics_update:
    description: 'Atualização de analytics'
    real_time_metrics:
      - Pipeline value
      - Stage velocity
      - Conversion rates
      - Average deal size
      - Win probability
    forecast_impact:
      - Committed deals
      - Best case scenario
      - Weighted pipeline
      - Quota attainment
      - Trend analysis
    team_leaderboard:
      - Deals moved
      - Value progressed
      - Velocity score
      - Win rate
      - Activity score
    artifacts:
      - apps/api/src/services/pipeline-analytics.service.ts
      - apps/api/src/services/forecast.service.ts
      - apps/web/components/pipeline/analytics-panel.tsx

edge_cases:
  - offline_drag: 'Queue changes, sync when online'
  - concurrent_edit: 'Optimistic UI + conflict resolution'
  - permission_revoked: 'Graceful error, revert position'
  - stage_deleted: 'Migration wizard for deals'
  - bulk_operation_timeout: 'Progressive processing'

technical_artifacts:
  performance:
    - initial_load: <2s for 500 deals
    - drag_response: <16ms (60fps)
    - stage_update: <200ms
    - analytics_refresh: <1s

  scalability:
    - max_deals_view: 1000
    - virtual_scroll: true
    - pagination: 50 per page
    - caching: 5min TTL

  mobile_optimization:
    - touch_gestures: true
    - responsive_cards: true
    - offline_support: true

success_metrics:
  - drag_success_rate: >99
  - stage_velocity: tracked
  - user_engagement: >80
  - mobile_usage: >40
```

**Cenário**: Camila gerencia 20 deals simultâneos e organiza pipeline
semanalmente.

**Passos Detalhados**:

```yaml
1. Visualização Kanban:
  - Colunas: Prospecting → Demo → Negotiation → Closing
  - Cards mostram: título, valor, owner, dias no estágio
  - Cores por prioridade/idade

2. Drag and Drop:
  - Hover mostra drop zones
  - Drag inicia → placeholder
  - Drop → atualização otimista
  - Animação de transição

3. Validações de Movimento:
  - Regras por estágio (ex: demo agendada?)
  - Permissões (pode mover deal de outro?)
  - Valor máximo por estágio
  - Approval se >$50k

4. Ações Automáticas:
  - Email ao mover para Negotiation
  - Task ao entrar em Closing
  - Forecast atualizado
  - Notificação ao manager

5. Filtros e Agrupamentos:
  - Por owner, valor, idade
  - Swimlanes por produto
  - Zoom in/out
  - Export para Excel
```

**Edge Cases**:

- Conflito de edição → Last write wins + notification
- Drag cancelado → Restore position
- Limite de WIP → Warning antes do drop

**Sistemas**:

- `apps/web/components/deal-kanban/board.tsx`
- `apps/api/src/deals/pipeline.service.ts`
- React Beautiful DnD + Supabase Realtime

**Métricas**:

- Tempo médio por estágio
- Taxa de conversão entre estágios
- Velocity (deals/semana)
