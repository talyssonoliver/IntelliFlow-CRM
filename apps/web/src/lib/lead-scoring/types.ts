/**
 * Lead Scoring Dashboard Types (PG-148)
 *
 * Canonical response shape for the getLeadScoringDashboard tRPC procedure.
 */

import type { ScoreFactor } from '@intelliflow/ui';

export interface LeadScoringStats {
  total: number;
  hot: number;
  warm: number;
  cold: number;
  avgScore: number;
  avgConfidence: number;
}

export interface ScoredLead {
  id: string;
  leadId: string;
  leadName: string;
  company: string | null;
  score: number;
  confidence: number;
  factors: ScoreFactor[];
  modelVersion: string;
  scoredAt: string;
  tier: 'hot' | 'warm' | 'cold';
  requiresReview: boolean;
}

export interface ScoreTrendPoint {
  date: string;
  avgScore: number;
  hot: number;
  warm: number;
  cold: number;
  count: number;
}

export interface LeadScoringDashboardData {
  stats: LeadScoringStats;
  distribution: { hot: number; warm: number; cold: number };
  scoredLeads: ScoredLead[];
  trends: ScoreTrendPoint[];
}
