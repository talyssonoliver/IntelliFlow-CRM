import { useMemo } from 'react';

export type PeriodKey = '7d' | '30d' | '90d' | 'ytd';

/**
 * Convert a period selector value to ISO datetime start/end strings
 * suitable for tRPC analytics endpoints.
 */
export function useAnalyticsDateRange(period: PeriodKey) {
  return useMemo(() => {
    const end = new Date();
    let start: Date;

    switch (period) {
      case '7d': {
        start = new Date();
        start.setDate(start.getDate() - 7);
        break;
      }
      case '30d': {
        start = new Date();
        start.setDate(start.getDate() - 30);
        break;
      }
      case '90d': {
        start = new Date();
        start.setDate(start.getDate() - 90);
        break;
      }
      case 'ytd': {
        start = new Date(end.getFullYear(), 0, 1);
        break;
      }
    }

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  }, [period]);
}
