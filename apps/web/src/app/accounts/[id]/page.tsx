'use client';

import { Suspense, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { AccountDetail } from '@/components/accounts/AccountDetail';
import { Card, Skeleton } from '@intelliflow/ui';

/**
 * PG-197: the page reads `?edit=true` (the legacy edit URL), so its body sits
 * inside Suspense (Next 16 `useSearchParams` bailout rule).
 */
export default function AccountDetailPage() {
  return (
    <Suspense fallback={null}>
      <AccountDetailPageBody />
    </Suspense>
  );
}

function AccountDetailPageBody() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const accountId = params.id as string;
  const legacyEdit = searchParams?.get('edit') === 'true';

  // Redirect to login if not authenticated once auth check completes; a legacy
  // `?edit=true` URL moves to the edit page only after auth resolves (PG-197).
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (legacyEdit) router.replace(`/accounts/${accountId}/edit`);
  }, [authLoading, isAuthenticated, legacyEdit, accountId, router]);

  if (authLoading) {
    return (
      <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        <div className="mb-6">
          <Skeleton className="h-4 w-48 mb-2" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-3">
            <Card className="p-6">
              <Skeleton className="h-24 w-full mb-4" />
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-4 w-24" />
            </Card>
          </div>
          <div className="lg:col-span-6">
            <Card className="p-6">
              <Skeleton className="h-10 w-full mb-4" />
              <Skeleton className="h-32 w-full mb-4" />
              <Skeleton className="h-32 w-full" />
            </Card>
          </div>
          <div className="lg:col-span-3">
            <Card className="p-6">
              <Skeleton className="h-6 w-24 mb-4" />
              <Skeleton className="h-20 w-full mb-4" />
              <Skeleton className="h-20 w-full" />
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        <Card className="p-8 text-center">
          <span className="material-symbols-outlined text-5xl text-slate-400 mb-4 animate-spin">
            progress_activity
          </span>
          <p className="text-slate-500 dark:text-slate-400">Redirecting to login...</p>
        </Card>
      </div>
    );
  }

  return <AccountDetail accountId={accountId} isAuthenticated={isAuthenticated} />;
}
