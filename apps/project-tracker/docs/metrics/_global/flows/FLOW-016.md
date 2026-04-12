### 4.1 Envio de Email a partir do CRM (com tracking)

**Cenário**: Vendedor envia proposta por email com tracking completo.

**Especificações Técnicas**:

```yaml
id: FLOW-016
name: Envio de Email com Tracking
category: Comunicação
priority: High
sprint: 5

actors:
  - Usuário do CRM
  - Sistema de Email
  - Destinatário
  - Sistema de Analytics

pre_conditions:
  - Template de email configurado
  - Destinatários válidos
  - Permissões de envio
  - Tracking habilitado

flow_steps:
  1_email_composition:
    description: 'Composição do email'
    template_selection:
      - Pre-built templates
      - Custom templates
      - Dynamic content
      - Personalization
      - Branding consistency
    content_personalization:
      - Contact data merge
      - Company information
      - Deal context
      - User preferences
      - Behavioral data
    attachment_handling:
      - File validation
      - Size limits
      - Security scanning
      - Preview generation
      - Download tracking
    artifacts:
      - apps/web/components/email/composer.tsx
      - apps/api/src/services/template-engine.service.ts
      - apps/api/src/validators/email-content.validator.ts

  2_tracking_implementation:
    description: 'Implementação de tracking'
    pixel_tracking:
      - Open tracking pixel
      - Unique identifiers
      - Timestamp recording
      - IP address logging
      - Device detection
    link_tracking:
      - URL redirection service
      - Click event capture
      - Link uniqueness
      - Destination validation
      - Security measures
    advanced_tracking:
      - Email client detection
      - Geographic location
      - Time zone analysis
      - Engagement scoring
      - Unsubscribe handling
    artifacts:
      - apps/api/src/services/tracking-pixel.service.ts
      - apps/api/src/services/link-tracker.service.ts
      - apps/api/src/models/email-tracking.model.ts

  3_delivery_execution:
    description: 'Execução da entrega'
    smtp_configuration:
      - Provider selection
      - Authentication
      - Rate limiting
      - Bounce handling
      - Reputation management
    queue_management:
      - Priority queuing
      - Batch processing
      - Retry logic
      - Failure recovery
      - Performance monitoring
    compliance_ensurance:
      - GDPR compliance
      - CAN-SPAM compliance
      - Unsubscribe processing
      - Opt-in verification
      - Data retention
    artifacts:
      - apps/api/src/services/email-deliverer.service.ts
      - apps/api/src/queues/email-queue.ts
      - apps/api/src/services/compliance-checker.service.ts

  4_analytics_processing:
    description: 'Processamento de analytics'
    real_time_updates:
      - Delivery confirmation
      - Open events
      - Click events
      - Bounce notifications
      - Unsubscribe events
    engagement_scoring:
      - Open rate calculation
      - Click rate analysis
      - Conversion attribution
      - Engagement timeline
      - Comparative analysis
    reporting_generation:
      - Individual email reports
      - Campaign performance
      - Contact engagement
      - Trend analysis
      - Predictive insights
    artifacts:
      - apps/api/src/services/analytics-processor.service.ts
      - apps/web/components/email/analytics-dashboard.tsx
      - apps/api/src/models/email-metrics.model.ts

edge_cases:
  - email_bounces: 'Bounce handling and suppression'
  - spam_complaints: 'List cleaning and reputation management'
  - deliverability_issues: 'Provider switching and optimization'
  - tracking_blocked: 'Alternative measurement methods'
  - privacy_regulations: 'Consent management and data handling'

technical_artifacts:
  infrastructure:
    - email_providers: SendGrid, AWS SES, Postmark
    - tracking_domain: Dedicated subdomain
    - database: Time-series optimized
    - caching: Redis for real-time metrics

  security:
    - encryption: TLS 1.3 mandatory
    - authentication: SPF, DKIM, DMARC
    - privacy: Data minimization
    - compliance: GDPR, CCPA

  performance:
    - delivery_time: <5s average
    - tracking_accuracy: >95
    - analytics_latency: <1s

success_metrics:
  - deliverability_rate: >98
  - open_rate: >25
  - click_rate: >3
  - conversion_rate: >1
  - unsubscribe_rate: <1%
```

**Cenário**: Lucas envia proposta comercial com tracking de abertura e links.

**Passos Detalhados**:

```yaml
1. Composição:
  - De: lucas@company (ou alias)
  - Para: Contato (auto-complete)
  - Template ou blank
  - Rich text editor
  - Anexos (até 25MB)

2. Personalização:
  - Merge tags {{FirstName}}
  - Dynamic content
  - Signature automática
  - Disclaimer legal

3. Tracking Setup:
  - Open tracking pixel
  - Link wrapping
  - Attachment downloads
  - Reply detection

4. Envio:
  - Preview mode
  - Spam check score
  - Schedule option
  - Send confirmation

5. Analytics:
  - Opens em real-time
  - Links clicked
  - Time spent
  - Forward detection
  - Device/location
```

**Edge Cases**:

- Bounce → Update contact
- Spam complaint → Blacklist
- Image blocking → Fallback

**Sistemas**:

- `apps/web/components/email-composer.tsx`
- `apps/api/src/email/tracking.service.ts`
- SendGrid/AWS SES integration
