'use client';

import { useMemo } from 'react';
import { Icon } from '@/lib/icons';

interface StaleIndicatorProps {
  lastUpdated: Date | string;
  thresholdMinutes?: number;
  showTime?: boolean;
}

export default function StaleIndicator({
  lastUpdated,
  thresholdMinutes = 60,
  showTime = true,
}: Readonly<StaleIndicatorProps>) {
  const { isStale, timeAgo, formattedTime } = useMemo(() => {
    const date =
      typeof lastUpdated === 'string' ? new Date(lastUpdated) : lastUpdated;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    let timeAgoStr: string;
    if (diffMinutes < 1) {
      timeAgoStr = 'Just now';
    } else if (diffMinutes < 60) {
      timeAgoStr = `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      timeAgoStr = `${diffHours}h ago`;
    } else {
      timeAgoStr = `${diffDays}d ago`;
    }

    return {
      isStale: diffMinutes >= thresholdMinutes,
      timeAgo: timeAgoStr,
      formattedTime: date.toLocaleString(),
    };
  }, [lastUpdated, thresholdMinutes]);

  if (isStale) {
    return (
      <div
        className="flex items-center gap-1.5 text-xs"
        title={`Last updated: ${formattedTime}`}
      >
        <Icon name="warning" size="xs" className="text-amber-500" />
        <span className="text-amber-400 font-medium">Stale data</span>
        {showTime && <span className="text-gray-400">({timeAgo})</span>}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 text-xs"
      title={`Last updated: ${formattedTime}`}
    >
      <Icon name="schedule" size="xs" className="text-gray-400" />
      <span className="text-gray-500">Updated {timeAgo}</span>
    </div>
  );
}
