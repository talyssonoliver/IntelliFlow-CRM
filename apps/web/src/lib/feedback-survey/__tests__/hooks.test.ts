/**
 * Feedback Survey Analytics Hooks Tests - IFC-068
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock trpc
const mockUseQuery = vi.fn().mockReturnValue({ data: undefined, isLoading: true });

vi.mock('@/lib/api', () => ({
  api: {
    feedbackSurvey: {
      getDashboardStats: { useQuery: (...args: unknown[]) => mockUseQuery(...args) },
      getNPSTrend: { useQuery: (...args: unknown[]) => mockUseQuery(...args) },
      getSentimentBreakdown: { useQuery: (...args: unknown[]) => mockUseQuery(...args) },
      exportData: { useQuery: (...args: unknown[]) => mockUseQuery(...args) },
    },
  },
}));

// Import after mocks
const {
  useFeedbackSurveyDashboard,
  useFeedbackNPSTrend,
  useFeedbackSentiment,
  useFeedbackExportData,
} = await import('../hooks');

describe('Feedback Survey Hooks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });
  });

  describe('useFeedbackSurveyDashboard', () => {
    it('calls trpc.feedbackSurvey.getDashboardStats', () => {
      const filters = { granularity: 'month' as const };
      useFeedbackSurveyDashboard(filters);

      expect(mockUseQuery).toHaveBeenCalledWith(
        filters,
        expect.objectContaining({
          refetchInterval: 30_000,
        })
      );
    });

    it('passes filters to query', () => {
      const filters = {
        granularity: 'week' as const,
        surveyType: 'NPS' as const,
        dateFrom: new Date('2025-01-01'),
      };
      useFeedbackSurveyDashboard(filters);

      expect(mockUseQuery).toHaveBeenCalledWith(filters, expect.any(Object));
    });

    it('sets refetchInterval: 30_000', () => {
      useFeedbackSurveyDashboard({ granularity: 'month' });

      const options = mockUseQuery.mock.calls[0][1];
      expect(options.refetchInterval).toBe(30_000);
    });

    it('sets placeholderData to keep previous data', () => {
      useFeedbackSurveyDashboard({ granularity: 'month' });

      const options = mockUseQuery.mock.calls[0][1];
      expect(options.placeholderData).toBeDefined();
      // placeholderData is a function (prev) => prev
      expect(typeof options.placeholderData).toBe('function');
      expect(options.placeholderData('previous')).toBe('previous');
    });
  });

  describe('useFeedbackNPSTrend', () => {
    it('calls trpc.feedbackSurvey.getNPSTrend', () => {
      useFeedbackNPSTrend({ granularity: 'day' });
      expect(mockUseQuery).toHaveBeenCalledWith({ granularity: 'day' }, expect.any(Object));
    });

    it('sets placeholderData to keep previous data', () => {
      useFeedbackNPSTrend({ granularity: 'day' });
      const options = mockUseQuery.mock.calls[0][1];
      expect(typeof options.placeholderData).toBe('function');
      expect(options.placeholderData('prev')).toBe('prev');
    });
  });

  describe('useFeedbackSentiment', () => {
    it('calls trpc.feedbackSurvey.getSentimentBreakdown', () => {
      useFeedbackSentiment({ granularity: 'month' });
      expect(mockUseQuery).toHaveBeenCalledWith({ granularity: 'month' }, expect.any(Object));
    });

    it('sets placeholderData to keep previous data', () => {
      useFeedbackSentiment({ granularity: 'month' });
      const options = mockUseQuery.mock.calls[0][1];
      expect(typeof options.placeholderData).toBe('function');
      expect(options.placeholderData('prev')).toBe('prev');
    });
  });

  describe('useFeedbackExportData', () => {
    it('disables auto-fetch (enabled: false)', () => {
      useFeedbackExportData({ granularity: 'month' });

      const options = mockUseQuery.mock.calls[0][1];
      expect(options.enabled).toBe(false);
    });
  });
});
