/**
 * PrismaAppointmentRepository Additional Tests
 *
 * Supplements PrismaAppointmentRepository.test.ts with coverage
 * for save(), saveAll(), and additional findWithFilters() branches
 * (isRecurring, endTimeFrom/endTimeTo, default pagination).
 *
 * Coverage target: Cover uncovered 34 statements
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '@intelliflow/db';
import { PrismaAppointmentRepository } from '../src/repositories/PrismaAppointmentRepository';

// Mock the withTransaction function from @intelliflow/db
vi.mock('@intelliflow/db', async () => {
  const actual = await vi.importActual('@intelliflow/db');
  return {
    ...actual,
    withTransaction: vi.fn((fn: (tx: any) => Promise<any>) => {
      // Get the mock transaction from the global test context
      const mockTx = (global as any).__mockTransaction;
      return fn(mockTx);
    }),
  };
});

// Mock Prisma transaction
const createMockTransaction = () => ({
  appointment: {
    upsert: vi.fn().mockResolvedValue({}),
  },
  appointmentAttendee: {
    deleteMany: vi.fn().mockResolvedValue({}),
    createMany: vi.fn().mockResolvedValue({}),
  },
  appointmentCase: {
    deleteMany: vi.fn().mockResolvedValue({}),
    createMany: vi.fn().mockResolvedValue({}),
  },
});

// Mock Prisma Client
const createMockPrismaClient = () => {
  const mockTx = createMockTransaction();

  // Store in global for withTransaction mock to access
  (global as any).__mockTransaction = mockTx;

  return {
    appointment: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn(),
      groupBy: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    appointmentAttendee: {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    },
    appointmentCase: {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn((callback: (tx: any) => Promise<any>) => callback(mockTx)),
    _mockTx: mockTx,
  } as PrismaClient & { _mockTx: any };
};

// Create mock database record
const createMockDbRecord = (overrides?: Record<string, unknown>) => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Test Meeting',
  description: 'A test meeting',
  startTime: new Date('2025-01-15T10:00:00Z'),
  endTime: new Date('2025-01-15T11:00:00Z'),
  appointmentType: 'MEETING',
  status: 'SCHEDULED',
  location: 'Conference Room A',
  bufferMinutesBefore: 5,
  bufferMinutesAfter: 5,
  recurrence: null,
  organizerId: 'user-123',
  notes: null,
  externalCalendarId: null,
  reminderMinutes: 15,
  createdAt: new Date('2025-01-10T10:00:00Z'),
  updatedAt: new Date('2025-01-10T10:00:00Z'),
  cancelledAt: null,
  completedAt: null,
  cancellationReason: null,
  parentAppointmentId: null,
  attendees: [],
  linkedCases: [],
  ...overrides,
});

describe('PrismaAppointmentRepository - Additional', () => {
  let repository: PrismaAppointmentRepository;
  let mockPrisma: PrismaClient & { _mockTx: any };

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    repository = new PrismaAppointmentRepository(mockPrisma as PrismaClient);
    vi.clearAllMocks();
  });

  describe('save()', () => {
    it('should upsert appointment within a transaction', async () => {
      const {
        Appointment,
        AppointmentId,
        TimeSlot,
        Buffer: AppBuffer,
      } = await import('@intelliflow/domain');

      const id = AppointmentId.create('550e8400-e29b-41d4-a716-446655440000').value;
      const timeSlot = TimeSlot.reconstitute(
        new Date('2025-01-15T10:00:00Z'),
        new Date('2025-01-15T11:00:00Z')
      );
      const buffer = AppBuffer.reconstitute(5, 5);

      const appointment = Appointment.reconstitute(id, {
        title: 'My Meeting',
        timeSlot,
        appointmentType: 'MEETING' as any,
        status: 'SCHEDULED' as any,
        buffer,
        attendeeIds: [],
        linkedCaseIds: [],
        organizerId: 'user-123',
        tenantId: 'tenant-001',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await repository.save(appointment);

      // Should upsert the appointment in transaction
      expect(mockPrisma._mockTx.appointment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: '550e8400-e29b-41d4-a716-446655440000' },
        })
      );
    });

    it('should sync attendees by deleting and re-creating', async () => {
      const {
        Appointment,
        AppointmentId,
        TimeSlot,
        Buffer: AppBuffer,
      } = await import('@intelliflow/domain');

      const id = AppointmentId.create('550e8400-e29b-41d4-a716-446655440000').value;
      const timeSlot = TimeSlot.reconstitute(
        new Date('2025-01-15T10:00:00Z'),
        new Date('2025-01-15T11:00:00Z')
      );
      const buffer = AppBuffer.reconstitute(5, 5);

      const appointment = Appointment.reconstitute(id, {
        title: 'Team Meeting',
        timeSlot,
        appointmentType: 'MEETING' as any,
        status: 'SCHEDULED' as any,
        buffer,
        attendeeIds: ['user-a', 'user-b'],
        linkedCaseIds: [],
        organizerId: 'user-123',
        tenantId: 'tenant-001',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await repository.save(appointment);

      // Should delete existing attendees
      expect(mockPrisma._mockTx.appointmentAttendee.deleteMany).toHaveBeenCalledWith({
        where: { appointmentId: '550e8400-e29b-41d4-a716-446655440000' },
      });

      // Should create new attendees
      expect(mockPrisma._mockTx.appointmentAttendee.createMany).toHaveBeenCalledWith({
        data: [
          {
            appointmentId: '550e8400-e29b-41d4-a716-446655440000',
            userId: 'user-a',
            tenantId: 'tenant-001',
          },
          {
            appointmentId: '550e8400-e29b-41d4-a716-446655440000',
            userId: 'user-b',
            tenantId: 'tenant-001',
          },
        ],
      });
    });

    it('should not create attendees if array is empty', async () => {
      const {
        Appointment,
        AppointmentId,
        TimeSlot,
        Buffer: AppBuffer,
      } = await import('@intelliflow/domain');

      const id = AppointmentId.create('550e8400-e29b-41d4-a716-446655440000').value;
      const timeSlot = TimeSlot.reconstitute(
        new Date('2025-01-15T10:00:00Z'),
        new Date('2025-01-15T11:00:00Z')
      );
      const buffer = AppBuffer.reconstitute(0, 0);

      const appointment = Appointment.reconstitute(id, {
        title: 'Solo Meeting',
        timeSlot,
        appointmentType: 'MEETING' as any,
        status: 'SCHEDULED' as any,
        buffer,
        attendeeIds: [],
        linkedCaseIds: [],
        organizerId: 'user-123',
        tenantId: 'tenant-001',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await repository.save(appointment);

      // Should delete but NOT create attendees
      expect(mockPrisma._mockTx.appointmentAttendee.deleteMany).toHaveBeenCalled();
      expect(mockPrisma._mockTx.appointmentAttendee.createMany).not.toHaveBeenCalled();
    });

    it('should sync linked cases', async () => {
      const {
        Appointment,
        AppointmentId,
        CaseId,
        TimeSlot,
        Buffer: AppBuffer,
      } = await import('@intelliflow/domain');

      const id = AppointmentId.create('550e8400-e29b-41d4-a716-446655440000').value;
      const caseId = CaseId.create('550e8400-e29b-41d4-a716-446655440010').value;
      const timeSlot = TimeSlot.reconstitute(
        new Date('2025-01-15T10:00:00Z'),
        new Date('2025-01-15T11:00:00Z')
      );
      const buffer = AppBuffer.reconstitute(0, 0);

      const appointment = Appointment.reconstitute(id, {
        title: 'Case Review',
        timeSlot,
        appointmentType: 'COURT_HEARING' as any,
        status: 'SCHEDULED' as any,
        buffer,
        attendeeIds: [],
        linkedCaseIds: [caseId],
        organizerId: 'user-123',
        tenantId: 'tenant-001',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await repository.save(appointment);

      expect(mockPrisma._mockTx.appointmentCase.deleteMany).toHaveBeenCalledWith({
        where: { appointmentId: '550e8400-e29b-41d4-a716-446655440000' },
      });

      expect(mockPrisma._mockTx.appointmentCase.createMany).toHaveBeenCalledWith({
        data: [
          {
            appointmentId: '550e8400-e29b-41d4-a716-446655440000',
            caseId: '550e8400-e29b-41d4-a716-446655440010',
            tenantId: 'tenant-001',
          },
        ],
      });
    });

    it('should not create linked cases if array is empty', async () => {
      const {
        Appointment,
        AppointmentId,
        TimeSlot,
        Buffer: AppBuffer,
      } = await import('@intelliflow/domain');

      const id = AppointmentId.create('550e8400-e29b-41d4-a716-446655440000').value;
      const timeSlot = TimeSlot.reconstitute(
        new Date('2025-01-15T10:00:00Z'),
        new Date('2025-01-15T11:00:00Z')
      );
      const buffer = AppBuffer.reconstitute(0, 0);

      const appointment = Appointment.reconstitute(id, {
        title: 'No cases',
        timeSlot,
        appointmentType: 'MEETING' as any,
        status: 'SCHEDULED' as any,
        buffer,
        attendeeIds: [],
        linkedCaseIds: [],
        organizerId: 'user-123',
        tenantId: 'tenant-001',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await repository.save(appointment);

      expect(mockPrisma._mockTx.appointmentCase.deleteMany).toHaveBeenCalled();
      expect(mockPrisma._mockTx.appointmentCase.createMany).not.toHaveBeenCalled();
    });
  });

  describe('saveAll()', () => {
    it('should save multiple appointments in a single transaction', async () => {
      const {
        Appointment,
        AppointmentId,
        TimeSlot,
        Buffer: AppBuffer,
      } = await import('@intelliflow/domain');

      const makeAppt = (idStr: string, title: string) => {
        const id = AppointmentId.create(idStr).value;
        const timeSlot = TimeSlot.reconstitute(
          new Date('2025-01-15T10:00:00Z'),
          new Date('2025-01-15T11:00:00Z')
        );
        const buffer = AppBuffer.reconstitute(0, 0);
        return Appointment.reconstitute(id, {
          title,
          timeSlot,
          appointmentType: 'MEETING' as any,
          status: 'SCHEDULED' as any,
          buffer,
          attendeeIds: [],
          linkedCaseIds: [],
          organizerId: 'user-123',
          tenantId: 'tenant-001',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      };

      const appts = [
        makeAppt('550e8400-e29b-41d4-a716-446655440001', 'Meeting 1'),
        makeAppt('550e8400-e29b-41d4-a716-446655440002', 'Meeting 2'),
      ];

      await repository.saveAll(appts);

      // Should upsert each appointment
      expect(mockPrisma._mockTx.appointment.upsert).toHaveBeenCalledTimes(2);
    });

    it('should sync attendees for each appointment', async () => {
      const {
        Appointment,
        AppointmentId,
        TimeSlot,
        Buffer: AppBuffer,
      } = await import('@intelliflow/domain');

      const id = AppointmentId.create('550e8400-e29b-41d4-a716-446655440001').value;
      const timeSlot = TimeSlot.reconstitute(
        new Date('2025-01-15T10:00:00Z'),
        new Date('2025-01-15T11:00:00Z')
      );
      const buffer = AppBuffer.reconstitute(0, 0);
      const appt = Appointment.reconstitute(id, {
        title: 'Team Meeting',
        timeSlot,
        appointmentType: 'MEETING' as any,
        status: 'SCHEDULED' as any,
        buffer,
        attendeeIds: ['user-a'],
        linkedCaseIds: [],
        organizerId: 'user-123',
        tenantId: 'tenant-001',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await repository.saveAll([appt]);

      expect(mockPrisma._mockTx.appointmentAttendee.deleteMany).toHaveBeenCalled();
      expect(mockPrisma._mockTx.appointmentAttendee.createMany).toHaveBeenCalled();
    });

    it('should sync linked cases for each appointment', async () => {
      const {
        Appointment,
        AppointmentId,
        CaseId,
        TimeSlot,
        Buffer: AppBuffer,
      } = await import('@intelliflow/domain');

      const id = AppointmentId.create('550e8400-e29b-41d4-a716-446655440001').value;
      const caseId = CaseId.create('550e8400-e29b-41d4-a716-446655440010').value;
      const timeSlot = TimeSlot.reconstitute(
        new Date('2025-01-15T10:00:00Z'),
        new Date('2025-01-15T11:00:00Z')
      );
      const buffer = AppBuffer.reconstitute(0, 0);
      const appt = Appointment.reconstitute(id, {
        title: 'Case Review',
        timeSlot,
        appointmentType: 'COURT_HEARING' as any,
        status: 'SCHEDULED' as any,
        buffer,
        attendeeIds: [],
        linkedCaseIds: [caseId],
        organizerId: 'user-123',
        tenantId: 'tenant-001',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await repository.saveAll([appt]);

      expect(mockPrisma._mockTx.appointmentCase.deleteMany).toHaveBeenCalled();
      expect(mockPrisma._mockTx.appointmentCase.createMany).toHaveBeenCalled();
    });

    it('should handle empty array', async () => {
      await repository.saveAll([]);

      // Should not upsert any appointments
      expect(mockPrisma._mockTx.appointment.upsert).not.toHaveBeenCalled();
    });
  });

  describe('findWithFilters() - additional branches', () => {
    it('should filter by isRecurring=true', async () => {
      (mockPrisma.appointment.findMany as any).mockResolvedValue([]);
      (mockPrisma.appointment.count as any).mockResolvedValue(0);

      await repository.findWithFilters({ isRecurring: true });

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            recurrence: expect.anything(),
          }),
        })
      );
    });

    it('should filter by isRecurring=false', async () => {
      (mockPrisma.appointment.findMany as any).mockResolvedValue([]);
      (mockPrisma.appointment.count as any).mockResolvedValue(0);

      await repository.findWithFilters({ isRecurring: false });

      expect(mockPrisma.appointment.findMany).toHaveBeenCalled();
    });

    it('should filter by endTimeFrom and endTimeTo', async () => {
      (mockPrisma.appointment.findMany as any).mockResolvedValue([]);
      (mockPrisma.appointment.count as any).mockResolvedValue(0);

      const endTimeFrom = new Date('2025-01-01');
      const endTimeTo = new Date('2025-01-31');

      await repository.findWithFilters({ endTimeFrom, endTimeTo });

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            endTime: {
              gte: endTimeFrom,
              lte: endTimeTo,
            },
          }),
        })
      );
    });

    it('should filter by endTimeFrom only', async () => {
      (mockPrisma.appointment.findMany as any).mockResolvedValue([]);
      (mockPrisma.appointment.count as any).mockResolvedValue(0);

      const endTimeFrom = new Date('2025-01-01');

      await repository.findWithFilters({ endTimeFrom });

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            endTime: { gte: endTimeFrom },
          }),
        })
      );
    });

    it('should filter by endTimeTo only', async () => {
      (mockPrisma.appointment.findMany as any).mockResolvedValue([]);
      (mockPrisma.appointment.count as any).mockResolvedValue(0);

      const endTimeTo = new Date('2025-01-31');

      await repository.findWithFilters({ endTimeTo });

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            endTime: { lte: endTimeTo },
          }),
        })
      );
    });

    it('should use default pagination when options not provided', async () => {
      (mockPrisma.appointment.findMany as any).mockResolvedValue([]);
      (mockPrisma.appointment.count as any).mockResolvedValue(0);

      const result = await repository.findWithFilters({});

      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 0,
        })
      );
    });

    it('should handle hasMore=false when at end of results', async () => {
      const mockRecords = [createMockDbRecord()];
      (mockPrisma.appointment.findMany as any).mockResolvedValue(mockRecords);
      (mockPrisma.appointment.count as any).mockResolvedValue(1);

      const result = await repository.findWithFilters({}, { limit: 10, offset: 0 });

      expect(result.hasMore).toBe(false);
    });

    it('should filter by startTimeFrom only', async () => {
      (mockPrisma.appointment.findMany as any).mockResolvedValue([]);
      (mockPrisma.appointment.count as any).mockResolvedValue(0);

      const startTimeFrom = new Date('2025-01-01');

      await repository.findWithFilters({ startTimeFrom });

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startTime: { gte: startTimeFrom },
          }),
        })
      );
    });
  });

  describe('mapToEntity() with recurrence and optional fields', () => {
    it('should handle record with recurrence data', async () => {
      const mockRecord = createMockDbRecord({
        recurrence: {
          frequency: 'WEEKLY',
          interval: 1,
          daysOfWeek: ['MONDAY'],
          exceptionDates: [],
        },
      });
      (mockPrisma.appointment.findUnique as any).mockResolvedValue(mockRecord);

      const { AppointmentId } = await import('@intelliflow/domain');
      const id = AppointmentId.create(mockRecord.id as string).value;
      const result = await repository.findById(id);

      expect(result).not.toBeNull();
    });

    it('should handle record with attendees and linked cases', async () => {
      const mockRecord = createMockDbRecord({
        attendees: [{ userId: 'user-a' }, { userId: 'user-b' }],
        linkedCases: [{ caseId: '550e8400-e29b-41d4-a716-446655440010' }],
      });
      (mockPrisma.appointment.findUnique as any).mockResolvedValue(mockRecord);

      const { AppointmentId } = await import('@intelliflow/domain');
      const id = AppointmentId.create(mockRecord.id as string).value;
      const result = await repository.findById(id);

      expect(result).not.toBeNull();
      expect(result!.attendeeIds).toHaveLength(2);
      expect(result!.linkedCaseIds).toHaveLength(1);
    });

    it('should handle record with all optional fields set', async () => {
      const mockRecord = createMockDbRecord({
        description: 'Detailed description',
        location: 'Room 101',
        notes: 'Important notes',
        externalCalendarId: 'google-cal-123',
        reminderMinutes: 30,
        cancelledAt: new Date('2025-01-20T10:00:00Z'),
        completedAt: new Date('2025-01-20T11:00:00Z'),
        cancellationReason: 'Rescheduled',
        tenantId: 'tenant-custom',
      });
      (mockPrisma.appointment.findUnique as any).mockResolvedValue(mockRecord);

      const { AppointmentId } = await import('@intelliflow/domain');
      const id = AppointmentId.create(mockRecord.id as string).value;
      const result = await repository.findById(id);

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Test Meeting');
    });

    it('should use default tenantId when not present on record', async () => {
      const mockRecord = createMockDbRecord();
      // Remove tenantId to test fallback
      delete (mockRecord as any).tenantId;
      (mockPrisma.appointment.findUnique as any).mockResolvedValue(mockRecord);

      const { AppointmentId } = await import('@intelliflow/domain');
      const id = AppointmentId.create(mockRecord.id as string).value;
      const result = await repository.findById(id);

      expect(result).not.toBeNull();
      expect(result!.tenantId).toBe('default');
    });
  });
});
