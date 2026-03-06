'use client';

/**
 * Deal-Specific Forecast Page (PG-131)
 *
 * Shows forecast details for a single deal: probability gauge,
 * risk factors, recommendations, history, and confidence indicator.
 * Uses `trpc.opportunity.dealForecast` — no hardcoded sample data.
 */

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, Button, Skeleton } from '@intelliflow/ui';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import {
  ForecastHeader,
  ProbabilityGauge,
  RiskFactorsCard,
  RecommendedActions,
  ForecastHistory,
  ConfidenceIndicator,
} from '@/components/deals/forecast';

// ─── Loading Skeleton ───────────────────────────────────────────────────────

function DealForecastSkeleton() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex flex-col gap-6 max-w-5xl">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5 flex flex-col items-center">
            <Skeleton className="h-20 w-20 rounded-full" />
            <Skeleton className="h-4 w-24 mt-2" />
          </Card>
          <Card className="p-5">
            <Skeleton className="h-4 w-32 mb-3" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full mt-2" />
          </Card>
          <Card className="p-5">
            <Skeleton className="h-4 w-32 mb-3" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full mt-2" />
          </Card>
        </div>
        <Card className="p-4">
          <Skeleton className="h-4 w-40 mb-3" />
          <Skeleton className="h-64 w-full" />
        </Card>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function DealForecastDetailPage() {
  const router = useRouter();
  const params = useParams();
  const dealId = params.id as string;

  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();

  const { data, isLoading, error, refetch } = trpc.opportunity.dealForecast.useQuery(
    { id: dealId },
    { enabled: isAuthenticated && !authLoading && !!dealId }
  );

  // Auth error redirect
  const isAuthError =
    error?.data?.code === 'UNAUTHORIZED' || error?.message?.toLowerCase().includes('unauthorized');

  useEffect(() => {
    if (error && isAuthError && !isLoading && !authLoading) {
      router.replace('/login');
    }
  }, [error, isAuthError, isLoading, authLoading, router]);

  // Loading
  if (isLoading || authLoading) {
    return <DealForecastSkeleton />;
  }

  // Auth redirect
  if (error && isAuthError) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <h2 className="text-xl font-bold mb-2">Failed to load forecast data</h2>
          <p className="text-muted-foreground mb-4">{error.message}</p>
          <Button onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const currentQuarter = (() => {
    const now = new Date();
    const q = Math.floor(now.getMonth() / 3) + 1;
    return `Q${q} ${now.getFullYear()}`;
  })();

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex flex-col gap-6 max-w-5xl">
        {/* Header */}
        <ForecastHeader
          mode="deal"
          dealName={data.deal.name}
          dealId={data.deal.id}
          dealStage={data.deal.stage}
          quarter={currentQuarter}
        />

        {/* Top row: Gauge + Confidence + Risk */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Probability Gauge */}
          <Card className="p-5 flex flex-col items-center justify-center">
            <ProbabilityGauge
              value={data.deal.probability}
              label="Win Probability"
              target={data.stageDefault}
              size="lg"
            />
            <ConfidenceIndicator
              confidence={data.confidence}
              lastUpdatedAt={data.lastActivityAt ?? undefined}
              size="sm"
            />
          </Card>

          {/* Risk Factors */}
          <RiskFactorsCard factors={[...data.riskFactors]} />

          {/* Recommended Actions */}
          <RecommendedActions recommendations={[...data.recommendations]} />
        </div>

        {/* History Chart */}
        <ForecastHistory data={[...data.history]} mode="deal" />

        {/* Deal Info Summary */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Deal Details</h3>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Value</dt>
              <dd className="font-medium">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  minimumFractionDigits: 0,
                }).format(data.deal.value)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Stage</dt>
              <dd className="font-medium">{data.deal.stage.replace(/_/g, ' ')}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Owner</dt>
              <dd className="font-medium">{data.deal.owner.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Expected Close</dt>
              <dd className="font-medium">
                {data.deal.expectedCloseDate
                  ? new Date(data.deal.expectedCloseDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'Not set'}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
