/**
 * SLA Tracking Service - IFC-093
 *
 * Provides SLA timer calculations, breach detection, and alert generation
 * for the IntelliFlow CRM ticket module.
 *
 * @implements FLOW-011 (Ticket creation flow)
 * @implements FLOW-013 (SLA management flow)
 */

// SLA status types matching Prisma schema
export type SLAStatus = 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'PAUSED' | 'MET';
export type TicketPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type TicketStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_ON_CUSTOMER'
  | 'WAITING_ON_THIRD_PARTY'
  | 'RESOLVED'
  | 'CLOSED';

export interface SLAPolicy {
  id: string;
  name: string;
  description?: string;
  criticalResponseMinutes: number;
  highResponseMinutes: number;
  mediumResponseMinutes: number;
  lowResponseMinutes: number;
  criticalResolutionMinutes: number;
  highResolutionMinutes: number;
  mediumResolutionMinutes: number;
  lowResolutionMinutes: number;
  warningThresholdPercent: number;
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  description?: string;
  status: TicketStatus;
  priority: TicketPriority;
  slaPolicy: SLAPolicy;
  slaResponseDue?: Date;
  slaResolutionDue?: Date;
  slaStatus: SLAStatus;
  slaBreachedAt?: Date;
  firstResponseAt?: Date;
  resolvedAt?: Date;
  contactName: string;
  contactEmail: string;
  assigneeId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SLATimerResult {
  status: SLAStatus;
  remainingMinutes: number;
  remainingFormatted: string;
  percentRemaining: number;
  isBreached: boolean;
  isAtRisk: boolean;
  breachTime?: Date;
}

export interface SLABreachAlert {
  ticketId: string;
  ticketNumber: string;
  type: 'WARNING' | 'BREACH';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  timestamp: Date;
  priority: TicketPriority;
  assigneeId?: string;
  dueTime: Date;
}

/**
 * Default SLA Policy for standard support
 */
export const DEFAULT_SLA_POLICY: SLAPolicy = {
  id: 'default',
  name: 'Standard SLA',
  description: 'Default SLA policy for standard support tickets',
  criticalResponseMinutes: 15,
  highResponseMinutes: 60,
  mediumResponseMinutes: 240,
  lowResponseMinutes: 480,
  criticalResolutionMinutes: 120,
  highResolutionMinutes: 480,
  mediumResolutionMinutes: 1440,
  lowResolutionMinutes: 4320,
  warningThresholdPercent: 25,
};

/**
 * SLA Tracking Service
 * Provides real-time SLA monitoring with <1 minute breach detection
 */
export class SLATrackingService {
  private breachCheckInterval: ReturnType<typeof setInterval> | null = null;
  private onBreachCallbacks: Set<(alert: SLABreachAlert) => void> = new Set();
  private onWarningCallbacks: Set<(alert: SLABreachAlert) => void> = new Set();

  /**
   * Calculate response time SLA deadline based on priority
   */
  getResponseDeadline(createdAt: Date, priority: TicketPriority, policy: SLAPolicy): Date {
    const responseMinutes = this.getResponseMinutes(priority, policy);
    return new Date(createdAt.getTime() + responseMinutes * 60 * 1000);
  }

  /**
   * Calculate resolution time SLA deadline based on priority
   */
  getResolutionDeadline(createdAt: Date, priority: TicketPriority, policy: SLAPolicy): Date {
    const resolutionMinutes = this.getResolutionMinutes(priority, policy);
    return new Date(createdAt.getTime() + resolutionMinutes * 60 * 1000);
  }

  /**
   * Get response time in minutes based on priority
   */
  getResponseMinutes(priority: TicketPriority, policy: SLAPolicy): number {
    switch (priority) {
      case 'CRITICAL':
        return policy.criticalResponseMinutes;
      case 'HIGH':
        return policy.highResponseMinutes;
      case 'MEDIUM':
        return policy.mediumResponseMinutes;
      case 'LOW':
        return policy.lowResponseMinutes;
      default:
        return policy.mediumResponseMinutes;
    }
  }

  /**
   * Get resolution time in minutes based on priority
   */
  getResolutionMinutes(priority: TicketPriority, policy: SLAPolicy): number {
    switch (priority) {
      case 'CRITICAL':
        return policy.criticalResolutionMinutes;
      case 'HIGH':
        return policy.highResolutionMinutes;
      case 'MEDIUM':
        return policy.mediumResolutionMinutes;
      case 'LOW':
        return policy.lowResolutionMinutes;
      default:
        return policy.mediumResolutionMinutes;
    }
  }

