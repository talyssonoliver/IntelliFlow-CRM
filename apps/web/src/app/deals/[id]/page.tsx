'use client';

import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, Button, Skeleton, EmptyState } from '@intelliflow/ui';
import { type OpportunityStage } from '@intelliflow/domain';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api';
import { EntityHeader, AppAvatar } from '@/components/shared';
import { ActivityFeed } from '@/components/shared/activity-feed';
import { EntityActionSheet } from '@/components/shared/entity-action-sheet';
import { MoreActionsButton } from '@/components/shared/more-actions-button';
import { PinButton } from '@/components/home/PinButton';
import { RelatedTasksCard } from '@/components/tasks/RelatedTasksCard';

// Material Symbols icon helper component
const Icon = ({ name, className = '' }: Readonly<{ name: string; className?: string }>) => (
  <span className={`material-symbols-outlined ${className}`} aria-hidden="true">
    {name}
  </span>
);

// =============================================================================
// Types — derived from the getById router response
// =============================================================================

interface DealDetail {
  id: string;
  name: string;
  value: number;
  currency: string;
  stage: string;
  probability: number;
  expectedCloseDate: Date | string | null;
  description: string | null;
  accountId: string;
  contactId: string | null;
  ownerId: string;
  tenantId: string;
  weightedValue: number;
  isClosed: boolean;
  isWon: boolean;
  isLost: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  owner: { id: string; name: string | null; email: string } | null;
  account: { id: string; name: string; website: string | null } | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    title: string | null;
    email: string;
  } | null;
}

// =============================================================================
// Constants — Domain-aligned 7-stage enum
// =============================================================================

const STAGE_LABELS: Record<OpportunityStage, string> = {
  PROSPECTING: 'Prospecting',
  QUALIFICATION: 'Qualification',
  NEEDS_ANALYSIS: 'Needs Analysis',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  CLOSED_WON: 'Won',
  CLOSED_LOST: 'Lost',
};

const ACTIVE_STAGES: OpportunityStage[] = [
  'PROSPECTING',
  'QUALIFICATION',
  'NEEDS_ANALYSIS',
  'PROPOSAL',
  'NEGOTIATION',
];

// =============================================================================
// Utility Functions
// =============================================================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// =============================================================================
// Components
// =============================================================================

function StageProgress({
  value,
  stage,
  probability,
}: Readonly<{
  value: number;
  stage: OpportunityStage;
  probability: number;
}>) {
  const isClosedWon = stage === 'CLOSED_WON';
  const isClosedLost = stage === 'CLOSED_LOST';
  const isClosed = isClosedWon || isClosedLost;

  const stageIndex = isClosed ? ACTIVE_STAGES.length - 1 : ACTIVE_STAGES.indexOf(stage);
  const progressWidth = isClosed ? 100 : ((stageIndex + 1) / ACTIVE_STAGES.length) * 100;

  let barColor: string;
  if (isClosedWon) {
    barColor = 'bg-green-500';
  } else if (isClosedLost) {
    barColor = 'bg-red-500';
  } else {
    barColor = 'bg-primary';
  }

  return (
    <Card className="p-6">
      <div className="flex justify-between items-end mb-4">
        <div>
          <p className="text-sm font-medium text-slate-500">Total Value</p>
          <p className="text-3xl font-black text-slate-900 dark:text-white mt-1">
            {formatCurrency(value)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-slate-900 dark:text-white">
            {STAGE_LABELS[stage]}
          </p>
          <p className="text-xs text-slate-500">
            {isClosed
              ? `${STAGE_LABELS[stage]}`
              : `Stage ${stageIndex + 1} of ${ACTIVE_STAGES.length}`}{' '}
            &bull; {probability}% Probability
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`absolute top-0 left-0 h-full ${barColor} rounded-full transition-all duration-300`}
          style={{ width: `${progressWidth}%` }}
        />
        {/* Stage dividers */}
        <div className="absolute top-0 left-0 w-full h-full flex justify-between px-[10%]">
          {[...new Array(ACTIVE_STAGES.length - 1)].map((_, i) => (
            <div key={i} className="w-0.5 h-full bg-white dark:bg-slate-900 opacity-50" /> // NOSONAR typescript:S6479
          ))}
        </div>
      </div>

      {/* Stage Labels */}
      <div className="flex justify-between mt-2 text-xs font-medium text-slate-500 px-1">
        {ACTIVE_STAGES.map((s, index) => (
          <span key={s} className={index <= stageIndex || isClosed ? 'text-primary' : ''}>
            {STAGE_LABELS[s]}
          </span>
        ))}
      </div>
    </Card>
  );
}

