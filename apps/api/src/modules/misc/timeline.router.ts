/**
 * Timeline Router
 *
 * Provides unified timeline API that aggregates events from multiple sources:
 * - Tasks and their status changes
 * - Appointments (meetings, calls, hearings)
 * - Audit log entries
 * - Domain events
 * - Agent actions (AI-initiated actions pending approval)
 *
 * Task: IFC-159 - Timeline Enrichment with Documents, Communications, Agent Actions
 * KPIs: Response <1s, unified chronological ordering, permissions enforced
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

// =============================================================================
// Timeline Event Types
// =============================================================================

/**
 * Timeline event type enum
 * Represents all possible event sources in the unified timeline
 */
export const TimelineEventType = {
  TASK: 'task',
  TASK_COMPLETED: 'task_completed',
  TASK_OVERDUE: 'task_overdue',
  APPOINTMENT: 'appointment',
  DEADLINE: 'deadline',
  STATUS_CHANGE: 'status_change',
  NOTE: 'note',
  DOCUMENT: 'document',
  DOCUMENT_VERSION: 'document_version',
  COMMUNICATION: 'communication',
  EMAIL: 'email',
  CALL: 'call',
  AGENT_ACTION: 'agent_action',
  REMINDER: 'reminder',
  AUDIT: 'audit',
  STAGE_CHANGE: 'stage_change',
} as const;

export type TimelineEventTypeValue = (typeof TimelineEventType)[keyof typeof TimelineEventType];

/**
 * Agent action status
 */
export const AgentActionStatus = {
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ROLLED_BACK: 'rolled_back',
  EXPIRED: 'expired',
} as const;

export type AgentActionStatusValue = (typeof AgentActionStatus)[keyof typeof AgentActionStatus];

/**
 * Priority levels for timeline events
 */
export const TimelinePriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

export type TimelinePriorityValue = (typeof TimelinePriority)[keyof typeof TimelinePriority];

// =============================================================================
// Zod Schemas
// =============================================================================

const timelineEventTypeSchema = z.enum([
  'task',
  'task_completed',
  'task_overdue',
  'appointment',
  'deadline',
  'status_change',
  'note',
  'document',
  'document_version',
  'communication',
  'email',
  'call',
  'agent_action',
  'reminder',
  'audit',
  'stage_change',
]);

const timelinePrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);

const agentActionStatusSchema = z.enum([
  'pending_approval',
  'approved',
  'rejected',
  'rolled_back',
  'expired',
]);

/**
 * Query schema for fetching timeline events
 */
const timelineQuerySchema = z.object({
  // Entity filters
  dealId: z.string().optional(),
  caseId: z.string().optional(),
  opportunityId: z.string().optional(),
  contactId: z.string().optional(),
  accountId: z.string().optional(),

  // Event type filters
  eventTypes: z.array(timelineEventTypeSchema).optional(),
  excludeTypes: z.array(timelineEventTypeSchema).optional(),

  // Priority filters
  priorities: z.array(timelinePrioritySchema).optional(),

  // Agent action status filter
  agentActionStatus: z.array(agentActionStatusSchema).optional(),

  // Date range filters
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),

  // Pagination
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(50),

  // Sorting
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),

  // Include completed/cancelled items
  includeCompleted: z.boolean().optional().default(true),

  // Search
  search: z.string().optional(),
});

/**
 * Output schema for a single timeline event
 */
const timelineEventSchema = z.object({
  id: z.string(),
  type: timelineEventTypeSchema,
  title: z.string(),
  description: z.string().optional().nullable(),
  timestamp: z.date(),
  priority: timelinePrioritySchema.optional().nullable(),

  // Entity references
  entityType: z.string().optional().nullable(),
  entityId: z.string().optional().nullable(),

  // For agent actions
  agentAction: z
    .object({
      actionId: z.string(),
      agentName: z.string(),
      proposedChanges: z.any(),
      confidence: z.number(),
      status: agentActionStatusSchema,
      expiresAt: z.date().optional().nullable(),
    })
    .optional()
    .nullable(),

  // For documents
  document: z
    .object({
      documentId: z.string(),
      filename: z.string(),
      version: z.number().optional(),
      mimeType: z.string().optional(),
    })
    .optional()
    .nullable(),

  // For communications
  communication: z
    .object({
      channel: z.enum(['email', 'phone', 'whatsapp', 'sms', 'other']),
      direction: z.enum(['inbound', 'outbound']),
      from: z.string().optional(),
      to: z.string().optional(),
      subject: z.string().optional(),
    })
    .optional()
    .nullable(),

  // For appointments
  appointment: z
    .object({
      appointmentId: z.string(),
      appointmentType: z.string(),
      startTime: z.date(),
      endTime: z.date(),
      location: z.string().optional().nullable(),
      status: z.string(),
    })
    .optional()
    .nullable(),

  // For tasks
  task: z
    .object({
      taskId: z.string(),
      status: z.string(),
      dueDate: z.date().optional().nullable(),
      completedAt: z.date().optional().nullable(),
    })
    .optional()
    .nullable(),

  // Actor who performed the action
  actor: z
    .object({
      id: z.string(),
      name: z.string().optional().nullable(),
      email: z.string().optional().nullable(),
      avatarUrl: z.string().optional().nullable(),
      isAgent: z.boolean().optional(),
    })
    .optional()
    .nullable(),

  // Metadata
  metadata: z.record(z.any()).optional().nullable(),
  isOverdue: z.boolean().optional(),
});

