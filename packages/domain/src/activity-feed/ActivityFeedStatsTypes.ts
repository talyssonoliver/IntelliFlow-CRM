/**
 * Activity Feed Stats Domain Types
 * IFC-202: Activity Feed Stats Endpoint
 *
 * Pure domain types for activity feed statistics aggregation.
 */

import type {
  ActivityFeedSource,
  ActivityFeedType,
  ActivityFeedEntityType,
} from './ActivityFeedConstants';

/** Aggregated stats from the unified activity feed */
export interface ActivityFeedStats {
  total: number;
  byType: Array<{ type: ActivityFeedType; count: number }>;
  bySource: Array<{ source: ActivityFeedSource; count: number }>;
  byEntityType: Array<{ entityType: ActivityFeedEntityType; count: number }>;
}
