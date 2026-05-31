/**
 * Scheduled Maintenance Jobs
 *
 * Server-side cron jobs for CRM maintenance tasks:
 * - SLA breach detection & notification
 * - Stale lead / overdue task follow-up reminders
 * - Stale deal pipeline alerts
 * - Expired session cleanup
 * - Upcoming appointment reminders
 *
 * All jobs run as setInterval loops inside the events-worker process,
 * querying the database directly and creating notifications via Prisma.
 *
 * @module @intelliflow/events-worker/maintenance
 */

import type { Logger } from 'pino';
import type { PrismaClient, EncryptedPrismaClient } from '@intelliflow/db';

// ============================================================================
// Configuration
// ============================================================================

export interface MaintenanceConfig {
  /** SLA check interval in ms (default: 60s) */
  slaCheckIntervalMs: number;
  /** Follow-up reminder check interval in ms (default: 15 min) */
  followUpCheckIntervalMs: number;
  /** Stale deal check interval in ms (default: 1 hour) */
  staleDealCheckIntervalMs: number;
  /** Session cleanup interval in ms (default: 30 min) */
  sessionCleanupIntervalMs: number;
  /** Appointment reminder check interval in ms (default: 5 min) */
  appointmentReminderIntervalMs: number;
  /** Days without activity before a lead is considered stale */
  staleLeadDays: number;
  /** Days without activity before a deal is considered stale */
  staleDealDays: number;
}

const DEFAULT_CONFIG: MaintenanceConfig = {
  slaCheckIntervalMs: 60_000, // every 60s
  followUpCheckIntervalMs: 15 * 60_000, // every 15 min
  staleDealCheckIntervalMs: 60 * 60_000, // every 1 hour
  sessionCleanupIntervalMs: 30 * 60_000, // every 30 min
  appointmentReminderIntervalMs: 5 * 60_000, // every 5 min
  staleLeadDays: 7,
  staleDealDays: 14,
};

// ============================================================================
// Maintenance Scheduler
// ============================================================================

export class MaintenanceScheduler {
  private intervals: NodeJS.Timeout[] = [];
  private readonly config: MaintenanceConfig;
  private readonly logger: Logger;
  private readonly prisma: PrismaClient;

  constructor(prisma: EncryptedPrismaClient, logger: Logger, config?: Partial<MaintenanceConfig>) {
    this.prisma = prisma as unknown as PrismaClient;
    this.logger = logger.child({ component: 'maintenance-scheduler' });
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start all scheduled maintenance jobs
   */
  start(): void {
    this.logger.info('Starting maintenance scheduler');

    this.intervals.push(
      setInterval(
        () => this.runSafe('sla-breach-check', () => this.checkSLABreaches()),
        this.config.slaCheckIntervalMs
      ),
      setInterval(
        () => this.runSafe('follow-up-reminders', () => this.checkFollowUpReminders()),
        this.config.followUpCheckIntervalMs
      ),
      setInterval(
        () => this.runSafe('stale-deal-scan', () => this.checkStaleDeal()),
        this.config.staleDealCheckIntervalMs
      ),
      setInterval(
        () => this.runSafe('session-cleanup', () => this.cleanupSessions()),
        this.config.sessionCleanupIntervalMs
      ),
      setInterval(
        () => this.runSafe('appointment-reminders', () => this.checkAppointmentReminders()),
        this.config.appointmentReminderIntervalMs
      )
    );

    this.logger.info(
      {
        jobs: [
          `sla-breach-check (every ${this.config.slaCheckIntervalMs / 1000}s)`,
          `follow-up-reminders (every ${this.config.followUpCheckIntervalMs / 60000}min)`,
          `stale-deal-scan (every ${this.config.staleDealCheckIntervalMs / 60000}min)`,
          `session-cleanup (every ${this.config.sessionCleanupIntervalMs / 60000}min)`,
          `appointment-reminders (every ${this.config.appointmentReminderIntervalMs / 60000}min)`,
        ],
      },
      'Maintenance scheduler started with 5 jobs'
    );
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];
    this.logger.info('Maintenance scheduler stopped');
  }

  // ==========================================================================
  // Job 1: SLA Breach Detection
  // ==========================================================================