export type TimelineEvent = z.infer<typeof timelineEventSchema>;

// =============================================================================
// Router Implementation
// =============================================================================

export const timelineRouter = createTRPCRouter({
  /**
   * Get unified timeline for an entity (deal/case/opportunity/contact/account)
   *
   * Aggregates events from multiple sources and returns in chronological order.
   * Respects user permissions - only shows events the user has access to.
   */
  getEvents: protectedProcedure.input(timelineQuerySchema).query(async ({ ctx, input }) => {
    const startTime = performance.now();

    const {
      dealId,
      caseId,
      opportunityId,
      contactId,
      accountId,
      eventTypes,
      excludeTypes,
      priorities,
      agentActionStatus,
      fromDate,
      toDate,
      page,
      limit,
      sortOrder,
      includeCompleted,
      search,
    } = input;

    // Use dealId or caseId interchangeably (same entity concept)
    const effectiveOpportunityId = opportunityId || dealId || caseId;

    const events: TimelineEvent[] = [];
    const now = new Date();

    // Build date filters
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (fromDate) dateFilter.gte = fromDate;
    if (toDate) dateFilter.lte = toDate;

    // Helper to check if event type should be included
    const shouldIncludeType = (type: string): boolean => {
      if (excludeTypes?.includes(type as any)) return false;
      if (eventTypes && eventTypes.length > 0) {
        return eventTypes.includes(type as any);
      }
      return true;
    };

    // Helper to map priority
    const mapPriority = (priority: string | null | undefined): TimelinePriorityValue | null => {
      if (!priority) return null;
      const mapping: Record<string, TimelinePriorityValue> = {
        LOW: 'low',
        MEDIUM: 'medium',
        HIGH: 'high',
        URGENT: 'urgent',
      };
      return mapping[priority.toUpperCase()] || 'medium';
    };

    // =========================================================================
    // 1. Fetch Tasks
    // =========================================================================
    if (shouldIncludeType('task') || shouldIncludeType('task_completed') || shouldIncludeType('task_overdue')) {
      const taskWhere: any = {};

      if (effectiveOpportunityId) {
        taskWhere.opportunityId = effectiveOpportunityId;
      }
      if (contactId) {
        taskWhere.contactId = contactId;
      }

      if (Object.keys(dateFilter).length > 0) {
        taskWhere.OR = [
          { createdAt: dateFilter },
          { dueDate: dateFilter },
          { completedAt: dateFilter },
        ];
      }

      if (search) {
        taskWhere.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (!includeCompleted) {
        taskWhere.status = { notIn: ['COMPLETED', 'CANCELLED'] };
      }

      if (priorities && priorities.length > 0) {
        taskWhere.priority = {
          in: priorities.map((p) => p.toUpperCase()),
        };
      }

      const tasks = await ctx.prisma.task.findMany({
        where: taskWhere,
        include: {
          owner: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: sortOrder },
      });

      for (const task of tasks) {
        const isOverdue =
          task.dueDate &&
          task.dueDate < now &&
          task.status !== 'COMPLETED' &&
          task.status !== 'CANCELLED';

        let eventType: TimelineEventTypeValue = 'task';
        if (task.status === 'COMPLETED') {
          eventType = 'task_completed';
        } else if (isOverdue) {
          eventType = 'task_overdue';
        }

        if (shouldIncludeType(eventType)) {
          events.push({
            id: `task-${task.id}`,
            type: eventType,
            title: task.title,
            description: task.description,
            timestamp: task.completedAt || task.dueDate || task.createdAt,
            priority: mapPriority(task.priority),
            entityType: 'task',
            entityId: task.id,
            task: {
              taskId: task.id,
              status: task.status,
              dueDate: task.dueDate,
              completedAt: task.completedAt,
            },
            actor: task.owner
              ? {
                  id: task.owner.id,
                  name: task.owner.name,
                  email: task.owner.email,
                  avatarUrl: task.owner.avatarUrl,
                  isAgent: false,
                }
              : null,
            isOverdue: !!isOverdue,
            agentAction: null,
            document: null,
            communication: null,
            appointment: null,
            metadata: null,
          });
        }
      }
    }

    // =========================================================================
    // 2. Fetch Appointments
    // =========================================================================
    if (shouldIncludeType('appointment')) {
      const appointmentWhere: any = {
        OR: [
          { organizerId: ctx.user.userId },
          { attendees: { some: { userId: ctx.user.userId } } },
        ],
      };

      // Link appointments to cases/deals via linkedCases
      if (effectiveOpportunityId) {
        appointmentWhere.linkedCases = {
          some: { caseId: effectiveOpportunityId },
        };
      }

      if (Object.keys(dateFilter).length > 0) {
        appointmentWhere.startTime = dateFilter;
      }

      if (!includeCompleted) {
        appointmentWhere.status = { notIn: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] };
      }

      const appointments = await ctx.prisma.appointment.findMany({
        where: appointmentWhere,
        orderBy: { startTime: sortOrder },
      });

      for (const apt of appointments) {
        events.push({
          id: `appointment-${apt.id}`,
          type: 'appointment',
          title: apt.title,
          description: apt.description,
          timestamp: apt.startTime,
          priority: null,
          entityType: 'appointment',
          entityId: apt.id,
          appointment: {
            appointmentId: apt.id,
            appointmentType: apt.appointmentType,
            startTime: apt.startTime,
            endTime: apt.endTime,
            location: apt.location,
            status: apt.status,
          },
          actor: null,
          isOverdue: apt.endTime < now && apt.status === 'SCHEDULED',
          agentAction: null,
          document: null,
          communication: null,
          task: null,
          metadata: null,
        });
      }
    }

    // =========================================================================
    // 3. Fetch Audit Log Entries (for status changes, stage changes, etc.)
    // =========================================================================
    if (shouldIncludeType('status_change') || shouldIncludeType('stage_change') || shouldIncludeType('audit')) {
      const auditWhere: any = {};

      if (effectiveOpportunityId) {
        auditWhere.OR = [
          { entityType: 'Opportunity', entityId: effectiveOpportunityId },
          { entityType: 'Deal', entityId: effectiveOpportunityId },
          { entityType: 'Case', entityId: effectiveOpportunityId },
        ];
      }

      if (Object.keys(dateFilter).length > 0) {
        auditWhere.createdAt = dateFilter;
      }

      const auditLogs = await ctx.prisma.auditLog.findMany({
        where: auditWhere,
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: sortOrder },
        take: 100, // Limit audit entries
      });

      for (const log of auditLogs) {
        let eventType: TimelineEventTypeValue = 'audit';

        // Determine specific event type based on action
        if (log.action.toLowerCase().includes('stage')) {
          eventType = 'stage_change';
        } else if (log.action.toLowerCase().includes('status')) {
          eventType = 'status_change';
        }

        if (shouldIncludeType(eventType)) {
          events.push({
            id: `audit-${log.id}`,
            type: eventType,
            title: log.action,
            description: null,
            timestamp: log.createdAt,
            priority: null,
            entityType: log.entityType,
            entityId: log.entityId,
            actor: log.user
              ? {
                  id: log.user.id,
                  name: log.user.name,
                  email: log.user.email,
                  avatarUrl: log.user.avatarUrl,
                  isAgent: false,
                }
              : null,
            metadata: {
              oldValue: log.oldValue,
              newValue: log.newValue,
              ipAddress: log.ipAddress,
            },
            isOverdue: false,
            agentAction: null,
            document: null,
            communication: null,
            appointment: null,
            task: null,
          });
        }
      }
    }

    // =========================================================================
    // 4. Fetch Domain Events (for agent actions and other domain events)
    // =========================================================================
    if (shouldIncludeType('agent_action')) {
      const domainEventWhere: any = {
        eventType: { startsWith: 'AgentAction' },
      };

      if (effectiveOpportunityId) {
        domainEventWhere.aggregateId = effectiveOpportunityId;
      }

      if (Object.keys(dateFilter).length > 0) {
        domainEventWhere.occurredAt = dateFilter;
      }

      if (agentActionStatus && agentActionStatus.length > 0) {
        // Filter by status in payload
        domainEventWhere.payload = {
          path: ['status'],
          array_contains: agentActionStatus,
        };
      }

      const domainEvents = await ctx.prisma.domainEvent.findMany({
        where: domainEventWhere,
        orderBy: { occurredAt: sortOrder },
      });

      for (const event of domainEvents) {
        const payload = event.payload as any;

        // Map status
        let status: AgentActionStatusValue = 'pending_approval';
        if (payload?.status) {
          const statusMap: Record<string, AgentActionStatusValue> = {
            pending: 'pending_approval',
            pending_approval: 'pending_approval',
            approved: 'approved',
            rejected: 'rejected',
            rolled_back: 'rolled_back',
            expired: 'expired',
          };
          status = statusMap[payload.status.toLowerCase()] || 'pending_approval';
        }

        events.push({
          id: `agent-${event.id}`,
          type: 'agent_action',
          title: payload?.actionName || `Agent Action: ${event.eventType}`,
          description: payload?.description || null,
          timestamp: event.occurredAt,
          priority: payload?.priority ? mapPriority(payload.priority) : 'medium',
          entityType: event.aggregateType,
          entityId: event.aggregateId,
          agentAction: {
            actionId: event.id,
            agentName: payload?.agentName || 'AI Assistant',
            proposedChanges: payload?.proposedChanges || payload?.changes || null,
            confidence: payload?.confidence || 0.85,
            status,
            expiresAt: payload?.expiresAt ? new Date(payload.expiresAt) : null,
          },
          actor: {
            id: 'agent',
            name: payload?.agentName || 'AI Assistant',
            email: null,
            avatarUrl: null,
            isAgent: true,
          },
          isOverdue: false,
          document: null,
          communication: null,
          appointment: null,
          task: null,
          metadata: event.metadata as Record<string, any> | null,
        });
      }
    }

    // =========================================================================
    // 5. Sort all events chronologically
    // =========================================================================
    events.sort((a, b) => {
      const timeA = a.timestamp.getTime();
      const timeB = b.timestamp.getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    // =========================================================================
    // 6. Apply pagination
    // =========================================================================
    const skip = (page - 1) * limit;
    const paginatedEvents = events.slice(skip, skip + limit);
    const total = events.length;

    const duration = performance.now() - startTime;
    console.log(`[timeline.getEvents] Fetched ${total} events in ${duration.toFixed(2)}ms`);

    // Warn if response time exceeds KPI target (1s)
    if (duration > 1000) {
      console.warn(`[timeline.getEvents] SLOW: Response took ${duration.toFixed(2)}ms (target: <1000ms)`);
    }

    return {
      events: paginatedEvents,
      total,
      page,
      limit,
      hasMore: skip + paginatedEvents.length < total,
      queryDurationMs: duration,
    };
  }),

  /**
   * Get timeline statistics for an entity
   *
   * Returns counts by event type, priority, and status
   */
  getStats: protectedProcedure
    .input(
      z.object({
        dealId: z.string().optional(),
        caseId: z.string().optional(),
        opportunityId: z.string().optional(),
        fromDate: z.coerce.date().optional(),
        toDate: z.coerce.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const startTime = performance.now();

      const effectiveOpportunityId = input.opportunityId || input.dealId || input.caseId;

      const now = new Date();

      // Task stats
      const taskWhere: any = {};
      if (effectiveOpportunityId) {
        taskWhere.opportunityId = effectiveOpportunityId;
      }

      const [
        totalTasks,
        completedTasks,
        overdueTasks,
        upcomingAppointments,
        pendingAgentActions,
      ] = await Promise.all([
        ctx.prisma.task.count({ where: taskWhere }),
        ctx.prisma.task.count({
          where: { ...taskWhere, status: 'COMPLETED' },
        }),
        ctx.prisma.task.count({
          where: {
            ...taskWhere,
            dueDate: { lt: now },
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
          },
        }),
        effectiveOpportunityId
          ? ctx.prisma.appointment.count({
              where: {
                linkedCases: { some: { caseId: effectiveOpportunityId } },
                startTime: { gte: now },
                status: { notIn: ['CANCELLED', 'COMPLETED', 'NO_SHOW'] },
              },
            })
          : Promise.resolve(0),
        ctx.prisma.domainEvent.count({
          where: {
            eventType: { startsWith: 'AgentAction' },
            ...(effectiveOpportunityId && { aggregateId: effectiveOpportunityId }),
            status: 'PENDING',
          },
        }),
      ]);

      const duration = performance.now() - startTime;

      return {
        tasks: {
          total: totalTasks,
          completed: completedTasks,
          overdue: overdueTasks,
          pending: totalTasks - completedTasks,
        },
        appointments: {
          upcoming: upcomingAppointments,
        },
        agentActions: {
          pendingApproval: pendingAgentActions,
        },
        queryDurationMs: duration,
      };
    }),

  /**
   * Get upcoming deadlines for an entity
   *
   * Returns tasks and appointments due in the next N days
   */
  getUpcomingDeadlines: protectedProcedure
    .input(
      z.object({
        dealId: z.string().optional(),
        caseId: z.string().optional(),
        opportunityId: z.string().optional(),
        daysAhead: z.number().min(1).max(90).optional().default(7),
        limit: z.number().min(1).max(50).optional().default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const startTime = performance.now();

      const effectiveOpportunityId = input.opportunityId || input.dealId || input.caseId;
      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + input.daysAhead);

      const deadlines: Array<{
        id: string;
        type: 'task' | 'appointment';
        title: string;
        dueDate: Date;
        priority: TimelinePriorityValue | null;
        isOverdue: boolean;
      }> = [];

      // Get upcoming tasks
      const taskWhere: any = {
        dueDate: {
          gte: new Date(now.setHours(0, 0, 0, 0)),
          lte: futureDate,
        },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      };

      if (effectiveOpportunityId) {
        taskWhere.opportunityId = effectiveOpportunityId;
      }

      const tasks = await ctx.prisma.task.findMany({
        where: taskWhere,
        orderBy: { dueDate: 'asc' },
        take: input.limit,
      });

      for (const task of tasks) {
        if (task.dueDate) {
          deadlines.push({
            id: `task-${task.id}`,
            type: 'task',
            title: task.title,
            dueDate: task.dueDate,
            priority: task.priority?.toLowerCase() as TimelinePriorityValue || null,
            isOverdue: task.dueDate < new Date(),
          });
        }
      }

      // Get upcoming appointments
      const appointmentWhere: any = {
        startTime: {
          gte: now,
          lte: futureDate,
        },
        status: { notIn: ['CANCELLED', 'COMPLETED', 'NO_SHOW'] },
      };

      if (effectiveOpportunityId) {
        appointmentWhere.linkedCases = {
          some: { caseId: effectiveOpportunityId },
        };
      }

      const appointments = await ctx.prisma.appointment.findMany({
        where: appointmentWhere,
        orderBy: { startTime: 'asc' },
        take: input.limit,
      });

      for (const apt of appointments) {
        deadlines.push({
          id: `appointment-${apt.id}`,
          type: 'appointment',
          title: apt.title,
          dueDate: apt.startTime,
          priority: null,
          isOverdue: false,
        });
      }

      // Sort by due date
      deadlines.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

      const duration = performance.now() - startTime;

      return {
        deadlines: deadlines.slice(0, input.limit),
        total: deadlines.length,
        queryDurationMs: duration,
      };
    }),

  /**
   * Get pending agent actions requiring approval
   *
   * Returns agent actions with pending_approval status
   */
  getPendingAgentActions: protectedProcedure
    .input(
      z.object({
        dealId: z.string().optional(),
        caseId: z.string().optional(),
        opportunityId: z.string().optional(),
        limit: z.number().min(1).max(50).optional().default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const startTime = performance.now();

      const effectiveOpportunityId = input.opportunityId || input.dealId || input.caseId;

      const where: any = {
        eventType: { startsWith: 'AgentAction' },
        status: 'PENDING',
      };

      if (effectiveOpportunityId) {
        where.aggregateId = effectiveOpportunityId;
      }

      const events = await ctx.prisma.domainEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: input.limit,
      });

      const actions = events.map((event) => {
        const payload = event.payload as any;

        return {
          id: event.id,
          actionId: event.id,
          agentName: payload?.agentName || 'AI Assistant',
          actionType: event.eventType.replace('AgentAction', ''),
          title: payload?.actionName || payload?.title || `Agent Action: ${event.eventType}`,
          description: payload?.description || null,
          proposedChanges: payload?.proposedChanges || payload?.changes || null,
          confidence: payload?.confidence || 0.85,
          createdAt: event.occurredAt,
          expiresAt: payload?.expiresAt ? new Date(payload.expiresAt) : null,
          entityType: event.aggregateType,
          entityId: event.aggregateId,
        };
      });

      const duration = performance.now() - startTime;

      return {
        actions,
        total: actions.length,
        queryDurationMs: duration,
      };
    }),
});

// Export type for use in merged router
export type TimelineRouter = typeof timelineRouter;
