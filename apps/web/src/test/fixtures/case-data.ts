/**
 * Mock data fixtures for Case components — PG-138
 */

import type { CaseListItem, CaseDetailData, CaseTaskItem, CaseStats, CaseFilterOptions, CaseAssigneeOption, PartyData } from '@/components/cases/types';

export const mockTask1: CaseTaskItem = {
  id: 'task-1',
  title: 'File initial complaint',
  description: 'Draft and file the initial complaint with the court',
  dueDate: '2026-03-01T00:00:00Z',
  status: 'COMPLETED',
  assignee: 'user-1',
  isOverdue: false,
  createdAt: '2026-02-10T10:00:00Z',
  updatedAt: '2026-02-11T14:00:00Z',
  completedAt: '2026-02-11T14:00:00Z',
};

export const mockTask2: CaseTaskItem = {
  id: 'task-2',
  title: 'Prepare discovery documents',
  description: null,
  dueDate: '2026-02-15T00:00:00Z',
  status: 'IN_PROGRESS',
  assignee: 'user-2',
  isOverdue: true,
  createdAt: '2026-02-10T10:00:00Z',
  updatedAt: '2026-02-12T09:00:00Z',
  completedAt: null,
};

export const mockTask3: CaseTaskItem = {
  id: 'task-3',
  title: 'Schedule deposition',
  description: 'Contact opposing counsel for deposition scheduling',
  dueDate: '2026-03-15T00:00:00Z',
  status: 'PENDING',
  assignee: null,
  isOverdue: false,
  createdAt: '2026-02-12T10:00:00Z',
  updatedAt: '2026-02-12T10:00:00Z',
  completedAt: null,
};

export const mockCase1: CaseListItem = {
  id: 'case-1',
  caseNumber: 'CF-2024-001',
  title: 'Smith v. Johnson Property Dispute',
  description: 'Property boundary dispute regarding lot lines',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  deadline: '2026-04-01T00:00:00Z',
  clientId: 'account-1',
  assignedTo: 'user-1',
  client: { id: 'account-1', name: 'Smith Holdings LLC' },
  assignee: { id: 'user-1', name: 'Jane Doe', email: 'jane@firm.com', avatarUrl: null },
  tasks: [mockTask1, mockTask2, mockTask3],
  taskProgress: 33,
  pendingTaskCount: 2,
  completedTaskCount: 1,
  isOverdue: false,
  resolution: null,
  createdAt: '2026-02-01T10:00:00Z',
  updatedAt: '2026-02-12T14:00:00Z',
  closedAt: null,
};

export const mockCase2: CaseListItem = {
  id: 'case-2',
  caseNumber: 'CF-2024-002',
  title: 'Williams Contract Breach',
  description: 'Breach of commercial lease agreement',
  status: 'OPEN',
  priority: 'MEDIUM',
  deadline: '2026-03-15T00:00:00Z',
  clientId: 'account-2',
  assignedTo: 'user-2',
  client: { id: 'account-2', name: 'Williams Corp' },
  assignee: { id: 'user-2', name: 'John Smith', email: 'john@firm.com', avatarUrl: null },
  tasks: [],
  taskProgress: 0,
  pendingTaskCount: 0,
  completedTaskCount: 0,
  isOverdue: false,
  resolution: null,
  createdAt: '2026-02-05T09:00:00Z',
  updatedAt: '2026-02-10T16:00:00Z',
  closedAt: null,
};

export const mockCase3: CaseListItem = {
  id: 'case-3',
  caseNumber: 'CF-2024-003',
  title: 'Davis Employment Claim',
  description: 'Wrongful termination claim',
  status: 'CLOSED',
  priority: 'URGENT',
  deadline: '2026-02-01T00:00:00Z',
  clientId: 'account-3',
  assignedTo: 'user-1',
  client: { id: 'account-3', name: 'Davis Industries' },
  assignee: { id: 'user-1', name: 'Jane Doe', email: 'jane@firm.com', avatarUrl: null },
  tasks: [mockTask1],
  taskProgress: 100,
  pendingTaskCount: 0,
  completedTaskCount: 1,
  isOverdue: false,
  resolution: 'Settled out of court for agreed terms.',
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-02-01T12:00:00Z',
  closedAt: '2026-02-01T12:00:00Z',
};

export const mockCases: CaseListItem[] = [mockCase1, mockCase2, mockCase3];

export const mockStats: CaseStats = {
  open: 5,
  inProgress: 3,
  overdue: 2,
  closedThisMonth: 1,
};

export const mockFilterOptions: CaseFilterOptions = {
  statuses: [
    { value: 'OPEN', label: 'OPEN', count: 5 },
    { value: 'IN_PROGRESS', label: 'IN_PROGRESS', count: 3 },
    { value: 'ON_HOLD', label: 'ON_HOLD', count: 1 },
    { value: 'CLOSED', label: 'CLOSED', count: 2 },
  ],
  priorities: [
    { value: 'LOW', label: 'LOW', count: 2 },
    { value: 'MEDIUM', label: 'MEDIUM', count: 4 },
    { value: 'HIGH', label: 'HIGH', count: 3 },
    { value: 'URGENT', label: 'URGENT', count: 1 },
  ],
};

export const mockAssignees: CaseAssigneeOption[] = [
  { id: 'user-1', name: 'Jane Doe', title: 'Case Manager', avatar: null },
  { id: 'user-2', name: 'John Smith', title: 'Legal Associate', avatar: null },
  { id: 'user-3', name: 'Sarah Wilson', title: 'Senior Associate', avatar: null },
];

export const mockParties: PartyData[] = [
  { id: 'party-1', name: 'Robert Smith', role: 'CLIENT', organization: 'Smith Holdings', email: 'robert@smith.com', phone: '+1-555-0101' },
  { id: 'party-2', name: 'Linda Johnson', role: 'OPPOSING_COUNSEL', organization: 'Johnson Legal', email: 'linda@johnson.com' },
  { id: 'party-3', name: 'Dr. Michael Brown', role: 'EXPERT', organization: 'Brown Consulting', notes: 'Property valuation expert' },
];

export const mockCaseDetail: CaseDetailData = {
  ...mockCase1,
  parties: mockParties,
  appointments: [
    { id: 'appt-1', title: 'Client Meeting', startTime: '2026-03-01T10:00:00Z', endTime: '2026-03-01T11:00:00Z', status: 'CONFIRMED' },
  ],
};
