### 4.2 Integração Chat/WhatsApp/Teams (mensagens bidirecionais)

**Cenário**: Cliente inicia conversa no WhatsApp que é automaticamente integrada
ao CRM.

**Especificações Técnicas**:

```yaml
id: FLOW-017
name: Integração de Chat Bidirecional
category: Comunicação
priority: Medium
sprint: 5

actors:
  - Cliente
  - Agente de Suporte
  - Sistema de Chat
  - CRM Integration

pre_conditions:
  - Canal de chat configurado
  - Webhooks estabelecidos
  - Agentes disponíveis
  - Conversa mapeada a contato

flow_steps:
  1_channel_connection:
    description: "Conexão com canais de chat"
    whatsapp_business:
      - Business API setup
      - Webhook configuration
      - Message templates
      - Media handling
      - Rate limiting
    microsoft_teams:
      - Bot registration
      - Channel configuration
      - Authentication
      - Message formatting
      - File attachments
    other_integrations:
      - Intercom connection
      - Zendesk integration
      - Custom API setup
      - Webhook security
      - Error handling
    artifacts:
      - apps/api/src/integrations/whatsapp.service.ts
      - apps/api/src/integrations/teams.service.ts
      - apps/api/src/webhooks/chat-webhook.handler.ts

  2_message_processing:
    description: "Processamento de mensagens"
    incoming_messages:
      - Message parsing
      - Contact identification
      - Conversation threading
      - Media processing
      - Language detection
    outgoing_messages:
      - Message formatting
      - Template application
      - Personalization
      - Scheduling
      - Delivery confirmation
    conversation_context:
      - History preservation
      - Context awareness
      - Intent recognition
      - Sentiment analysis
      - Escalation triggers
    artifacts:
      - apps/api/src/services/message-processor.service.ts
      - apps/ai-worker/src/chains/conversation-analysis.chain.ts
      - apps/api/src/models/chat-message.model.ts

  3_crm_integration:
    description: "Integração com CRM"
    contact_linking:
      - Phone number matching
      - Contact creation
      - Profile enrichment
      - Relationship mapping
      - Data synchronization
    ticket_creation:
      - Automatic ticket generation
      - Conversation logging
      - Priority assignment
      - Agent notification
      - SLA initiation
    activity_logging:
      - Message history
      - Response times
      - Resolution tracking
      - Quality metrics
      - Performance analytics
    artifacts:
      - apps/api/src/services/crm-chat-integration.service.ts
      - apps/api/src/mappers/chat-to-ticket.mapper.ts
      - apps/web/components/chat/crm-integration-panel.tsx

  4_agent_interface:
    description: "Interface do agente"
    unified_inbox:
      - Multi-channel view
      - Conversation management
      - Quick responses
      - Canned messages
      - Transfer capabilities
    real_time_updates:
      - Live message delivery
      - Typing indicators
      - Read receipts
      - Presence status
      - Queue management
    productivity_tools:
      - AI suggestions
      - Translation support
      - Sentiment monitoring
      - Escalation tools
      - Reporting dashboard
    artifacts:
      - apps/web/components/chat/agent-interface.tsx
      - apps/web/components/chat/unified-inbox.tsx
      - apps/api/src/services/agent-productivity.service.ts

edge_cases:
  - message_delays: "Queue management and prioritization"
  - media_processing: "File validation and compression"
  - language_barriers: "Translation services integration"
  - conversation_overflow: "Load balancing and routing"
  - privacy_compliance: "Data retention and deletion"

technical_artifacts:
  architecture:
    - real_time: WebSocket connections
    - scalability: Horizontal scaling
    - reliability: Message queuing
    - security: End-to-end encryption

  integrations:
    - whatsapp: Business API
    - teams: Microsoft Graph API
    - intercom: REST API
    - custom: Webhook support

  monitoring:
    - message_latency: <2s average
    - delivery_rate: >99.5%
    - agent_response_time: <5min average

success_metrics:
  - customer_satisfaction: >4.5/5
  - resolution_rate: >85%
  - response_time: <2min
  - channel_adoption: >60%
```

**Cenário**: Marina atende múltiplos clientes via WhatsApp Business integrado.

**Passos Detalhados**:

```yaml
1. Mensagem Recebida:
  - Webhook WhatsApp API
  - Parse e validação
  - Match com contato
  - Thread criada/continuada

2. Notificação Agente:
  - Desktop notification
  - Badge no CRM
  - Sound alert
  - Mobile push

3. Interface Unificada:
  - Chat widget no Contact 360
  - Histórico completo
  - Status (online/typing)
  - Media support

4. Resposta:
  - Text + emojis
  - Templates aprovados
  - Imagens/documentos
  - Quick replies
  - AI suggestions

5. Sync e Archive:
  - Todas mensagens salvas
  - Searchable index
  - Compliance ready
  - Export disponível
```

**Edge Cases**:

- Número não registrado → Create lead
- Rate limit → Queue messages
- Media fail → Retry + notify

**Sistemas**:

- `apps/api/src/integrations/whatsapp/webhook.ts`
- `apps/web/components/unified-inbox.tsx`
- `apps/api/src/messaging/thread.service.ts`
