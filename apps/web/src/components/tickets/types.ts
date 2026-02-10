/**
 * Shared types for Ticket Management components (PG-137)
 *
 * These interfaces define the shape of data flowing between
 * the ticket page wrappers and extracted components.
 */

import type { TicketStatus, TicketPriority, SLAStatus } from '@intelliflow/domain';

export type { TicketStatus, TicketPriority, SLAStatus };

// ─── List View Types ────────────────────────────────────────────────────────

export interface TicketListItem {
  id: string;
  ticketNumber: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  slaStatus: SLAStatus;
  slaTimeRemaining: number; // minutes (negative = breached)
  slaResponseDue: Date | string | null;
  slaResolutionDue: Date | string | null;
  contactName: string;
  contactEmail: string;
  assignee: string | null;
  assigneeAvatar: string | null;
  category: string | null;
  channel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketStats {
  open: number;
  inProgress: number;
  breached: number;
  resolvedToday: number;
  slaBreakdown?: Record<SLAStatus, number>;
}

export interface TicketFilterOptions {
  statuses: string[];
  priorities: string[];
  slaStatuses: string[];
  assignees: { id: string; name: string }[];
  categories: string[];
}

export type BulkActionType = 'assign' | 'updateStatus' | 'resolve' | 'escalate' | 'close';

// ─── Detail View Types ──────────────────────────────────────────────────────

export interface TicketActivity {
  id: string;
  type: 'customer_message' | 'agent_reply' | 'internal_note' | 'system_event' | 'sla_breach' | 'priority_change';
  author: {
    name: string;
    role: 'customer' | 'agent' | 'system' | 'devops';
    avatar?: string;
  };
  content: string;
  timestamp: string;
  metadata?: {
    via?: string;
    oldPriority?: string;
    newPriority?: string;
  };
}

export interface TicketCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  title: string;
  company: string;
  avatar?: string;
  isVIP: boolean;
  totalTickets: number;
}

export interface TicketAccount {
  id: string;
  name: string;
  industry: string;
  tier: string;
}

export interface TicketNextStep {
  id: string;
  title: string;
  dueDate: string;
  completed: boolean;
}

export interface TicketRelated {
  id: string;
  subject: string;
  status: TicketStatus;
  similarity: number;
}

export interface TicketSLA {
  firstResponse: { target: number; actual: number | null; met: boolean };
  resolution: { target: number; remaining: number; status: SLAStatus };
}

export interface TicketAIInsights {
  suggestedSolutions: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  predictedResolutionTime: string;
  similarResolvedTickets: number;
  escalationRisk: 'low' | 'medium' | 'high';
}

export interface TicketDetailData extends TicketListItem {
  description: string;
  tags: string[];
  type: string;
  customer: TicketCustomer;
  account: TicketAccount;
  assigneeInfo: {
    name: string;
    title: string;
    avatar?: string;
  } | null;
  activities: TicketActivity[];
  nextSteps: TicketNextStep[];
  relatedTickets: TicketRelated[];
  sla: TicketSLA;
  aiInsights: TicketAIInsights;
  firstResponseAt: Date | string | null;
  resolvedAt: Date | string | null;
  attachments: TicketAttachment[];
}

export interface TicketAttachment {
  id: string;
  name: string;
  size: string;
  type: string;
  uploader: string;
}

// ─── Form Types ─────────────────────────────────────────────────────────────

export interface ResolutionInput {
  type: string;
  rootCause?: string;
  summary: string;
}
