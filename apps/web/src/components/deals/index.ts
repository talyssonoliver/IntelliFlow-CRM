/**
 * Deal Pipeline Components (PG-135)
 *
 * Barrel exports for all deal pipeline components.
 * AC-28: Barrel export via index.ts
 */

export { PipelineBoard } from './PipelineBoard';
export { StageColumn } from './StageColumn';
export { DealCard } from './DealCard';
export { DealFilters } from './DealFilters';
export { ValueSummary } from './ValueSummary';
export { DealQuickView } from './DealQuickView';
export { DealListView } from './DealListView';
export type { Deal, PipelineStats, DealFiltersValue } from './types';
export {
  formatCurrencyFull,
  formatCurrencyCompact,
  PIPELINE_STAGE_CONFIG,
  transformDeals,
  calculateStats,
} from './types';
