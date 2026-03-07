/**
 * Shared types for Case Management components (PG-138)
 */

import type { CaseStatus, CasePriority, CaseTaskStatus } from '@intelliflow/domain';

export type { CaseStatus, CasePriority, CaseTaskStatus } from '@intelliflow/domain';

export type DateOrStringOrNull = Date | string | null;

// ─── List View Types ────────────────────────────────────────────────────────

export interface CaseListItem {
  id: string;
  caseNumber: string;
  title: string;
  description: string | null;
  status: CaseStatus;
  priority: CasePriority;
  deadline: DateOrStringOrNull;
  clientId: string;
  assignedTo: string;
  client: { id: string; name: string };
  assignee: { id: string; name: string; email: string; avatarUrl: string | null };
  tasks: CaseTaskItem[];
  taskProgress: number;
  pendingTaskCount: number;
  completedTaskCount: number;
  isOverdue: boolean;
  resolution: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  closedAt: Date | string | null;
  /** e.g. "Updated 2 hours ago" or "Awaiting documents" */
  lastActivityText?: string;
}

export interface CaseTaskItem {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | string | null;
  status: CaseTaskStatus;
  assignee: string | null;
  isOverdue: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  completedAt: Date | string | null;
}

export interface CaseStats {
  open: number;
  inProgress: number;
  overdue: number;
  closedThisMonth: number;
  /** Trend percentages (optional — display if available) */
  openTrend?: number;
  inProgressTrend?: number;
  closedTrend?: number;
}

export interface CaseFilterOptions {
  statuses: { value: string; label: string; count: number }[];
  priorities: { value: string; label: string; count: number }[];
  assignees?: { id: string; name: string }[];
}

export interface CaseAssigneeOption {
  id: string;
  name: string;
  title: string;
  avatar: string | null;
}

export interface PartyData {
  id: string;
  name: string;
  role: PartyRole;
  organization?: string;
  email?: string;
  phone?: string;
  notes?: string;
  avatarUrl?: string;
}

export type PartyRole = 'CLIENT' | 'OPPOSING_COUNSEL' | 'WITNESS' | 'EXPERT' | 'JUDGE' | 'OTHER';

export const PARTY_ROLES: { value: PartyRole; label: string }[] = [
  { value: 'CLIENT', label: 'Client' },
  { value: 'OPPOSING_COUNSEL', label: 'Opposing Counsel' },
  { value: 'WITNESS', label: 'Witness' },
  { value: 'EXPERT', label: 'Expert' },
  { value: 'JUDGE', label: 'Judge' },
  { value: 'OTHER', label: 'Other' },
];

// ─── Timeline Types ─────────────────────────────────────────────────────────

export interface TimelineEntry {
  id: string;
  type: 'meeting' | 'document' | 'status_change' | 'note' | 'event';
  title: string;
  description: string;
  timestamp: Date | string;
  user?: { name: string; avatarUrl?: string };
  attachment?: { name: string; downloadUrl?: string };
}

// ─── Detail View Types ──────────────────────────────────────────────────────

export interface CaseDetailData extends CaseListItem {
  parties: PartyData[] | null;
  tags?: string[];
  appointments: Array<{
    id: string;
    title: string;
    startTime: Date | string;
    endTime: Date | string;
    status: string;
    location?: string;
  }>;
  timeline?: TimelineEntry[];
  /** 0-100 */
  resolutionProgress?: number;
  /** 0-100 */
  budgetConsumed?: number;
  slaDays?: number;
  openItems?: number;
  assignedTeam?: Array<{
    id: string;
    name: string;
    avatarUrl?: string;
  }>;
  managedBy?: string;
}