  /**
   * Calculate current SLA timer status
   */
  calculateSLATimer(
    dueTime: Date,
    policy: SLAPolicy,
    ticketStatus: TicketStatus,
    now: Date = new Date()
  ): SLATimerResult {
    // If ticket is paused (waiting on customer), return paused status
    if (ticketStatus === 'WAITING_ON_CUSTOMER' || ticketStatus === 'WAITING_ON_THIRD_PARTY') {
      return {
        status: 'PAUSED',
        remainingMinutes: 0,
        remainingFormatted: 'Paused',
        percentRemaining: 100,
        isBreached: false,
        isAtRisk: false,
      };
    }

    // If ticket is resolved or closed
    if (ticketStatus === 'RESOLVED' || ticketStatus === 'CLOSED') {
      return {
        status: 'MET',
        remainingMinutes: 0,
        remainingFormatted: 'Completed',
        percentRemaining: 100,
        isBreached: false,
        isAtRisk: false,
      };
    }

    const remainingMs = dueTime.getTime() - now.getTime();
    const remainingMinutes = Math.floor(remainingMs / (60 * 1000));
    const isBreached = remainingMinutes < 0;

    // Calculate percent remaining for warning threshold
    const totalMinutes = this.getTotalSLAMinutes(dueTime, now);
    const percentRemaining = totalMinutes > 0 ? (remainingMinutes / totalMinutes) * 100 : 0;
    const isAtRisk = !isBreached && percentRemaining <= policy.warningThresholdPercent;

    let status: SLAStatus;
    if (isBreached) {
      status = 'BREACHED';
    } else if (isAtRisk) {
      status = 'AT_RISK';
    } else {
      status = 'ON_TRACK';
    }

    return {
      status,
      remainingMinutes: isBreached ? remainingMinutes : Math.max(0, remainingMinutes),
      remainingFormatted: this.formatRemainingTime(remainingMinutes),
      percentRemaining: Math.max(0, Math.min(100, percentRemaining)),
      isBreached,
      isAtRisk,
      breachTime: isBreached ? undefined : dueTime,
    };
  }

  /**
   * Format remaining time as human-readable string
   */
  formatRemainingTime(minutes: number): string {
    const absMinutes = Math.abs(minutes);
    const hours = Math.floor(absMinutes / 60);
    const mins = absMinutes % 60;

    const sign = minutes < 0 ? '-' : '';
    if (hours > 0) {
      return `${sign}${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m`;
    }
    return `${sign}${mins.toString().padStart(2, '0')}m`;
  }

  /**
   * Get total SLA time in minutes (for percentage calculations)
   */
  private getTotalSLAMinutes(dueTime: Date, now: Date): number {
    // Estimate original SLA time based on due time being in future
    // This is a rough estimate; in production, store original SLA time
    const elapsedMs = now.getTime() - (dueTime.getTime() - 24 * 60 * 60 * 1000);
    return Math.max(60, Math.floor(elapsedMs / (60 * 1000)));
  }

  /**
   * Generate SLA breach alert
   */
  generateBreachAlert(ticket: Ticket, isWarning: boolean = false): SLABreachAlert {
    const dueTime = ticket.slaResolutionDue || new Date();
    const timerResult = this.calculateSLATimer(
      dueTime,
      ticket.slaPolicy,
      ticket.status
    );

    return {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      type: isWarning ? 'WARNING' : 'BREACH',
      severity: this.getSeverityFromPriority(ticket.priority, isWarning),
      message: this.generateAlertMessage(ticket, timerResult, isWarning),
      timestamp: new Date(),
      priority: ticket.priority,
      assigneeId: ticket.assigneeId,
      dueTime,
    };
  }

  /**
   * Get notification severity based on ticket priority
   */
  private getSeverityFromPriority(
    priority: TicketPriority,
    isWarning: boolean
  ): 'INFO' | 'WARNING' | 'CRITICAL' {
    if (isWarning) {
      return priority === 'CRITICAL' || priority === 'HIGH' ? 'WARNING' : 'INFO';
    }
    return priority === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
  }

  /**
   * Generate human-readable alert message
   */
  private generateAlertMessage(
    ticket: Ticket,
    timerResult: SLATimerResult,
    isWarning: boolean
  ): string {
    if (isWarning) {
      return `SLA Warning: Ticket ${ticket.ticketNumber} is at risk. ${timerResult.remainingFormatted} remaining until breach.`;
    }
    return `SLA Breach: Ticket ${ticket.ticketNumber} has breached SLA by ${timerResult.remainingFormatted}.`;
  }

  /**
   * Register callback for breach notifications
   */
  onBreach(callback: (alert: SLABreachAlert) => void): () => void {
    this.onBreachCallbacks.add(callback);
    return () => this.onBreachCallbacks.delete(callback);
  }

  /**
   * Register callback for warning notifications
   */
  onWarning(callback: (alert: SLABreachAlert) => void): () => void {
    this.onWarningCallbacks.add(callback);
    return () => this.onWarningCallbacks.delete(callback);
  }

