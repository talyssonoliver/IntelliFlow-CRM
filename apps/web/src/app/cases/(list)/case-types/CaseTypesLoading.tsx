import { TypeSettingsLoading } from '@/components/settings/TypeSettingsLoading';

/** Skeleton mirroring the case types bento grid (no layout shift when data lands). */
export function CaseTypesLoading() {
  return <TypeSettingsLoading label="Loading case types" keyPrefix="ct" />;
}
