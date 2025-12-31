# IFC-158 Implementation Summary

**Task**: Scheduling Communications - ICS invites, reschedule/cancel flows, reminders
**Sprint**: 11
**Status**: In Progress
**Started**: 2025-12-29

---

## ✅ Completed Phase 1: Architecture & Design

### 1.1 Context Pack & Acknowledgment
- ✅ Created `context_ack.json` with comprehensive invariants and implementation approach
- ✅ Acknowledged all architectural boundaries and dependencies
- ✅ Identified risks and mitigations (IFC-157 dependency clarification needed)

### 1.2 Port Interfaces (Hexagonal Architecture)

#### ICS Generation Service Port
**Location**: `packages/application/src/ports/external/IcsGenerationServicePort.ts`

**Key Features**:
- RFC 5545 compliant iCalendar file generation
- Support for METHOD types: REQUEST (invite/update), CANCEL, REPLY, PUBLISH
- Sequence number handling for versioning
- Reminder (VALARM) configuration
- Priority levels (HIGH, MEDIUM, LOW)
- Three main methods:
  - `generateInvitation()` - Initial invite (SEQUENCE:0, METHOD:REQUEST)
  - `generateUpdate()` - Reschedule (SEQUENCE++, METHOD:REQUEST)
  - `generateCancellation()` - Cancel (METHOD:CANCEL, STATUS:CANCELLED)
- Validation and parsing utilities

**Domain Errors Defined**:
- `IcsGenerationError` - ICS generation failures
- `IcsValidationError` - RFC 5545 validation failures

#### Notification Service Port
**Location**: `packages/application/src/ports/external/NotificationServicePort.ts`

**Key Features**:
- Multi-channel support: email, SMS, push, webhook
- Immediate and scheduled delivery
- Email with attachments (for .ics files)
- Priority levels (high, normal, low)
- Batch sending capability
- Reminder Service specialized for appointments:
  - `scheduleAppointmentReminder()` - Schedule multi-channel reminders
  - `cancelAppointmentReminders()` - Cancel all reminders for appointment
  - `rescheduleAppointmentReminders()` - Update reminder times on reschedule

**Domain Errors Defined**:
- `NotificationDeliveryError` - Delivery failures
- `NotificationSchedulingError` - Scheduling failures

---

## 📋 Next Steps: Implementation Roadmap

### Phase 2: TDD Implementation (Next)

#### 2.1 ICS Generation Service Tests
**File**: `packages/adapters/src/__tests__/IcsGenerationService.test.ts`

**Test Coverage Required** (≥95%):
```typescript
describe('IcsGenerationService', () => {
  describe('generateInvitation', () => {
    it('should generate RFC 5545 compliant ICS for new appointment');
    it('should set METHOD:REQUEST and SEQUENCE:0');
    it('should include all required VEVENT fields (UID, DTSTART, DTEND, SUMMARY)');
    it('should format dates in UTC with Z suffix');
    it('should include VALARM components for reminders');
    it('should handle timezone conversions correctly');
    it('should validate organizer email format');
  });

  describe('generateUpdate', () => {
    it('should increment SEQUENCE number');
    it('should maintain same UID across updates');
    it('should set METHOD:REQUEST');
    it('should preserve DTSTAMP ordering');
  });

  describe('generateCancellation', () => {
    it('should set METHOD:CANCEL');
    it('should set STATUS:CANCELLED');
    it('should include cancellation reason in DESCRIPTION');
    it('should maintain SEQUENCE continuity');
  });

  describe('validate', () => {
    it('should pass valid RFC 5545 ICS content');
    it('should fail on missing required fields');
    it('should fail on invalid date formats');
  });
});
```

#### 2.2 ICS Generation Service Implementation
**File**: `packages/adapters/src/ics/IcsGenerationService.ts`

**Implementation Options**:
1. **Manual**: Write RFC 5545 formatter from scratch (full control, complex)
2. **Library**: Use `ics` npm package (recommended for RFC 5545 compliance)

**Recommended Library**:
```bash
pnpm add ics
pnpm add -D @types/ics
```

**Key Implementation Points**:
- Use `ics.createEvent()` for RFC 5545 compliance
- Format dates in UTC (append 'Z')
- Generate UID: `${appointmentId}@intelliflow-crm.com`
- SEQUENCE starts at 0, increment on each update
- VALARM components for reminders:
  - TRIGGER:-PT15M (15 minutes before)
  - ACTION:DISPLAY or ACTION:EMAIL
- Validate output against RFC 5545 spec

