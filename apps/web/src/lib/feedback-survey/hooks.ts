'use client';

/**
 * Feedback Survey Analytics Hooks - IFC-068
 *
 * Wraps feedbackSurvey tRPC procedures for the analytics dashboard.
 */

import { api } from '@/lib/api';
import type { FeedbackDashboardFilters } from './types';

/**
 * Hook to fetch feedback survey dashboard data
 *
 * @param filters - Dashboard filters (date range, survey type, granularity)
 * @returns tRPC query result with dashboard data
 */
export function useFeedbackSurveyDashboard(filters: FeedbackDashboardFilters) {
  return api.feedbackSurvey.getDashboardStats.useQuery(filters, {
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });
}

/**
 * Hook to fetch NPS trend data
 */
export function useFeedbackNPSTrend(filters: FeedbackDashboardFilters) {
  return api.feedbackSurvey.getNPSTrend.useQuery(filters, {
    placeholderData: (prev) => prev,
  });
}

/**
 * Hook to fetch sentiment breakdown
 */
export function useFeedbackSentiment(filters: FeedbackDashboardFilters) {
  return api.feedbackSurvey.getSentimentBreakdown.useQuery(filters, {
    placeholderData: (prev) => prev,
  });
}

/**
 * Hook to fetch exportable data
 */
export function useFeedbackExportData(filters: FeedbackDashboardFilters) {
  return api.feedbackSurvey.exportData.useQuery(filters, {
    enabled: false, // Only fetch when explicitly requested
  });
}
