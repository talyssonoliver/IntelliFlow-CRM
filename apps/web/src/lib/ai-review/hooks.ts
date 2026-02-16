'use client';

/**
 * AI Review Queue Hooks (IFC-181)
 *
 * Composite hooks for the AI Output Review frontend.
 * Follows the useChainVersions.ts mutation pattern:
 * - api alias (not trpc)
 * - invalidate() (not refetch())
 * - useToast on every success and error
 * - Lock tokens in useRef<Map> (no re-renders)
 */

import { useRef, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@intelliflow/ui';
import type { ReviewListFilter } from '@intelliflow/validators/ai-review';

// ============================================
// Types
// ============================================

type LockTokenEntry = { token: string; expiresAt: Date };
type LockTokenMap = Map<string, LockTokenEntry>;

// ============================================
// useReviewQueue — composite hook
// ============================================

export function useReviewQueue(initialFilters?: Partial<ReviewListFilter>) {
  const { toast } = useToast();
  const utils = api.useUtils();
  const lockTokens = useRef<LockTokenMap>(new Map());

  // Filter state (drives list query)
  const [filters, setFilters] = useState<Partial<ReviewListFilter>>({
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    ...initialFilters,
  });

  // Queries
  const listQuery = api.aiReview.list.useQuery(filters as ReviewListFilter, {
    refetchInterval: 30_000,
  });
  const statsQuery = api.aiReview.stats.useQuery({}, { refetchInterval: 60_000 });

  // Common invalidation helper
  const invalidateAll = useCallback(() => {
    utils.aiReview.list.invalidate();
    utils.aiReview.stats.invalidate();
  }, [utils]);

  // ---- Mutations (useChainVersions pattern) ----

  const claimMutation = api.aiReview.claim.useMutation({
    onSuccess: (data) => {
      if (data.lockToken) {
        lockTokens.current.set(data.review?.id ?? '', {
          token: data.lockToken,
          expiresAt: new Date(data.expiresAt),
        });
      }
      invalidateAll();
      toast({
        title: 'Review claimed',
        description: 'You have exclusive access to review this output.',
      });
    },
    onError: (err: { message: string }) => {
      toast({
        title: 'Failed to claim',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const approveMutation = api.aiReview.approve.useMutation({
    onSuccess: (_data, vars) => {
      lockTokens.current.delete(vars.reviewId);
      invalidateAll();
      toast({ title: 'Review approved' });
    },
    onError: (err: { message: string }) => {
      toast({
        title: 'Failed to approve',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const rejectMutation = api.aiReview.reject.useMutation({
    onSuccess: (_data, vars) => {
      lockTokens.current.delete(vars.reviewId);
      invalidateAll();
      toast({ title: 'Review rejected' });
    },
    onError: (err: { message: string }) => {
      toast({
        title: 'Failed to reject',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const escalateMutation = api.aiReview.escalate.useMutation({
    onSuccess: (_data, vars) => {
      lockTokens.current.delete(vars.reviewId);
      invalidateAll();
      toast({ title: 'Review escalated' });
    },
    onError: (err: { message: string }) => {
      toast({
        title: 'Failed to escalate',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Helpers
  const getLockToken = useCallback(
    (reviewId: string): string | null => lockTokens.current.get(reviewId)?.token ?? null,
    []
  );

  return {
    // State
    filters,
    setFilters,
    // Queries
    reviews: listQuery.data?.data ?? [],
    total: listQuery.data?.total ?? 0,
    hasMore: listQuery.data?.hasMore ?? false,
    stats: statsQuery.data,
    isLoading: listQuery.isLoading,
    isStatsLoading: statsQuery.isLoading,
    // Mutations
    claim: claimMutation.mutateAsync,
    approve: approveMutation.mutateAsync,
    reject: rejectMutation.mutateAsync,
    escalate: escalateMutation.mutateAsync,
    isMutating:
      claimMutation.isPending ||
      approveMutation.isPending ||
      rejectMutation.isPending ||
      escalateMutation.isPending,
    // Lock management
    getLockToken,
  };
}

// ============================================
// useReviewHistory — read-only history hook (PG-150)
// ============================================

export function useReviewHistory(initialFilters?: Partial<ReviewListFilter>) {
  const [filters, setFilters] = useState<Partial<ReviewListFilter>>({
    status: ['APPROVED', 'REJECTED', 'EXPIRED'] as ReviewListFilter['status'],
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    ...initialFilters,
  });

  const listQuery = api.aiReview.list.useQuery(filters as ReviewListFilter, {
    refetchInterval: 60_000,
  });
  const statsQuery = api.aiReview.stats.useQuery({}, { refetchInterval: 120_000 });

  return {
    reviews: listQuery.data?.data ?? [],
    total: listQuery.data?.total ?? 0,
    hasMore: listQuery.data?.hasMore ?? false,
    stats: statsQuery.data,
    isLoading: listQuery.isLoading,
    isStatsLoading: statsQuery.isLoading,
    filters,
    setFilters,
  };
}

// ============================================
// useReviewDetail — single review query
// ============================================

export function useReviewDetail(reviewId: string) {
  return api.aiReview.get.useQuery({ reviewId }, { enabled: !!reviewId });
}