### Phase 3: Reschedule/Cancel Event Handlers

#### 3.1 Domain Event Subscription Service
**File**: `packages/application/src/services/AppointmentIcsEventHandler.ts`

```typescript
class AppointmentIcsEventHandler {
  constructor(
    private icsService: IcsGenerationServicePort,
    private notificationService: NotificationServicePort,
    private calendarService: CalendarServicePort
  ) {}

  async onAppointmentRescheduled(event: AppointmentRescheduledEvent) {
    // 1. Increment sequence number (stored in appointment metadata)
    const sequence = await this.getNextSequence(event.appointmentId);

    // 2. Generate updated ICS
    const icsResult = this.icsService.generateUpdate(appointment, {
      sequence,
      organizerEmail: '...',
      attendees: [...],
      reminders: [...]
    });

    // 3. Send via email to all attendees
    await this.notificationService.sendEmail({
      to: attendees,
      subject: `Rescheduled: ${appointment.title}`,
      htmlBody: 'Appointment has been rescheduled...',
      attachments: [{
        filename: icsResult.filename,
        content: icsResult.content,
        contentType: 'text/calendar; method=REQUEST'
      }]
    });

    // 4. Update external calendar
    if (appointment.externalCalendarId) {
      await this.calendarService.updateEvent(...);
    }

    // 5. Audit trail
    await this.auditLogger.log('appointment_rescheduled_ics_sent', {...});
  }

  async onAppointmentCancelled(event: AppointmentCancelledEvent) {
    // Similar flow with METHOD:CANCEL
  }
}
```

#### 3.2 Tests for Event Handlers
**File**: `packages/application/src/__tests__/AppointmentIcsEventHandler.test.ts`

```typescript
describe('AppointmentIcsEventHandler', () => {
  it('should generate and send ICS update on reschedule');
  it('should increment sequence number on reschedule');
  it('should generate and send ICS cancel on cancellation');
  it('should update external calendar if linked');
  it('should create audit trail for each operation');
});
```

### Phase 4: Reminder Scheduling Integration

#### 4.1 Reminder Scheduler Service
**File**: `packages/application/src/services/ReminderSchedulerService.ts`

```typescript
class ReminderSchedulerService implements ReminderServicePort {
  async scheduleAppointmentReminder(
    appointmentId: string,
    reminderMinutes: number,
    appointmentStartTime: Date,
    recipientEmail: string,
    recipientPhone?: string,
    channels: NotificationChannel[] = ['email']
  ) {
    const triggerTime = new Date(
      appointmentStartTime.getTime() - reminderMinutes * 60 * 1000
    );

    const scheduledNotifications: ScheduledNotification[] = [];

    for (const channel of channels) {
      if (channel === 'email') {
        const result = await this.notificationService.schedule(
          'email',
          triggerTime,
          {
            to: [recipientEmail],
            subject: `Reminder: Appointment in ${reminderMinutes} minutes`,
            htmlBody: `Your appointment "${appointment.title}" starts at ${appointmentStartTime}`
          },
          'high'
        );
        scheduledNotifications.push(result.value);
      }
      // Handle SMS, push, etc.
    }

    return Result.ok(scheduledNotifications);
  }
}
```

### Phase 5: Audit Trail

#### 5.1 Audit Logger Port
**File**: `packages/application/src/ports/external/AuditLoggerPort.ts`

```typescript
export interface AuditLoggerPort {
  log(
    eventType: string,
    payload: Record<string, any>,
    userId?: string
  ): Promise<void>;
}
```

#### 5.2 Audit Events
- `ics_invitation_generated` - Initial ICS created
- `ics_invitation_sent` - Email with ICS sent
- `ics_update_generated` - Reschedule ICS created
- `ics_update_sent` - Reschedule email sent
- `ics_cancel_generated` - Cancel ICS created
- `ics_cancel_sent` - Cancel email sent
- `reminder_scheduled` - Reminder scheduled
- `reminder_sent` - Reminder delivered
- `reminder_cancelled` - Reminder cancelled

### Phase 6: Integration Tests

#### 6.1 E2E Test Scenarios
**File**: `tests/integration/scheduling/appointment-ics-flow.test.ts`

