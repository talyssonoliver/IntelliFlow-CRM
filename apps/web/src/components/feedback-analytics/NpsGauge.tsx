'use client';

/**
 * NPS Gauge Component - IFC-068
 *
 * Displays the Net Promoter Score (-100 to +100) with color coding.
 */

import type { NpsGaugeProps } from '@/lib/feedback-survey/types';

function getScoreColor(score: number): string {
  if (score >= 50) return 'text-green-600';
  if (score >= 0) return 'text-yellow-600';
  return 'text-red-600';
}

function getScoreLabel(score: number): string {
  if (score >= 70) return 'Excellent';
  if (score >= 50) return 'Great';
  if (score >= 0) return 'Good';
  if (score >= -50) return 'Needs Improvement';
  return 'Critical';
}

export default function NpsGauge({ score, distribution }: NpsGaugeProps) {
  const colorClass = getScoreColor(score);
  const label = getScoreLabel(score);

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border bg-card p-6">
      <h3 className="text-sm font-medium text-muted-foreground">Net Promoter Score</h3>
      <div className={`text-5xl font-bold ${colorClass}`}>{score > 0 ? `+${score}` : score}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="flex w-full gap-4 text-xs">
        <div className="flex flex-col items-center">
          <span className="font-semibold text-green-600">{distribution.promoters}</span>
          <span className="text-muted-foreground">Promoters</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="font-semibold text-yellow-600">{distribution.passives}</span>
          <span className="text-muted-foreground">Passives</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="font-semibold text-red-600">{distribution.detractors}</span>
          <span className="text-muted-foreground">Detractors</span>
        </div>
      </div>
    </div>
  );
}