  private async checkSLABreaches(): Promise<void> {
    const now = new Date();

    // Find tickets where SLA deadline has passed but status is not breached
    const breachedTickets = await this.prisma.ticket.findMany({
      where: {
        slaResolutionDue: { lte: now },
        slaStatus: { not: 'BREACHED' },
        status: { notIn: ['CLOSED', 'RESOLVED'] },
      },
      select: {
        id: true,
        subject: true,
        assigneeId: true,
        tenantId: true,
        slaResolutionDue: true,
        priority: true,
      },
      take: 50,
    });

    if (breachedTickets.length === 0) return;

    this.logger.info({ count: breachedTickets.length }, 'SLA breaches detected');

    // Narrow to rows that actually have a non-null slaResolutionDue
    // (`slaResolutionDue: { lte: now }` excludes NULLs in SQL, but Prisma
    // types the field as `Date | null`, so we narrow here for safe access below)
    const validBreached = breachedTickets.filter(
      (t): t is typeof t & { slaResolutionDue: Date } => t.slaResolutionDue != null
    );

    // Batch-update all breached tickets in one query (NP-008 fix)
    const breachedIds = validBreached.map((t) => t.id);
    await this.prisma.ticket.updateMany({
      where: { id: { in: breachedIds } },
      data: { slaStatus: 'BREACHED', slaBreachedAt: now },
    });

    // Build notification payloads for assigned tickets, then insert in one shot
    const breachNotifications = validBreached
      .filter((t) => t.assigneeId != null)
      .map((ticket) => ({
        tenantId: ticket.tenantId,
        recipientId: ticket.assigneeId as string,
        channel: 'IN_APP' as const,
        subject: `SLA Breached: ${ticket.subject}`,
        body: `Ticket "${ticket.subject}" has breached its SLA deadline (${ticket.slaResolutionDue.toISOString()}). Immediate action required.`,
        priority: 'HIGH' as const,
        status: 'PENDING' as const,
        category: 'ALERTS' as const,
        sourceType: 'sla_breach',
        sourceId: ticket.id,
        metadata: {
          notificationType: 'sla_breach',
          ticketId: ticket.id,
          ticketPriority: ticket.priority,
          actionUrl: `/tickets/${ticket.id}`,
        },
      }));

    if (breachNotifications.length > 0) {
      await this.prisma.notification.createMany({ data: breachNotifications });
    }

    // Also check for SLA warnings (tickets approaching deadline within 30 min)
    const warningThreshold = new Date(now.getTime() + 30 * 60_000);
    const warningTickets = await this.prisma.ticket.findMany({
      where: {
        slaResolutionDue: { gt: now, lte: warningThreshold },
        slaStatus: { notIn: ['BREACHED', 'AT_RISK'] },
        status: { notIn: ['CLOSED', 'RESOLVED'] },
      },
      select: {
        id: true,
        subject: true,
        assigneeId: true,
        tenantId: true,
        slaResolutionDue: true,
      },
      take: 50,
    });

    if (warningTickets.length === 0) return;

    const validWarning = warningTickets.filter(
      (t): t is typeof t & { slaResolutionDue: Date } => t.slaResolutionDue != null
    );

    // Batch-update all at-risk tickets in one query (NP-009 fix)
    const warningIds = validWarning.map((t) => t.id);
    await this.prisma.ticket.updateMany({
      where: { id: { in: warningIds } },
      data: { slaStatus: 'AT_RISK' },
    });

    const warningNotifications = validWarning
      .filter((t) => t.assigneeId != null)
      .map((ticket) => {
        const minutesLeft = Math.round(
          (ticket.slaResolutionDue.getTime() - now.getTime()) / 60_000
        );
        return {
          tenantId: ticket.tenantId,
          recipientId: ticket.assigneeId as string,
          channel: 'IN_APP' as const,
          subject: `SLA Warning: ${ticket.subject}`,
          body: `Ticket "${ticket.subject}" will breach SLA in ${minutesLeft} minutes.`,
          priority: 'HIGH' as const,
          status: 'PENDING' as const,
          category: 'ALERTS' as const,
          sourceType: 'sla_warning',
          sourceId: ticket.id,
          metadata: {
            notificationType: 'sla_warning',
            ticketId: ticket.id,
            minutesUntilBreach: minutesLeft,
            actionUrl: `/tickets/${ticket.id}`,
          },
        };
      });

    if (warningNotifications.length > 0) {
      await this.prisma.notification.createMany({ data: warningNotifications });
    }
  }

  // ==========================================================================
  // Job 2: Follow-up Reminders (Stale Leads + Overdue Tasks)
  // ==========================================================================

  private async checkFollowUpReminders(): Promise<void> {
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - this.config.staleLeadDays * 24 * 60 * 60_000);

    // --- Stale leads: no activity in N days, not converted/disqualified ---
    const staleLeads = await this.prisma.lead.findMany({
      where: {
        updatedAt: { lte: staleCutoff },
        status: { notIn: ['CONVERTED', 'DISQUALIFIED', 'ARCHIVED'] },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        ownerId: true,
        tenantId: true,
        updatedAt: true,
      },
      take: 30,
    });

    const ownerLeads = staleLeads.filter((l) => l.ownerId != null);

