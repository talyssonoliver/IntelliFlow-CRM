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

    for (const ticket of breachedTickets) {
      // `slaResolutionDue: { lte: now }` in the where clause excludes NULL rows
      // in SQL, but the Prisma-generated type is still `Date | null`.
      if (!ticket.slaResolutionDue) continue;

      // Mark ticket as breached
      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: { slaStatus: 'BREACHED', slaBreachedAt: now },
      });

      // Create notification for the assignee (or tenant admins if unassigned)
      if (ticket.assigneeId) {
        await this.prisma.notification.create({
          data: {
            tenantId: ticket.tenantId,
            recipientId: ticket.assigneeId,
            channel: 'IN_APP',
            subject: `SLA Breached: ${ticket.subject}`,
            body: `Ticket "${ticket.subject}" has breached its SLA deadline (${ticket.slaResolutionDue.toISOString()}). Immediate action required.`,
            priority: 'HIGH',
            status: 'PENDING',
            category: 'ALERTS',
            sourceType: 'sla_breach',
            sourceId: ticket.id,
            metadata: {
              notificationType: 'sla_breach',
              ticketId: ticket.id,
              ticketPriority: ticket.priority,
              actionUrl: `/tickets/${ticket.id}`,
            },
          },
        });
      }
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

    for (const ticket of warningTickets) {
      if (!ticket.slaResolutionDue) continue;

      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: { slaStatus: 'AT_RISK' },
      });

      if (ticket.assigneeId) {
        const minutesLeft = Math.round(
          (ticket.slaResolutionDue.getTime() - now.getTime()) / 60_000
        );
        await this.prisma.notification.create({
          data: {
            tenantId: ticket.tenantId,
            recipientId: ticket.assigneeId,
            channel: 'IN_APP',
            subject: `SLA Warning: ${ticket.subject}`,
            body: `Ticket "${ticket.subject}" will breach SLA in ${minutesLeft} minutes.`,
            priority: 'HIGH',
            status: 'PENDING',
            category: 'ALERTS',
            sourceType: 'sla_warning',
            sourceId: ticket.id,
            metadata: {
              notificationType: 'sla_warning',
              ticketId: ticket.id,
              minutesUntilBreach: minutesLeft,
              actionUrl: `/tickets/${ticket.id}`,
            },
          },
        });
      }
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

    for (const lead of staleLeads) {
      if (!lead.ownerId) continue;

      const daysSinceUpdate = Math.round(
        (now.getTime() - lead.updatedAt.getTime()) / (24 * 60 * 60_000)
      );

      // Deduplicate: check if we already sent a stale reminder recently (within 24h)
      const recentReminder = await this.prisma.notification.findFirst({
        where: {
          sourceId: lead.id,
          sourceType: 'stale_lead_reminder',
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
        },
      });
      if (recentReminder) continue;

      const leadName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email;
      await this.prisma.notification.create({
        data: {
          tenantId: lead.tenantId,
          recipientId: lead.ownerId,
          channel: 'IN_APP',
          subject: `Stale lead: ${leadName}`,
          body: `Lead "${leadName}" has had no activity for ${daysSinceUpdate} days. Consider reaching out or updating their status.`,
          priority: 'NORMAL',
          status: 'PENDING',
          category: 'REMINDERS',
          sourceType: 'stale_lead_reminder',
          sourceId: lead.id,
          metadata: {
            notificationType: 'follow_up_reminder',
            daysSinceUpdate,
            actionUrl: `/leads/${lead.id}`,
          },
        },
      });
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

    for (const task of overdueTasks) {
      // `dueDate: { lt: now }` filter excludes NULL in SQL, but Prisma types
      // it as `Date | null` — narrow explicitly for the math below.
      if (!task.dueDate) continue;

      // Prefer the user currently working the task; fall back to the owner.
      const recipientId = task.assigneeId ?? task.ownerId;

      const recentReminder = await this.prisma.notification.findFirst({
        where: {
          sourceId: task.id,
          sourceType: 'overdue_task_reminder',
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
        },
      });
      if (recentReminder) continue;

      const daysOverdue = Math.round((now.getTime() - task.dueDate.getTime()) / (24 * 60 * 60_000));
      await this.prisma.notification.create({
        data: {
          tenantId: task.tenantId,
          recipientId,
          channel: 'IN_APP',
          subject: `Overdue task: ${task.title}`,
          body: `Task "${task.title}" is ${daysOverdue} day(s) overdue. Please complete or reschedule it.`,
          priority: daysOverdue >= 3 ? 'HIGH' : 'NORMAL',
          status: 'PENDING',
          category: 'REMINDERS',
          sourceType: 'overdue_task_reminder',
          sourceId: task.id,
          metadata: {
            notificationType: 'overdue_task',
            daysOverdue,
            actionUrl: `/tasks/${task.id}`,
          },
        },
      });
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

    for (const deal of staleDeals) {
      if (!deal.ownerId) continue;

      // Deduplicate within 48h for deals (less frequent alerts)
      const recentReminder = await this.prisma.notification.findFirst({
        where: {
          sourceId: deal.id,
          sourceType: 'stale_deal_alert',
          createdAt: { gte: new Date(now.getTime() - 48 * 60 * 60_000) },
        },
      });
      if (recentReminder) continue;

      const daysSinceUpdate = Math.round(
        (now.getTime() - deal.updatedAt.getTime()) / (24 * 60 * 60_000)
      );
      await this.prisma.notification.create({
        data: {
          tenantId: deal.tenantId,
          recipientId: deal.ownerId,
          channel: 'IN_APP',
          subject: `Stale deal: ${deal.name}`,
          body: `Deal "${deal.name}" (${deal.stage}) has had no activity for ${daysSinceUpdate} days. Value: ${deal.value ?? 'N/A'}. Review or update its status.`,
          priority: 'HIGH',
          status: 'PENDING',
          category: 'ALERTS',
          sourceType: 'stale_deal_alert',
          sourceId: deal.id,
          metadata: {
            notificationType: 'stale_deal',
            daysSinceUpdate,
            dealStage: deal.stage,
            dealValue: deal.value,
            actionUrl: `/deals/${deal.id}`,
          },
        },
      });
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

    let sentCount = 0;
    for (const appt of upcomingAppointments) {
      if (!appt.organizerId) continue;

      // Deduplicate: skip if reminder already sent for this appointment
      const alreadySent = await this.prisma.notification.findFirst({
        where: {
          sourceId: appt.id,
          sourceType: 'appointment_reminder',
          createdAt: { gte: new Date(now.getTime() - 60 * 60_000) },
        },
      });
      if (alreadySent) continue;

      const minutesUntilStart = Math.round((appt.startTime.getTime() - now.getTime()) / 60_000);

      await this.prisma.notification.create({
        data: {
          tenantId: appt.tenantId,
          recipientId: appt.organizerId,
          channel: 'IN_APP',
          subject: `Upcoming: ${appt.title}`,
          body:
            `Your appointment "${appt.title}" starts in ${minutesUntilStart} minutes.` +
            (appt.location ? ` Location: ${appt.location}` : ''),
          priority: 'HIGH',
          status: 'PENDING',
          category: 'REMINDERS',
          sourceType: 'appointment_reminder',
          sourceId: appt.id,
          metadata: {
            notificationType: 'appointment_reminder',
            minutesUntilStart,
            actionUrl: `/appointments/${appt.id}`,
          },
        },
      });
      sentCount++;
    }

    if (sentCount > 0) {
      this.logger.info({ count: sentCount }, 'Appointment reminders sent');
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
