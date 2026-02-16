/**
 * Experiments Dashboard Types (PG-149)
 *
 * Frontend-specific types derived from @intelliflow/validators experiment schemas.
 */

import type {
  ExperimentSummary as ValidatorExperimentSummary,
  ExperimentResult as ValidatorExperimentResult,
  ExperimentStatusResponse as ValidatorExperimentStatusResponse,
} from '@intelliflow/validators';

// Re-export validator types for use in components
export type ExperimentSummary = ValidatorExperimentSummary;
export type ExperimentResult = ValidatorExperimentResult;
export type ExperimentStatusResponse = ValidatorExperimentStatusResponse;

/** Filter state for experiment list */
export interface ExperimentFilters {
  status: string | null;
  sort: 'newest' | 'oldest' | 'progress';
  search: string;
}

/** Computed dashboard statistics */
export interface ExperimentStats {
  total: number;
  running: number;
  completed: number;
  significant: number;
  avgProgress: number;
}

/** Action button configuration */
export interface ExperimentAction {
  label: string;
  icon: string;
  onClick: () => void;
  variant?: string;
}
