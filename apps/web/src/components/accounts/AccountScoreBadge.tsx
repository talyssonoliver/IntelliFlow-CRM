'use client';

/**
 * IFC-312 — Small score badge surfaced on Account header.
 * Colored by score range (0-40 red, 40-70 amber, 70-100 green). Tooltip
 * summarises factors from `scoreProvenance`.
 */

export interface AccountScoreBadgeProps {
  readonly score: number | null | undefined;
  readonly modelVersion?: string | null;
  readonly scoredAt?: Date | string | null;
  readonly factors?: Array<{ name: string; impact: number; reasoning?: string }> | null;
}

function tier(score: number): { tone: string; label: string } {
  if (score >= 70)
    return { tone: 'bg-emerald-100 text-emerald-800 border-emerald-300', label: 'High' };
  if (score >= 40) return { tone: 'bg-amber-100 text-amber-800 border-amber-300', label: 'Mid' };
  return { tone: 'bg-rose-100 text-rose-800 border-rose-300', label: 'Low' };
}

export function AccountScoreBadge({
  score,
  modelVersion,
  scoredAt,
  factors,
}: Readonly<AccountScoreBadgeProps>) {
  if (score === null || score === undefined) return null;

  const { tone, label } = tier(score);

  const title = [
    `Account score: ${score}/100 (${label})`,
    modelVersion ? `Model: ${modelVersion}` : null,
    scoredAt ? `Scored: ${new Date(scoredAt).toLocaleString('en-US', { timeZone: 'UTC' })}` : null,
    factors && factors.length > 0
      ? `Top factors: ${factors
          .slice(0, 3)
          .map((f) => f.name)
          .join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone}`}
      title={title}
      aria-label={title}
      data-testid="account-score-badge"
    >
      <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
        insights
      </span>
      {score}
    </span>
  );
}
