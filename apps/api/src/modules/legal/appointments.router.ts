/**
 * Appointments Router
 *
 * Provides type-safe tRPC endpoints for appointment management:
 * - CRUD operations (create, read, update, delete)
 * - Conflict detection and availability checking
 * - Rescheduling and cancellation
 * - Case linkage
 * - Recurrence support
 *
 * Task: IFC-137 - Appointment Aggregate with conflict detection
 * KPIs: Conflict detection accuracy >95%, scheduling latency <=100ms
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

// Zod schemas for appointment operations
const appointmentTypeSchema = z.enum([
  'MEETING',
  'CALL',
  'HEARING',
  'CONSULTATION',
  'DEPOSITION',
  'OTHER',
]);

const appointmentStatusSchema = z.enum([
  'SCHEDULED',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]);

const dayOfWeekSchema = z.enum([
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
]);

const recurrenceSchema = z
  .object({
    frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
    interval: z.number().min(1).optional().default(1),
    daysOfWeek: z.array(dayOfWeekSchema).optional(),
    dayOfMonth: z.number().min(1).max(31).optional(),
    monthOfYear: z.number().min(1).max(12).optional(),
    endDate: z.coerce.date().optional(),
    occurrenceCount: z.number().min(1).optional(),
  })
  .optional();

const createAppointmentSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  appointmentType: appointmentTypeSchema,
  location: z.string().max(500).optional(),
  attendeeIds: z.array(z.string()).optional().default([]),
  linkedCaseIds: z.array(z.string()).optional().default([]),
  bufferMinutesBefore: z.number().min(0).max(240).optional().default(0),
  bufferMinutesAfter: z.number().min(0).max(240).optional().default(0),
  recurrence: recurrenceSchema,
  reminderMinutes: z.number().min(0).optional(),
  forceOverrideConflicts: z.boolean().optional().default(false),
});

const updateAppointmentSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  location: z.string().max(500).optional(),
  appointmentType: appointmentTypeSchema.optional(),
  notes: z.string().max(5000).optional(),
  reminderMinutes: z.number().min(0).optional(),
});

const rescheduleSchema = z.object({
  id: z.string(),
  newStartTime: z.coerce.date(),
  newEndTime: z.coerce.date(),
  reason: z.string().max(500).optional(),
  forceOverrideConflicts: z.boolean().optional().default(false),
});

const checkConflictsSchema = z.object({
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  attendeeIds: z.array(z.string()).min(1),
  bufferMinutesBefore: z.number().min(0).max(240).optional().default(0),
  bufferMinutesAfter: z.number().min(0).max(240).optional().default(0),
  excludeAppointmentId: z.string().optional(),
});

const checkAvailabilitySchema = z.object({
  attendeeId: z.string(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  minimumSlotMinutes: z.number().min(5).optional().default(30),
});

const findNextSlotSchema = z.object({
  attendeeId: z.string(),
  startFrom: z.coerce.date(),
  durationMinutes: z.number().min(5),
  maxDaysAhead: z.number().min(1).max(365).optional().default(30),
  bufferMinutesBefore: z.number().min(0).max(240).optional().default(0),
  bufferMinutesAfter: z.number().min(0).max(240).optional().default(0),
});

const listAppointmentsSchema = z.object({
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(20),
  status: z.array(appointmentStatusSchema).optional(),
  appointmentType: z.array(appointmentTypeSchema).optional(),
  startTimeFrom: z.coerce.date().optional(),
  startTimeTo: z.coerce.date().optional(),
  caseId: z.string().optional(),
  sortBy: z.enum(['startTime', 'createdAt', 'updatedAt']).optional().default('startTime'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

export const appointmentsRouter = createTRPCRouter({
  /**
   * Create a new appointment
   * Includes conflict detection
   */
  create: protectedProcedure.input(createAppointmentSchema).mutation(async ({ ctx, input }) => {
    const startTime = performance.now();

    // Validate time range
    if (input.startTime >= input.endTime) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Start time must be before end time',
      });
    }

    // Check for conflicts if not overriding
    if (!input.forceOverrideConflicts) {
      const allAttendees = [ctx.user.userId, ...input.attendeeIds];

      // Calculate effective time with buffers
      const effectiveStart = new Date(
        input.startTime.getTime() - input.bufferMinutesBefore * 60 * 1000
      );
      const effectiveEnd = new Date(input.endTime.getTime() + input.bufferMinutesAfter * 60 * 1000);

      const conflicts = await ctx.prisma.appointment.findMany({
        where: {
          AND: [
            {
              OR: [
                { organizerId: { in: allAttendees } },
                { attendees: { some: { userId: { in: allAttendees } } } },
              ],
            },
            { startTime: { lt: effectiveEnd } },
            { endTime: { gt: effectiveStart } },
            { status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
          ],
        },
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
        },
      });

      if (conflicts.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Scheduling conflict detected with ${conflicts.length} appointment(s)`,
          cause: {
            conflicts: conflicts.map((c) => ({
              id: c.id,
              title: c.title,
              startTime: c.startTime,
              endTime: c.endTime,
            })),
          },
        });
      }
    }

    // Create the appointment
    const appointment = await ctx.prisma.appointment.create({
      data: {
        title: input.title,
        description: input.description,
        startTime: input.startTime,
        endTime: input.endTime,
        appointmentType: input.appointmentType,
        location: input.location,
        bufferMinutesBefore: input.bufferMinutesBefore,
        bufferMinutesAfter: input.bufferMinutesAfter,
        recurrence: input.recurrence ? input.recurrence : undefined,
        reminderMinutes: input.reminderMinutes,
        organizerId: ctx.user.userId,
        attendees: {
          create: input.attendeeIds.map((userId) => ({ userId })),
        },
        linkedCases: {
          create: input.linkedCaseIds.map((caseId) => ({ caseId })),
        },
      },
      include: {
        attendees: true,
        linkedCases: true,
      },
    });

    const duration = performance.now() - startTime;
    console.log(`[appointments.create] Scheduled in ${duration.toFixed(2)}ms`);

    return appointment;
  }),

  /**
   * Get a single appointment by ID
   */
  getById: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const appointment = await ctx.prisma.appointment.findUnique({
      where: { id: input.id },
      include: {
        attendees: true,
        linkedCases: true,
      },
    });

    if (!appointment) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Appointment with ID ${input.id} not found`,
      });
    }

    return appointment;
  }),

  /**
   * List appointments with filtering
   */
  list: protectedProcedure.input(listAppointmentsSchema).query(async ({ ctx, input }) => {
    const {
      page,
      limit,
      status,
      appointmentType,
      startTimeFrom,
      startTimeTo,
      caseId,
      sortBy,
      sortOrder,
    } = input;
    const skip = (page - 1) * limit;

    const where: any = {
      OR: [{ organizerId: ctx.user.userId }, { attendees: { some: { userId: ctx.user.userId } } }],
    };

    if (status && status.length > 0) {
      where.status = { in: status };
    }

    if (appointmentType && appointmentType.length > 0) {
      where.appointmentType = { in: appointmentType };
    }

    if (startTimeFrom || startTimeTo) {
      where.startTime = {};
      if (startTimeFrom) where.startTime.gte = startTimeFrom;
      if (startTimeTo) where.startTime.lte = startTimeTo;
    }

    if (caseId) {
      where.linkedCases = { some: { caseId } };
    }

    const [appointments, total] = await Promise.all([
      ctx.prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          attendees: true,
          linkedCases: true,
        },
      }),
      ctx.prisma.appointment.count({ where }),
    ]);

    return {
      appointments,
      total,
      page,
      limit,
      hasMore: skip + appointments.length < total,
    };
  }),

  /**
   * Update appointment details
   */
  update: protectedProcedure.input(updateAppointmentSchema).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;

    const existing = await ctx.prisma.appointment.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Appointment with ID ${id} not found`,
      });
    }

    if (existing.status === 'CANCELLED') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot update a cancelled appointment',
      });
    }

    const appointment = await ctx.prisma.appointment.update({
      where: { id },
      data,
      include: {
        attendees: true,
        linkedCases: true,
      },
    });

    return appointment;
  }),

  /**
   * Reschedule an appointment
   */
  reschedule: protectedProcedure.input(rescheduleSchema).mutation(async ({ ctx, input }) => {
    const startTime = performance.now();

    const existing = await ctx.prisma.appointment.findUnique({
      where: { id: input.id },
      include: {
        attendees: true,
      },
    });

    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Appointment with ID ${input.id} not found`,
      });
    }

    if (existing.status === 'CANCELLED') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot reschedule a cancelled appointment',
      });
    }

    if (existing.status === 'COMPLETED') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot reschedule a completed appointment',
      });
    }

    // Check for conflicts if not overriding
    if (!input.forceOverrideConflicts) {
      const allAttendees = [existing.organizerId, ...existing.attendees.map((a) => a.userId)];

      const effectiveStart = new Date(
        input.newStartTime.getTime() - existing.bufferMinutesBefore * 60 * 1000
      );
      const effectiveEnd = new Date(
        input.newEndTime.getTime() + existing.bufferMinutesAfter * 60 * 1000
      );

      const conflicts = await ctx.prisma.appointment.findMany({
        where: {
          AND: [
            { id: { not: input.id } },
            {
              OR: [
                { organizerId: { in: allAttendees } },
                { attendees: { some: { userId: { in: allAttendees } } } },
              ],
            },
            { startTime: { lt: effectiveEnd } },
            { endTime: { gt: effectiveStart } },
            { status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
          ],
        },
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
        },
      });

      if (conflicts.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Rescheduling conflict detected with ${conflicts.length} appointment(s)`,
          cause: {
            conflicts: conflicts.map((c) => ({
              id: c.id,
              title: c.title,
              startTime: c.startTime,
              endTime: c.endTime,
            })),
          },
        });
      }
    }

    const appointment = await ctx.prisma.appointment.update({
      where: { id: input.id },
      data: {
        startTime: input.newStartTime,
        endTime: input.newEndTime,
      },
      include: {
        attendees: true,
        linkedCases: true,
      },
    });

    const duration = performance.now() - startTime;
    console.log(`[appointments.reschedule] Rescheduled in ${duration.toFixed(2)}ms`);

    return {
      appointment,
      previousTime: {
        startTime: existing.startTime,
        endTime: existing.endTime,
      },
    };
  }),

  /**
   * Confirm an appointment
   */
  confirm: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.appointment.findUnique({
        where: { id: input.id },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Appointment with ID ${input.id} not found`,
        });
      }

      if (existing.status !== 'SCHEDULED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot confirm appointment with status ${existing.status}`,
        });
      }

      const appointment = await ctx.prisma.appointment.update({
        where: { id: input.id },
        data: { status: 'CONFIRMED' },
        include: {
          attendees: true,
          linkedCases: true,
        },
      });

      return appointment;
    }),

  /**
   * Complete an appointment
   */
  complete: protectedProcedure
    .input(z.object({ id: z.string(), notes: z.string().max(5000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.appointment.findUnique({
        where: { id: input.id },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Appointment with ID ${input.id} not found`,
        });
      }

      if (existing.status === 'CANCELLED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot complete a cancelled appointment',
        });
      }

      if (existing.status === 'COMPLETED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Appointment is already completed',
        });
      }

      const appointment = await ctx.prisma.appointment.update({
        where: { id: input.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          notes: input.notes,
        },
        include: {
          attendees: true,
          linkedCases: true,
        },
      });

      return appointment;
    }),

  /**
   * Cancel an appointment
   */
  cancel: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.appointment.findUnique({
        where: { id: input.id },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Appointment with ID ${input.id} not found`,
        });
      }

      if (existing.status === 'CANCELLED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Appointment is already cancelled',
        });
      }

      if (existing.status === 'COMPLETED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot cancel a completed appointment',
        });
      }

      const appointment = await ctx.prisma.appointment.update({
        where: { id: input.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: input.reason,
        },
        include: {
          attendees: true,
          linkedCases: true,
        },
      });

      return appointment;
    }),

  /**
   * Mark appointment as no-show
   */
  markNoShow: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.appointment.findUnique({
        where: { id: input.id },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Appointment with ID ${input.id} not found`,
        });
      }

      if (existing.status !== 'SCHEDULED' && existing.status !== 'CONFIRMED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot mark as no-show for status ${existing.status}`,
        });
      }

      const appointment = await ctx.prisma.appointment.update({
        where: { id: input.id },
        data: { status: 'NO_SHOW' },
        include: {
          attendees: true,
          linkedCases: true,
        },
      });

      return appointment;
    }),

  /**
   * Delete an appointment
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.appointment.findUnique({
        where: { id: input.id },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Appointment with ID ${input.id} not found`,
        });
      }

      await ctx.prisma.appointment.delete({
        where: { id: input.id },
      });

      return { success: true, id: input.id };
    }),

  /**
   * Check for scheduling conflicts
   * Returns detailed conflict information
   */
  checkConflicts: protectedProcedure.input(checkConflictsSchema).query(async ({ ctx, input }) => {
    const startTime = performance.now();

    const effectiveStart = new Date(
      input.startTime.getTime() - input.bufferMinutesBefore * 60 * 1000
    );
    const effectiveEnd = new Date(input.endTime.getTime() + input.bufferMinutesAfter * 60 * 1000);

    const where: any = {
      AND: [
        {
          OR: [
            { organizerId: { in: input.attendeeIds } },
            { attendees: { some: { userId: { in: input.attendeeIds } } } },
          ],
        },
        { startTime: { lt: effectiveEnd } },
        { endTime: { gt: effectiveStart } },
        { status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
      ],
    };

    if (input.excludeAppointmentId) {
      where.AND.push({ id: { not: input.excludeAppointmentId } });
    }

    const conflicts = await ctx.prisma.appointment.findMany({
      where,
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        appointmentType: true,
        organizerId: true,
        bufferMinutesBefore: true,
        bufferMinutesAfter: true,
      },
    });

    const duration = performance.now() - startTime;
    console.log(`[appointments.checkConflicts] Checked in ${duration.toFixed(2)}ms`);

    return {
      hasConflicts: conflicts.length > 0,
      conflicts: conflicts.map((c) => {
        // Calculate overlap
        const cEffectiveStart = new Date(c.startTime.getTime() - c.bufferMinutesBefore * 60 * 1000);
        const cEffectiveEnd = new Date(c.endTime.getTime() + c.bufferMinutesAfter * 60 * 1000);
        const overlapStart = Math.max(effectiveStart.getTime(), cEffectiveStart.getTime());
        const overlapEnd = Math.min(effectiveEnd.getTime(), cEffectiveEnd.getTime());
        const overlapMinutes = Math.round((overlapEnd - overlapStart) / (1000 * 60));

        return {
          id: c.id,
          title: c.title,
          startTime: c.startTime,
          endTime: c.endTime,
          appointmentType: c.appointmentType,
          overlapMinutes,
        };
      }),
      checkDurationMs: duration,
    };
  }),

  /**
   * Check availability for an attendee
   * Returns available time slots
   */
  checkAvailability: protectedProcedure
    .input(checkAvailabilitySchema)
    .query(async ({ ctx, input }) => {
      const startTime = performance.now();

      // Get all appointments for the attendee in the time range
      const appointments = await ctx.prisma.appointment.findMany({
        where: {
          AND: [
            {
              OR: [
                { organizerId: input.attendeeId },
                { attendees: { some: { userId: input.attendeeId } } },
              ],
            },
            { startTime: { lt: input.endTime } },
            { endTime: { gt: input.startTime } },
            { status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
          ],
        },
        orderBy: { startTime: 'asc' },
        select: {
          startTime: true,
          endTime: true,
          bufferMinutesBefore: true,
          bufferMinutesAfter: true,
        },
      });

      // Calculate available slots
      const availableSlots: Array<{
        startTime: Date;
        endTime: Date;
        durationMinutes: number;
      }> = [];

      let currentStart = input.startTime;

      for (const apt of appointments) {
        const aptEffectiveStart = new Date(
          apt.startTime.getTime() - apt.bufferMinutesBefore * 60 * 1000
        );
        const aptEffectiveEnd = new Date(
          apt.endTime.getTime() + apt.bufferMinutesAfter * 60 * 1000
        );

        // Skip if outside our range
        if (aptEffectiveEnd <= input.startTime || aptEffectiveStart >= input.endTime) {
          continue;
        }

        // Check for gap before this appointment
        if (currentStart < aptEffectiveStart) {
          const slotEnd = new Date(Math.min(aptEffectiveStart.getTime(), input.endTime.getTime()));
          const duration = Math.round((slotEnd.getTime() - currentStart.getTime()) / (1000 * 60));

          if (duration >= input.minimumSlotMinutes) {
            availableSlots.push({
              startTime: new Date(currentStart),
              endTime: slotEnd,
              durationMinutes: duration,
            });
          }
        }

        // Move current start to after this appointment
        currentStart = new Date(Math.max(currentStart.getTime(), aptEffectiveEnd.getTime()));
      }

      // Check for remaining time at the end
      if (currentStart < input.endTime) {
        const duration = Math.round(
          (input.endTime.getTime() - currentStart.getTime()) / (1000 * 60)
        );

        if (duration >= input.minimumSlotMinutes) {
          availableSlots.push({
            startTime: new Date(currentStart),
            endTime: new Date(input.endTime),
            durationMinutes: duration,
          });
        }
      }

      const totalAvailableMinutes = availableSlots.reduce(
        (sum, slot) => sum + slot.durationMinutes,
        0
      );

      const duration = performance.now() - startTime;
      console.log(`[appointments.checkAvailability] Checked in ${duration.toFixed(2)}ms`);

      return {
        availableSlots,
        totalAvailableMinutes,
        checkDurationMs: duration,
      };
    }),

  /**
   * Find next available slot
   */
  findNextSlot: protectedProcedure.input(findNextSlotSchema).query(async ({ ctx, input }) => {
    const startTime = performance.now();

    const searchEndDate = new Date(input.startFrom);
    searchEndDate.setDate(searchEndDate.getDate() + input.maxDaysAhead);

    // Get all appointments for the attendee in the search range
    const appointments = await ctx.prisma.appointment.findMany({
      where: {
        AND: [
          {
            OR: [
              { organizerId: input.attendeeId },
              { attendees: { some: { userId: input.attendeeId } } },
            ],
          },
          { endTime: { gt: input.startFrom } },
          { startTime: { lt: searchEndDate } },
          { status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
        ],
      },
      orderBy: { startTime: 'asc' },
      select: {
        startTime: true,
        endTime: true,
        bufferMinutesBefore: true,
        bufferMinutesAfter: true,
      },
    });

    const totalDuration =
      input.durationMinutes + input.bufferMinutesBefore + input.bufferMinutesAfter;
    let currentDate = new Date(input.startFrom);

    // Find next available slot during working hours (9 AM - 5 PM, weekdays)
    const workStart = 9;
    const workEnd = 17;

    while (currentDate < searchEndDate) {
      const hour = currentDate.getHours();
      const dayOfWeek = currentDate.getDay();

      // Skip weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(workStart, 0, 0, 0);
        continue;
      }

      // Set to working hours
      if (hour < workStart) {
        currentDate.setHours(workStart, 0, 0, 0);
      } else if (hour >= workEnd) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(workStart, 0, 0, 0);
        continue;
      }

      // Calculate end of proposed slot
      const proposedEnd = new Date(currentDate.getTime() + totalDuration * 60 * 1000);

      // Check if it's within working hours
      if (
        proposedEnd.getHours() > workEnd ||
        (proposedEnd.getHours() === workEnd && proposedEnd.getMinutes() > 0)
      ) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(workStart, 0, 0, 0);
        continue;
      }

      // Check for conflicts
      let hasConflict = false;
      for (const apt of appointments) {
        const aptEffectiveStart = new Date(
          apt.startTime.getTime() - apt.bufferMinutesBefore * 60 * 1000
        );
        const aptEffectiveEnd = new Date(
          apt.endTime.getTime() + apt.bufferMinutesAfter * 60 * 1000
        );

        if (currentDate < aptEffectiveEnd && proposedEnd > aptEffectiveStart) {
          hasConflict = true;
          // Move past this appointment
          currentDate = new Date(aptEffectiveEnd);
          break;
        }
      }

      if (!hasConflict) {
        const duration = performance.now() - startTime;
        console.log(`[appointments.findNextSlot] Found in ${duration.toFixed(2)}ms`);

        return {
          slot: {
            startTime: new Date(currentDate),
            endTime: proposedEnd,
            durationMinutes: totalDuration,
          },
          searchDurationMs: duration,
        };
      }
    }

    const duration = performance.now() - startTime;
    console.log(`[appointments.findNextSlot] No slot found in ${duration.toFixed(2)}ms`);

    return {
      slot: null,
      searchDurationMs: duration,
    };
  }),

  /**
   * Link appointment to a case
   */
  linkToCase: protectedProcedure
    .input(z.object({ appointmentId: z.string(), caseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.appointment.findUnique({
        where: { id: input.appointmentId },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Appointment with ID ${input.appointmentId} not found`,
        });
      }

      // Check if already linked
      const existingLink = await ctx.prisma.appointmentCase.findUnique({
        where: {
          appointmentId_caseId: {
            appointmentId: input.appointmentId,
            caseId: input.caseId,
          },
        },
      });

      if (existingLink) {
        return { success: true, message: 'Already linked' };
      }

      await ctx.prisma.appointmentCase.create({
        data: {
          appointmentId: input.appointmentId,
          caseId: input.caseId,
        },
      });

      return { success: true };
    }),

  /**
   * Unlink appointment from a case
   */
  unlinkFromCase: protectedProcedure
    .input(z.object({ appointmentId: z.string(), caseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.appointmentCase.findUnique({
        where: {
          appointmentId_caseId: {
            appointmentId: input.appointmentId,
            caseId: input.caseId,
          },
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Link not found',
        });
      }

      await ctx.prisma.appointmentCase.delete({
        where: { id: existing.id },
      });

      return { success: true };
    }),

  /**
   * Add attendee to appointment
   */
  addAttendee: protectedProcedure
    .input(z.object({ appointmentId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.appointment.findUnique({
        where: { id: input.appointmentId },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Appointment with ID ${input.appointmentId} not found`,
        });
      }

      // Check if already added
      const existingAttendee = await ctx.prisma.appointmentAttendee.findUnique({
        where: {
          appointmentId_userId: {
            appointmentId: input.appointmentId,
            userId: input.userId,
          },
        },
      });

      if (existingAttendee) {
        return { success: true, message: 'Already added' };
      }

      await ctx.prisma.appointmentAttendee.create({
        data: {
          appointmentId: input.appointmentId,
          userId: input.userId,
        },
      });

      return { success: true };
    }),

  /**
   * Remove attendee from appointment
   */
  removeAttendee: protectedProcedure
    .input(z.object({ appointmentId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.appointmentAttendee.findUnique({
        where: {
          appointmentId_userId: {
            appointmentId: input.appointmentId,
            userId: input.userId,
          },
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Attendee not found',
        });
      }

      await ctx.prisma.appointmentAttendee.delete({
        where: { id: existing.id },
      });

      return { success: true };
    }),

  /**
   * Get upcoming appointments
   */
  upcoming: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).optional().default(10) }))
    .query(async ({ ctx, input }) => {
      const now = new Date();

      const appointments = await ctx.prisma.appointment.findMany({
        where: {
          AND: [
            {
              OR: [
                { organizerId: ctx.user.userId },
                { attendees: { some: { userId: ctx.user.userId } } },
              ],
            },
            { startTime: { gte: now } },
            { status: { notIn: ['CANCELLED', 'COMPLETED', 'NO_SHOW'] } },
          ],
        },
        take: input.limit,
        orderBy: { startTime: 'asc' },
        include: {
          attendees: true,
          linkedCases: true,
        },
      });

      return appointments;
    }),

  /**
   * Get appointment statistics
   */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [total, byStatus, byType, upcoming, overdue] = await Promise.all([
      ctx.prisma.appointment.count({
        where: {
          OR: [
            { organizerId: ctx.user.userId },
            { attendees: { some: { userId: ctx.user.userId } } },
          ],
        },
      }),
      ctx.prisma.appointment.groupBy({
        by: ['status'],
        where: {
          OR: [
            { organizerId: ctx.user.userId },
            { attendees: { some: { userId: ctx.user.userId } } },
          ],
        },
        _count: true,
      }),
      ctx.prisma.appointment.groupBy({
        by: ['appointmentType'],
        where: {
          OR: [
            { organizerId: ctx.user.userId },
            { attendees: { some: { userId: ctx.user.userId } } },
          ],
        },
        _count: true,
      }),
      ctx.prisma.appointment.count({
        where: {
          AND: [
            {
              OR: [
                { organizerId: ctx.user.userId },
                { attendees: { some: { userId: ctx.user.userId } } },
              ],
            },
            { startTime: { gte: new Date() } },
            { status: { in: ['SCHEDULED', 'CONFIRMED'] } },
          ],
        },
      }),
      ctx.prisma.appointment.count({
        where: {
          AND: [
            {
              OR: [
                { organizerId: ctx.user.userId },
                { attendees: { some: { userId: ctx.user.userId } } },
              ],
            },
            { endTime: { lt: new Date() } },
            { status: { in: ['SCHEDULED', 'CONFIRMED'] } },
          ],
        },
      }),
    ]);

    return {
      total,
      byStatus: byStatus.reduce(
        (acc, item) => {
          acc[item.status] = item._count;
          return acc;
        },
        {} as Record<string, number>
      ),
      byType: byType.reduce(
        (acc, item) => {
          acc[item.appointmentType] = item._count;
          return acc;
        },
        {} as Record<string, number>
      ),
      upcoming,
      overdue,
    };
  }),
});

// Export type for use in merged router
export type AppointmentsRouter = typeof appointmentsRouter;