function AboutDealCard({ deal }: Readonly<{ deal: DealDetail }>) {
  const { timezone } = useTimezoneContext();
  return (
    <Card className="p-5">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4 border-b pb-2">
        About Deal
      </h3>
      <div className="space-y-4">
        <div>
          <p className="text-xs text-slate-500 mb-1">Expected Close Date</p>
          <div className="flex items-center gap-2 text-slate-900 dark:text-slate-200 font-medium">
            <Icon name="calendar_today" className="text-base text-slate-400" />
            {deal.expectedCloseDate
              ? new Date(deal.expectedCloseDate).toLocaleDateString('en-GB', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  timeZone: timezone,
                })
              : 'Not set'}
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Owner</p>
          <div className="flex items-center gap-2">
            {deal.owner ? (
              <>
                <AppAvatar name={deal.owner.name ?? 'Unknown'} className="w-6 h-6" />
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  {deal.owner.name ?? 'Unknown'}
                </span>
              </>
            ) : (
              <span className="text-sm text-slate-400">Unassigned</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function StakeholdersCard({ deal }: Readonly<{ deal: DealDetail }>) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4 border-b pb-2">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
          Stakeholders
        </h3>
        <button className="text-primary hover:text-primary/80 text-xs font-semibold">Edit</button>
      </div>
      <div className="flex flex-col gap-4">
        {/* Account */}
        <div className="flex items-start gap-3">
          <div className="bg-slate-100 p-2 rounded-lg text-slate-500">
            <Icon name="apartment" className="text-xl" />
          </div>
          <div className="flex-1">
            {deal.account ? (
              <>
                <Link
                  href={`/accounts/${deal.accountId}`}
                  className="text-sm font-bold text-slate-900 dark:text-white hover:text-primary"
                >
                  {deal.account.name}
                </Link>
                <div className="flex gap-2 mt-2">
                  <Link
                    href={`/accounts/${deal.accountId}`}
                    className="text-slate-400 hover:text-primary"
                  >
                    <Icon name="open_in_new" className="text-base" />
                  </Link>
                  {deal.account.website && (
                    <a
                      href={deal.account.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-primary"
                    >
                      <Icon name="language" className="text-base" />
                    </a>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">No account linked</p>
            )}
          </div>
        </div>

        <hr className="border-slate-100 dark:border-slate-800" />

        {/* Contact */}
        <div className="flex items-start gap-3">
          {deal.contact ? (
            <>
              <AppAvatar
                name={`${deal.contact.firstName} ${deal.contact.lastName}`}
                className="w-10 h-10"
              />
              <div className="flex-1">
                <Link
                  href={`/contacts/${deal.contactId}`}
                  className="text-sm font-bold text-slate-900 dark:text-white hover:text-primary"
                >
                  {deal.contact.firstName} {deal.contact.lastName}
                </Link>
                <p className="text-xs text-slate-500">{deal.contact.title}</p>
                <div className="flex gap-3 mt-2">
                  <a
                    href={`mailto:${deal.contact.email}`}
                    className="bg-primary/10 hover:bg-primary/20 p-1.5 rounded text-primary transition-colors"
                  >
                    <Icon name="mail" className="text-base" />
                  </a>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                <Icon name="person_off" className="text-xl text-slate-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-slate-400">No contact linked</p>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function ProductsCard({ dealId }: Readonly<{ dealId: string }>) {
  const { data, isLoading } = api.opportunity.getProducts.useQuery({ opportunityId: dealId });

  if (isLoading) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">
          Products
        </h3>
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Card>
    );
  }

  const products = data?.products ?? [];
  const totalValue = data?.totalValue ?? 0;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
          Products
        </h3>
        <button className="w-6 h-6 flex items-center justify-center rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors">
          <Icon name="add" className="text-base" />
        </button>
      </div>
      {products.length === 0 ? (
        <EmptyState entity="products" phase="passive" className="py-2" />
      ) : (
        <>
          <div className="space-y-3">
            {products.map((product, index) => (
              <div
                key={product.id}
                className={`flex justify-between items-start text-sm ${
                  index > 0 ? 'border-t border-slate-50 pt-3' : ''
                }`}
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{product.name}</p>
                  <p className="text-xs text-slate-500">{product.description}</p>
                </div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {formatCurrency(Number(product.totalPrice))}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-dashed border-slate-200 flex justify-between items-center">
            <span className="text-sm font-medium text-slate-500">Total</span>
            <span className="text-lg font-bold text-primary">{formatCurrency(totalValue)}</span>
          </div>
        </>
      )}
    </Card>
  );
}

function FilesCard() {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
          Files
        </h3>
        <button className="w-6 h-6 flex items-center justify-center rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors">
          <Icon name="upload" className="text-base" />
        </button>
      </div>
      <EmptyState entity="files" phase="passive" className="py-2" />
    </Card>
  );
}

function DealDetailSkeleton() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex flex-col gap-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-3 flex flex-col gap-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
          <div className="lg:col-span-6">
            <Skeleton className="h-96 w-full" />
          </div>
          <div className="lg:col-span-3 flex flex-col gap-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

function DealNotFoundError() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-lg text-center py-20">
        <Icon name="error_outline" className="text-6xl text-slate-300 mb-4" />
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
          Deal not found or you don&apos;t have access
        </h2>
        <p className="text-slate-500 mb-6">
          The deal you&apos;re looking for may have been deleted or you may not have permission to
          view it.
        </p>
        <Link href="/deals">
          <Button>Back to Deals</Button>
        </Link>
      </div>
    </div>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function DealDetailPage() {
  const params = useParams();
  const dealId = params.id as string;
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();

  const {
    data: deal,
    isLoading,
    error,
  } = api.opportunity.getById.useQuery(
    { id: dealId },
    { enabled: isAuthenticated && !authLoading && !!dealId }
  );

  if (authLoading || isLoading) return <DealDetailSkeleton />;
  if (error || !deal) return <DealNotFoundError />;

  // Cast the tRPC-inferred type to our explicit DealDetail interface
  // This is a single validated boundary cast rather than scattered field-level casts
  const d = deal as DealDetail;
  const stage = d.stage as OpportunityStage;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex flex-col gap-6">
        {/* Header using EntityHeader */}
        <EntityHeader
          breadcrumbs={[{ label: 'Deals', href: '/deals' }, { label: d.name }]}
          title={d.name}
          entityId={d.id}
          badges={[
            { label: STAGE_LABELS[stage], variant: 'status' },
            { label: `${d.probability}%`, variant: 'info' },
          ]}
          actions={[
            {
              label: 'Forecast',
              icon: 'bar_chart',
              variant: 'secondary',
              href: `/deals/${dealId}/forecast`,
            },
            {
              label: 'Lost',
              variant: 'secondary',
              onClick: () => {},
            },
            {
              label: 'Edit',
              variant: 'secondary',
              onClick: () => {},
            },
            {
              label: 'Won',
              icon: 'check',
              variant: 'primary',
              onClick: () => {},
            },
          ]}
          endContent={
            <div className="flex items-center gap-2">
              <PinButton
                entityType="opportunity"
                entityId={d.id}
                title={d.name}
                url={`/deals/${dealId}`}
              />
              <MoreActionsButton onClick={() => setActionSheetOpen(true)} />
            </div>
          }
        />

        <EntityActionSheet
          open={actionSheetOpen}
          onOpenChange={setActionSheetOpen}
          entity={{
            type: 'opportunity',
            id: d.id,
            title: d.name,
            subtitle: d.account?.name ?? '',
            icon: 'handshake',
            url: `/deals/${dealId}`,
          }}
          extraActions={[
            { label: 'Clone Deal', icon: 'content_copy', onClick: () => {} },
            { label: 'Archive', icon: 'archive', onClick: () => {} },
            { label: 'Delete', icon: 'delete', onClick: () => {}, destructive: true },
          ]}
        />

        {/* Stage Progress */}
        <StageProgress value={d.value} stage={stage} probability={d.probability} />

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Sidebar */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            <AboutDealCard deal={d} />
            <StakeholdersCard deal={d} />
          </div>

          {/* Center - Activity Timeline */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Activity</h3>
                <span className="text-xs text-slate-500">All Sources</span>
              </div>
              <ActivityFeed
                entityType="OPPORTUNITY"
                entityId={dealId}
                limit={20}
                height={620}
                emptyMessage="No activity found across all sources"
              />
            </Card>
          </div>

          {/* Right Sidebar */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            <ProductsCard dealId={dealId} />
            <RelatedTasksCard entityType="opportunity" entityId={dealId} title="Next Steps" />
            <FilesCard />
          </div>
        </div>
      </div>
    </div>
  );
}