    if (ownerLeads.length > 0) {
      // Pre-load all recent stale-lead reminders for these ids in ONE query (NP-029 fix)
      const leadIds = ownerLeads.map((l) => l.id);
      const recentLeadReminders = await this.prisma.notification.findMany({
        where: {
          sourceId: { in: leadIds },
          sourceType: 'stale_lead_reminder',
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
        },
        select: { sourceId: true },
      });
      const alreadyRemindedLeads = new Set(recentLeadReminders.map((r) => r.sourceId));

      const leadNotifications = ownerLeads
        .filter((lead) => !alreadyRemindedLeads.has(lead.id))
        .map((lead) => {
          const daysSinceUpdate = Math.round(
            (now.getTime() - lead.updatedAt.getTime()) / (24 * 60 * 60_000)
          );
          const leadName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email;
          return {
            tenantId: lead.tenantId,
            recipientId: lead.ownerId as string,
            channel: 'IN_APP' as const,
            subject: `Stale lead: ${leadName}`,
            body: `Lead "${leadName}" has had no activity for ${daysSinceUpdate} days. Consider reaching out or updating their status.`,
            priority: 'NORMAL' as const,
            status: 'PENDING' as const,
            category: 'REMINDERS' as const,
            sourceType: 'stale_lead_reminder',
            sourceId: lead.id,
            metadata: {
              notificationType: 'follow_up_reminder',
              daysSinceUpdate,
              actionUrl: `/leads/${lead.id}`,
            },
          };
        });

      if (leadNotifications.length > 0) {
        await this.prisma.notification.createMany({ data: leadNotifications });
      }
    }

    if (staleLeads.length > 0) {
      this.logger.info({ count: staleLeads.length }, 'Stale lead reminders processed');
    }

    // --- Overdue tasks ---
    const overdueTasks = await this.prisma.task.findMany({
      where: {
        dueDate: { lt: now },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      select: {
        id: true,
        title: true,
        ownerId: true,
        assigneeId: true,
        tenantId: true,
        dueDate: true,
      },
      take: 30,
    });

    // `dueDate: { lt: now }` excludes NULLs in SQL, but Prisma types it Date | null
    const validTasks = overdueTasks.filter(
      (t): t is typeof t & { dueDate: Date } => t.dueDate != null
    );

    if (validTasks.length > 0) {
      // Pre-load all recent overdue-task reminders for these ids in ONE query (NP-030 fix)
      const taskIds = validTasks.map((t) => t.id);
      const recentTaskReminders = await this.prisma.notification.findMany({
        where: {
          sourceId: { in: taskIds },
          sourceType: 'overdue_task_reminder',
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
        },
        select: { sourceId: true },
      });
      const alreadyRemindedTasks = new Set(recentTaskReminders.map((r) => r.sourceId));

      const taskNotifications = validTasks
        .filter((task) => !alreadyRemindedTasks.has(task.id))
        .map((task) => {
          // Prefer the user currently working the task; fall back to the owner.
          const recipientId = task.assigneeId ?? task.ownerId;
          const daysOverdue = Math.round(
            (now.getTime() - task.dueDate.getTime()) / (24 * 60 * 60_000)
          );
          return {
            tenantId: task.tenantId,
            recipientId,
            channel: 'IN_APP' as const,
            subject: `Overdue task: ${task.title}`,
            body: `Task "${task.title}" is ${daysOverdue} day(s) overdue. Please complete or reschedule it.`,
            priority: (daysOverdue >= 3 ? 'HIGH' : 'NORMAL') as 'HIGH' | 'NORMAL',
            status: 'PENDING' as const,
            category: 'REMINDERS' as const,
            sourceType: 'overdue_task_reminder',
            sourceId: task.id,
            metadata: {
              notificationType: 'overdue_task',
              daysOverdue,
              actionUrl: `/tasks/${task.id}`,
            },
          };
        });

      if (taskNotifications.length > 0) {
        await this.prisma.notification.createMany({ data: taskNotifications });
      }
    }

    if (overdueTasks.length > 0) {
      this.logger.info({ count: overdueTasks.length }, 'Overdue task reminders processed');
    }
  }

  // ==========================================================================
  // Job 3: Stale Deal Scanner
  // ==========================================================================

  private async checkStaleDeal(): Promise<void> {
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - this.config.staleDealDays * 24 * 60 * 60_000);

    const staleDeals = await this.prisma.opportunity.findMany({
      where: {
        updatedAt: { lte: staleCutoff },
        stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
      },
      select: {
        id: true,
        name: true,
        ownerId: true,
        tenantId: true,
        updatedAt: true,
        value: true,
        stage: true,
      },
      take: 30,
    });

    const ownerDeals = staleDeals.filter((d) => d.ownerId != null);

