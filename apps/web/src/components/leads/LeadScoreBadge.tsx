import {
  FEW_SIGNALS_LABEL,
  FEW_SIGNALS_TITLE,
  LOW_CONFIDENCE_TITLE,
  leadScoreDisplay,
} from '@/lib/leads/score-display';

export function LeadScoreBadge({
  score,
  scoringStatus,
  scoreConfidence,
}: Readonly<{
  score: number;
  scoringStatus?: string | null;
  /** 0 to 1, when the API supplies it. Decides the flag band; see `leadScoreFlag`. */
  scoreConfidence?: number | null;
}>) {
  const display = leadScoreDisplay(score, scoringStatus, scoreConfidence);
  if (display.kind === 'not-scored') {
    return (
      <span
        title={display.title}
        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300 border border-slate-200 dark:border-slate-600"
      >
        {display.label}
      </span>
    );
  }
  const getScoreConfig = (s: number) => {
    if (s >= 80) {
      return {
        bgClass: 'bg-green-100 dark:bg-green-500/20',
        textClass: 'text-green-700 dark:text-green-400',
        dotClass: 'bg-green-500',
        borderClass: 'border-green-200 dark:border-green-500/20',
      };
    }
    if (s >= 50) {
      return {
        bgClass: 'bg-amber-100 dark:bg-amber-500/20',
        textClass: 'text-amber-700 dark:text-amber-400',
        dotClass: 'bg-amber-500',
        borderClass: 'border-amber-200 dark:border-amber-500/20',
      };
    }
    return {
      bgClass: 'bg-red-100 dark:bg-red-500/20',
      textClass: 'text-red-700 dark:text-red-400',
      dotClass: 'bg-red-500',
      borderClass: 'border-red-200 dark:border-red-500/20',
    };
  };
  const { bgClass, textClass, dotClass, borderClass } = getScoreConfig(score);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${bgClass} ${textClass} border ${borderClass}`}
    >
      <span className={`size-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
      {score}
      {display.flag === 'low-confidence' && (
        <>
          <span className="sr-only"> ({LOW_CONFIDENCE_TITLE})</span>
          <span className="font-normal" aria-hidden="true" title={LOW_CONFIDENCE_TITLE}>
            ?
          </span>
        </>
      )}
      {display.flag === 'few-signals' && (
        <span className="font-normal text-slate-600 dark:text-slate-300" title={FEW_SIGNALS_TITLE}>
          {FEW_SIGNALS_LABEL}
          <span className="sr-only">. {FEW_SIGNALS_TITLE}</span>
        </span>
      )}
    </span>
  );
}
