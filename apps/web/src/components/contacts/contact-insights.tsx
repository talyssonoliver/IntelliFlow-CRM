'use client';

// Contact AI insights — presentational insight surfaces and pure insight
// builders extracted (behavior-preserving) from
// apps/web/src/app/contacts/[id]/page.tsx for PG-065. No logic changed.
import React from 'react';
import {
  Button,
  Card,
  ChurnRiskCard,
  NextBestActionCard,
  type ChurnRiskData,
  type ChurnRiskLevel,
  type NextBestActionData,
  type NBAActionType,
  type NBAPriority,
} from '@intelliflow/ui';
import type { ContactWithRelations } from '@/components/contacts/contact-360';

export function ContactAiPendingState({
  compact = false,
  onAction,
  isPending = false,
}: Readonly<{
  compact?: boolean;
  onAction: () => void;
  isPending?: boolean;
}>) {
  return (
    <div
      data-testid={compact ? 'contact-ai-pending-summary' : 'contact-ai-pending-banner'}
      className={`rounded-lg border border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950/20 ${
        /* istanbul ignore next */ compact ? 'p-3' : 'p-4'
      }`}
    >
      <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
        AI analysis has not been run for this contact yet.
      </p>
      <p className="mt-2 text-sm text-amber-700/90 dark:text-amber-300/90">
        Metrics and recommendations will appear here after a real AI analysis is available.
      </p>
      <Button size="sm" onClick={onAction} disabled={isPending} className="mt-3">
        {isPending ? 'Analyzing...' : 'Run AI Analysis'}
      </Button>
    </div>
  );
}

export type ContactAiInsightsSummary = {
  conversionProbability: number;
  lifetimeValue: number;
  churnRisk: string;
  nextBestAction: string;
  sentiment: string;
  engagementScore: number;
  recommendations: string[];
  quietPeriodAlert: string | null;
  sentimentTrend: string | null;
  lastEngagementDays: number;
} | null;

export function resolveNextBestActionType(selectedAction: string): NBAActionType {
  const actionText = selectedAction.toUpperCase();
  if (actionText.includes('CALL')) return 'CALL';
  if (actionText.includes('EMAIL')) return 'EMAIL';
  if (actionText.includes('MEET')) return 'MEETING';
  if (actionText.includes('PROPOSAL')) return 'SEND_PROPOSAL';
  if (actionText.includes('DEMO')) return 'SCHEDULE_DEMO';
  if (actionText.includes('DISCOUNT')) return 'OFFER_DISCOUNT';
  if (actionText.includes('TRAIN')) return 'TRAINING';
  if (actionText.includes('ESCALATE')) return 'ESCALATE';
  return 'WAIT';
}

export function resolveNextBestActionPriority(
  linkedPriority: 'low' | 'medium' | 'high' | undefined,
  churnRisk: string | null | undefined
): NBAPriority {
  if (linkedPriority === 'high') return 'HIGH';
  if (linkedPriority === 'low') return 'LOW';
  if (churnRisk === 'HIGH' || churnRisk === 'CRITICAL') return 'HIGH';
  if (churnRisk === 'LOW' || churnRisk === 'MINIMAL') return 'LOW';
  return 'MEDIUM';
}

