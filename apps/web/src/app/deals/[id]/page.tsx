'use client';

import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Card,
  Button,
  Skeleton,
  EmptyState,
  toast,
  ConfirmationDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@intelliflow/ui';
import { STAGE_TRANSITION_RULES, type OpportunityStage } from '@intelliflow/domain';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api';
import { useTenantCurrency } from '@/lib/format/useTenantCurrency';
import { AppAvatar } from '@/components/shared';
import { PageHeader } from '@/components/shared/page-header';
import { WidgetHeader } from '@/components/dashboard/WidgetHeader';
import { ActivityFeed } from '@/components/shared/activity-feed';
import { EntityActionSheet } from '@/components/shared/entity-action-sheet';
import { MoreActionsButton } from '@/components/shared/more-actions-button';
import { PinButton } from '@/components/home/PinButton';
import { RelatedTasksCard } from '@/components/tasks/RelatedTasksCard';
import { LossReasonModal } from '@/components/deals/LossReasonModal';
import { DealForm, type DealFormData } from '@/components/deals/DealForm';
import {
  DealStageProgress,
  STAGE_LABELS,
  formatCurrency,
  stageMoveToastTitle,
} from '@/components/deals/DealStageProgress';
import { useDealStageMove } from '@/components/deals/useDealStageMove';
import { useConversionUndo } from '@/components/deals/UndoConversion';
import { revalidateDealCaches } from '@/app/deals/actions';

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

/**
 * The server-cache refresh after a mutation is best-effort (the mutation already
 * succeeded), but a failure is logged rather than swallowed — otherwise a stale
 * deals list has no trace of why.
 */
function logDealCacheFailure(error: unknown): void {
  console.warn('[DealPage] Deal cache revalidation failed:', error);
}

// =============================================================================
// Components
// =============================================================================

