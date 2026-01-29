/**
 * Ticket Repository Port
 * Defines the contract for ticket persistence operations
 * Implementation lives in adapters layer (PrismaTicketRepository)
 */

import type { TicketStatus, TicketPriority, SLAStatus } from '@intelliflow/domain';

// ============================================
// DATA TYPES (Plain objects, not domain entities)
// ============================================

/**
 * Ticket data transfer object
 */
export interface TicketDTO {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  tenantId: string;

  // SLA fields
  slaPolicyId: string;
  slaPolicy?: SLAPolicyDTO;
  slaResponseDue: Date | null;
  slaResolutionDue: Date | null;
  slaStatus: SLAStatus;
  slaBreachedAt: Date | null;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;

  // Contact & Assignment
  contactId: string | null;
  contactName: string;
  contactEmail: string;
  assigneeId: string | null;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;

  // Relations (optional, populated when requested)
  activities?: TicketActivityDTO[];
  attachments?: TicketAttachmentDTO[];
  nextSteps?: TicketNextStepDTO[];
}

export interface SLAPolicyDTO {
  id: string;
  name: string;
  criticalResponseMinutes: number;
  criticalResolutionMinutes: number;
  highResponseMinutes: number;
  highResolutionMinutes: number;
  mediumResponseMinutes: number;
  mediumResolutionMinutes: number;
  lowResponseMinutes: number;
  lowResolutionMinutes: number;
}

export interface TicketActivityDTO {
  id: string;
  type: string;
  content: string;
  timestamp: Date;
  isInternal: boolean;
  authorName: string;
  authorRole: string | null;
  channel: string;
}

export interface TicketAttachmentDTO {
  id: string;
  name: string;
  size: string;
  fileType: string;
  url: string | null;
  uploadedAt: Date;
}

export interface TicketNextStepDTO {
  id: string;
  title: string;
  dueDate: string;
  completed: boolean;
}

// ============================================
// QUERY TYPES
// ============================================

export interface TicketFilters {
  tenantId: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string;
  slaStatus?: SLAStatus;
  contactId?: string;
}

export interface TicketQueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: {
    field: 'priority' | 'createdAt' | 'slaResolutionDue';
    direction: 'asc' | 'desc';
  }[];
  includeActivities?: boolean;
  includeAttachments?: boolean;
  includeNextSteps?: boolean;
  includeSLAPolicy?: boolean;
  activitiesLimit?: number;
}

export interface TicketListResult {
  tickets: TicketDTO[];
  total: number;
  hasMore: boolean;
}

// ============================================
// CREATE / UPDATE TYPES
// ============================================

export interface CreateTicketData {
  ticketNumber: string;
  subject: string;
  description?: string;
  priority: TicketPriority;
  contactName: string;
  contactEmail: string;
  contactId?: string;
  assigneeId?: string;
  slaPolicyId: string;
  tenantId: string;
  slaResponseDue: Date;
  slaResolutionDue: Date;
  status: TicketStatus;
  slaStatus: SLAStatus;
}

export interface UpdateTicketData {
  subject?: string;
  description?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string;
  resolvedAt?: Date;
  closedAt?: Date;
  firstResponseAt?: Date;
  slaBreachedAt?: Date;
  slaStatus?: SLAStatus;
}

// ============================================
// STATISTICS TYPES
// ============================================

export interface TicketStats {
  total: number;
  byStatus: Record<TicketStatus, number>;
  byPriority: Record<TicketPriority, number>;
  slaBreached: number;
  avgResponseTimeMinutes: number;
}

// ============================================
// ACTIVITY TYPES
// ============================================

export interface CreateActivityData {
  ticketId: string;
  type: 'CUSTOMER_MESSAGE' | 'AGENT_REPLY' | 'INTERNAL_NOTE' | 'SYSTEM_EVENT' | 'SLA_ALERT' | 'ASSIGNMENT' | 'STATUS_CHANGE';
  content: string;
  authorName: string;
  authorRole: string;
  channel: 'EMAIL' | 'PORTAL' | 'PHONE' | 'CHAT' | 'API' | 'SYSTEM';
  isInternal?: boolean;
}

// ============================================
// REPOSITORY INTERFACE
// ============================================

export interface TicketRepository {
  /**
   * Find tickets with filters, pagination, and optional relations
   */
  findMany(filters: TicketFilters, options?: TicketQueryOptions): Promise<TicketListResult>;

  /**
   * Find a single ticket by ID with all relations
   */
  findById(id: string, options?: TicketQueryOptions): Promise<TicketDTO | null>;

  /**
   * Find a ticket by ID without relations (for bulk operations)
   */
  findByIdSimple(id: string): Promise<TicketDTO | null>;

  /**
   * Create a new ticket
   */
  create(data: CreateTicketData): Promise<TicketDTO>;

  /**
   * Update a ticket
   */
  update(id: string, data: UpdateTicketData): Promise<TicketDTO>;

  /**
   * Delete a ticket
   */
  delete(id: string): Promise<void>;

  /**
   * Get the next ticket number
   */
  getNextTicketNumber(): Promise<string>;

  /**
   * Get SLA policy by ID
   */
  getSLAPolicy(id: string): Promise<SLAPolicyDTO | null>;

  /**
   * Get ticket statistics for a tenant
   */
  getStats(tenantId: string): Promise<TicketStats>;

  /**
   * Create a ticket activity
   */
  createActivity(data: CreateActivityData): Promise<void>;

  /**
   * Count tickets matching filter (for pagination)
   */
  count(filters: TicketFilters): Promise<number>;

  /**
   * Get average response time in minutes for tickets with first response
   */
  getAverageResponseTime(tenantId: string): Promise<number>;

  /**
   * Find tickets breaching SLA
   */
  findBreachingSLA(tenantId: string): Promise<TicketDTO[]>;
}
