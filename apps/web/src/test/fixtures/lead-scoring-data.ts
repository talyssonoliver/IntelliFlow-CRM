/**
 * Lead Scoring Dashboard Test Fixtures (PG-148)
 */

import type {
  LeadScoringStats,
  ScoredLead,
  ScoreTrendPoint,
  LeadScoringDashboardData,
} from '@/lib/lead-scoring/types';

export const mockLeadScoringStats: LeadScoringStats = {
  total: 150,
  hot: 35,
  warm: 60,
  cold: 55,
  avgScore: 68,
  avgConfidence: 0.87,
};

const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

export const mockScoredLeads: ScoredLead[] = [
  {
    id: 'score-1',
    leadId: 'lead-001',
    leadName: 'John Doe',
    company: 'Acme Corp',
    score: 92,
    confidence: 0.95,
    factors: [
      { name: 'Activity Level', impact: 15, reasoning: 'High engagement in last 7 days' },
      { name: 'Email Domain', impact: 10, reasoning: 'Corporate domain detected' },
      { name: 'Company Size', impact: 8, reasoning: 'Mid-market company' },
    ],
    modelVersion: 'openai:gpt-3.5-turbo:v2',
    scoredAt: daysAgo(0),
    tier: 'hot',
    requiresReview: false,
  },
  {
    id: 'score-2',
    leadId: 'lead-002',
    leadName: 'Jane Smith',
    company: 'TechStart Inc',
    score: 65,
    confidence: 0.78,
    factors: [
      { name: 'Data Quality', impact: 12, reasoning: 'Complete profile information' },
      { name: 'Qualification', impact: -5, reasoning: 'No budget confirmed' },
    ],
    modelVersion: 'openai:gpt-3.5-turbo:v2',
    scoredAt: daysAgo(1),
    tier: 'warm',
    requiresReview: true,
  },
  {
    id: 'score-3',
    leadId: 'lead-003',
    leadName: 'Bob Wilson',
    company: null,
    score: 35,
    confidence: 0.92,
    factors: [
      { name: 'Contact Info', impact: -10, reasoning: 'Missing phone number' },
      { name: 'Engagement', impact: -8, reasoning: 'No recent activity' },
    ],
    modelVersion: 'openai:gpt-3.5-turbo:v1',
    scoredAt: daysAgo(3),
    tier: 'cold',
    requiresReview: false,
  },
  {
    id: 'score-4',
    leadId: 'lead-004',
    leadName: 'Alice Brown',
    company: 'Enterprise Co',
    score: 88,
    confidence: 0.91,
    factors: [
      { name: 'Activity Level', impact: 20, reasoning: 'Visited pricing page 3 times' },
      { name: 'Company Size', impact: 15, reasoning: 'Enterprise segment' },
      { name: 'Email Domain', impact: 8, reasoning: 'Corporate domain' },
    ],
    modelVersion: 'openai:gpt-3.5-turbo:v2',
    scoredAt: daysAgo(0),
    tier: 'hot',
    requiresReview: false,
  },
  {
    id: 'score-5',
    leadId: 'lead-005',
    leadName: 'Charlie Davis',
    company: 'Startup LLC',
    score: 55,
    confidence: 0.82,
    factors: [{ name: 'Qualification', impact: 5, reasoning: 'Budget partially confirmed' }],
    modelVersion: 'openai:gpt-3.5-turbo:v2',
    scoredAt: daysAgo(2),
    tier: 'warm',
    requiresReview: true,
  },
];

export const mockLeadScoringTrends: ScoreTrendPoint[] = [
  { date: '2026-02-10', avgScore: 62, hot: 5, warm: 8, cold: 7, count: 20 },
  { date: '2026-02-11', avgScore: 65, hot: 6, warm: 9, cold: 6, count: 21 },
  { date: '2026-02-12', avgScore: 64, hot: 5, warm: 10, cold: 8, count: 23 },
  { date: '2026-02-13', avgScore: 68, hot: 7, warm: 8, cold: 5, count: 20 },
  { date: '2026-02-14', avgScore: 70, hot: 8, warm: 9, cold: 6, count: 23 },
  { date: '2026-02-15', avgScore: 67, hot: 6, warm: 10, cold: 7, count: 23 },
  { date: '2026-02-16', avgScore: 68, hot: 7, warm: 9, cold: 8, count: 24 },
];

export const mockLeadScoringDashboardData: LeadScoringDashboardData = {
  stats: mockLeadScoringStats,
  distribution: { hot: 35, warm: 60, cold: 55 },
  scoredLeads: mockScoredLeads,
  trends: mockLeadScoringTrends,
};

export const mockEmptyLeadScoringDashboard: LeadScoringDashboardData = {
  stats: { total: 0, hot: 0, warm: 0, cold: 0, avgScore: 0, avgConfidence: 0 },
  distribution: { hot: 0, warm: 0, cold: 0 },
  scoredLeads: [],
  trends: [],
};
