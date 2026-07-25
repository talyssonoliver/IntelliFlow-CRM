/**
 * Unit tests for contact-insights.tsx (PG-065 reconcile).
 *
 * Covers the AI-insight surfaces and pure insight builders extracted from the
 * Contact 360 route. Behavior is unchanged by the extraction; these tests pin it.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ContactAiPendingState,
  ContactAiInsightsTab,
  ContactAiSummaryCard,
  resolveNextBestActionType,
  resolveNextBestActionPriority,
  buildChurnRiskData,
  type ContactAiInsightsSummary,
} from '../contact-insights';

describe('contact-insights — resolveNextBestActionType', () => {
  it('maps each recognised action keyword', () => {
    expect(resolveNextBestActionType('Make a CALL')).toBe('CALL');
    expect(resolveNextBestActionType('Send EMAIL')).toBe('EMAIL');
    expect(resolveNextBestActionType('Book a MEETing')).toBe('MEETING');
    expect(resolveNextBestActionType('Send PROPOSAL')).toBe('SEND_PROPOSAL');
    expect(resolveNextBestActionType('Schedule DEMO')).toBe('SCHEDULE_DEMO');
    expect(resolveNextBestActionType('Offer DISCOUNT')).toBe('OFFER_DISCOUNT');
    expect(resolveNextBestActionType('Provide TRAINing')).toBe('TRAINING');
    expect(resolveNextBestActionType('ESCALATE now')).toBe('ESCALATE');
    expect(resolveNextBestActionType('Just wait around')).toBe('WAIT');
  });
});

describe('contact-insights — resolveNextBestActionPriority', () => {
  it('honours the linked priority first', () => {
    expect(resolveNextBestActionPriority('high', 'LOW')).toBe('HIGH');
    expect(resolveNextBestActionPriority('low', 'CRITICAL')).toBe('LOW');
  });
  it('falls back to churn risk, then MEDIUM', () => {
    expect(resolveNextBestActionPriority(undefined, 'HIGH')).toBe('HIGH');
    expect(resolveNextBestActionPriority(undefined, 'CRITICAL')).toBe('HIGH');
    expect(resolveNextBestActionPriority(undefined, 'LOW')).toBe('LOW');
    expect(resolveNextBestActionPriority(undefined, 'MINIMAL')).toBe('LOW');
    expect(resolveNextBestActionPriority(undefined, 'MEDIUM')).toBe('MEDIUM');
    expect(resolveNextBestActionPriority('medium', undefined)).toBe('MEDIUM');
  });
});

describe('contact-insights — buildChurnRiskData', () => {
  it('returns null without an insight', () => {
    expect(buildChurnRiskData(null)).toBeNull();
    expect(buildChurnRiskData(undefined)).toBeNull();
  });

  const insight = (over: Record<string, unknown> = {}) => ({
    conversionProbability: 50,
    lifetimeValue: 10000,
    churnRisk: 'MEDIUM',
    nextBestAction: null,
    sentiment: null,
    engagementScore: 50,
    recommendations: null,
    sentimentTrend: null,
    lastEngagementDays: 10,
    ...over,
  });

  it('maps every churn level to a score + SLA', () => {
    for (const level of ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) {
      const data = buildChurnRiskData(insight({ churnRisk: level }) as never);
      expect(data?.level).toBe(level);
      expect(typeof data?.score).toBe('number');
      expect(typeof data?.slaHours).toBe('number');
    }
    // unknown level falls back to LOW
    expect(buildChurnRiskData(insight({ churnRisk: 'ZZZ' }) as never)?.level).toBe('LOW');
  });

  it('maps sentiment trend and impact factors across thresholds', () => {
    expect(buildChurnRiskData(insight({ sentimentTrend: 'IMPROVING' }) as never)?.trend).toBe(
      'IMPROVING'
    );
    expect(buildChurnRiskData(insight({ sentimentTrend: 'DECLINING' }) as never)?.trend).toBe(
      'DECLINING'
    );
    expect(buildChurnRiskData(insight({ sentimentTrend: 'FLAT' }) as never)?.trend).toBe('STABLE');

    const high = buildChurnRiskData(
      insight({ engagementScore: 10, lastEngagementDays: 40 }) as never
    );
    expect(high?.factors?.[0]?.impact).toBe('HIGH');
    expect(high?.factors?.[1]?.impact).toBe('HIGH');
    const med = buildChurnRiskData(
      insight({ engagementScore: 45, lastEngagementDays: 20 }) as never
    );
    expect(med?.factors?.[0]?.impact).toBe('MEDIUM');
    expect(med?.factors?.[1]?.impact).toBe('MEDIUM');
    const low = buildChurnRiskData(
      insight({ engagementScore: 80, lastEngagementDays: 5 }) as never
    );
    expect(low?.factors?.[0]?.impact).toBe('LOW');
    expect(low?.factors?.[1]?.impact).toBe('LOW');
  });
});

const aiInsights: ContactAiInsightsSummary = {
  conversionProbability: 72,
  lifetimeValue: 42000,
  churnRisk: 'LOW',
  nextBestAction: 'Send proposal',
  sentiment: 'positive',
  engagementScore: 88,
  recommendations: ['Follow up', 'Share case study'],
  quietPeriodAlert: null,
  sentimentTrend: 'IMPROVING',
  lastEngagementDays: 3,
};

describe('contact-insights — components', () => {
  it('ContactAiPendingState renders and fires onAction (both variants)', () => {
    const onAction = vi.fn();
    const { rerender } = render(<ContactAiPendingState onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: /Run AI Analysis/i }));
    expect(onAction).toHaveBeenCalledTimes(1);
    rerender(<ContactAiPendingState compact onAction={onAction} isPending />);
    expect(screen.getByText(/Analyzing/i)).toBeInTheDocument();
  });

  it('ContactAiInsightsTab renders the pending state when no insights', () => {
    render(
      <ContactAiInsightsTab
        aiInsights={null}
        churnRiskData={null}
        nextBestActionData={null}
        onPendingAction={vi.fn()}
      />
    );
    expect(screen.getByText(/AI analysis has not been run/i)).toBeInTheDocument();
  });

  it('ContactAiInsightsTab renders metrics, recommendations and churn card', () => {
    const churnRiskData = buildChurnRiskData({
      conversionProbability: 50,
      lifetimeValue: 1000,
      churnRisk: 'HIGH',
      nextBestAction: null,
      sentiment: null,
      engagementScore: 20,
      recommendations: null,
      sentimentTrend: 'DECLINING',
      lastEngagementDays: 40,
    } as never);
    render(
      <ContactAiInsightsTab
        aiInsights={aiInsights}
        churnRiskData={churnRiskData}
        nextBestActionData={null}
        onPendingAction={vi.fn()}
      />
    );
    expect(screen.getByText(/AI Recommendations/i)).toBeInTheDocument();
    expect(screen.getByText('Follow up')).toBeInTheDocument();
    expect(screen.getByText(/72%/)).toBeInTheDocument();
  });

  it('ContactAiSummaryCard renders insights and fires onViewAiTab', () => {
    const onView = vi.fn();
    render(<ContactAiSummaryCard aiInsights={aiInsights} onViewAiTab={onView} />);
    fireEvent.click(screen.getByText(/View Full Analysis/i));
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it('ContactAiSummaryCard renders the pending compact state without insights', () => {
    render(<ContactAiSummaryCard aiInsights={null} onViewAiTab={vi.fn()} />);
    expect(screen.getByText(/AI analysis has not been run/i)).toBeInTheDocument();
  });
});
