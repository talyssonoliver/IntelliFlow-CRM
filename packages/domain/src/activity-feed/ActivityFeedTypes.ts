/**
 * Activity Feed Domain Types
 * IFC-069: Unified Activity Feed Service
 *
 * Pure domain types with no infrastructure dependencies.
 */

import type {
  ActivityFeedSource,
  ActivityFeedType,
  ActivityFeedEntityType,
} from './ActivityFeedConstants';

/** A single item in the unified activity feed */
export interface UnifiedActivityItem {
  /** Unique identifier (prefixed with source for dedup, e.g. "lead_cuid123") */
  id: string;
  /** Which table/source this came from */
  source: ActivityFeedSource;
  /** Normalized activity type */
  type: ActivityFeedType;
  /** Human-readable title */
  title: string;
  /** Optional description/body */
  description: string | null;
  /** When the activity occurred */
  timestamp: Date;
  /** Actor who performed the activity */
  actor: ActivityActor | null;
  /** The entity this activity relates to */
  entity: ActivityEntity | null;
  /** Source-specific metadata */
  metadata: Record<string, unknown> | null;
}

/** The person/system that performed the activity */
export interface ActivityActor {
  id: string | null;
  name: string;
  avatarUrl?: string | null;
}

/** The CRM entity the activity relates to */
export interface ActivityEntity {
  id: string;
  type: ActivityFeedEntityType;
  name: string;
}

/** Cursor for pagination (encodes timestamp + id for deterministic ordering) */
export interface ActivityFeedCursor {
  timestamp: Date;
  id: string;
}

/** Filters for the activity feed query */
/**
 * Who the feed is read for (register #64). Email rows are read through the mail visibility policy:
 * a colleague's personal-mailbox mail never appears. With no viewer, personal mail is left out.
 */
export interface ActivityFeedViewer {
  userId: string;
  /** Tenant role: ADMIN sees every lead and contact, so the mail logged to them. */
  role?: string | null;
  /** A manager's team. */
  teamMemberIds?: readonly string[] | null;
}

export interface ActivityFeedFilters {
  /** Who is reading (see ActivityFeedViewer). */
  viewer?: ActivityFeedViewer;
  /** Filter by activity types */
  types?: ActivityFeedType[];
  /** Filter by source tables */
  sources?: ActivityFeedSource[];
  /** Filter by entity type (e.g., only lead activities) */
  entityType?: ActivityFeedEntityType;
  /** Filter by specific entity ID */
  entityId?: string;
  /** Only show activities after this date */
  after?: Date;
  /** Only show activities before this date */
  before?: Date;
}

/** Result of a paginated feed query */
export interface ActivityFeedPage {
  items: UnifiedActivityItem[];
  nextCursor: string | null;
  hasMore: boolean;
}
