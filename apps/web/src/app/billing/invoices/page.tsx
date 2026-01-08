'use client';

/**
 * Invoices Page
 *
 * Displays a paginated list of all invoices for the billing portal.
 * Uses tRPC for data fetching with infinite pagination.
 *
 * @implements PG-027 (Invoices)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { InvoiceList } from '@/components/billing/invoice-list';
import { trpc } from '@/lib/trpc';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@intelliflow/api-client';

const INVOICES_PER_PAGE = 10;

// Type inferred from tRPC router response
type RouterOutput = inferRouterOutputs<AppRouter>;
type InvoiceItem = RouterOutput['billing']['listInvoices']['invoices'][number];

export default function InvoicesPage() {
  const [page, setPage] = useState(1);
  const [allInvoices, setAllInvoices] = useState<InvoiceItem[]>([]);
  const prevDataRef = useRef<typeof data>(undefined);

  // Fetch invoices with pagination
  const {
    data,
    isLoading,
    isFetching,
  } = trpc.billing.listInvoices.useQuery(
    { page, limit: INVOICES_PER_PAGE }
  );

  // Handle data updates with useEffect (TanStack Query v5 pattern)
  useEffect(() => {
    if (data && data !== prevDataRef.current) {
      prevDataRef.current = data;
      if (page === 1) {
        setAllInvoices(data.invoices);
      } else {
        setAllInvoices((prev) => {
          // Avoid duplicates
          const existingIds = new Set(prev.map((inv) => inv.id));
          const newInvoices = data.invoices.filter(
            (inv) => !existingIds.has(inv.id)
          );
          return [...prev, ...newInvoices];
        });
      }
    }
  }, [data, page]);

  // Load more handler
  const handleLoadMore = useCallback(() => {
    if (data?.hasMore && !isFetching) {
      setPage((prev) => prev + 1);
    }
  }, [data?.hasMore, isFetching]);

  // Calculate total and hasMore from latest data
  const total = data?.total ?? 0;
  const hasMore = data?.hasMore ?? false;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Invoices
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            View and download your billing history
          </p>
        </div>
      </div>

      {/* Invoice List */}
      <InvoiceList
        invoices={allInvoices}
        isLoading={isLoading && page === 1}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
        total={total}
        isLoadingMore={isFetching && page > 1}
      />
    </div>
  );
}
