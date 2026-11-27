import { describeScoreChange } from '@/lib/leads/lead-format';

/**
 * The score row of an expanded score-change activity (UI-021): "Score changed from 30 → 40",
 * "First score 38" when the lead had no earlier score (or the row records none), and nothing
 * for a failed scoring, which has no new score. It used to read `oldScore`, which the scoring
 * API never writes, so every row said "from [empty]".
 */
export function ScoreChangeRow({
  meta,
}: Readonly<{ meta: Parameters<typeof describeScoreChange>[0] }>) {
  const change = describeScoreChange(meta);
  if (!change) return null;
  return (
    <div className="mt-2 flex items-center gap-2" data-testid="score-change">
      {change.from === null ? (
        <span className="text-xs text-slate-500">First score</span>
      ) : (
        <>
          <span className="text-xs text-slate-500">Score changed from</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
            {change.from}
          </span>
          <span aria-hidden="true" className="material-symbols-outlined text-slate-400 !text-sm">
            arrow_forward
          </span>
        </>
      )}
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
        {change.to}
      </span>
    </div>
  );
}
