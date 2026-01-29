### 3.5 Feedback do Cliente (NPS, CSAT)

**Cenário**: Cliente fornece feedback sobre experiência de suporte.

**Especificações Técnicas**:

```yaml
id: FLOW-015
name: Coleta e Análise de Feedback
category: Relacionamento e Suporte
priority: Medium
sprint: 6

actors:
  - Cliente
  - Sistema de Feedback
  - Analista de Qualidade
  - Management

pre_conditions:
  - Ticket resolvido
  - Canal de feedback disponível
  - Survey configurado
  - Análise automatizada ativa

flow_steps:
  1_feedback_collection:
    description: "Coleta de feedback"
    survey_delivery:
      - Post-resolution email
      - In-portal survey
      - SMS invitation
      - Chat follow-up
      - API integration
    survey_design:
      - NPS question (0-10)
      - CSAT rating (1-5)
      - Open-ended comments
      - Follow-up questions
      - Demographic data
    timing_optimization:
      - 24h post-resolution
      - Business hours only
      - Multiple reminders
      - Expiration handling
      - Response tracking
    artifacts:
      - apps/api/src/services/feedback-collector.service.ts
      - apps/web/components/surveys/nps-survey.tsx
      - apps/api/src/templates/feedback-surveys/

  2_response_processing:
    description: "Processamento de respostas"
    real_time_analysis:
      - Sentiment analysis
      - Keyword extraction
      - Trend identification
      - Alert generation
      - Action prioritization
    data_validation:
      - Response completeness
      - Spam detection
      - Duplicate prevention
      - Data quality checks
      - Anonymization
    categorization:
      - Issue classification
      - Severity assessment
      - Department routing
      - Trend categorization
      - Action item creation
    artifacts:
      - apps/ai-worker/src/chains/feedback-analysis.chain.ts
      - apps/api/src/services/response-processor.service.ts
      - apps/api/src/models/feedback-categorization.model.ts

  3_actionable_insights:
    description: "Geração de insights acionáveis"
    pattern_recognition:
      - Common themes
      - Root cause analysis
      - Process gaps
      - Training needs
      - System improvements
    prioritization_matrix:
      - Impact assessment
      - Frequency analysis
      - Effort estimation
      - Business value
      - Urgency rating
    recommendation_engine:
      - Automated suggestions
      - Best practice references
      - Process improvements
      - Training recommendations
      - System enhancement
    artifacts:
      - apps/api/src/services/insight-generator.service.ts
      - apps/web/components/insights/action-dashboard.tsx
      - apps/api/src/models/prioritization-matrix.model.ts

  4_follow_up_actions:
    description: "Ações de follow-up"
    customer_engagement:
      - Detractor follow-up
      - Promoter appreciation
      - Passive engagement
      - Issue resolution
      - Relationship building
    internal_improvements:
      - Process optimization
      - Training programs
      - System enhancements
      - Policy updates
      - Quality initiatives
    communication_cascade:
      - Team notifications
      - Management reports
      - Executive summaries
      - Customer updates
      - Stakeholder alerts
    artifacts:
      - apps/api/src/workflows/feedback-followup.workflow.ts
      - apps/api/src/services/action-tracker.service.ts
      - apps/api/src/templates/followup-communications/

edge_cases:
  - low_response_rates: "Multiple channel attempts"
  - extreme_feedback: "Immediate escalation protocols"
  - incomplete_responses: "Follow-up for completion"
  - language_barriers: "Translation and localization"
  - privacy_concerns: "Anonymization and compliance"

technical_artifacts:
  analytics:
    - nps_tracking: Real-time calculation
    - trend_analysis: Historical comparison
    - predictive_modeling: Churn risk assessment

  automation:
    - survey_delivery: Triggered workflows
    - response_analysis: AI-powered processing
    - alert_generation: Rule-based notifications

  integrations:
    - survey_platforms: Typeform, SurveyMonkey
    - communication: Email, SMS, chat
    - analytics: Tableau, PowerBI

success_metrics:
  - response_rate: >30%
  - nps_score: >50
  - csat_score: >4.2/5
  - action_completion: >80%
  - customer_retention: >95%
```

**Cenário**: Karina recebe survey automático após resolução de ticket crítico.

**Passos Detalhados**:

```yaml
1. Trigger do Survey:
  - Ticket closed + 24h
  - Email/SMS enviado
  - Link personalizado
  - Mobile optimized

2. Questões:
  - CSAT: Satisfação 1-5 ⭐
  - Resolução: Problema resolvido?
  - NPS: Recomendaria 0-10?
  - Comentário aberto

3. Experiência:
  - 2 minutos máximo
  - Progress bar
  - Skip opcional
  - Multi-idioma

4. Processamento:
  - Score calculado
  - Sentiment analysis
  - Categorização automática
  - Alerts se crítico

5. Follow-up:
  - Se ≤6: Manager contact
  - Se 9-10: Review request
  - Insights dashboard
  - Trends analysis
```

**Edge Cases**:

- Multiple responses → Use última
- Aggressive comment → Escalation
- No response → Re-send 1x

**Sistemas**:

- `apps/web/app/survey/[token]/page.tsx`
- `apps/api/src/feedback/nps.service.ts`
- `apps/ai-worker/src/sentiment/analyzer.ts`
