import { z } from 'zod';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RiskStatus =
  | 'Open'
  | 'In Progress'
  | 'Mitigated'
  | 'Monitoring'
  | 'Accepted'
  | 'Closed';

export interface Risk {
  id: string;
  category: string;
  description: string;
  impact: number;
  likelihood: number;
  score: number;
  status: RiskStatus;
  owner: string;
  mitigation: string;
  lastReviewed: string;
  escalationPath: string;
  evidence: string;
  notes: string;
  reviewDate: string;
}

export interface RiskSummary {
  total: number;
  open: number;
  mitigated: number;
  monitoring: number;
  closed: number;
  inProgress: number;
  accepted: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
}

export interface RiskAuditEntry {
  riskId: string;
  action: 'add' | 'edit';
  previousStatus?: RiskStatus;
  newStatus?: RiskStatus;
  previousScore?: number;
  newScore?: number;
  changedAt: string;
  note?: string;
}

// ─── Status Transition State Machine ─────────────────────────────────────────

export const VALID_RISK_TRANSITIONS: Record<RiskStatus, readonly RiskStatus[]> = {
  Open: ['In Progress', 'Accepted'],
  'In Progress': ['Mitigated', 'Open'],
  Mitigated: ['Monitoring', 'Closed', 'Open'],
  Monitoring: ['Mitigated', 'Open'],
  Accepted: ['Closed', 'Open'],
  Closed: [],
};

export function isValidTransition(from: RiskStatus, to: RiskStatus): boolean {
  const allowed = VALID_RISK_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

// ─── Score Classification ────────────────────────────────────────────────────

export function classifyScore(
  score: number
): 'Critical' | 'High' | 'Medium' | 'Low' | 'Minimal' {
  if (score >= 20) return 'Critical';
  if (score >= 15) return 'High';
  if (score >= 10) return 'Medium';
  if (score >= 6) return 'Low';
  return 'Minimal';
}

export function getScoreColor(score: number): string {
  if (score >= 15) return 'bg-red-100 text-red-600 border-red-200';
  if (score >= 10) return 'bg-orange-100 text-orange-600 border-orange-200';
  if (score >= 6) return 'bg-yellow-100 text-yellow-600 border-yellow-200';
  return 'bg-green-100 text-green-600 border-green-200';
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'Open':
      return 'bg-red-100 text-red-600';
    case 'In Progress':
      return 'bg-yellow-100 text-yellow-600';
    case 'Mitigated':
      return 'bg-green-100 text-green-600';
    case 'Monitoring':
      return 'bg-blue-100 text-blue-600';
    case 'Accepted':
      return 'bg-purple-100 text-purple-600';
    case 'Closed':
      return 'bg-gray-100 text-gray-600';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

// ─── Status Normalization ────────────────────────────────────────────────────

const VALID_STATUSES: RiskStatus[] = [
  'Open',
  'In Progress',
  'Mitigated',
  'Monitoring',
  'Accepted',
  'Closed',
];

export function normalizeStatus(raw: string): RiskStatus {
  if (raw === 'Monitored') return 'Monitoring';
  if (VALID_STATUSES.includes(raw as RiskStatus)) return raw as RiskStatus;
  return 'Open';
}

// ─── CSV Injection Sanitization ──────────────────────────────────────────────

export function sanitizeCSVField(value: string): string {
  return value.replace(/^[=+\-@\t\r]+/, '');
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const AddRiskSchema = z.object({
  category: z.string().min(1),
  description: z.string().min(1).max(2000),
  impact: z.number().int().min(1).max(5),
  likelihood: z.number().int().min(1).max(5),
  owner: z.string().max(100),
  mitigation: z.string().max(2000),
});

export const EditRiskSchema = z.object({
  riskId: z.string().regex(/^RISK-\d{3}$/),
  updates: z.object({
    category: z.string().min(1).optional(),
    description: z.string().min(1).max(2000).optional(),
    impact: z.number().int().min(1).max(5).optional(),
    likelihood: z.number().int().min(1).max(5).optional(),
    status: z
      .enum(['Open', 'In Progress', 'Mitigated', 'Monitoring', 'Accepted', 'Closed'])
      .optional(),
    owner: z.string().max(100).optional(),
    mitigation: z.string().max(2000).optional(),
    escalationPath: z.string().optional(),
    evidence: z.string().optional(),
    notes: z.string().optional(),
  }),
});

// ─── Export Functions ─────────────────────────────────────────────────────────

const CSV_HEADERS = [
  'Risk ID',
  'Category',
  'Description',
  'Likelihood (1-5)',
  'Impact (1-5)',
  'Score',
  'Mitigation Strategy',
  'Owner',
  'Status',
  'Review Date',
  'Escalation Path',
  'Evidence',
  'Notes',
];

function escapeCSVValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function generateCSVExport(risks: Risk[]): string {
  const headerLine = CSV_HEADERS.join(',');
  const rows = risks.map((r) =>
    [
      escapeCSVValue(r.id),
      escapeCSVValue(r.category),
      escapeCSVValue(r.description),
      String(r.likelihood),
      String(r.impact),
      String(r.score),
      escapeCSVValue(r.mitigation),
      escapeCSVValue(r.owner),
      escapeCSVValue(r.status),
      escapeCSVValue(r.reviewDate),
      escapeCSVValue(r.escalationPath),
      escapeCSVValue(r.evidence),
      escapeCSVValue(r.notes),
    ].join(',')
  );
  return [headerLine, ...rows].join('\n');
}

export function generateJSONExport(
  risks: Risk[],
  summary: RiskSummary
): { risks: Risk[]; summary: RiskSummary; exportedAt: string } {
  return {
    risks,
    summary,
    exportedAt: new Date().toISOString(),
  };
}
