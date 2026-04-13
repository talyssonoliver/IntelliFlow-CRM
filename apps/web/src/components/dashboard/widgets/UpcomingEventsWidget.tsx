'use client';

import type { WidgetProps } from './index';
import { UpcomingEventsCard } from '@/components/shared';

export function UpcomingEventsWidget(_props: Readonly<WidgetProps>) {
  return (
    <UpcomingEventsCard
      title="Upcoming Appointments"
      maxItems={3}
      viewAllHref="/appointments"
      standalone={false}
    />
  );
}