```typescript
describe('Appointment ICS Flow (E2E)', () => {
  it('should create appointment and send ICS invitation', async () => {
    // 1. Create appointment
    const appointment = await appointmentService.create({...});

    // 2. Verify ICS generated
    expect(icsService.generateInvitation).toHaveBeenCalled();

    // 3. Verify email sent with ICS attachment
    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({
            contentType: 'text/calendar'
          })
        ])
      })
    );

    // 4. Verify audit trail
    expect(auditLogger.log).toHaveBeenCalledWith('ics_invitation_sent', ...);
  });

  it('should reschedule and send updated ICS with SEQUENCE++', async () => {
    // 1. Create appointment
    // 2. Reschedule
    const result = await appointment.reschedule(newStart, newEnd, userId);

    // 3. Verify SEQUENCE incremented
    const ics = await icsService.generate(...);
    expect(ics.sequence).toBe(1);

    // 4. Verify email sent
    // 5. Verify audit trail
  });

  it('should cancel and send ICS with METHOD:CANCEL', async () => {
    // 1. Create appointment
    // 2. Cancel
    // 3. Verify METHOD:CANCEL, STATUS:CANCELLED
    // 4. Verify email sent
    // 5. Verify reminders cancelled
  });

  it('should schedule reminders at correct times', async () => {
    // Test reminder scheduling 15min, 1hr, 1day before
  });
});
```

---

## 🎯 Definition of Done Checklist

### Functional Requirements
- [ ] ICS files generated for new appointments (METHOD:REQUEST, SEQUENCE:0)
- [ ] ICS files regenerated on reschedule (SEQUENCE++, METHOD:REQUEST)
- [ ] ICS cancel files generated on cancellation (METHOD:CANCEL, STATUS:CANCELLED)
- [ ] Reminders scheduled via notification service
- [ ] Email delivery with .ics attachments working
- [ ] Audit trail captures all operations

### Non-Functional Requirements
- [ ] Test coverage ≥95% (domain), ≥90% (overall)
- [ ] All integration tests pass (`pnpm test:e2e`)
- [ ] TypeScript strict mode passes (`pnpm run typecheck`)
- [ ] Linting passes (`pnpm run lint --max-warnings=0`)
- [ ] Build succeeds (`pnpm run build`)

### Evidence Artifacts Required
- [x] `context_ack.json`
- [ ] Unit test files (IcsGenerationService.test.ts)
- [ ] Integration test files (appointment-ics-flow.test.ts)
- [ ] ICS sample output files (for manual RFC 5545 validation)
- [ ] Test coverage report (≥90%)
- [ ] Audit trail schema and sample logs

---

## 📦 Dependencies & Risks

### Dependencies Status
- ✅ **IFC-138** (DONE): Google Calendar adapter provides calendar sync patterns
- ✅ **IFC-137** (DONE): Notification service MVP available for reminder delivery
- ⚠️ **IFC-157** (BACKLOG): Unknown dependency - needs clarification

### Risk Register
| Risk | Impact | Mitigation |
|------|--------|------------|
| IFC-157 dependency unclear | Medium | Proceed with available context; block if truly required |
| RFC 5545 complexity | Medium | Use `ics` npm library for spec compliance |
| Timezone handling errors | High | Store UTC, use Luxon/date-fns for conversion, extensive testing |
| Email delivery failures | Medium | Retry logic, DLQ, delivery status tracking |
| Reminder scheduling drift | Low | Use cron/queue system with idempotency |

---

## 📚 References

- **RFC 5545**: [iCalendar Specification](https://datatracker.ietf.org/doc/html/rfc5545)
- **FLOW-019**: Meeting scheduling user flow
- **Framework v4.3 FINAL**: STOA governance model
- **Hexagonal Architecture**: `docs/architecture/hex-boundaries.md`
- **Google Calendar Adapter**: `packages/adapters/src/calendar/google/client.ts`
- **Appointment Domain Model**: `packages/domain/src/legal/appointments/Appointment.ts`

---

## 🚀 Next Immediate Actions

1. **Install ICS library**:
   ```bash
   cd packages/adapters
   pnpm add ics
   pnpm add -D @types/ics
   ```

2. **Create test file**:
   ```bash
   touch packages/adapters/src/__tests__/IcsGenerationService.test.ts
   ```

3. **Write failing tests** (TDD red phase)

4. **Implement IcsGenerationService** (TDD green phase)

5. **Refactor** (TDD refactor phase)

6. **Repeat for event handlers, reminders, audit trail**

7. **Run full validation**:
   ```bash
   pnpm run typecheck
   pnpm run lint
   pnpm run test:coverage
   pnpm run test:e2e
   ```

---

**Last Updated**: 2025-12-29 23:50 UTC
**Next Review**: After Phase 2 completion (TDD implementation)
