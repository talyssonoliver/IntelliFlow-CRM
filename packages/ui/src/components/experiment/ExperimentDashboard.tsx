/**
 * Experiment Dashboard - IFC-025: A/B Testing Framework
 *
 * Displays A/B experiment list with status, progress, and results.
 * Provides actions to manage experiment lifecycle.
 */

import React from 'react';
import { cn } from '../../lib/utils';

// =============================================================================
// Types
// =============================================================================

export type ExperimentStatus = 'DRAFT' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
export type ExperimentType = 'AI_VS_MANUAL' | 'MODEL_COMPARISON' | 'THRESHOLD_TEST';
export type ExperimentVariant = 'control' | 'treatment';

export interface ExperimentSummary {
  id: string;
  name: string;
  description: string | null;
  type: ExperimentType;
  status: ExperimentStatus;
  hypothesis: string;
  controlVariant: string;
  treatmentVariant: string;
  trafficPercent: number;
  startDate: Date | null;
  endDate: Date | null;
  minSampleSize: number;
  significanceLevel: number;
  controlSampleSize: number;
  treatmentSampleSize: number;
  totalAssignments: number;
  progressPercent: number;
  hasResult: boolean;
  isSignificant: boolean | null;
  winner: ExperimentVariant | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExperimentResult {
  controlMean: number;
  treatmentMean: number;
  controlStdDev: number;
  treatmentStdDev: number;
  pValue: number;
  effectSize: number;
  isSignificant: boolean;
  winner: ExperimentVariant | null;
  recommendation: string | null;
}

export interface ExperimentDashboardProps {
  experiments: ExperimentSummary[];
  selectedExperiment?: ExperimentSummary;
  selectedResult?: ExperimentResult;
  onSelectExperiment?: (id: string) => void;
  onStartExperiment?: (id: string) => void;
  onPauseExperiment?: (id: string) => void;
  onCompleteExperiment?: (id: string) => void;
  onAnalyzeExperiment?: (id: string) => void;
  onCreateExperiment?: () => void;
  isLoading?: boolean;
  className?: string;
}

// =============================================================================
// Status Badge Component
// =============================================================================

interface StatusBadgeProps {
  status: ExperimentStatus;
  className?: string;
}

function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusConfig: Record<ExperimentStatus, { label: string; variant: string }> = {
    DRAFT: { label: 'Draft', variant: 'bg-muted text-muted-foreground' },
    RUNNING: { label: 'Running', variant: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    PAUSED: { label: 'Paused', variant: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
    COMPLETED: { label: 'Completed', variant: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    ARCHIVED: { label: 'Archived', variant: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  };

  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.variant,
        className
      )}
    >
      {config.label}
    </span>
  );
}

// =============================================================================
// Winner Badge Component
// =============================================================================

interface WinnerBadgeProps {
  winner: ExperimentVariant | null;
  isSignificant: boolean | null;
  className?: string;
}

function WinnerBadge({ winner, isSignificant, className }: WinnerBadgeProps) {
  if (!isSignificant || !winner) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground',
          className
        )}
      >
        No significant difference
      </span>
    );
  }

  const variant = winner === 'treatment'
    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';

  const label = winner === 'treatment' ? 'AI wins' : 'Manual wins';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variant,
        className
      )}
    >
      ✓ {label}
    </span>
  );
}

// =============================================================================
// Progress Bar Component
// =============================================================================

interface ProgressBarProps {
  percent: number;
  label?: string;
  className?: string;
}

function ProgressBar({ percent, label, className }: ProgressBarProps) {
  const clampedPercent = Math.max(0, Math.min(100, percent));

  return (
    <div className={cn('space-y-1', className)}>
      {label && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span>{clampedPercent.toFixed(0)}%</span>
        </div>
      )}
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            clampedPercent < 50 ? 'bg-amber-500' : clampedPercent < 100 ? 'bg-blue-500' : 'bg-green-500'
          )}
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Experiment Card Component
// =============================================================================

interface ExperimentCardProps {
  experiment: ExperimentSummary;
  isSelected?: boolean;
  onSelect?: () => void;
  onStart?: () => void;
  onPause?: () => void;
  onComplete?: () => void;
  onAnalyze?: () => void;
}

