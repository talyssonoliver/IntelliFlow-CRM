import { TypeSettingsLoading } from '@/components/settings/TypeSettingsLoading';

/** Skeleton mirroring the contact types bento grid (no layout shift when data lands). */
export function ContactTypesLoading() {
  return (
    <TypeSettingsLoading label="Loading contact types" heading="Contact Types" keyPrefix="cty" />
  );
}
