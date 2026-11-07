import type { LeadStatus } from '@intelliflow/domain';

export interface Lead {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  status: LeadStatus;
  score: number;
  /** #1218: whether `score` is a real AI score (NONE / FAILED show as not scored). */
  scoringStatus?: 'NONE' | 'SCORED' | 'NEEDS_REVIEW' | 'FAILED' | null;
  createdAt: Date | string;
  phone?: string | null;
  source?: string;
  isStarred?: boolean; // PG-059 sidebar "Starred" view
  owner?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
}