function ExperimentCard({
  experiment,
  isSelected,
  onSelect,
  onStart,
  onPause,
  onComplete,
  onAnalyze,
}: ExperimentCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-all cursor-pointer hover:border-primary/50',
        isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card'
      )}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="space-y-1">
          <h3 className="font-semibold text-sm">{experiment.name}</h3>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {experiment.hypothesis}
          </p>
        </div>
        <StatusBadge status={experiment.status} />
      </div>

      {/* Progress */}
      <ProgressBar
        percent={experiment.progressPercent}
        label={`Samples: ${experiment.totalAssignments} / ${experiment.minSampleSize * 2}`}
        className="mb-3"
      />

      {/* Sample Distribution */}
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div className="p-2 rounded bg-muted/50">
          <span className="text-muted-foreground">Control</span>
          <div className="font-medium">{experiment.controlSampleSize}</div>
        </div>
        <div className="p-2 rounded bg-muted/50">
          <span className="text-muted-foreground">Treatment</span>
          <div className="font-medium">{experiment.treatmentSampleSize}</div>
        </div>
      </div>

      {/* Result indicator */}
      {experiment.hasResult && (
        <WinnerBadge
          winner={experiment.winner}
          isSignificant={experiment.isSignificant}
          className="mb-3"
        />
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t">
        {experiment.status === 'DRAFT' && (
          <button
            className="flex-1 text-xs py-1.5 px-3 rounded bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={(e) => {
              e.stopPropagation();
              onStart?.();
            }}
          >
            Start
          </button>
        )}
        {experiment.status === 'RUNNING' && (
          <>
            <button
              className="flex-1 text-xs py-1.5 px-3 rounded bg-amber-500 text-white hover:bg-amber-600"
              onClick={(e) => {
                e.stopPropagation();
                onPause?.();
              }}
            >
              Pause
            </button>
            <button
              className="flex-1 text-xs py-1.5 px-3 rounded bg-blue-500 text-white hover:bg-blue-600"
              onClick={(e) => {
                e.stopPropagation();
                onAnalyze?.();
              }}
            >
              Analyze
            </button>
          </>
        )}
        {experiment.status === 'PAUSED' && (
          <button
            className="flex-1 text-xs py-1.5 px-3 rounded bg-green-500 text-white hover:bg-green-600"
            onClick={(e) => {
              e.stopPropagation();
              onStart?.();
            }}
          >
            Resume
          </button>
        )}
        {(experiment.status === 'RUNNING' || experiment.status === 'PAUSED') && experiment.progressPercent >= 100 && (
          <button
            className="flex-1 text-xs py-1.5 px-3 rounded bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={(e) => {
              e.stopPropagation();
              onComplete?.();
            }}
          >
            Complete
          </button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Results Panel Component
// =============================================================================

interface ResultsPanelProps {
  experiment: ExperimentSummary;
  result: ExperimentResult;
}

function ResultsPanel({ experiment, result }: ResultsPanelProps) {
  const effectSizeLabel = Math.abs(result.effectSize) < 0.2
    ? 'Negligible'
    : Math.abs(result.effectSize) < 0.5
      ? 'Small'
      : Math.abs(result.effectSize) < 0.8
        ? 'Medium'
        : 'Large';

  return (
    <div className="rounded-lg border p-4 bg-card">
      <h3 className="font-semibold mb-4">Statistical Results</h3>

      {/* Winner */}
      <div className="mb-4">
        <WinnerBadge winner={result.winner} isSignificant={result.isSignificant} />
      </div>

      {/* Descriptive Stats */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="p-3 rounded bg-muted/50">
          <div className="text-xs text-muted-foreground mb-1">Control (Manual)</div>
          <div className="text-lg font-semibold">{result.controlMean.toFixed(1)}</div>
          <div className="text-xs text-muted-foreground">
            σ = {result.controlStdDev.toFixed(2)}
          </div>
        </div>
        <div className="p-3 rounded bg-muted/50">
          <div className="text-xs text-muted-foreground mb-1">Treatment (AI)</div>
          <div className="text-lg font-semibold">{result.treatmentMean.toFixed(1)}</div>
          <div className="text-xs text-muted-foreground">
            σ = {result.treatmentStdDev.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Statistical Metrics */}
      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">p-value</span>
          <span className={cn(
            'font-medium',
            result.pValue < experiment.significanceLevel ? 'text-green-600' : 'text-muted-foreground'
          )}>
            {result.pValue < 0.001 ? '< 0.001' : result.pValue.toFixed(4)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Effect Size (Cohen&apos;s d)</span>
          <span className="font-medium">
            {result.effectSize.toFixed(2)} ({effectSizeLabel})
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Significance Level (α)</span>
          <span className="font-medium">{experiment.significanceLevel}</span>
        </div>
      </div>

      {/* Recommendation */}
      {result.recommendation && (
        <div className="p-3 rounded bg-primary/5 border border-primary/10">
          <div className="text-xs font-medium text-primary mb-1">Recommendation</div>
          <p className="text-sm">{result.recommendation}</p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Dashboard Component
// =============================================================================

export function ExperimentDashboard({
  experiments,
  selectedExperiment,
  selectedResult,
  onSelectExperiment,
  onStartExperiment,
  onPauseExperiment,
  onCompleteExperiment,
  onAnalyzeExperiment,
  onCreateExperiment,
  isLoading,
  className,
}: ExperimentDashboardProps) {
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <div className="animate-pulse text-muted-foreground">Loading experiments...</div>
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-1 lg:grid-cols-3 gap-4', className)}>
      {/* Experiment List */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">A/B Experiments</h2>
          {onCreateExperiment && (
            <button
              className="text-sm py-1.5 px-4 rounded bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={onCreateExperiment}
            >
              + New Experiment
            </button>
          )}
        </div>

        {experiments.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            <p>No experiments yet</p>
            <p className="text-sm mt-1">Create your first A/B test to compare AI vs manual scoring</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {experiments.map((exp) => (
              <ExperimentCard
                key={exp.id}
                experiment={exp}
                isSelected={selectedExperiment?.id === exp.id}
                onSelect={() => onSelectExperiment?.(exp.id)}
                onStart={() => onStartExperiment?.(exp.id)}
                onPause={() => onPauseExperiment?.(exp.id)}
                onComplete={() => onCompleteExperiment?.(exp.id)}
                onAnalyze={() => onAnalyzeExperiment?.(exp.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Results Panel */}
      <div>
        {selectedExperiment && selectedResult ? (
          <ResultsPanel experiment={selectedExperiment} result={selectedResult} />
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground h-full flex items-center justify-center">
            <p className="text-sm">Select an experiment to view results</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ExperimentDashboard;
