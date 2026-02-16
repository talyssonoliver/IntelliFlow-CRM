'use client';

import type { WidgetProps } from './index';
import { UpcomingEventsCard } from '@/components/shared';

export function UpcomingEventsWidget(_props: WidgetProps) {
  return (
    <UpcomingEventsCard
      title="Upcoming Events"
      maxItems={3}
      viewAllHref="/calendar"
      standalone={false}
    />
  );
}
