/**
 * Lead Routing Settings Page
 *
 * PG-132: Smart Lead Routing UI
 *
 * Server Component shell — streams skeleton immediately via Suspense,
 * then hydrates RoutingContent (client component).
 */

import { Suspense } from 'react';
import RoutingContent from './RoutingContent';
import RoutingLoading from './RoutingLoading';

export default function RoutingPage() {
  return (
    <Suspense fallback={<RoutingLoading />}>
      <RoutingContent />
    </Suspense>
  );
}
