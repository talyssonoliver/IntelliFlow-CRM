/**
 * AI Worker Jobs
 *
 * Export all job handlers and queue configurations.
 *
 * @module ai-worker/jobs
 * @task IFC-168
 */

export {
  SCORING_QUEUE,
  processScoringJob,
  ScoringJobDataSchema,
  ScoringJobResultSchema,
  DEFAULT_SCORING_JOB_OPTIONS,
  type ScoringJobData,
  type ScoringJobResult,
} from './scoring.job';

export {
  PREDICTION_QUEUE,
  processPredictionJob,
  PredictionJobDataSchema,
  PredictionJobResultSchema,
  PredictionTypes,
  DEFAULT_PREDICTION_JOB_OPTIONS,
  type PredictionJobData,
  type PredictionJobResult,
  type PredictionType,
} from './prediction.job';

/** All queue names this worker processes */
export const AI_WORKER_QUEUES = ['ai-scoring', 'ai-prediction'] as const;
