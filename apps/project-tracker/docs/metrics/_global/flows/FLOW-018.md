### 4.3 Registro de Chamada (manual ou VoIP integrado)

**Cenário**: Vendedor registra chamada telefônica com cliente no CRM.

**Especificações Técnicas**:

```yaml
id: FLOW-018
name: Registro de Chamadas Telefônicas
category: Comunicação
priority: Medium
sprint: 5

actors:
  - Usuário do CRM
  - Sistema de Telefonia
  - Contacto
  - Sistema de Gravação

pre_conditions:
  - Integração VoIP configurada
  - Permissões de gravação
  - Contacto identificado
  - Compliance aprovado

flow_steps:
  1_call_initiation:
    description: 'Iniciação da chamada'
    manual_dialing:
      - Click-to-call integration
      - Number validation
      - Contact lookup
      - Context loading
      - Permission check
    voip_integration:
      - Softphone integration
      - WebRTC setup
      - Audio quality
      - Network optimization
      - Fallback options
    automated_dialing:
      - Campaign dialing
      - Predictive dialing
      - Preview dialing
      - Progressive dialing
      - Compliance monitoring
    artifacts:
      - apps/web/components/phone/dialer.tsx
      - apps/api/src/integrations/voip.service.ts
      - apps/api/src/services/call-initiator.service.ts

  2_call_recording:
    description: 'Gravação da chamada'
    recording_setup:
      - Automatic start
      - Dual channel recording
      - Quality monitoring
      - Storage allocation
      - Encryption setup
    compliance_handling:
      - Legal requirements
      - Consent management
      - Retention policies
      - Access controls
      - Audit trails
    storage_management:
      - Cloud storage
      - Compression
      - Backup strategy
      - Lifecycle management
      - Cost optimization
    artifacts:
      - apps/api/src/services/call-recorder.service.ts
      - apps/api/src/services/compliance-manager.service.ts
      - apps/api/src/models/call-recording.model.ts

  3_call_logging:
    description: 'Registro da chamada'
    metadata_capture:
      - Call duration
      - Start/end times
      - Phone numbers
      - Call outcome
      - Follow-up actions
    crm_integration:
      - Activity creation
      - Contact update
      - Deal progression
      - Task scheduling
      - Note attachment
    transcription_service:
      - Speech-to-text
      - Language detection
      - Keyword extraction
      - Sentiment analysis
      - Summary generation
    artifacts:
      - apps/api/src/services/call-logger.service.ts
      - apps/ai-worker/src/chains/call-transcription.chain.ts
      - apps/web/components/calls/call-log-form.tsx

  4_post_call_actions:
    description: 'Ações pós-chamada'
    follow_up_tasks:
      - Email follow-up
      - Meeting scheduling
      - Document sending
      - Task creation
      - Reminder setup
    analytics_update:
      - Call metrics
      - Performance tracking
      - Contact scoring
      - Pipeline updates
      - Trend analysis
    quality_assurance:
      - Call review
      - Coaching feedback
      - Process improvement
      - Training needs
      - Best practices
    artifacts:
      - apps/api/src/workflows/post-call.workflow.ts
      - apps/api/src/services/call-analytics.service.ts
      - apps/web/components/calls/quality-review.tsx

edge_cases:
  - call_drops: 'Automatic reconnection'
  - recording_failures: 'Manual note-taking fallback'
  - compliance_violations: 'Immediate termination'
  - international_calls: 'Rate and compliance checking'
  - emergency_situations: 'Priority handling'

technical_artifacts:
  infrastructure:
    - voip_providers: Twilio, Plivo, Nexmo
    - recording_storage: S3 with encryption
    - transcription: AWS Transcribe, Google Speech
    - real_time: WebRTC, SIP

  security:
    - encryption: TLS + SRTP
    - access_control: Role-based permissions
    - audit_trails: Complete call logging
    - compliance: GDPR, TCPA, SOX

  performance:
    - connection_time: <3s
    - recording_quality: HD audio
    - transcription_accuracy: >90

success_metrics:
  - call_completion_rate: >85
  - recording_success: >98
  - transcription_accuracy: >90
  - follow_up_completion: >75
```

**Cenário**: Nathan faz 30 ligações/dia e precisa logging eficiente com
insights.

**Passos Detalhados**:

```yaml
1. Iniciar Chamada:
  - Click-to-call no número
  - VoIP popup (Aircall/Twilio)
  - Auto-pause outras tasks
  - Screen pop contact info

2. Durante Chamada:
  - Timer ativo
  - Notes em real-time
  - Sentiment indicator
  - Pause/Resume

3. Call Wrap-up:
  - Duração registrada
  - Outcome (interested/not/callback)
  - Next action scheduled
  - Voice memo option

4. AI Processing:
  - Transcrição (se gravada)
  - Summary bullets
  - Action items extracted
  - Sentiment scored

5. Updates:
  - Activity timeline
  - Call stats updated
  - Team leaderboard
  - Coaching flags
```

**Edge Cases**:

- Call dropped → Auto-save partial
- No answer → Quick log option
- Compliance → Recording consent

**Sistemas**:

- `apps/web/components/call-logger.tsx`
- `apps/api/src/telephony/voip.service.ts`
- `apps/ai-worker/src/transcription/processor.ts`
