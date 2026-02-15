/**
 * Churn Risk Dashboard Test Fixtures (PG-143)
 */

import type { ChurnStats, AtRiskCustomer, ChurnTrendPoint, ChurnDashboardData } from '@/lib/churn-risk/types';

export const mockChurnStats: ChurnStats = {
  total: 120,
  critical: 8,
  high: 22,
  medium: 35,
  low: 30,
  minimal: 25,
  avgEngagement: 62,
};

const now = new Date();
const hoursFromNow = (h: number) => new Date(now.getTime() + h * 3600000).toISOString();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

export const mockAtRiskCustomers: AtRiskCustomer[] = [
  {
    id: 'arc-1',
    entityType: 'lead',
    entityId: 'lead-001',
    entityName: 'Acme Corp',
    riskLevel: 'CRITICAL',
    engagementScore: 15,
    slaHours: 24,
    slaDeadline: hoursFromNow(6), // 6h left
    nextBestAction: 'Schedule urgent retention call',
    recommendations: ['Offer discount', 'Assign senior CSM', 'Schedule meeting'],
    lastEngagementDays: 45,
    updatedAt: hoursAgo(2),
  },
  {
    id: 'arc-2',
    entityType: 'contact',
    entityId: 'contact-001',
    entityName: 'Jane Smith',
    riskLevel: 'HIGH',
    engagementScore: 35,
    slaHours: 48,
    slaDeadline: hoursFromNow(30),
    nextBestAction: 'Send personalized email',
    recommendations: ['Feature highlight email', 'Invite to webinar'],
    lastEngagementDays: 20,
    updatedAt: hoursAgo(5),
  },
  {
    id: 'arc-3',
    entityType: 'lead',
    entityId: 'lead-002',
    entityName: 'TechStart Inc',
    riskLevel: 'MEDIUM',
    engagementScore: 50,
    slaHours: 168,
    slaDeadline: hoursFromNow(120),
    nextBestAction: 'Product training session',
    recommendations: ['Training session', 'Usage tips newsletter'],
    lastEngagementDays: 12,
    updatedAt: daysAgo(1),
  },
  {
    id: 'arc-4',
    entityType: 'contact',
    entityId: 'contact-002',
    entityName: 'Bob Johnson',
    riskLevel: 'LOW',
    engagementScore: 72,
    slaHours: 336,
    slaDeadline: hoursFromNow(300),
    nextBestAction: null,
    recommendations: ['Regular check-in'],
    lastEngagementDays: 5,
    updatedAt: daysAgo(2),
  },
  {
    id: 'arc-5',
    entityType: 'lead',
    entityId: 'lead-003',
    entityName: 'Growth Partners',
    riskLevel: 'MINIMAL',
    engagementScore: 92,
    slaHours: 720,
    slaDeadline: hoursFromNow(600),
    nextBestAction: null,
    recommendations: [],
    lastEngagementDays: 1,
    updatedAt: hoursAgo(1),
  },
  {
    id: 'arc-6',
    entityType: 'lead',
    entityId: 'lead-004',
    entityName: 'Overdue Ltd',
    riskLevel: 'CRITICAL',
    engagementScore: 8,
    slaHours: 24,
    slaDeadline: hoursAgo(12), // OVERDUE
    nextBestAction: 'Immediate escalation',
    recommendations: ['Executive escalation', 'Emergency discount'],
    lastEngagementDays: 60,
    updatedAt: daysAgo(3),
  },
];

export const mockChurnTrends: ChurnTrendPoint[] = [
  { date: '2026-02-08', critical: 5, high: 18, medium: 30, low: 28, minimal: 22, avgEngagement: 58 },
  { date: '2026-02-09', critical: 6, high: 19, medium: 31, low: 29, minimal: 23, avgEngagement: 59 },
  { date: '2026-02-10', critical: 7, high: 20, medium: 33, low: 29, minimal: 24, avgEngagement: 60 },
  { date: '2026-02-11', critical: 7, high: 21, medium: 34, low: 30, minimal: 24, avgEngagement: 61 },
  { date: '2026-02-12', critical: 8, high: 21, medium: 34, low: 30, minimal: 25, avgEngagement: 61 },
  { date: '2026-02-13', critical: 8, high: 22, medium: 35, low: 30, minimal: 25, avgEngagement: 62 },
  { date: '2026-02-14', critical: 8, high: 22, medium: 35, low: 30, minimal: 25, avgEngagement: 62 },
];

export const mockEmptyChurnDashboard: ChurnDashboardData = {
  stats: { total: 0, critical: 0, high: 0, medium: 0, low: 0, minimal: 0, avgEngagement: 0 },
  distribution: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, MINIMAL: 0 },
  atRiskCustomers: [],
  trends: [],
};

export const mockChurnDashboardData: ChurnDashboardData = {
  stats: mockChurnStats,
  distribution: { CRITICAL: 8, HIGH: 22, MEDIUM: 35, LOW: 30, MINIMAL: 25 },
  atRiskCustomers: mockAtRiskCustomers,
  trends: mockChurnTrends,
};
