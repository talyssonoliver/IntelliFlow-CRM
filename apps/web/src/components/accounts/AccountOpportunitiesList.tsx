'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Skeleton, Badge, Card } from '@intelliflow/ui';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/pricing/calculator';

interface AccountOpportunity {
  id: string;
  name: string;
  value: number;
  probability: number;
  stage: string;
}

interface AccountOpportunitiesListProps {
  accountId: string;
}

export function AccountOpportunitiesList({ accountId }: AccountOpportunitiesListProps) {
  const router = useRouter();
  const [cursor, setCursor] = useState<string | undefined>();
  const [stageFilter, setStageFilter] = useState<string | undefined>();

  const { data, isLoading, error } = api.account.getOpportunities.useQuery({
    accountId,
    limit: 20,
    cursor,
    stage: stageFilter ? [stageFilter as any] : undefined,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        <span className="material-symbols-outlined text-3xl mb-2">error</span>
        <p className="text-sm">Failed to load opportunities</p>
      </div>
    );
  }

  const opportunities: AccountOpportunity[] = data?.opportunities ?? [];
  const summary = data?.summary;

  if (opportunities.length === 0 && !stageFilter) {
    return (
      <div className="text-center py-12">
        <span className="material-symbols-outlined text-4xl text-muted-foreground mb-3">
          trending_up
        </span>
        <p className="text-muted-foreground">No opportunities for this account</p>
        <Button variant="outline" size="sm" className="mt-3">
          <span className="material-symbols-outlined text-base mr-1">add</span>
          Create Opportunity
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Total Pipeline</p>
            <p className="text-lg font-semibold text-foreground">
              {formatCurrency(summary.totalValue)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Weighted Value</p>
            <p className="text-lg font-semibold text-foreground">
              {formatCurrency(summary.weightedValue)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Opportunities</p>
            <p className="text-lg font-semibold text-foreground">{data?.total ?? 0}</p>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between">
        <select
          className="text-sm border rounded-md px-2 py-1 bg-background text-foreground"
          value={stageFilter ?? ''}
          onChange={(e) => {
            setStageFilter(e.target.value || undefined);
            setCursor(undefined);
          }}
        >
          <option value="">All Stages</option>
          <option value="PROSPECTING">Prospecting</option>
          <option value="QUALIFICATION">Qualification</option>
          <option value="PROPOSAL">Proposal</option>
          <option value="NEGOTIATION">Negotiation</option>
          <option value="CLOSED_WON">Closed Won</option>
          <option value="CLOSED_LOST">Closed Lost</option>
        </select>
        <Button variant="outline" size="sm">
          <span className="material-symbols-outlined text-base mr-1">add</span>
          Create Opportunity
        </Button>
      </div>

      <div className="border rounded-lg divide-y dark:divide-border">
        {opportunities.map((opp) => (
          <button
            key={opp.id}
            className="flex items-center gap-4 px-4 py-3 w-full text-left hover:bg-muted/50 transition-colors"
            onClick={() => router.push(`/deals/${opp.id}`)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{opp.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(opp.value)} &middot; {opp.probability}% probability
              </p>
            </div>
            <Badge variant="outline" className="text-xs shrink-0">
              {opp.stage.replace(/_/g, ' ')}
            </Badge>
          </button>
        ))}
      </div>

      {data?.nextCursor && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={() => setCursor(data.nextCursor)}>
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
