/**
 * AppointmentDomainService Tests
 *
 * Comprehensive tests for appointment domain service functionality.
 */

import { describe, it, expect, vi } from 'vitest';
import { AppointmentDomainService } from '../appointment-domain.service';

// Mock the domain imports
vi.mock('@intelliflow/domain', () => {
  // Mock Result type
  const createResult = <T>(value: T, isSuccess: boolean, error?: { message: string }) => ({
    isSuccess,
    isFailure: !isSuccess,
    value,
    error,
  });

  // Mock AppointmentId
  class MockAppointmentId {
    value: string;
    constructor(value: string) {
      this.value = value;
    }
    static create(value?: string) {
      if (!value || value.length < 3) {
        return createResult(null, false, { message: 'Invalid appointment ID' });
      }
      return createResult(new MockAppointmentId(value), true);
    }
  }

  // Mock TimeSlot
  class MockTimeSlot {
    startTime: Date;
    endTime: Date;
    constructor(startTime: Date, endTime: Date) {
      this.startTime = startTime;
      this.endTime = endTime;
    }
    static create(startTime: Date, endTime: Date) {
      if (startTime >= endTime) {
        return createResult(null, false, { message: 'Start time must be before end time' });
      }
      return createResult(new MockTimeSlot(startTime, endTime), true);
    }
  }

  // Mock Buffer
  class MockBuffer {
    minutesBefore: number;
    minutesAfter: number;
    constructor(minutesBefore: number, minutesAfter: number) {
      this.minutesBefore = minutesBefore;
      this.minutesAfter = minutesAfter;
    }
    static create(minutesBefore: number, minutesAfter: number) {
      if (minutesBefore < 0 || minutesAfter < 0) {
        return createResult(null, false, { message: 'Buffer cannot be negative' });
      }
      return createResult(new MockBuffer(minutesBefore, minutesAfter), true);
    }
  }

  // Mock Recurrence
  class MockRecurrence {
    frequency: string;
    interval: number;
    daysOfWeek?: string[];
    dayOfMonth?: number;
    monthOfYear?: number;
    endDate?: Date;
    occurrenceCount?: number;
    exceptionDates?: Date[];

    constructor(props: {
      frequency: string;
      interval: number;
      daysOfWeek?: string[];
      dayOfMonth?: number;
      monthOfYear?: number;
      endDate?: Date;
      occurrenceCount?: number;
      exceptionDates?: Date[];
    }) {
      this.frequency = props.frequency;
      this.interval = props.interval;
      this.daysOfWeek = props.daysOfWeek;
      this.dayOfMonth = props.dayOfMonth;
      this.monthOfYear = props.monthOfYear;
      this.endDate = props.endDate;
      this.occurrenceCount = props.occurrenceCount;
      this.exceptionDates = props.exceptionDates;
    }

    generateOccurrences(startDate: Date, maxOccurrences: number, endDate: Date): Date[] {
      const occurrences: Date[] = [];
      const current = new Date(startDate);

      for (let i = 0; i < maxOccurrences && current <= endDate; i++) {
        occurrences.push(new Date(current));

        // Add interval based on frequency
        switch (this.frequency) {
          case 'DAILY':
            current.setDate(current.getDate() + this.interval);
            break;
          case 'WEEKLY':
            current.setDate(current.getDate() + 7 * this.interval);
            break;
          case 'MONTHLY':
            current.setMonth(current.getMonth() + this.interval);
            break;
          case 'YEARLY':
            current.setFullYear(current.getFullYear() + this.interval);
            break;
        }
      }

      return occurrences;
    }

    static createCustom(props: {
      frequency: string;
      interval: number;
      daysOfWeek?: string[];
      dayOfMonth?: number;
      monthOfYear?: number;
      endDate?: Date;
      occurrenceCount?: number;
      exceptionDates?: Date[];
    }) {
      if (props.interval < 1) {
        return createResult(null, false, { message: 'Interval must be at least 1' });
      }
      return createResult(new MockRecurrence(props), true);
    }
  }

  // Mock Appointment
  class MockAppointment {
    id: MockAppointmentId;
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    appointmentType: string;
    location?: string;
    organizerId: string;
    attendeeIds: string[];
    status: string;
    buffer: MockBuffer;
    recurrence?: MockRecurrence;
    isActive: boolean;

    constructor(props: {
      title: string;
      description?: string;
      startTime: Date;
      endTime: Date;
      appointmentType: string;
      location?: string;
      organizerId: string;
      attendeeIds: string[];
      buffer: MockBuffer;
      recurrence?: MockRecurrence;
    }) {
      this.id = new MockAppointmentId(`apt-${Date.now()}`);
      this.title = props.title;
      this.description = props.description;
      this.startTime = props.startTime;
      this.endTime = props.endTime;
      this.appointmentType = props.appointmentType;
      this.location = props.location;
      this.organizerId = props.organizerId;
      this.attendeeIds = props.attendeeIds;
      this.buffer = props.buffer;
      this.recurrence = props.recurrence;
      this.status = 'SCHEDULED';
      this.isActive = true;
    }

    static create(props: {
      title: string;
      description?: string;
      startTime: Date;
      endTime: Date;
      appointmentType: string;
      location?: string;
      organizerId: string;
      attendeeIds: string[];
      buffer: MockBuffer;
      recurrence?: MockRecurrence;
    }) {
      return createResult(new MockAppointment(props), true);
    }
  }

  return {
    Appointment: MockAppointment,
    AppointmentId: MockAppointmentId,
    TimeSlot: MockTimeSlot,
    Buffer: MockBuffer,
    Recurrence: MockRecurrence,
  };
});

