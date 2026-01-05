import type {
  TicketRepository,
  TicketDTO,
  TicketFilters,
  TicketQueryOptions,
  TicketListResult,
  CreateTicketData,
  UpdateTicketData,
  TicketStats,
  CreateActivityData,
  SLAPolicyDTO,
  TicketActivityDTO,
} from '@intelliflow/application';
import type { TicketStatus, TicketPriority } from '@intelliflow/domain';
import { TICKET_STATUSES, TICKET_PRIORITIES } from '@intelliflow/domain';

/**
 * In-Memory Ticket Repository
 * Used for testing and development without database dependency
 */
export class InMemoryTicketRepository implements TicketRepository {
  private tickets: Map<string, TicketDTO> = new Map();
  private activities: Map<string, TicketActivityDTO[]> = new Map();
  private slaPolicies: Map<string, SLAPolicyDTO> = new Map();
  private ticketCounter = 0;

  /**
   * Find tickets with filters, pagination, and optional relations
   */
  async findMany(
    filters: TicketFilters,
    options?: TicketQueryOptions
  ): Promise<TicketListResult> {
    let tickets = Array.from(this.tickets.values());

    // Apply filters
    tickets = tickets.filter((ticket) => {
      if (ticket.tenantId !== filters.tenantId) return false;
      if (filters.status && ticket.status !== filters.status) return false;
      if (filters.priority && ticket.priority !== filters.priority) return false;
      if (filters.assigneeId && ticket.assigneeId !== filters.assigneeId) return false;
      if (filters.slaStatus && ticket.slaStatus !== filters.slaStatus) return false;
      if (filters.contactId && ticket.contactId !== filters.contactId) return false;
      return true;
    });

    // Get total before pagination
    const total = tickets.length;

    // Apply sorting
    if (options?.orderBy && options.orderBy.length > 0) {
      tickets.sort((a, b) => {
        for (const order of options.orderBy!) {
          let comparison = 0;
          const aVal = a[order.field];
          const bVal = b[order.field];

          if (aVal === null && bVal === null) continue;
          if (aVal === null) return order.direction === 'asc' ? 1 : -1;
          if (bVal === null) return order.direction === 'asc' ? -1 : 1;

          if (order.field === 'priority') {
            const priorityOrder: Record<TicketPriority, number> = {
              CRITICAL: 0,
              HIGH: 1,
              MEDIUM: 2,
              LOW: 3,
            };
            comparison = priorityOrder[aVal as TicketPriority] - priorityOrder[bVal as TicketPriority];
          } else if (aVal instanceof Date && bVal instanceof Date) {
            comparison = aVal.getTime() - bVal.getTime();
          }

          if (comparison !== 0) {
            return order.direction === 'asc' ? comparison : -comparison;
          }
        }
        return 0;
      });
    } else {
      // Default sort by createdAt desc
      tickets.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    // Apply pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 20;
    const paginatedTickets = tickets.slice(offset, offset + limit);

    // Include relations
    const result = paginatedTickets.map((ticket) => this.hydrateTicket(ticket, options));

    return {
      tickets: result,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Find a single ticket by ID with all relations
   */
  async findById(id: string, options?: TicketQueryOptions): Promise<TicketDTO | null> {
    const ticket = this.tickets.get(id);
    if (!ticket) return null;
    return this.hydrateTicket(ticket, options);
  }

  /**
   * Find a ticket by ID without relations (for bulk operations)
   */
  async findByIdSimple(id: string): Promise<TicketDTO | null> {
    return this.tickets.get(id) ?? null;
  }

  /**
   * Create a new ticket
   */
  async create(data: CreateTicketData): Promise<TicketDTO> {
    const now = new Date();
    const ticket: TicketDTO = {
      id: this.generateId(),
      ticketNumber: data.ticketNumber,
      subject: data.subject,
      description: data.description ?? null,
      status: data.status,
      priority: data.priority,
      tenantId: data.tenantId,
      slaPolicyId: data.slaPolicyId,
      slaResponseDue: data.slaResponseDue,
      slaResolutionDue: data.slaResolutionDue,
      slaStatus: data.slaStatus,
      slaBreachedAt: null,
      firstResponseAt: null,
      resolvedAt: null,
      contactId: data.contactId ?? null,
      contactName: data.contactName,
      contactEmail: data.contactEmail,
      assigneeId: data.assigneeId ?? null,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    };

    this.tickets.set(ticket.id, ticket);
    this.activities.set(ticket.id, []);

    return ticket;
  }

  /**
   * Update a ticket
   */
  async update(id: string, data: UpdateTicketData): Promise<TicketDTO> {
    const ticket = this.tickets.get(id);
    if (!ticket) {
      throw new Error(`Ticket not found: ${id}`);
    }

    const updated: TicketDTO = {
      ...ticket,
      ...data,
      updatedAt: new Date(),
    };

    this.tickets.set(id, updated);
    return updated;
  }

  /**
   * Delete a ticket
   */
  async delete(id: string): Promise<void> {
    this.tickets.delete(id);
    this.activities.delete(id);
  }

  /**
   * Get the next ticket number
   */
  async getNextTicketNumber(): Promise<string> {
    this.ticketCounter++;
    return `TKT-${String(this.ticketCounter).padStart(6, '0')}`;
  }

  /**
   * Get SLA policy by ID
   */
  async getSLAPolicy(id: string): Promise<SLAPolicyDTO | null> {
    return this.slaPolicies.get(id) ?? null;
  }

  /**
   * Get ticket statistics for a tenant
   */
  async getStats(tenantId: string): Promise<TicketStats> {
    const tenantTickets = Array.from(this.tickets.values()).filter(
      (t) => t.tenantId === tenantId
    );

    // Initialize counts
    const byStatus = {} as Record<TicketStatus, number>;
    const byPriority = {} as Record<TicketPriority, number>;

    for (const status of TICKET_STATUSES) {
      byStatus[status] = 0;
    }
    for (const priority of TICKET_PRIORITIES) {
      byPriority[priority] = 0;
    }

    // Count by status and priority
    let slaBreached = 0;
    let totalResponseTime = 0;
    let responsesCount = 0;

    for (const ticket of tenantTickets) {
      byStatus[ticket.status]++;
      byPriority[ticket.priority]++;

      if (ticket.slaBreachedAt) {
        slaBreached++;
      }

      if (ticket.firstResponseAt && ticket.createdAt) {
        totalResponseTime +=
          (ticket.firstResponseAt.getTime() - ticket.createdAt.getTime()) / (1000 * 60);
        responsesCount++;
      }
    }

    return {
      total: tenantTickets.length,
      byStatus,
      byPriority,
      slaBreached,
      avgResponseTimeMinutes: responsesCount > 0 ? totalResponseTime / responsesCount : 0,
    };
  }

  /**
   * Create a ticket activity
   */
  async createActivity(data: CreateActivityData): Promise<void> {
    const activities = this.activities.get(data.ticketId) ?? [];
    const activity: TicketActivityDTO = {
      id: this.generateId(),
      type: data.type,
      content: data.content,
      timestamp: new Date(),
      isInternal: data.isInternal ?? false,
      authorName: data.authorName,
      authorRole: data.authorRole,
      channel: data.channel,
    };
    activities.push(activity);
    this.activities.set(data.ticketId, activities);
  }

  /**
   * Count tickets matching filter
   */
  async count(filters: TicketFilters): Promise<number> {
    return Array.from(this.tickets.values()).filter((ticket) => {
      if (ticket.tenantId !== filters.tenantId) return false;
      if (filters.status && ticket.status !== filters.status) return false;
      if (filters.priority && ticket.priority !== filters.priority) return false;
      if (filters.assigneeId && ticket.assigneeId !== filters.assigneeId) return false;
      if (filters.slaStatus && ticket.slaStatus !== filters.slaStatus) return false;
      if (filters.contactId && ticket.contactId !== filters.contactId) return false;
      return true;
    }).length;
  }

  /**
   * Get average response time in minutes
   */
  async getAverageResponseTime(tenantId: string): Promise<number> {
    const tenantTickets = Array.from(this.tickets.values()).filter(
      (t) => t.tenantId === tenantId && t.firstResponseAt
    );

    if (tenantTickets.length === 0) return 0;

    const totalMinutes = tenantTickets.reduce((sum, ticket) => {
      const responseTime =
        (ticket.firstResponseAt!.getTime() - ticket.createdAt.getTime()) / (1000 * 60);
      return sum + responseTime;
    }, 0);

    return totalMinutes / tenantTickets.length;
  }

  /**
   * Find tickets breaching SLA
   */
  async findBreachingSLA(tenantId: string): Promise<TicketDTO[]> {
    const now = new Date();
    return Array.from(this.tickets.values()).filter((ticket) => {
      if (ticket.tenantId !== tenantId) return false;
      if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') return false;

      // Check if already breached
      if (ticket.slaBreachedAt) return true;

      // Check response SLA breach
      if (ticket.slaResponseDue && !ticket.firstResponseAt) {
        if (ticket.slaResponseDue.getTime() < now.getTime()) return true;
      }

      // Check resolution SLA breach
      if (ticket.slaResolutionDue && ticket.slaResolutionDue.getTime() < now.getTime()) {
        return true;
      }

      return false;
    });
  }

  // ============================================
  // TEST HELPER METHODS
  // ============================================

  /**
   * Clear all tickets and activities
   */
  clear(): void {
    this.tickets.clear();
    this.activities.clear();
    this.ticketCounter = 0;
  }

  /**
   * Get all tickets (for test assertions)
   */
  getAll(): TicketDTO[] {
    return Array.from(this.tickets.values());
  }

  /**
   * Seed an SLA policy (for testing)
   */
  seedSLAPolicy(policy: SLAPolicyDTO): void {
    this.slaPolicies.set(policy.id, policy);
  }

  /**
   * Seed a ticket directly (for testing)
   */
  seedTicket(ticket: TicketDTO): void {
    this.tickets.set(ticket.id, ticket);
    if (!this.activities.has(ticket.id)) {
      this.activities.set(ticket.id, []);
    }
  }

  /**
   * Get activities for a ticket (for test assertions)
   */
  getActivities(ticketId: string): TicketActivityDTO[] {
    return this.activities.get(ticketId) ?? [];
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private generateId(): string {
    return `inmem-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private hydrateTicket(ticket: TicketDTO, options?: TicketQueryOptions): TicketDTO {
    const result = { ...ticket };

    if (options?.includeActivities) {
      let activities = this.activities.get(ticket.id) ?? [];
      if (options.activitiesLimit) {
        activities = activities.slice(-options.activitiesLimit);
      }
      result.activities = activities;
    }

    if (options?.includeSLAPolicy) {
      result.slaPolicy = this.slaPolicies.get(ticket.slaPolicyId) ?? undefined;
    }

    // Attachments and nextSteps would be stored separately if needed
    if (options?.includeAttachments) {
      result.attachments = [];
    }

    if (options?.includeNextSteps) {
      result.nextSteps = [];
    }

    return result;
  }
}
