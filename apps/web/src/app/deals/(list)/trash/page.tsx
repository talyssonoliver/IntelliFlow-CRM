'use client';

/**
 * Deals Trash Page (PG-175)
 *
 * Displays soft-deleted deals with restore and permanent delete actions.
 * Route: /deals/trash
 */

import * as React from 'react';
import { Suspense } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { TrashList } from '@/components/deals/TrashList';

export default function DealsTrashPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Deals', href: '/deals' },
          { label: 'Trash' },
        ]}
        title="Deals Trash"
        description="Restore or permanently remove deleted deals"
        actions={[
          {
            label: 'Back to Deals',
            icon: 'arrow_back',
            variant: 'secondary',
            href: '/deals',
          },
        ]}
      />
      <Suspense fallback={null}>
        <TrashList />
      </Suspense>
    </div>
  );
}
