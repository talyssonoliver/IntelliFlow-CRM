### 4.4 Agendamento de Reunião (sincronizado com Google/Outlook)

**Cenário**: Vendedor agenda reunião com cliente através do CRM.

**Especificações Técnicas**:

```yaml
id: FLOW-019
name: Agendamento de Reuniões
category: Comunicação
priority: Medium
sprint: 5

actors:
  - Organizador
  - Participantes
  - Sistema de Calendário
  - CRM Integration

pre_conditions:
  - Conta de calendário conectada
  - Contatos com emails válidos
  - Disponibilidade verificada
  - Permissões de agendamento

flow_steps:
  1_availability_check:
    description: "Verificação de disponibilidade"
    calendar_integration:
      - Google Calendar API
      - Outlook Graph API
      - Free/Busy status
      - Time zone handling
      - Recurring events
    participant_availability:
      - Multiple calendar sync
      - Conflict detection
      - Alternative suggestions
      - Buffer time consideration
      - Working hours respect
    smart_scheduling:
      - AI-powered suggestions
      - Historical preferences
      - Optimal time analysis
      - Meeting pattern learning
      - Success rate optimization
    artifacts:
      - apps/api/src/integrations/calendar.service.ts
      - apps/api/src/services/availability-checker.service.ts
      - apps/ai-worker/src/algorithms/scheduling-algo.ts

  2_meeting_creation:
    description: "Criação da reunião"
    meeting_details:
      - Title and description
      - Date and time
      - Duration selection
      - Location options
      - Virtual meeting links
    participant_management:
      - Contact selection
      - Email validation
      - Role assignment
      - RSVP tracking
      - Reminder settings
    crm_context:
      - Deal association
      - Contact linking
      - Activity logging
      - Follow-up tasks
      - Document attachment
    artifacts:
      - apps/web/components/calendar/meeting-scheduler.tsx
      - apps/api/src/services/meeting-creator.service.ts
      - apps/api/src/models/meeting.model.ts

  3_invitation_delivery:
    description: "Entrega de convites"
    email_invitations:
      - Calendar attachment
      - RSVP links
      - Meeting details
      - Agenda inclusion
      - Branding
    calendar_sync:
      - Automatic addition
      - Reminder setup
      - Color coding
      - Category assignment
      - Conflict alerts
    notification_system:
      - SMS reminders
      - Push notifications
      - Slack/Teams alerts
      - Custom notifications
      - Escalation rules
    artifacts:
      - apps/api/src/services/invitation-deliverer.service.ts
      - apps/api/src/templates/meeting-invitations/
      - apps/api/src/integrations/notification.service.ts

  4_meeting_management:
    description: "Gestão da reunião"
    status_tracking:
      - RSVP responses
      - Attendance confirmation
      - No-show handling
      - Rescheduling requests
      - Cancellation processing
    follow_up_actions:
      - Meeting notes
      - Action items
      - Next steps
      - Document sharing
      - Feedback collection
    integration_updates:
      - CRM activity update
      - Deal progression
      - Task completion
      - Analytics update
      - Performance tracking
    artifacts:
      - apps/api/src/services/meeting-manager.service.ts
      - apps/web/components/meetings/follow-up-form.tsx
      - apps/api/src/workflows/meeting-followup.workflow.ts

edge_cases:
  - scheduling_conflicts: "Alternative time suggestions"
  - timezone_complexity: "Multi-timezone handling"
  - last_minute_changes: "Real-time updates"
  - recurring_meetings: "Series management"
  - external_participants: "Guest handling"

technical_artifacts:
  integrations:
    - google_calendar: Calendar API v3
    - outlook: Microsoft Graph API
    - zoom: Meeting API
    - teams: Integration API

  automation:
    - scheduling: AI-powered optimization
    - reminders: Multi-channel delivery
    - follow_up: Automated workflows

  reliability:
    - sync_accuracy: >99%
    - delivery_success: >98%
    - conflict_detection: >95%

success_metrics:
  - meeting_show_rate: >80%
  - scheduling_efficiency: <5min average
  - calendar_sync_accuracy: >99%
  - participant_satisfaction: >4.5/5
```

**Cenário**: Olívia agenda demos com prospects respeitando disponibilidade
mútua.

**Passos Detalhados**:

```yaml
1. Iniciar Agendamento:
  - Botão "Schedule Meeting"
  - Tipo: Demo/Discovery/Follow-up
  - Duração: 30/45/60 min
  - Participantes internos

2. Disponibilidade:
  - Calendário integrado
  - Busy/Free slots
  - Timezone do contato
  - Buffer time config

3. Propor Horários:
  - 3 slots sugeridos
  - Email template
  - Calendly-like link
  - Confirm button

4. Confirmação:
  - Cliente seleciona slot
  - Calendar invite auto
  - Zoom/Teams link
  - Reminder schedule
  - iCal attachment

5. Preparação:
  - Agenda sugerida (AI)
  - Materiais relevantes
  - Briefing do contato
  - Team notification
```

**Edge Cases**:

- Conflito calendário → Re-suggest
- No-show → Follow-up auto
- Reschedule → Update all

**Sistemas**:

- `apps/web/components/meeting-scheduler.tsx`
- `apps/api/src/calendar/availability.service.ts`
- Google Calendar API / MS Graph API
