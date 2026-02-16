'use client';

/**
 * ExperimentResultsPanel (PG-149)
 *
 * Lazy-loadable panel showing statistical results for completed experiments.
 * Displays variant comparison, significance, effect size, CI, and recommendation.
 */

import { Card, CardContent, Badge, Skeleton, cn } from '@intelliflow/ui';
import { useExperimentResults } from '@/lib/experiments/hooks';
import {
  formatPValue,
  getSignificanceDescription,
  interpretEffectSize,
  formatConfidenceInterval,
} from '@/lib/experiments/experiment-utils';

interface ExperimentResultsPanelProps {
  experimentId: string;
}

export default function ExperimentResultsPanel({
  experimentId,
}: ExperimentResultsPanelProps) {
  const { data: result, isLoading, error } = useExperimentResults(experimentId);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4" data-testid="results-loading">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="p-4 text-sm text-slate-500 dark:text-slate-400">
        {error ? 'Failed to load results.' : 'No results available.'}
      </div>
    );
  }

  const effectInterpretation = interpretEffectSize(result.effectSize);
  const significanceDesc = getSignificanceDescription(result.pValue);

  return (
    <Card className="mt-3 border-slate-200 dark:border-slate-700">
      <CardContent className="p-4 space-y-4">
        {/* Variant Comparison */}
        <div>
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
            Variant Comparison
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <p className="text-xs text-slate-500 dark:text-slate-400">Control</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">
                {result.controlMean.toFixed(2)}
              </p>
              <p className="text-xs text-slate-400">
                SD: {result.controlStdDev.toFixed(2)} · n={result.controlSampleSize}
              </p>
            </div>
            <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <p className="text-xs text-slate-500 dark:text-slate-400">Treatment</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">
                {result.treatmentMean.toFixed(2)}
              </p>
              <p className="text-xs text-slate-400">
                SD: {result.treatmentStdDev.toFixed(2)} · n={result.treatmentSampleSize}
              </p>
            </div>
          </div>
        </div>

        {/* Statistical Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* p-value */}
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">p-value</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {formatPValue(result.pValue)}
            </p>
            <Badge
              className={cn(
                'mt-1 text-xs',
                result.isSignificant
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              )}
              aria-label={
                result.isSignificant ? 'Statistically significant' : 'Not significant'
              }
            >
              {result.isSignificant ? 'Significant' : 'Not Significant'}
            </Badge>
          </div>

          {/* Effect Size */}
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Effect Size</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              d = {result.effectSize.toFixed(3)}
            </p>
            <p className="text-xs text-slate-500 mt-1">{effectInterpretation}</p>
          </div>

          {/* Confidence Interval */}
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">95% CI</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {formatConfidenceInterval(
                result.confidenceInterval.lower,
                result.confidenceInterval.upper
              )}
            </p>
          </div>

          {/* Winner */}
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Winner</p>
            {result.winner ? (
              <Badge
                className={cn(
                  'mt-1',
                  result.winner === 'treatment'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                )}
                aria-label={`Winner: ${result.winner}`}
              >
                <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                  emoji_events
                </span>
                {result.winner === 'treatment' ? 'Treatment' : 'Control'}
              </Badge>
            ) : (
              <p className="text-sm text-slate-500 mt-1">No winner</p>
            )}
          </div>
        </div>

        {/* Significance Description */}
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {significanceDesc}
        </p>

        {/* Recommendation */}
        {result.recommendation && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
              Recommendation
            </p>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              {result.recommendation}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
