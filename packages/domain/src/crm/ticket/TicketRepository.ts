import { Ticket } from './Ticket';
import { TicketId } from './TicketId';
import type { TicketStatus, TicketPriority } from '../../support/TicketConstants';
import { DateRange } from '../../shared/QueryTypes';

/**
 * Ticket Repository Interface
 * Defines the contract for ticket persistence
 * Implementation lives in adapters layer
 *
 * CRITICAL: All methods require tenantId for multi-tenant isolation
 */
/**
 * @knipignore Intentional public repository contract for adapter implementations.
 */
export interface TicketRepository {
  /**
   * Save a ticket (create or update)
   */
  save(ticket: Ticket): Promise<void>;

  /**
   * Find a ticket by ID within a tenant
   */
  findById(id: TicketId, tenantId: string): Promise<Ticket | null>;

  /**
   * Find a ticket by ticket number within a tenant
   */
  findByTicketNumber(ticketNumber: string, tenantId: string): Promise<Ticket | null>;

  /**
   * Find all tickets assigned to a user
   */
  findByAssignee(assigneeId: string, tenantId: string): Promise<Ticket[]>;

  /**
   * Find all tickets for a customer
   */
  findByCustomer(customerId: string, tenantId: string): Promise<Ticket[]>;

  /**
   * Find tickets by status
   */
  findByStatus(status: TicketStatus, tenantId: string): Promise<Ticket[]>;

  /**
   * Find tickets by priority
   */
  findByPriority(priority: TicketPriority, tenantId: string): Promise<Ticket[]>;

  /**
   * Find tickets with breached SLAs
   */
  findWithBreachedSla(tenantId: string): Promise<Ticket[]>;

  /**
   * Find tickets approaching SLA breach (within warning threshold)
   */
  findApproachingSla(tenantId: string, withinMinutes: number): Promise<Ticket[]>;

  /**
   * Delete a ticket
   */
  delete(id: TicketId, tenantId: string): Promise<void>;

  /**
   * Check if ticket number exists within tenant
   */
  existsByTicketNumber(ticketNumber: string, tenantId: string): Promise<boolean>;

  /**
   * Count tickets by status for a tenant
   */
  countByStatus(tenantId: string): Promise<Record<TicketStatus, number>>;

  /**
   * Count tickets by priority for a tenant
   */
  countByPriority(tenantId: string): Promise<Record<TicketPriority, number>>;

  /**
   * Get the next ticket number for a tenant
   */
  getNextTicketNumber(tenantId: string): Promise<string>;
}

/**
 * Ticket Query Service Interface
 * For complex read-only queries that don't need domain logic
 */
/**
 * @knipignore Intentional public query contract shared across application boundaries.
 */
export interface TicketQueryService {
  /**
   * Search tickets with filters
   */
  search(params: TicketSearchParams): Promise<TicketSearchResult>;

  /**
   * Get ticket statistics for a tenant
   */
  getStatistics(tenantId: string, dateRange?: DateRange): Promise<TicketStatistics>;

  /**
   * Get SLA performance metrics
   */
  getSlaMetrics(tenantId: string, dateRange?: DateRange): Promise<SlaMetrics>;
}

// Query Types
/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
export interface TicketSearchParams {
  tenantId: string;
  query?: string;
  status?: TicketStatus[];
  priority?: TicketPriority[];
  category?: string[];
  assigneeId?: string;
  customerId?: string;
  slaBreached?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'status' | 'responseDueAt' | 'resolutionDueAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
export interface TicketSearchResult {
  tickets: Ticket[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
export interface TicketStatistics {
  total: number;
  byStatus: Record<TicketStatus, number>;
  byPriority: Record<TicketPriority, number>;
  byCategory: Record<string, number>;
  openTickets: number;
  resolvedToday: number;
  averageResolutionTime: number; // in minutes
  averageFirstResponseTime: number; // in minutes
}

/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
export interface SlaMetrics {
  totalTickets: number;
  responseSlaMet: number;
  responseSlaBreached: number;
  resolutionSlaMet: number;
  resolutionSlaBreached: number;
  responseComplianceRate: number; // percentage
  resolutionComplianceRate: number; // percentage
  averageResponseTime: number; // in minutes
  averageResolutionTime: number; // in minutes
}