function AboutDealCard({ deal }: Readonly<{ deal: DealDetail }>) {
  const { timezone } = useTimezoneContext();
  return (
    <Card className="p-5">
      <WidgetHeader title="About this deal" className="mb-4" />
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

/**
 * Who the deal is with (owner 23/11 on the deal page). Each row says what it is, account or
 * contact, so a sole trader whose account and contact share a name no longer reads as the same
 * line twice; the icon-only links are 44px with names.
 */
function StakeholdersCard({ deal, onEdit }: Readonly<{ deal: DealDetail; onEdit: () => void }>) {
  const contactName = deal.contact ? `${deal.contact.firstName} ${deal.contact.lastName}` : null;
  return (
    <Card className="p-5">
      <WidgetHeader
        title="Stakeholders"
        className="mb-4"
        actions={
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit stakeholders"
            className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-ds-primary hover:bg-primary/10"
          >
            Edit
          </button>
        }
      />
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon name="apartment" className="text-xl" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Account</p>
            {deal.account ? (
              <Link
                href={`/accounts/${deal.accountId}`}
                className="block truncate text-sm font-semibold text-foreground hover:text-ds-primary"
              >
                {deal.account.name}
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">No account linked</p>
            )}
          </div>
          {deal.account?.website && (
            <a
              href={deal.account.website}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${deal.account.name} website`}
              className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-ds-primary"
            >
              <Icon name="language" className="text-xl" />
            </a>
          )}
        </div>

        <hr className="border-border" />

        <div className="flex items-center gap-3">
          {contactName ? (
            <AppAvatar name={contactName} className="size-10 shrink-0" />
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <Icon name="person_off" className="text-xl text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              Contact{deal.contact?.title ? ` · ${deal.contact.title}` : ''}
            </p>
            {deal.contact && contactName ? (
              <Link
                href={`/contacts/${deal.contactId}`}
                className="block truncate text-sm font-semibold text-foreground hover:text-ds-primary"
              >
                {contactName}
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">No contact linked</p>
            )}
          </div>
          {deal.contact?.email && (
            <a
              href={`mailto:${deal.contact.email}`}
              aria-label={`Email ${contactName}`}
              className="flex size-11 shrink-0 items-center justify-center rounded-lg text-ds-primary hover:bg-primary/10"
            >
              <Icon name="mail" className="text-xl" />
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}

function ProductsCard({
  dealId,
  onAddProduct,
}: Readonly<{ dealId: string; onAddProduct: () => void }>) {
  const currency = useTenantCurrency();
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
        <button
          type="button"
          onClick={onAddProduct}
          aria-label="Add product"
          className="w-6 h-6 flex items-center justify-center rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
        >
          <Icon name="add" className="text-base" />
        </button>
      </div>
      {products.length === 0 ? (
        <EmptyState entity="products" showCta={false} className="py-2" />
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
                  {formatCurrency(Number(product.totalPrice), currency)}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-dashed border-slate-200 flex justify-between items-center">
            <span className="text-sm font-medium text-slate-500">Total</span>
            <span className="text-lg font-bold text-primary">
              {formatCurrency(totalValue, currency)}
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

function FilesCard({ onUpload }: Readonly<{ onUpload: () => void }>) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
          Files
        </h3>
        <button
          type="button"
          onClick={onUpload}
          aria-label="Upload file"
          className="w-6 h-6 flex items-center justify-center rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
        >
          <Icon name="upload" className="text-base" />
        </button>
      </div>
      <EmptyState entity="files" showCta={false} className="py-2" />
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
  const router = useRouter();
  const dealId = params.id as string;
  const utils = api.useUtils();
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [lossModalOpen, setLossModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'WON' | 'LOST' | null>(null);
  const { isLoading: authLoading, isAuthenticated, user } = useRequireAuth();
  const conversionUndo = useConversionUndo(dealId, user?.id, isAuthenticated && !authLoading);

  const {
    data: deal,
    isLoading,
    error,
  } = api.opportunity.getById.useQuery(
    { id: dealId },
    { enabled: isAuthenticated && !authLoading && !!dealId }
  );

  // Server-side cache revalidation. A failure must not turn a successful
  // mutation into a failed one, so it is logged rather than rethrown.
  const revalidateServerCaches = async () => {
    try {
      await revalidateDealCaches(user?.id ?? null);
    } catch (error) {
      logDealCacheFailure(error);
    }
  };

  const moveStage = api.opportunity.moveStage.useMutation({
    onSuccess: (_data, variables) => {
      setPendingAction(null);
      toast({ title: stageMoveToastTitle(variables.targetStage as OpportunityStage) });
      return Promise.all([
        revalidateServerCaches(),
        utils.opportunity.getById.invalidate({ id: dealId }),
        // The move wrote a STAGE_CHANGE entry (#31): show it now, not at the feed's next poll.
        // The deal's feed reads the unified query; the leads and contacts pages invalidate both.
        utils.activityFeed.getUnifiedFeed.invalidate(),
        utils.activityFeed.getEntityFeed.invalidate(),
      ]);
    },
    onError: (err) => {
      setPendingAction(null);
      const message = /already been closed/i.test(err.message ?? '')
        ? 'This deal has already been closed by another user'
        : 'Failed to update deal stage. Please try again.';
      toast({ title: message, variant: 'destructive' });
    },
  });

  // #32: tapping a stage on the bar asks first, then moves the deal (and logs it on its activity).
  const stageMove = useDealStageMove({
    dealId,
    dealName: deal?.name ?? '',
    stage: (deal?.stage ?? 'PROSPECTING') as OpportunityStage,
    mutation: moveStage,
  });

  const deleteMutation = api.opportunity.delete.useMutation({
    onSuccess: () => {
      setDeleteConfirmOpen(false);
      toast({ title: 'Deal moved to trash' });
      router.push('/deals');
      // The list this navigates to must not show the deal that was just trashed, even
      // when the server-cache refresh fails.
      return Promise.all([revalidateServerCaches(), utils.opportunity.list.invalidate()]);
    },
    onError: () => {
      toast({ title: 'Failed to delete deal. Please try again.', variant: 'destructive' });
    },
  });

  const updateMutation = api.opportunity.update.useMutation({
    onSuccess: () => {
      setEditDialogOpen(false);
      toast({ title: 'Deal updated' });
      return Promise.all([
        revalidateServerCaches(),
        utils.opportunity.getById.invalidate({ id: dealId }),
      ]);
    },
    onError: () => {
      toast({ title: 'Failed to update deal. Please try again.', variant: 'destructive' });
    },
  });

  if (authLoading || isLoading) return <DealDetailSkeleton />;
  if (error || !deal) return <DealNotFoundError />;

  // Cast the tRPC-inferred type to our explicit DealDetail interface
  // This is a single validated boundary cast rather than scattered field-level casts
  const d = deal as DealDetail;
  const stage = d.stage as OpportunityStage;

  // Owner 23/11: these stay on screen until they are built (PG-074), never removed.
  const comingSoon = (feature: string) =>
    toast({ title: 'Coming soon', description: `${feature} is under development` });

  const handleWon = () => {
    setPendingAction('WON');
    moveStage.mutate({ id: dealId, targetStage: 'CLOSED_WON' });
  };

  const handleLossConfirm = (reason: string) => {
    setLossModalOpen(false);
    setPendingAction('LOST');
    moveStage.mutate({ id: dealId, targetStage: 'CLOSED_LOST', reason });
  };

  // Map the loaded deal onto the DealForm shape for the inline Edit dialog.
  const editInitialData: Partial<DealFormData> = {
    name: d.name,
    value: { amount: d.value, currency: d.currency },
    stage: stage as DealFormData['stage'],
    probability: d.probability,
    expectedCloseDate: d.expectedCloseDate
      ? new Date(d.expectedCloseDate).toISOString().slice(0, 10)
      : '',
    accountId: d.accountId,
    accountName: d.account?.name ?? '',
    contactId: d.contactId ?? '',
    contactName: d.contact ? `${d.contact.firstName} ${d.contact.lastName}` : '',
    description: d.description ?? '',
  };

  const handleEditSubmit = (data: DealFormData) => {
    // Send only changed fields (dirty diff). value/probability/stage/date are
    // closed-guarded in the domain, so submitting them unchanged on a closed deal
    // would reject the whole update before the allowed clerical edits (name,
    // description, account, contact) persist. Omitting unchanged fields avoids that.
    const payload: {
      id: string;
      name?: string;
      value?: { amount: number; currency: string };
      stage?: OpportunityStage;
      probability?: number;
      expectedCloseDate?: Date | null;
      accountId?: string;
      contactId?: string | null;
      description?: string;
    } = { id: dealId };

    if (data.name.trim() !== d.name) payload.name = data.name.trim();
    if (data.value.amount !== d.value) {
      payload.value = { amount: data.value.amount, currency: data.value.currency };
    }
    if (data.stage !== stage) payload.stage = data.stage;
    if (data.probability !== d.probability) payload.probability = data.probability;
    // expectedCloseDate: send a Date when set, or null to clear (the service +
    // domain clearExpectedCloseDate persist the clear). Only when it changed.
    if (data.expectedCloseDate !== (editInitialData.expectedCloseDate ?? '')) {
      payload.expectedCloseDate = data.expectedCloseDate ? new Date(data.expectedCloseDate) : null;
    }
    if (data.accountId !== d.accountId) payload.accountId = data.accountId;
    if ((data.contactId || '') !== (d.contactId ?? '')) payload.contactId = data.contactId || null;
    if (data.description !== (d.description ?? '')) payload.description = data.description.trim();

    updateMutation.mutate(payload);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex flex-col gap-6">
        {/* Owner 23/11: the shared page hero, like every other page. The raw record id badge is
            gone (it read like a placeholder); stage and probability are in the line under the
            name, and the account is named there too. */}
        <PageHeader
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Deals', href: '/deals' },
          ]}
          title={d.name}
          description={[
            d.account?.name,
            STAGE_LABELS[stage],
            d.isClosed ? null : `${d.probability}% probability`,
          ]
            .filter(Boolean)
            .join(' · ')}
          controls={
            <>
              {/* Phones (owner 26/11): Won, Lost, Edit, Forecast and ⋮ fit one row; Pin is in the
                  ⋮ sheet ("Pin to Home"), so the separate pin shows from sm up. */}
              <PinButton
                entityType="opportunity"
                entityId={d.id}
                title={d.name}
                url={`/deals/${dealId}`}
                className="hidden text-white hover:bg-white/10 sm:inline-flex"
              />
              <MoreActionsButton variant="hero" onClick={() => setActionSheetOpen(true)} />
            </>
          }
          actions={[
            {
              label: 'Won',
              icon: 'check',
              variant: 'primary',
              onClick: handleWon,
              disabled: !(!d.isClosed && stage === 'NEGOTIATION'),
              loading: moveStage.isPending && pendingAction === 'WON',
            },
            {
              label: 'Lost',
              icon: 'close',
              variant: 'secondary',
              onClick: () => setLossModalOpen(true),
              disabled: d.isClosed,
              loading: moveStage.isPending && pendingAction === 'LOST',
            },
            {
              label: 'Edit',
              icon: 'edit',
              variant: 'secondary',
              hideOnMobile: true,
              onClick: () => setEditDialogOpen(true),
              loading: updateMutation.isPending,
            },
            {
              label: 'Forecast',
              icon: 'bar_chart',
              variant: 'secondary',
              hideOnMobile: true,
              href: `/deals/${dealId}/forecast`,
            },
          ]}
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
            { label: 'Clone Deal', icon: 'content_copy', onClick: () => comingSoon('Clone deal') },
            { label: 'Archive', icon: 'archive', onClick: () => comingSoon('Archive deal') },
            ...(conversionUndo.action ? [conversionUndo.action] : []),
            {
              label: 'Delete',
              icon: 'delete',
              onClick: () => setDeleteConfirmOpen(true),
              destructive: true,
            },
          ]}
        />

        {conversionUndo.dialog}
        {/* Mark-as-Lost reason modal (CLOSED_LOST requires a reason >=10 chars) */}
        <LossReasonModal
          open={lossModalOpen}
          dealName={d.name}
          onConfirm={handleLossConfirm}
          onCancel={() => setLossModalOpen(false)}
        />

        {/* Delete confirmation (soft-delete → trash) */}
        <ConfirmationDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="Delete Deal"
          description="This deal will be moved to trash. You can restore it from the Deals trash view."
          confirmLabel="Delete"
          variant="destructive"
          icon="delete"
          isLoading={deleteMutation.isPending}
          onConfirm={async () => {
            try {
              await deleteMutation.mutateAsync({ id: dealId });
            } catch {
              // deleteMutation.onError shows the destructive toast; swallow the
              // rejection so it doesn't surface as an unhandled promise rejection.
            }
          }}
        />

        {/* Inline Edit dialog (reuses DealForm in edit mode → opportunity.update) */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Deal</DialogTitle>
            </DialogHeader>
            <DealForm
              mode="edit"
              initialData={editInitialData}
              isSubmitting={updateMutation.isPending}
              onSubmit={handleEditSubmit}
              onCancel={() => setEditDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>

        {/* Stage Progress */}
        <DealStageProgress
          value={d.value}
          stage={stage}
          probability={d.probability}
          onAddValue={d.isClosed ? undefined : () => setEditDialogOpen(true)}
          onSelectStage={d.isClosed ? undefined : stageMove.requestMove}
          allowedStages={STAGE_TRANSITION_RULES[stage]}
          moving={stageMove.moving}
        />
        {stageMove.dialog}

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Sidebar */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            <AboutDealCard deal={d} />
            <StakeholdersCard deal={d} onEdit={() => setEditDialogOpen(true)} />
          </div>

          {/* Center - Activity Timeline */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            <Card className="p-4 sm:p-5">
              <WidgetHeader title="Activity" className="mb-4" />
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
            <ProductsCard dealId={dealId} onAddProduct={() => comingSoon('Adding products')} />
            <RelatedTasksCard entityType="opportunity" entityId={dealId} title="Next Steps" />
            <FilesCard onUpload={() => comingSoon('File upload')} />
          </div>
        </div>
      </div>
    </div>
  );
}
