/**
 * Territory Mapping Page - PG-197
 *
 * Server Component shell — streams the skeleton immediately, then hydrates
 * TerritoryMappingContent (client component) via Suspense. Matches the PG-183
 * account-settings pattern.
 */

import { Suspense } from 'react';
import TerritoryMappingContent from './TerritoryMappingContent';
import { TerritoryMappingLoading } from './TerritoryMappingLoading';

export default function TerritoryMappingPage() {
  return (
    <Suspense fallback={<TerritoryMappingLoading />}>
      <TerritoryMappingContent />
    </Suspense>
  );
}
