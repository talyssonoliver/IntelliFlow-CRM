'use client';

import { useState, useEffect } from 'react';
import { Icon } from '@/lib/icons';

interface StaleIndicatorProps {
  lastUpdated: Date | string;
  thresholdMinutes?: number;
  showTime?: boolean;
}

/**
 * Computes stale state from a lastUpdated timestamp.
 * Exported as a pure function for testability.
 */
export function computeStaleState(
  lastUpdated: Date | string,
  thresholdMinutes: number = 60
): { isStale: boolean; timeAgo: string; formattedTime: string } {
  const date = typeof lastUpdated === 'string' ? new Date(lastUpdated) : lastUpdated;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  let timeAgo: string;
  if (diffMinutes < 1) {
    timeAgo = 'Just now';
  } else if (diffMinutes < 60) {
    timeAgo = `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    timeAgo = `${diffHours}h ago`;
  } else {
    timeAgo = `${diffDays}d ago`;
  }

  return {
    isStale: diffMinutes >= thresholdMinutes,
    timeAgo,
    formattedTime: date.toLocaleString(),
  };
}

export default function StaleIndicator({
  lastUpdated,
  thresholdMinutes = 60,
  showTime = true,
}: Readonly<StaleIndicatorProps>) {
  const [state, setState] = useState(() => computeStaleState(lastUpdated, thresholdMinutes));

  useEffect(() => {
    // Recompute immediately when inputs change
    setState(computeStaleState(lastUpdated, thresholdMinutes));

    // Tick every 30 seconds (NF-004)
    const interval = setInterval(() => {
      setState(computeStaleState(lastUpdated, thresholdMinutes));
    }, 30_000);

    return () => clearInterval(interval);
  }, [lastUpdated, thresholdMinutes]);

  if (state.isStale) {
    return (
      <div
        className="flex items-center gap-1.5 text-xs"
        title={`Last updated: ${state.formattedTime}`}
      >
        <Icon name="warning" size="xs" className="text-amber-500" />
        <span className="text-amber-600 font-medium">Stale data</span>
        {showTime && <span className="text-gray-500">({state.timeAgo})</span>}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 text-xs"
      title={`Last updated: ${state.formattedTime}`}
    >
      <Icon name="schedule" size="xs" className="text-gray-500" />
      <span className="text-gray-600">Updated {state.timeAgo}</span>
    </div>
  );
}