    if (ownerDeals.length > 0) {
      // Pre-load all recent stale-deal reminders for these ids in ONE query (NP-031 fix)
      const dealIds = ownerDeals.map((d) => d.id);
      const recentDealReminders = await this.prisma.notification.findMany({
        where: {
          sourceId: { in: dealIds },
          sourceType: 'stale_deal_alert',
          createdAt: { gte: new Date(now.getTime() - 48 * 60 * 60_000) },
        },
        select: { sourceId: true },
      });
      const alreadyAlertedDeals = new Set(recentDealReminders.map((r) => r.sourceId));

      const dealNotifications = ownerDeals
        .filter((deal) => !alreadyAlertedDeals.has(deal.id))
        .map((deal) => {
          const daysSinceUpdate = Math.round(
            (now.getTime() - deal.updatedAt.getTime()) / (24 * 60 * 60_000)
          );
          return {
            tenantId: deal.tenantId,
            recipientId: deal.ownerId as string,
            channel: 'IN_APP' as const,
            subject: `Stale deal: ${deal.name}`,
            body: `Deal "${deal.name}" (${deal.stage}) has had no activity for ${daysSinceUpdate} days. Value: ${deal.value ?? 'N/A'}. Review or update its status.`,
            priority: 'HIGH' as const,
            status: 'PENDING' as const,
            category: 'ALERTS' as const,
            sourceType: 'stale_deal_alert',
            sourceId: deal.id,
            metadata: {
              notificationType: 'stale_deal',
              daysSinceUpdate,
              dealStage: deal.stage,
              dealValue: deal.value,
              actionUrl: `/deals/${deal.id}`,
            },
          };
        });

      if (dealNotifications.length > 0) {
        await this.prisma.notification.createMany({ data: dealNotifications });
      }
    }

    if (staleDeals.length > 0) {
      this.logger.info({ count: staleDeals.length }, 'Stale deal alerts processed');
    }
  }

  // ==========================================================================
  // Job 4: Session Cleanup
  // ==========================================================================

  private async cleanupSessions(): Promise<void> {
    const now = new Date();

    // Delete expired sessions from the database
    const result = await this.prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lte: now } },
          // Also clean sessions inactive for more than 4 hours
          { lastActiveAt: { lte: new Date(now.getTime() - 4 * 60 * 60_000) } },
        ],
      },
    });

    if (result.count > 0) {
      this.logger.info({ cleaned: result.count }, 'Expired sessions cleaned up');
    }
  }

  // ==========================================================================
  // Job 5: Appointment Reminders
  // ==========================================================================

  private async checkAppointmentReminders(): Promise<void> {
    const now = new Date();

    // Find appointments starting in the next 15 min
    const reminderWindow = new Date(now.getTime() + 15 * 60_000);

    const upcomingAppointments = await this.prisma.appointment.findMany({
      where: {
        startTime: { gt: now, lte: reminderWindow },
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        location: true,
        organizerId: true,
        tenantId: true,
      },
      take: 50,
    });

    const organizerAppts = upcomingAppointments.filter((a) => a.organizerId != null);

    if (organizerAppts.length === 0) return;

    // Pre-load all recent appointment reminders for these ids in ONE query (NP-032 fix)
    const apptIds = organizerAppts.map((a) => a.id);
    const recentApptReminders = await this.prisma.notification.findMany({
      where: {
        sourceId: { in: apptIds },
        sourceType: 'appointment_reminder',
        createdAt: { gte: new Date(now.getTime() - 60 * 60_000) },
      },
      select: { sourceId: true },
    });
    const alreadySentAppts = new Set(recentApptReminders.map((r) => r.sourceId));

    const apptNotifications = organizerAppts
      .filter((appt) => !alreadySentAppts.has(appt.id))
      .map((appt) => {
        const minutesUntilStart = Math.round((appt.startTime.getTime() - now.getTime()) / 60_000);
        return {
          tenantId: appt.tenantId,
          recipientId: appt.organizerId as string,
          channel: 'IN_APP' as const,
          subject: `Upcoming: ${appt.title}`,
          body:
            `Your appointment "${appt.title}" starts in ${minutesUntilStart} minutes.` +
            (appt.location ? ` Location: ${appt.location}` : ''),
          priority: 'HIGH' as const,
          status: 'PENDING' as const,
          category: 'REMINDERS' as const,
          sourceType: 'appointment_reminder',
          sourceId: appt.id,
          metadata: {
            notificationType: 'appointment_reminder',
            minutesUntilStart,
            actionUrl: `/appointments/${appt.id}`,
          },
        };
      });

    if (apptNotifications.length > 0) {
      await this.prisma.notification.createMany({ data: apptNotifications });
      this.logger.info({ count: apptNotifications.length }, 'Appointment reminders sent');
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private async runSafe(name: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      this.logger.error(
        { job: name, error: error instanceof Error ? error.message : String(error) },
        `Maintenance job "${name}" failed — will retry on next interval`
      );
    }
  }
}
