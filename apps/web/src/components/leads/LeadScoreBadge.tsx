import { leadScoreDisplay } from '@/lib/leads/score-display';

/**
 * The score cell of the leads list (desktop table and phone rows).
 *
 * Owner 26/11 on the leads list: "These label with ( few signals and ? ) are breaking the ui. On
 * this page we shouldn't show why on the list page". The list shows the score only, in its usual
 * badge. Why a score is unsure ("Few signals yet", "Low confidence") is explained on the lead page
 * (Overview), which renders its own explanation and does not use this badge.
 */
export function LeadScoreBadge({
  score,
  scoringStatus,
}: Readonly<{
  score: number;
  scoringStatus?: string | null;
  /** Accepted for the callers' convenience; the list does not show confidence (owner 26/11). */
  scoreConfidence?: number | null;
}>) {
  const display = leadScoreDisplay(score, scoringStatus);
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
    </span>
  );
}