  /**
   * Start monitoring tickets for SLA breaches
   * Checks every 30 seconds to ensure <1 minute detection
   */
  startMonitoring(getTickets: () => Promise<Ticket[]>): void {
    if (this.breachCheckInterval) {
      this.stopMonitoring();
    }

    // Check immediately and then every 30 seconds
    this.checkForBreaches(getTickets);
    this.breachCheckInterval = setInterval(() => {
      this.checkForBreaches(getTickets);
    }, 30 * 1000); // 30 second interval for <1 minute detection
  }

  /**
   * Stop monitoring for SLA breaches
   */
  stopMonitoring(): void {
    if (this.breachCheckInterval) {
      clearInterval(this.breachCheckInterval);
      this.breachCheckInterval = null;
    }
  }

  /**
   * Check all tickets for SLA breaches and warnings
   */
  private async checkForBreaches(getTickets: () => Promise<Ticket[]>): Promise<void> {
    try {
      const tickets = await getTickets();
      const now = new Date();

      for (const ticket of tickets) {
        // Skip resolved/closed tickets
        if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
          continue;
        }

        // Skip paused tickets
        if (
          ticket.status === 'WAITING_ON_CUSTOMER' ||
          ticket.status === 'WAITING_ON_THIRD_PARTY'
        ) {
          continue;
        }

        const dueTime = ticket.slaResolutionDue;
        if (!dueTime) continue;

        const timerResult = this.calculateSLATimer(dueTime, ticket.slaPolicy, ticket.status, now);

        // Emit breach alert if newly breached
        if (timerResult.isBreached && ticket.slaStatus !== 'BREACHED') {
          const alert = this.generateBreachAlert(ticket, false);
          this.onBreachCallbacks.forEach((cb) => cb(alert));
        }

        // Emit warning alert if at risk and not already warned
        if (timerResult.isAtRisk && ticket.slaStatus === 'ON_TRACK') {
          const alert = this.generateBreachAlert(ticket, true);
          this.onWarningCallbacks.forEach((cb) => cb(alert));
        }
      }
    } catch (error) {
      console.error('Error checking for SLA breaches:', error);
    }
  }

  /**
   * Get SLA badge color based on status
   */
  getSLABadgeColor(status: SLAStatus): {
    bg: string;
    text: string;
    border: string;
    darkBg: string;
    darkText: string;
    darkBorder: string;
  } {
    switch (status) {
      case 'ON_TRACK':
        return {
          bg: 'bg-emerald-50',
          text: 'text-emerald-700',
          border: 'border-emerald-200',
          darkBg: 'dark:bg-emerald-900/30',
          darkText: 'dark:text-emerald-400',
          darkBorder: 'dark:border-emerald-800',
        };
      case 'AT_RISK':
        return {
          bg: 'bg-yellow-50',
          text: 'text-yellow-700',
          border: 'border-yellow-200',
          darkBg: 'dark:bg-yellow-900/30',
          darkText: 'dark:text-yellow-400',
          darkBorder: 'dark:border-yellow-800',
        };
      case 'BREACHED':
        return {
          bg: 'bg-red-50',
          text: 'text-red-700',
          border: 'border-red-200',
          darkBg: 'dark:bg-red-900/30',
          darkText: 'dark:text-red-400',
          darkBorder: 'dark:border-red-800',
        };
      case 'PAUSED':
        return {
          bg: 'bg-slate-50',
          text: 'text-slate-700',
          border: 'border-slate-200',
          darkBg: 'dark:bg-slate-800',
          darkText: 'dark:text-slate-300',
          darkBorder: 'dark:border-slate-700',
        };
      case 'MET':
        return {
          bg: 'bg-blue-50',
          text: 'text-blue-700',
          border: 'border-blue-200',
          darkBg: 'dark:bg-blue-900/30',
          darkText: 'dark:text-blue-400',
          darkBorder: 'dark:border-blue-800',
        };
      default:
        return {
          bg: 'bg-slate-50',
          text: 'text-slate-700',
          border: 'border-slate-200',
          darkBg: 'dark:bg-slate-800',
          darkText: 'dark:text-slate-300',
          darkBorder: 'dark:border-slate-700',
        };
    }
  }

  /**
   * Get SLA timer icon based on status
   */
  getSLATimerIcon(status: SLAStatus): string {
    switch (status) {
      case 'ON_TRACK':
        return 'schedule';
      case 'AT_RISK':
        return 'timelapse';
      case 'BREACHED':
        return 'timer_off';
      case 'PAUSED':
        return 'pause_circle';
      case 'MET':
        return 'check_circle';
      default:
        return 'schedule';
    }
  }
}

// Export singleton instance
export const slaTrackingService = new SLATrackingService();
