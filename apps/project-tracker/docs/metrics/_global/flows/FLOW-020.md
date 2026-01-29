### 4.5 Feed de Atividade Unificado (linha do tempo 360º)

**Cenário**: Paulo revisa histórico completo de interações com cliente
estratégico.

**Passos Detalhados**:

```yaml
1. Timeline View:
  - Ordem cronológica reversa
  - Filtros por tipo/pessoa
  - Search dentro timeline
  - Infinite scroll

2. Tipos de Atividade:
  - 📧 Emails (sent/received)
  - 📞 Calls (duration/outcome)
  - 📅 Meetings (attendees/notes)
  - 💬 Chats (WhatsApp/Teams)
  - 📄 Documents (uploaded/signed)
  - 🎯 Deal updates
  - 🎫 Tickets
  - 📝 Notes internas

3. Rich Preview:
  - Email subject + preview
  - Call recording player
  - Meeting summary
  - Document thumbnail
  - Quick actions

4. Interações:
  - Expand para detalhes
  - Reply/React inline
  - Add note to activity
  - Share with team

5. AI Insights:
  - Sentiment trending
  - Engagement score
  - Quiet periods alert
  - Next best action
```

**Edge Cases**:

- Data overload → Smart grouping
- Missing data → Backfill prompt
- Performance → Virtual scrolling

**Sistemas Envolvidos**:

- `apps/web/components/activity-timeline.tsx`
- `apps/api/src/activities/aggregator.service.ts`
- Supabase real-time subscriptions

**Especificações Técnicas**:

```yaml
id: FLOW-020
name: Feed de Atividade Unificado
category: Comunicação
priority: High
sprint: 5

actors:
  - Usuário do CRM
  - Sistema de Atividade
  - Múltiplos Canais
  - Sistema de Analytics

pre_conditions:
  - Contacto selecionado
  - Histórico disponível
  - Permissões de visualização
  - Dados agregados

flow_steps:
  1_data_aggregation:
    description: "Agregação de dados"
    source_collection:
      - Email communications
      - Call records
      - Meeting history
      - Chat conversations
      - Document interactions
    timeline_construction:
      - Chronological ordering
      - Source attribution
      - Context preservation
      - Thread grouping
      - Importance scoring
    real_time_updates:
      - Live activity feed
      - Push notifications
      - WebSocket connections
      - Cache invalidation
      - Performance optimization
    artifacts:
      - apps/api/src/services/activity-aggregator.service.ts
      - apps/api/src/models/activity-timeline.model.ts
      - apps/web/hooks/use-activity-feed.ts

  2_activity_presentation:
    description: "Apresentação de atividades"
    unified_interface:
      - Timeline visualization
      - Activity cards
      - Quick actions
      - Filtering options
      - Search capability
    rich_content_display:
      - Email previews
      - Call transcripts
      - Meeting summaries
      - Document thumbnails
      - Chat snippets
    interaction_features:
      - Like/comment system
      - @mentions
      - Task creation
      - Follow-up scheduling
      - Export options
    artifacts:
      - apps/web/components/activity/timeline-view.tsx
      - apps/web/components/activity/activity-card.tsx
      - apps/api/src/services/activity-presenter.service.ts

  3_context_awareness:
    description: "Consciência de contexto"
    relationship_mapping:
      - Contact connections
      - Company relationships
      - Deal associations
      - Project linkages
      - Team collaborations
    sentiment_analysis:
      - Communication tone
      - Engagement levels
      - Satisfaction indicators
      - Risk signals
      - Opportunity detection
    predictive_insights:
      - Next best actions
      - Churn risk assessment
      - Buying signals
      - Engagement predictions
      - Timing recommendations
    artifacts:
      - apps/ai-worker/src/chains/context-analysis.chain.ts
      - apps/api/src/services/relationship-mapper.service.ts
      - apps/web/components/activity/insights-panel.tsx

  4_collaboration_features:
    description: "Recursos de colaboração"
    team_sharing:
      - Activity visibility
      - Comment threads
      - File attachments
      - Task assignments
      - Notification preferences
    external_sharing:
      - Client portals
      - Secure links
      - Limited views
      - Time restrictions
      - Audit trails
    integration_sync:
      - Calendar events
      - Task management
      - Document systems
      - Communication tools
      - Analytics platforms
    artifacts:
      - apps/api/src/services/collaboration-manager.service.ts
      - apps/web/components/activity/sharing-controls.tsx
      - apps/api/src/integrations/external-sync.service.ts

edge_cases:
  - data_gaps: "Gap filling and estimation"
  - privacy_filters: "Content filtering and masking"
  - performance_issues: "Pagination and virtualization"
  - concurrent_edits: "Conflict resolution"
  - large_datasets: "Efficient querying and caching"

technical_artifacts:
  architecture:
    - data_aggregation: Event sourcing pattern
    - real_time: WebSocket + Server-Sent Events
    - caching: Multi-level caching strategy
    - search: Elasticsearch integration

  performance:
    - load_time: <2s for 1000 activities
    - real_time_latency: <500ms
    - search_speed: <200ms
    - scalability: Horizontal scaling

  analytics:
    - engagement_tracking: User interaction metrics
    - content_analysis: AI-powered insights
    - predictive_modeling: Behavior prediction

success_metrics:
  - user_engagement: >70% daily active users
  - information_findability: >90% success rate
  - collaboration_increase: >50% more interactions
  - insight_accuracy: >85%
```
