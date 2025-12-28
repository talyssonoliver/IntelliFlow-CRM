/**
 * PrismaAppointmentRepository Tests
 *
 * Tests verify the Prisma repository implementation using a mock Prisma client.
 * Covers CRUD operations, conflict detection, filtering, and pagination.
 *
 * Coverage target: >90% for adapters layer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient, Prisma } from '@intelliflow/db';
import { PrismaAppointmentRepository } from '../src/repositories/PrismaAppointmentRepository';

// Mock Prisma transaction
const createMockTransaction = () => {
  return {
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
  };
};

// Mock Prisma Client
const createMockPrismaClient = () => {
  const mockTx = createMockTransaction();

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
    _mockTx: mockTx, // Expose for assertions
  } as unknown as PrismaClient & { _mockTx: any };
};

// Create mock database record
const createMockDbRecord = (overrides?: Partial<{
  id: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  appointmentType: string;
  status: string;
  location: string | null;
  bufferMinutesBefore: number;
  bufferMinutesAfter: number;
  recurrence: any;
  organizerId: string;
  notes: string | null;
  externalCalendarId: string | null;
  reminderMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
  cancelledAt: Date | null;
  completedAt: Date | null;
  cancellationReason: string | null;
  parentAppointmentId: string | null;
  attendees: { userId: string }[];
  linkedCases: { caseId: string }[];
}>) => {
  const defaults = {
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
  };

  return { ...defaults, ...overrides };
};

describe('PrismaAppointmentRepository', () => {
  let repository: PrismaAppointmentRepository;
  let mockPrisma: PrismaClient & { _mockTx: any };

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    repository = new PrismaAppointmentRepository(mockPrisma as unknown as PrismaClient);
    vi.clearAllMocks();
  });

  describe('findById()', () => {
    it('should return appointment when found', async () => {
      const mockRecord = createMockDbRecord();
      (mockPrisma.appointment.findUnique as any).mockResolvedValue(mockRecord);

      // Create a mock AppointmentId
      const { AppointmentId } = await import('@intelliflow/domain');
      const idResult = AppointmentId.create(mockRecord.id);
      expect(idResult.isSuccess).toBe(true);

      const result = await repository.findById(idResult.value);

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Test Meeting');
      expect(mockPrisma.appointment.findUnique).toHaveBeenCalledWith({
        where: { id: mockRecord.id },
        include: { attendees: true, linkedCases: true },
      });
    });

    it('should return null when not found', async () => {
      (mockPrisma.appointment.findUnique as any).mockResolvedValue(null);

      const { AppointmentId } = await import('@intelliflow/domain');
      const idResult = AppointmentId.create('550e8400-e29b-41d4-a716-446655440001');

      const result = await repository.findById(idResult.value);

      expect(result).toBeNull();
    });
  });

  describe('findByIds()', () => {
    it('should return multiple appointments', async () => {
      const mockRecords = [
        createMockDbRecord({ id: '550e8400-e29b-41d4-a716-446655440001', title: 'Meeting 1' }),
        createMockDbRecord({ id: '550e8400-e29b-41d4-a716-446655440002', title: 'Meeting 2' }),
      ];
      (mockPrisma.appointment.findMany as any).mockResolvedValue(mockRecords);

      const { AppointmentId } = await import('@intelliflow/domain');
      const ids = mockRecords.map(r => AppointmentId.create(r.id).value);

      const result = await repository.findByIds(ids);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Meeting 1');
      expect(result[1].title).toBe('Meeting 2');
    });

    it('should return empty array when no ids provided', async () => {
      (mockPrisma.appointment.findMany as any).mockResolvedValue([]);

      const result = await repository.findByIds([]);

      expect(result).toHaveLength(0);
    });
  });

  describe('delete()', () => {
    it('should delete appointment', async () => {
      const { AppointmentId } = await import('@intelliflow/domain');
      const idResult = AppointmentId.create('550e8400-e29b-41d4-a716-446655440000');

      await repository.delete(idResult.value);

      expect(mockPrisma.appointment.delete).toHaveBeenCalledWith({
        where: { id: '550e8400-e29b-41d4-a716-446655440000' },
      });
    });
  });

  describe('findByOrganizer()', () => {
    it('should return appointments for organizer', async () => {
      const mockRecords = [
        createMockDbRecord({ organizerId: 'user-123', title: 'My Meeting 1' }),
        createMockDbRecord({ id: '550e8400-e29b-41d4-a716-446655440001', organizerId: 'user-123', title: 'My Meeting 2' }),
      ];
      (mockPrisma.appointment.findMany as any).mockResolvedValue(mockRecords);

      const result = await repository.findByOrganizer('user-123');

      expect(result).toHaveLength(2);
      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizerId: 'user-123' },
          include: { attendees: true, linkedCases: true },
        })
      );
    });

    it('should apply pagination options', async () => {
      (mockPrisma.appointment.findMany as any).mockResolvedValue([]);

      await repository.findByOrganizer('user-123', {
        limit: 10,
        offset: 20,
        sortBy: 'title',
        sortOrder: 'desc',
      });

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
          orderBy: { title: 'desc' },
        })
      );
    });
  });

  describe('findByAttendee()', () => {
    it('should return appointments where user is organizer or attendee', async () => {
      const mockRecords = [createMockDbRecord()];
      (mockPrisma.appointment.findMany as any).mockResolvedValue(mockRecords);

      const result = await repository.findByAttendee('user-123');

      expect(result).toHaveLength(1);
      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { organizerId: 'user-123' },
              { attendees: { some: { userId: 'user-123' } } },
            ],
          },
        })
      );
    });
  });

  describe('findByCase()', () => {
    it('should return appointments linked to a case', async () => {
      const mockRecords = [
        createMockDbRecord({
          linkedCases: [{ caseId: '550e8400-e29b-41d4-a716-446655440010' }],
        }),
      ];
      (mockPrisma.appointment.findMany as any).mockResolvedValue(mockRecords);

      const { CaseId } = await import('@intelliflow/domain');
      const caseIdResult = CaseId.create('550e8400-e29b-41d4-a716-446655440010');

      const result = await repository.findByCase(caseIdResult.value);

      expect(result).toHaveLength(1);
      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            linkedCases: { some: { caseId: '550e8400-e29b-41d4-a716-446655440010' } },
          },
        })
      );
    });
  });

  describe('findInTimeRange()', () => {
    it('should return overlapping appointments', async () => {
      const mockRecords = [createMockDbRecord()];
      (mockPrisma.appointment.findMany as any).mockResolvedValue(mockRecords);

      const startTime = new Date('2025-01-15T00:00:00Z');
      const endTime = new Date('2025-01-15T23:59:59Z');

      const result = await repository.findInTimeRange(startTime, endTime);

      expect(result).toHaveLength(1);
      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { startTime: { lt: endTime } },
              { endTime: { gt: startTime } },
            ],
          },
        })
      );
    });
  });

  describe('findOverlapping()', () => {
    it('should find overlapping appointments excluding cancelled', async () => {
      const mockRecords = [createMockDbRecord()];
      (mockPrisma.appointment.findMany as any).mockResolvedValue(mockRecords);

      const { TimeSlot } = await import('@intelliflow/domain');
      const timeSlotResult = TimeSlot.create(
        new Date('2025-01-15T10:30:00Z'),
        new Date('2025-01-15T11:30:00Z')
      );

      const result = await repository.findOverlapping(timeSlotResult.value);

      expect(result).toHaveLength(1);
      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: expect.arrayContaining([
              { startTime: { lt: expect.any(Date) } },
              { endTime: { gt: expect.any(Date) } },
              { status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
            ]),
          },
        })
      );
    });

    it('should exclude specific appointment when excludeId provided', async () => {
      (mockPrisma.appointment.findMany as any).mockResolvedValue([]);

      const { TimeSlot, AppointmentId } = await import('@intelliflow/domain');
      const timeSlotResult = TimeSlot.create(
        new Date('2025-01-15T10:30:00Z'),
        new Date('2025-01-15T11:30:00Z')
      );
      const excludeIdResult = AppointmentId.create('550e8400-e29b-41d4-a716-446655440099');

      await repository.findOverlapping(timeSlotResult.value, excludeIdResult.value);

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: expect.arrayContaining([
              { id: { not: '550e8400-e29b-41d4-a716-446655440099' } },
            ]),
          },
        })
      );
    });
  });

  describe('findForConflictCheck()', () => {
    it('should find conflicts for multiple attendees', async () => {
      (mockPrisma.appointment.findMany as any).mockResolvedValue([]);

      const timeRange = {
        startTime: new Date('2025-01-15T10:00:00Z'),
        endTime: new Date('2025-01-15T11:00:00Z'),
      };

      await repository.findForConflictCheck(['user-1', 'user-2'], timeRange);

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: expect.arrayContaining([
              {
                OR: [
                  { organizerId: { in: ['user-1', 'user-2'] } },
                  { attendees: { some: { userId: { in: ['user-1', 'user-2'] } } } },
                ],
              },
              { startTime: { lt: timeRange.endTime } },
              { endTime: { gt: timeRange.startTime } },
            ]),
          },
        })
      );
    });
  });

  describe('hasConflicts()', () => {
    it('should return true when conflicts exist', async () => {
      (mockPrisma.appointment.count as any).mockResolvedValue(2);

      const { TimeSlot } = await import('@intelliflow/domain');
      const timeSlotResult = TimeSlot.create(
        new Date('2025-01-15T10:00:00Z'),
        new Date('2025-01-15T11:00:00Z')
      );

      const result = await repository.hasConflicts(timeSlotResult.value, ['user-1']);

      expect(result).toBe(true);
    });

    it('should return false when no conflicts', async () => {
      (mockPrisma.appointment.count as any).mockResolvedValue(0);

      const { TimeSlot } = await import('@intelliflow/domain');
      const timeSlotResult = TimeSlot.create(
        new Date('2025-01-15T10:00:00Z'),
        new Date('2025-01-15T11:00:00Z')
      );

      const result = await repository.hasConflicts(timeSlotResult.value, ['user-1']);

      expect(result).toBe(false);
    });
  });

  describe('countByStatus()', () => {
    it('should return counts grouped by status', async () => {
      (mockPrisma.appointment.groupBy as any).mockResolvedValue([
        { status: 'SCHEDULED', _count: 5 },
        { status: 'CONFIRMED', _count: 3 },
        { status: 'COMPLETED', _count: 10 },
      ]);

      const result = await repository.countByStatus();

      expect(result.SCHEDULED).toBe(5);
      expect(result.CONFIRMED).toBe(3);
      expect(result.COMPLETED).toBe(10);
      expect(result.CANCELLED).toBe(0);
      expect(result.IN_PROGRESS).toBe(0);
      expect(result.NO_SHOW).toBe(0);
    });

    it('should filter by organizer when provided', async () => {
      (mockPrisma.appointment.groupBy as any).mockResolvedValue([]);

      await repository.countByStatus('user-123');

      expect(mockPrisma.appointment.groupBy).toHaveBeenCalledWith({
        by: ['status'],
        where: { organizerId: 'user-123' },
        _count: true,
      });
    });
  });

  describe('findUpcoming()', () => {
    it('should return upcoming appointments', async () => {
      const mockRecords = [createMockDbRecord()];
      (mockPrisma.appointment.findMany as any).mockResolvedValue(mockRecords);

      const result = await repository.findUpcoming('user-123', 5);

      expect(result).toHaveLength(1);
      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: expect.arrayContaining([
              {
                OR: [
                  { organizerId: 'user-123' },
                  { attendees: { some: { userId: 'user-123' } } },
                ],
              },
              { startTime: { gte: expect.any(Date) } },
              { status: { notIn: ['CANCELLED', 'COMPLETED', 'NO_SHOW'] } },
            ]),
          },
          take: 5,
          orderBy: { startTime: 'asc' },
        })
      );
    });
  });

  describe('findPast()', () => {
    it('should return past appointments', async () => {
      const mockRecords = [createMockDbRecord()];
      (mockPrisma.appointment.findMany as any).mockResolvedValue(mockRecords);

      const result = await repository.findPast('user-123');

      expect(result).toHaveLength(1);
      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: expect.arrayContaining([
              { endTime: { lt: expect.any(Date) } },
            ]),
          },
          orderBy: { startTime: 'desc' },
        })
      );
    });
  });

  describe('findByExternalCalendarId()', () => {
    it('should find appointment by external calendar ID', async () => {
      const mockRecord = createMockDbRecord({ externalCalendarId: 'google-event-123' });
      (mockPrisma.appointment.findFirst as any).mockResolvedValue(mockRecord);

      const result = await repository.findByExternalCalendarId('google-event-123');

      expect(result).not.toBeNull();
      expect(mockPrisma.appointment.findFirst).toHaveBeenCalledWith({
        where: { externalCalendarId: 'google-event-123' },
        include: { attendees: true, linkedCases: true },
      });
    });

    it('should return null when not found', async () => {
      (mockPrisma.appointment.findFirst as any).mockResolvedValue(null);

      const result = await repository.findByExternalCalendarId('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findRecurringInstances()', () => {
    it('should find instances of recurring appointment', async () => {
      const mockRecords = [
        createMockDbRecord({ id: '550e8400-e29b-41d4-a716-446655440001' }),
        createMockDbRecord({ id: '550e8400-e29b-41d4-a716-446655440002' }),
      ];
      (mockPrisma.appointment.findMany as any).mockResolvedValue(mockRecords);

      const { AppointmentId } = await import('@intelliflow/domain');
      const parentId = AppointmentId.create('550e8400-e29b-41d4-a716-446655440000').value;

      const result = await repository.findRecurringInstances(parentId);

      expect(result).toHaveLength(2);
      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith({
        where: { parentAppointmentId: '550e8400-e29b-41d4-a716-446655440000' },
        include: { attendees: true, linkedCases: true },
        orderBy: { startTime: 'asc' },
      });
    });
  });

  describe('batchUpdateStatus()', () => {
    it('should update status for multiple appointments', async () => {
      const { AppointmentId } = await import('@intelliflow/domain');
      const ids = [
        AppointmentId.create('550e8400-e29b-41d4-a716-446655440001').value,
        AppointmentId.create('550e8400-e29b-41d4-a716-446655440002').value,
      ];

      await repository.batchUpdateStatus(ids, 'CONFIRMED');

      expect(mockPrisma.appointment.updateMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002'],
          },
        },
        data: expect.objectContaining({
          status: 'CONFIRMED',
          updatedAt: expect.any(Date),
        }),
      });
    });

    it('should set cancelledAt when status is CANCELLED', async () => {
      const { AppointmentId } = await import('@intelliflow/domain');
      const ids = [AppointmentId.create('550e8400-e29b-41d4-a716-446655440001').value];

      await repository.batchUpdateStatus(ids, 'CANCELLED');

      expect(mockPrisma.appointment.updateMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancelledAt: expect.any(Date),
        }),
      });
    });

    it('should set completedAt when status is COMPLETED', async () => {
      const { AppointmentId } = await import('@intelliflow/domain');
      const ids = [AppointmentId.create('550e8400-e29b-41d4-a716-446655440001').value];

      await repository.batchUpdateStatus(ids, 'COMPLETED');

      expect(mockPrisma.appointment.updateMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        data: expect.objectContaining({
          status: 'COMPLETED',
          completedAt: expect.any(Date),
        }),
      });
    });
  });

  describe('findNeedingReminder()', () => {
    it('should find appointments needing reminders', async () => {
      const mockRecords = [createMockDbRecord({ reminderMinutes: 15 })];
      (mockPrisma.appointment.findMany as any).mockResolvedValue(mockRecords);

      const result = await repository.findNeedingReminder(30);

      expect(result).toHaveLength(1);
      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: expect.arrayContaining([
              { startTime: { gt: expect.any(Date) } },
              { startTime: { lte: expect.any(Date) } },
              { status: { in: ['SCHEDULED', 'CONFIRMED'] } },
              { reminderMinutes: { not: null } },
            ]),
          },
          orderBy: { startTime: 'asc' },
        })
      );
    });
  });

  describe('findWithFilters()', () => {
    it('should apply multiple filters', async () => {
      const mockRecords = [createMockDbRecord()];
      (mockPrisma.appointment.findMany as any).mockResolvedValue(mockRecords);
      (mockPrisma.appointment.count as any).mockResolvedValue(1);

      const result = await repository.findWithFilters(
        {
          organizerId: 'user-123',
          status: 'SCHEDULED',
          appointmentType: 'MEETING',
          startTimeFrom: new Date('2025-01-01'),
          startTimeTo: new Date('2025-01-31'),
        },
        { limit: 10, offset: 0 }
      );

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 0,
        })
      );
    });

    it('should handle array filters', async () => {
      (mockPrisma.appointment.findMany as any).mockResolvedValue([]);
      (mockPrisma.appointment.count as any).mockResolvedValue(0);

      await repository.findWithFilters({
        status: ['SCHEDULED', 'CONFIRMED'],
        appointmentType: ['MEETING', 'CALL'],
      });

      expect(mockPrisma.appointment.findMany).toHaveBeenCalled();
    });

    it('should return paginated result with hasMore', async () => {
      const mockRecords = Array.from({ length: 10 }, (_, i) =>
        createMockDbRecord({ id: `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}` })
      );
      (mockPrisma.appointment.findMany as any).mockResolvedValue(mockRecords);
      (mockPrisma.appointment.count as any).mockResolvedValue(25);

      const result = await repository.findWithFilters({}, { limit: 10, offset: 0 });

      expect(result.items).toHaveLength(10);
      expect(result.total).toBe(25);
      expect(result.hasMore).toBe(true);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });

    it('should filter by caseId', async () => {
      (mockPrisma.appointment.findMany as any).mockResolvedValue([]);
      (mockPrisma.appointment.count as any).mockResolvedValue(0);

      const { CaseId } = await import('@intelliflow/domain');
      const caseIdResult = CaseId.create('550e8400-e29b-41d4-a716-446655440010');

      await repository.findWithFilters({ caseId: caseIdResult.value });

      expect(mockPrisma.appointment.findMany).toHaveBeenCalled();
    });

    it('should filter by attendeeId', async () => {
      (mockPrisma.appointment.findMany as any).mockResolvedValue([]);
      (mockPrisma.appointment.count as any).mockResolvedValue(0);

      await repository.findWithFilters({ attendeeId: 'attendee-123' });

      expect(mockPrisma.appointment.findMany).toHaveBeenCalled();
    });
  });
});
