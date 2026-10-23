import { TypeSettingsLoading } from '@/components/settings/TypeSettingsLoading';

/** Skeleton mirroring the event types bento grid (no layout shift when data lands). */
export function EventTypesLoading() {
  return <TypeSettingsLoading label="Loading event types" heading="Event Types" keyPrefix="evt" />;
}