export function ContactAiInsightsTab({
  aiInsights,
  churnRiskData,
  nextBestActionData,
  onPendingAction,
  isPending = false,
}: Readonly<{
  aiInsights: ContactAiInsightsSummary;
  churnRiskData: ChurnRiskData | null;
  nextBestActionData: NextBestActionData | null;
  onPendingAction: () => void;
  isPending?: boolean;
}>) {
  return (
    <div className="space-y-6">
      {!aiInsights && <ContactAiPendingState onAction={onPendingAction} isPending={isPending} />}

      {(churnRiskData || nextBestActionData) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {churnRiskData && (
            <ChurnRiskCard
              data={churnRiskData}
              title="Churn Risk Assessment"
              showFactors={true}
              showConfidence={true}
              showSLA={true}
            />
          )}
          {nextBestActionData && (
            <NextBestActionCard
              data={nextBestActionData}
              title="Recommended Action"
              showRationale={true}
              showConfidence={true}
            />
          )}
        </div>
      )}

      {aiInsights && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-green-600">trending_up</span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {aiInsights.conversionProbability}%
                  </p>
                  <p className="text-xs text-slate-500">Conversion Probability</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#137fec]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#137fec]">paid</span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    ${(aiInsights.lifetimeValue / 1000).toFixed(0)}k
                  </p>
                  <p className="text-xs text-slate-500">Est. Lifetime Value</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-purple-600">
                    sentiment_satisfied
                  </span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {aiInsights.engagementScore}%
                  </p>
                  <p className="text-xs text-slate-500">Engagement Score</p>
                </div>
              </div>
            </Card>
          </div>
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              AI Recommendations
            </h3>
            <ul className="space-y-3">
              {aiInsights.recommendations.map((rec, index) => (
                <li key={`rec-${rec.slice(0, 20)}`} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#137fec]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-medium text-[#137fec]">{index + 1}</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400">{rec}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Engagement Analysis
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Engagement Score
                  </span>
                  <span className="text-sm font-bold text-[#137fec]">
                    {aiInsights.engagementScore}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                  <div
                    className="bg-[#137fec] h-2 rounded-full"
                    style={{ width: `${aiInsights.engagementScore}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-slate-600 dark:text-slate-300">Sentiment</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  {aiInsights.sentiment}
                </span>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

export function ContactAiSummaryCard({
  aiInsights,
  onViewAiTab,
}: Readonly<{
  aiInsights: ContactAiInsightsSummary;
  onViewAiTab: () => void;
}>) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-[#137fec]" viewBox="0 0 24 24" fill="currentColor">
            <path d="m19 9 1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z" />
          </svg>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">AI Insights</h3>
        </div>
        <span className="text-xs text-slate-400">Updated today</span>
      </div>
      {aiInsights ? (
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1.5">
              <span className="text-sm text-slate-600 dark:text-slate-300">Conversion</span>
              <span className="text-sm font-bold text-[#137fec]">
                {aiInsights.conversionProbability}%
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
              <div
                className="bg-[#137fec] h-2 rounded-full"
                style={{ width: `${aiInsights.conversionProbability}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between mb-1.5">
              <span className="text-sm text-slate-600 dark:text-slate-300">Engagement</span>
              <span className="text-sm font-bold text-green-600">
                {aiInsights.engagementScore}%
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full"
                style={{ width: `${aiInsights.engagementScore}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-slate-600 dark:text-slate-300">Sentiment</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              {aiInsights.sentiment}
            </span>
          </div>
          <button
            onClick={onViewAiTab}
            className="w-full mt-2 text-sm text-[#137fec] hover:underline text-center"
          >
            View Full Analysis
          </button>
        </div>
      ) : (
        <ContactAiPendingState compact onAction={onViewAiTab} />
      )}
    </Card>
  );
}

// ÔöÇÔöÇÔöÇ Module-level pure helpers (extracted to reduce cognitive complexity of Contact360Page) ÔöÇÔöÇÔöÇ

export function buildChurnRiskData(
  insight: ContactWithRelations['aiInsight'] | undefined
): ChurnRiskData | null {
  if (!insight) return null;
  const levelMap: Record<string, ChurnRiskLevel> = {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL',
    MINIMAL: 'MINIMAL',
  };
  const level = levelMap[insight.churnRisk] || 'LOW';
  const scoreMap: Record<ChurnRiskLevel, number> = {
    CRITICAL: 90,
    HIGH: 70,
    MEDIUM: 50,
    LOW: 25,
    MINIMAL: 10,
  };
  const slaMap: Record<ChurnRiskLevel, number> = {
    CRITICAL: 24,
    HIGH: 48,
    MEDIUM: 168,
    LOW: 336,
    MINIMAL: 720,
  };
  let trend: 'IMPROVING' | 'DECLINING' | 'STABLE';
  if (insight.sentimentTrend === 'IMPROVING') {
    trend = 'IMPROVING';
  } else if (insight.sentimentTrend === 'DECLINING') {
    trend = 'DECLINING';
  } else {
    trend = 'STABLE';
  }
  let engagementImpact: 'HIGH' | 'MEDIUM' | 'LOW';
  if (insight.engagementScore < 30) {
    engagementImpact = 'HIGH';
  } else if (insight.engagementScore < 60) {
    engagementImpact = 'MEDIUM';
  } else {
    engagementImpact = 'LOW';
  }
  let daysImpact: 'HIGH' | 'MEDIUM' | 'LOW';
  if (insight.lastEngagementDays > 30) {
    daysImpact = 'HIGH';
  } else if (insight.lastEngagementDays > 14) {
    daysImpact = 'MEDIUM';
  } else {
    daysImpact = 'LOW';
  }
  return {
    score: scoreMap[level],
    level,
    confidence: 0.85,
    slaHours: slaMap[level],
    trend,
    factors: [
      {
        factor: 'Engagement Score',
        impact: engagementImpact,
        value: `${insight.engagementScore}%`,
      },
      {
        factor: 'Days Since Contact',
        impact: daysImpact,
        value: `${insight.lastEngagementDays} days`,
      },
    ],
  };
}
