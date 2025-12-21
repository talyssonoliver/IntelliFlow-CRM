/**
 * Common query types used across repositories
 */

/**
 * Date range for filtering queries
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Common pagination parameters
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Common search result structure
 */
export interface SearchResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
