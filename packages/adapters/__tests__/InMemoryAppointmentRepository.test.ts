import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InMemoryAppointmentRepository } from '../src/repositories/InMemoryAppointmentRepository';
import { Appointment, AppointmentId, TimeSlot, CaseId, Buffer } from '@intelliflow/domain';

describe('InMemoryAppointmentRepository', () => {
  let repository: InMemoryAppointmentRepository;

  beforeEach(() => {
    repository = new InMemoryAppointmentRepository();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0)); // Jan 15, 2025 10:00
  });

  afterEach(() => {
    vi.useRealTimers();
    repository.clear();
  });

  // Creates an appointment - if allowPast is true, uses reconstitute to bypass validation
  function createAppointment(overrides: {
    title?: string;
    startTime?: Date;
    endTime?: Date;
    organizerId?: string;
    attendeeIds?: string[];
    linkedCaseIds?: CaseId[];
    reminderMinutes?: number;
    allowPast?: boolean;
  } = {}): Appointment {
    const startTime = overrides.startTime ?? new Date(2025, 0, 16, 14, 0, 0);
    // Default endTime is 1 hour after startTime
    const endTime = overrides.endTime ?? new Date(startTime.getTime() + 60 * 60 * 1000);
    const now = new Date();

    // If the appointment is in the past, use reconstitute to bypass validation
    if (overrides.allowPast && startTime < now) {
      const timeSlot = TimeSlot.reconstitute(startTime, endTime);
      return Appointment.reconstitute(AppointmentId.generate(), {
        title: overrides.title ?? 'Test Appointment',
        description: undefined,
        timeSlot,
        appointmentType: 'INTERNAL_MEETING',
        location: undefined,
        status: 'SCHEDULED',
        buffer: Buffer.none(),
        recurrence: undefined,
        attendeeIds: overrides.attendeeIds ?? [],
        linkedCaseIds: overrides.linkedCaseIds ?? [],
        organizerId: overrides.organizerId ?? 'user-123',
        notes: undefined,
        externalCalendarId: undefined,
        reminderMinutes: overrides.reminderMinutes,
        createdAt: new Date(),
        updatedAt: new Date(),
        cancelledAt: undefined,
        completedAt: undefined,
        cancellationReason: undefined,
      });
    }

    return Appointment.create({
      title: overrides.title ?? 'Test Appointment',
      startTime,
      endTime,
      appointmentType: 'INTERNAL_MEETING',
      organizerId: overrides.organizerId ?? 'user-123',
      attendeeIds: overrides.attendeeIds,
      linkedCaseIds: overrides.linkedCaseIds,
      reminderMinutes: overrides.reminderMinutes,
    }).value;
  }

  describe('save and findById', () => {
    it('should save and retrieve an appointment', async () => {
      const appointment = createAppointment();

      await repository.save(appointment);
      const found = await repository.findById(appointment.id);

      expect(found).not.toBeNull();
      expect(found?.id.value).toBe(appointment.id.value);
      expect(found?.title).toBe('Test Appointment');
    });

    it('should return null for non-existent appointment', async () => {
      const id = AppointmentId.generate();
      const found = await repository.findById(id);

      expect(found).toBeNull();
    });

    it('should update an existing appointment when saving again', async () => {
      const appointment = createAppointment({ title: 'Original' });
      await repository.save(appointment);

      appointment.updateDetails({ title: 'Updated' });
      await repository.save(appointment);

      const found = await repository.findById(appointment.id);
      expect(found?.title).toBe('Updated');
      expect(repository.count()).toBe(1);
    });
  });

  describe('saveAll', () => {
    it('should save multiple appointments', async () => {
      const appointments = [
        createAppointment({ title: 'Meeting 1' }),
        createAppointment({ title: 'Meeting 2' }),
        createAppointment({ title: 'Meeting 3' }),
      ];

      await repository.saveAll(appointments);

      expect(repository.count()).toBe(3);
    });
  });

  describe('findByIds', () => {
    it('should find multiple appointments by IDs', async () => {
      const apt1 = createAppointment({ title: 'Meeting 1' });
      const apt2 = createAppointment({ title: 'Meeting 2' });
      const apt3 = createAppointment({ title: 'Meeting 3' });

      await repository.saveAll([apt1, apt2, apt3]);

      const found = await repository.findByIds([apt1.id, apt3.id]);

      expect(found).toHaveLength(2);
      expect(found.map((a) => a.title)).toContain('Meeting 1');
      expect(found.map((a) => a.title)).toContain('Meeting 3');
    });

    it('should return empty array when no IDs match', async () => {
      const found = await repository.findByIds([AppointmentId.generate()]);
      expect(found).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('should delete an appointment', async () => {
      const appointment = createAppointment();
      await repository.save(appointment);

      await repository.delete(appointment.id);

      const found = await repository.findById(appointment.id);
      expect(found).toBeNull();
    });

    it('should not throw when deleting non-existent appointment', async () => {
      const id = AppointmentId.generate();
      await expect(repository.delete(id)).resolves.not.toThrow();
    });
  });

  describe('findByOrganizer', () => {
    it('should find appointments by organizer', async () => {
      await repository.save(createAppointment({ organizerId: 'user-1' }));
      await repository.save(createAppointment({ organizerId: 'user-1' }));
      await repository.save(createAppointment({ organizerId: 'user-2' }));

      const found = await repository.findByOrganizer('user-1');

      expect(found).toHaveLength(2);
    });

    it('should return appointments sorted by start time', async () => {
      await repository.save(
        createAppointment({
          organizerId: 'user-1',
          startTime: new Date(2025, 0, 17, 14, 0, 0),
        })
      );
      await repository.save(
        createAppointment({
          organizerId: 'user-1',
          startTime: new Date(2025, 0, 16, 10, 0, 0),
        })
      );

      const found = await repository.findByOrganizer('user-1');

      expect(found[0].startTime.getTime()).toBeLessThan(found[1].startTime.getTime());
    });

    it('should support pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await repository.save(
          createAppointment({
            organizerId: 'user-1',
            startTime: new Date(2025, 0, 16 + i, 10, 0, 0),
          })
        );
      }

      const found = await repository.findByOrganizer('user-1', { limit: 2, offset: 1 });

      expect(found).toHaveLength(2);
    });
  });

  describe('findByAttendee', () => {
    it('should find appointments where user is organizer', async () => {
      await repository.save(createAppointment({ organizerId: 'user-1' }));

      const found = await repository.findByAttendee('user-1');

      expect(found).toHaveLength(1);
    });

    it('should find appointments where user is attendee', async () => {
      await repository.save(
        createAppointment({
          organizerId: 'user-1',
          attendeeIds: ['user-2', 'user-3'],
        })
      );

      const found = await repository.findByAttendee('user-2');

      expect(found).toHaveLength(1);
    });

    it('should find all appointments for user as organizer or attendee', async () => {
      await repository.save(createAppointment({ organizerId: 'user-1' }));
      await repository.save(
        createAppointment({
          organizerId: 'user-2',
          attendeeIds: ['user-1'],
        })
      );

      const found = await repository.findByAttendee('user-1');

      expect(found).toHaveLength(2);
    });
  });

  describe('findByCase', () => {
    it('should find appointments linked to a case', async () => {
      const caseId = CaseId.generate();
      await repository.save(createAppointment({ linkedCaseIds: [caseId] }));
      await repository.save(createAppointment());

      const found = await repository.findByCase(caseId);

      expect(found).toHaveLength(1);
    });
  });

  describe('findInTimeRange', () => {
    it('should find appointments in time range', async () => {
      await repository.save(
        createAppointment({
          startTime: new Date(2025, 0, 16, 10, 0, 0),
          endTime: new Date(2025, 0, 16, 11, 0, 0),
        })
      );
      await repository.save(
        createAppointment({
          startTime: new Date(2025, 0, 17, 10, 0, 0),
          endTime: new Date(2025, 0, 17, 11, 0, 0),
        })
      );
      await repository.save(
        createAppointment({
          startTime: new Date(2025, 0, 20, 10, 0, 0),
          endTime: new Date(2025, 0, 20, 11, 0, 0),
        })
      );

      const found = await repository.findInTimeRange(
        new Date(2025, 0, 16, 0, 0, 0),
        new Date(2025, 0, 18, 0, 0, 0)
      );

      expect(found).toHaveLength(2);
    });

    it('should include partially overlapping appointments', async () => {
      await repository.save(
        createAppointment({
          startTime: new Date(2025, 0, 16, 23, 0, 0),
          endTime: new Date(2025, 0, 17, 1, 0, 0),
        })
      );

      const found = await repository.findInTimeRange(
        new Date(2025, 0, 17, 0, 0, 0),
        new Date(2025, 0, 18, 0, 0, 0)
      );

      expect(found).toHaveLength(1);
    });
  });

  describe('findOverlapping', () => {
    it('should find overlapping appointments', async () => {
      await repository.save(
        createAppointment({
          startTime: new Date(2025, 0, 16, 14, 0, 0),
          endTime: new Date(2025, 0, 16, 15, 0, 0),
        })
      );

      const timeSlot = TimeSlot.create(
        new Date(2025, 0, 16, 14, 30, 0),
        new Date(2025, 0, 16, 15, 30, 0)
      ).value;

      const found = await repository.findOverlapping(timeSlot);

      expect(found).toHaveLength(1);
    });

    it('should exclude cancelled appointments', async () => {
      const apt = createAppointment({
        startTime: new Date(2025, 0, 16, 14, 0, 0),
        endTime: new Date(2025, 0, 16, 15, 0, 0),
      });
      apt.cancel('user-123', 'No longer needed');
      await repository.save(apt);

      const timeSlot = TimeSlot.create(
        new Date(2025, 0, 16, 14, 30, 0),
        new Date(2025, 0, 16, 15, 30, 0)
      ).value;

      const found = await repository.findOverlapping(timeSlot);

      expect(found).toHaveLength(0);
    });

    it('should exclude specified appointment', async () => {
      const apt = createAppointment({
        startTime: new Date(2025, 0, 16, 14, 0, 0),
        endTime: new Date(2025, 0, 16, 15, 0, 0),
      });
      await repository.save(apt);

      const timeSlot = TimeSlot.create(
        new Date(2025, 0, 16, 14, 30, 0),
        new Date(2025, 0, 16, 15, 30, 0)
      ).value;

      const found = await repository.findOverlapping(timeSlot, apt.id);

      expect(found).toHaveLength(0);
    });
  });

  describe('findForConflictCheck', () => {
    it('should find conflicts for attendees in time range', async () => {
      await repository.save(
        createAppointment({
          organizerId: 'user-1',
          startTime: new Date(2025, 0, 16, 14, 0, 0),
          endTime: new Date(2025, 0, 16, 15, 0, 0),
        })
      );

      const found = await repository.findForConflictCheck(['user-1'], {
        startTime: new Date(2025, 0, 16, 14, 30, 0),
        endTime: new Date(2025, 0, 16, 15, 30, 0),
      });

      expect(found).toHaveLength(1);
    });

    it('should not find conflicts for different attendees', async () => {
      await repository.save(
        createAppointment({
          organizerId: 'user-1',
          startTime: new Date(2025, 0, 16, 14, 0, 0),
          endTime: new Date(2025, 0, 16, 15, 0, 0),
        })
      );

      const found = await repository.findForConflictCheck(['user-2'], {
        startTime: new Date(2025, 0, 16, 14, 30, 0),
        endTime: new Date(2025, 0, 16, 15, 30, 0),
      });

      expect(found).toHaveLength(0);
    });
  });

  describe('findWithFilters', () => {
    it('should filter by organizer', async () => {
      await repository.save(createAppointment({ organizerId: 'user-1' }));
      await repository.save(createAppointment({ organizerId: 'user-2' }));

      const result = await repository.findWithFilters({ organizerId: 'user-1' });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by status', async () => {
      const apt1 = createAppointment();
      const apt2 = createAppointment();
      apt2.cancel('user', 'test');
      await repository.saveAll([apt1, apt2]);

      const result = await repository.findWithFilters({ status: 'SCHEDULED' });

      expect(result.items).toHaveLength(1);
    });

    it('should filter by time range', async () => {
      await repository.save(
        createAppointment({
          startTime: new Date(2025, 0, 16, 10, 0, 0),
        })
      );
      await repository.save(
        createAppointment({
          startTime: new Date(2025, 0, 20, 10, 0, 0),
        })
      );

      const result = await repository.findWithFilters({
        startTimeFrom: new Date(2025, 0, 15),
        startTimeTo: new Date(2025, 0, 17),
      });

      expect(result.items).toHaveLength(1);
    });

    it('should support pagination', async () => {
      for (let i = 0; i < 10; i++) {
        await repository.save(
          createAppointment({
            startTime: new Date(2025, 0, 16 + i, 10, 0, 0),
          })
        );
      }

      const result = await repository.findWithFilters({}, { limit: 3, offset: 2 });

      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(10);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('countByStatus', () => {
    it('should count appointments by status', async () => {
      const apt1 = createAppointment();
      const apt2 = createAppointment();
      const apt3 = createAppointment();
      apt2.cancel('user', 'test');
      apt3.complete('user');
      await repository.saveAll([apt1, apt2, apt3]);

      const counts = await repository.countByStatus();

      expect(counts.SCHEDULED).toBe(1);
      expect(counts.CANCELLED).toBe(1);
      expect(counts.COMPLETED).toBe(1);
    });

    it('should filter by organizer when provided', async () => {
      await repository.save(createAppointment({ organizerId: 'user-1' }));
      await repository.save(createAppointment({ organizerId: 'user-2' }));

      const counts = await repository.countByStatus('user-1');

      expect(counts.SCHEDULED).toBe(1);
    });
  });

  describe('findUpcoming', () => {
    it('should find upcoming appointments', async () => {
      // Future appointment
      await repository.save(
        createAppointment({
          organizerId: 'user-1',
          startTime: new Date(2025, 0, 16, 14, 0, 0),
          endTime: new Date(2025, 0, 16, 15, 0, 0),
        })
      );
      // Past appointment (use reconstitute to bypass validation)
      await repository.save(
        createAppointment({
          organizerId: 'user-1',
          startTime: new Date(2025, 0, 14, 10, 0, 0),
          endTime: new Date(2025, 0, 14, 11, 0, 0),
          allowPast: true,
        })
      );

      const found = await repository.findUpcoming('user-1');

      expect(found).toHaveLength(1);
    });

    it('should exclude cancelled appointments', async () => {
      const apt = createAppointment({
        organizerId: 'user-1',
        startTime: new Date(2025, 0, 16, 14, 0, 0),
        endTime: new Date(2025, 0, 16, 15, 0, 0),
      });
      apt.cancel('user', 'test');
      await repository.save(apt);

      const found = await repository.findUpcoming('user-1');

      expect(found).toHaveLength(0);
    });

    it('should respect limit', async () => {
      for (let i = 0; i < 5; i++) {
        await repository.save(
          createAppointment({
            organizerId: 'user-1',
            startTime: new Date(2025, 0, 16 + i, 14, 0, 0),
            endTime: new Date(2025, 0, 16 + i, 15, 0, 0),
          })
        );
      }

      const found = await repository.findUpcoming('user-1', 3);

      expect(found).toHaveLength(3);
    });
  });

  describe('findPast', () => {
    it('should find past appointments', async () => {
      // Past appointment (use reconstitute to bypass validation)
      await repository.save(
        createAppointment({
          organizerId: 'user-1',
          startTime: new Date(2025, 0, 10, 10, 0, 0),
          endTime: new Date(2025, 0, 10, 11, 0, 0),
          allowPast: true,
        })
      );
      // Future appointment
      await repository.save(
        createAppointment({
          organizerId: 'user-1',
          startTime: new Date(2025, 0, 20, 10, 0, 0),
          endTime: new Date(2025, 0, 20, 11, 0, 0),
        })
      );

      const found = await repository.findPast('user-1');

      expect(found).toHaveLength(1);
    });

    it('should sort by start time descending', async () => {
      await repository.save(
        createAppointment({
          organizerId: 'user-1',
          startTime: new Date(2025, 0, 5, 10, 0, 0),
          endTime: new Date(2025, 0, 5, 11, 0, 0),
          allowPast: true,
        })
      );
      await repository.save(
        createAppointment({
          organizerId: 'user-1',
          startTime: new Date(2025, 0, 10, 10, 0, 0),
          endTime: new Date(2025, 0, 10, 11, 0, 0),
          allowPast: true,
        })
      );

      const found = await repository.findPast('user-1');

      expect(found[0].startTime.getTime()).toBeGreaterThan(found[1].startTime.getTime());
    });
  });

  describe('findByExternalCalendarId', () => {
    it('should find appointment by external calendar ID', async () => {
      const apt = Appointment.create({
        title: 'Synced Meeting',
        startTime: new Date(2025, 0, 16, 14, 0, 0),
        endTime: new Date(2025, 0, 16, 15, 0, 0),
        appointmentType: 'INTERNAL_MEETING',
        organizerId: 'user-123',
      }).value;
      apt.setExternalCalendarId('google-calendar-123');
      await repository.save(apt);

      const found = await repository.findByExternalCalendarId('google-calendar-123');

      expect(found).not.toBeNull();
      expect(found?.title).toBe('Synced Meeting');
    });

    it('should return null when not found', async () => {
      const found = await repository.findByExternalCalendarId('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('hasConflicts', () => {
    it('should return true when conflicts exist', async () => {
      await repository.save(
        createAppointment({
          organizerId: 'user-1',
          startTime: new Date(2025, 0, 16, 14, 0, 0),
          endTime: new Date(2025, 0, 16, 15, 0, 0),
        })
      );

      const timeSlot = TimeSlot.create(
        new Date(2025, 0, 16, 14, 30, 0),
        new Date(2025, 0, 16, 15, 30, 0)
      ).value;

      const hasConflicts = await repository.hasConflicts(timeSlot, ['user-1']);

      expect(hasConflicts).toBe(true);
    });

    it('should return false when no conflicts', async () => {
      await repository.save(
        createAppointment({
          organizerId: 'user-1',
          startTime: new Date(2025, 0, 16, 14, 0, 0),
          endTime: new Date(2025, 0, 16, 15, 0, 0),
        })
      );

      const timeSlot = TimeSlot.create(
        new Date(2025, 0, 16, 16, 0, 0),
        new Date(2025, 0, 16, 17, 0, 0)
      ).value;

      const hasConflicts = await repository.hasConflicts(timeSlot, ['user-1']);

      expect(hasConflicts).toBe(false);
    });

    it('should exclude specified appointment', async () => {
      const apt = createAppointment({
        organizerId: 'user-1',
        startTime: new Date(2025, 0, 16, 14, 0, 0),
        endTime: new Date(2025, 0, 16, 15, 0, 0),
      });
      await repository.save(apt);

      const timeSlot = TimeSlot.create(
        new Date(2025, 0, 16, 14, 30, 0),
        new Date(2025, 0, 16, 15, 30, 0)
      ).value;

      const hasConflicts = await repository.hasConflicts(timeSlot, ['user-1'], apt.id);

      expect(hasConflicts).toBe(false);
    });
  });

  describe('findNeedingReminder', () => {
    it('should find appointments needing reminder', async () => {
      await repository.save(
        createAppointment({
          startTime: new Date(2025, 0, 15, 10, 30, 0), // 30 minutes from now
          endTime: new Date(2025, 0, 15, 11, 30, 0),
          reminderMinutes: 60,
        })
      );

      const found = await repository.findNeedingReminder(60);

      expect(found).toHaveLength(1);
    });

    it('should not find appointments without reminder', async () => {
      await repository.save(
        createAppointment({
          startTime: new Date(2025, 0, 15, 10, 30, 0),
          endTime: new Date(2025, 0, 15, 11, 30, 0),
        })
      );

      const found = await repository.findNeedingReminder(60);

      expect(found).toHaveLength(0);
    });
  });

  describe('test helpers', () => {
    it('should clear all appointments', async () => {
      await repository.save(createAppointment());
      await repository.save(createAppointment());

      repository.clear();

      expect(repository.count()).toBe(0);
    });

    it('should get all appointments', async () => {
      await repository.save(createAppointment({ title: 'Meeting 1' }));
      await repository.save(createAppointment({ title: 'Meeting 2' }));

      const all = repository.getAll();

      expect(all).toHaveLength(2);
    });

    it('should count appointments', async () => {
      await repository.save(createAppointment());
      await repository.save(createAppointment());

      expect(repository.count()).toBe(2);
    });
  });
});