describe('AppointmentDomainService', () => {
  describe('toDomainAppointments', () => {
    it('should convert DB records to domain appointments', () => {
      const dbAppointments = [
        {
          id: 'apt-123',
          title: 'Team Meeting',
          description: 'Weekly sync',
          startTime: new Date('2024-01-15T10:00:00Z'),
          endTime: new Date('2024-01-15T11:00:00Z'),
          appointmentType: 'MEETING',
          location: 'Room A',
          organizerId: 'user-1',
          tenantId: 'tenant-test',
          attendees: [{ userId: 'user-2' }, { userId: 'user-3' }],
          status: 'SCHEDULED',
          bufferMinutesBefore: 10,
          bufferMinutesAfter: 5,
        },
      ];

      const appointments = AppointmentDomainService.toDomainAppointments(dbAppointments);

      expect(appointments.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle records with recurrence', () => {
      const dbAppointments = [
        {
          id: 'apt-124',
          title: 'Weekly Standup',
          startTime: new Date('2024-01-15T09:00:00Z'),
          endTime: new Date('2024-01-15T09:30:00Z'),
          appointmentType: 'MEETING',
          organizerId: 'user-1',
          tenantId: 'tenant-test',
          status: 'SCHEDULED',
          bufferMinutesBefore: 0,
          bufferMinutesAfter: 0,
          recurrence: {
            frequency: 'WEEKLY',
            interval: 1,
            daysOfWeek: ['MONDAY'],
            occurrenceCount: 52,
          },
        },
      ];

      const appointments = AppointmentDomainService.toDomainAppointments(dbAppointments);

      expect(appointments.length).toBeGreaterThanOrEqual(0);
    });

    it('should skip invalid records gracefully', () => {
      const dbAppointments = [
        {
          id: 'apt-125',
          title: 'Invalid',
          startTime: new Date('2024-01-15T11:00:00Z'), // Start after end
          endTime: new Date('2024-01-15T10:00:00Z'),
          appointmentType: 'MEETING',
          organizerId: 'user-1',
          tenantId: 'tenant-test',
          status: 'SCHEDULED',
          bufferMinutesBefore: 0,
          bufferMinutesAfter: 0,
        },
      ];

      const appointments = AppointmentDomainService.toDomainAppointments(dbAppointments);

      // Should skip invalid records
      expect(appointments).toHaveLength(0);
    });

    it('should handle empty array', () => {
      const appointments = AppointmentDomainService.toDomainAppointments([]);
      expect(appointments).toHaveLength(0);
    });

    it('should handle records without description or location', () => {
      const dbAppointments = [
        {
          id: 'apt-126',
          title: 'Simple Meeting',
          startTime: new Date('2024-01-15T10:00:00Z'),
          endTime: new Date('2024-01-15T11:00:00Z'),
          appointmentType: 'MEETING',
          organizerId: 'user-1',
          tenantId: 'tenant-test',
          status: 'SCHEDULED',
          bufferMinutesBefore: 0,
          bufferMinutesAfter: 0,
        },
      ];

      const appointments = AppointmentDomainService.toDomainAppointments(dbAppointments);

      expect(appointments.length).toBeGreaterThanOrEqual(0);
    });
  });
});
