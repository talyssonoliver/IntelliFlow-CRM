/**
 * Activity Feed Repository Port
 * IFC-069: Unified Activity Feed Service
 *
 * Defines the contract for fetching activity data from multiple sources.
 * Implementation lives in adapters layer (PrismaActivityFeedRepository).
 */

import type {
  UnifiedActivityItem,
  ActivityFeedCursor,
  ActivityFeedFilters,
} from '@intelliflow/domain';

export interface ActivityFeedRepositoryPort {
  /**
   * Fetch a page of unified activities from all sources.
   * The implementation handles parallel querying of multiple tables,
   * merge-sorting by timestamp DESC, and cursor-based pagination.
   *
   * @param tenantId - Tenant to scope activities to
   * @param limit - Maximum items to return
   * @param cursor - Pagination cursor (timestamp + id)
   * @param filters - Optional filters (types, sources, entity, date range)
   * @returns Unified activity items sorted by timestamp DESC
   */
  getUnifiedFeed(
    tenantId: string,
    limit: number,
    cursor: ActivityFeedCursor | null,
    filters: ActivityFeedFilters
  ): Promise<UnifiedActivityItem[]>;

  /**
   * Fetch activities for a specific entity (e.g., all activities for lead X).
   *
   * @param tenantId - Tenant to scope activities to
   * @param entityType - Type of entity to get activities for
   * @param entityId - ID of the specific entity
   * @param limit - Maximum items to return
   * @param cursor - Pagination cursor
   */
  getEntityFeed(
    tenantId: string,
    entityType: string,
    entityId: string,
    limit: number,
    cursor: ActivityFeedCursor | null
  ): Promise<UnifiedActivityItem[]>;
}
