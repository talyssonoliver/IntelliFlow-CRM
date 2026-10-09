'use client';

/**
 * Account Tiers — PG-196 (ADR-073)
 *
 * Tenant-configurable revenue tiers: names, minimum annual revenue, colour,
 * benefits, the default tier for accounts without revenue, and up/down
 * notifications. Follows docs/planning/module-settings-playbook.md (PageHeader,
 * 12-column bento, SectionHeader action slot, passive EmptyState, Save only when
 * dirty and valid). Writes are ADMIN-only; everyone else sees the page read-only.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, ConfirmationDialog, toast } from '@intelliflow/ui';
import { MAX_TIERS } from '@intelliflow/domain';
import { PageHeader } from '@/components/shared/page-header';
import { SectionHeader } from '@/components/shared/section-header';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { AccountTiersLoading } from './AccountTiersLoading';
import {
  draftFromView,
  draftSignature,
  draftToPayload,
  newBenefitRow,
  newTierDraft,
  validateDraft,
  type AccountTiersViewLike,
  type TierDraft,
  type TiersDraft,
} from './tier-draft';
import { TierDefinitionsCard } from './components/TierDefinitionsCard';
import { DefaultTierCard } from './components/DefaultTierCard';
import { TierRulesCard } from './components/TierRulesCard';
import { BenefitsMatrixCard } from './components/BenefitsMatrixCard';

export const RESET_CONFIRM_TEXT =
  'This restores the four built-in tiers (Enterprise from 10,000,000, Mid-Market from 1,000,000, SMB from 100,000, Startup from 0) with their default names and colours and no benefits, sets the default tier to Unknown and turns both tier notifications off. Custom tiers are removed and Account Settings hierarchy rules that reference them are cleared. Account records are not changed, but their displayed tier may change immediately.';

const CARD = 'p-4 sm:p-5';

export default function AccountTiersContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const utils = trpc.useUtils();
  const query = trpc.accountTiers.get.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
  });
  const view = query.data;

  const [draft, setDraft] = useState<TiersDraft | null>(null);
  const [baseline, setBaseline] = useState<string>('');
  const [announcement, setAnnouncement] = useState('');
  const [resetOpen, setResetOpen] = useState(false);

  const adopt = useCallback((next: AccountTiersViewLike) => {
    const fresh = draftFromView(next);
    setDraft(fresh);
    setBaseline(draftSignature(fresh));
  }, []);

  useEffect(() => {
    if (view) adopt(view);
  }, [view, adopt]);

  const onSaved = useCallback(
    (data: AccountTiersViewLike & { canManage: boolean }) => {
      utils.accountTiers.get.setData(undefined, data as never);
      adopt(data);
    },
    [utils, adopt]
  );

  const update = trpc.accountTiers.update.useMutation({
    onSuccess: (data) => {
      onSaved(data);
      toast({ title: 'Account tiers saved' });
    },
    onError: (error) => {
      if (error.data?.code === 'CONFLICT') {
        toast({
          title: 'Tiers changed elsewhere',
          description: 'Someone else saved account tiers. The latest tiers have been loaded.',
          variant: 'destructive',
        });
        query
          .refetch()
          .catch((err: unknown) => console.error('Failed to reload account tiers:', err));
        return;
      }
      toast({ title: 'Could not save tiers', description: error.message, variant: 'destructive' });
    },
  });

  const reset = trpc.accountTiers.resetToDefaults.useMutation({
    onSuccess: (data) => {
      onSaved(data);
      setResetOpen(false);
      toast({ title: 'Account tiers reset to defaults' });
    },
    onError: (error) => {
      toast({ title: 'Could not reset tiers', description: error.message, variant: 'destructive' });
    },
  });

  const canManage = view?.canManage ?? false;
  const readOnly = !canManage;
  const validation = useMemo(() => (draft ? validateDraft(draft) : null), [draft]);
  const isDirty = draft !== null && draftSignature(draft) !== baseline;
  const isSaving = update.isPending || reset.isPending;
  const hasConflict = validation !== null && !validation.valid;

  const patchTier = useCallback((id: string, patch: Partial<Omit<TierDraft, 'id'>>) => {
    setDraft(
      (d) => d && { ...d, tiers: d.tiers.map((t) => (t.id === id ? { ...t, ...patch } : t)) }
    );
  }, []);

  const addTier = useCallback(() => {
    setDraft((d) => d && { ...d, tiers: [...d.tiers, newTierDraft(d)] });
    setAnnouncement('Tier added');
  }, []);

  const removeTier = useCallback((id: string) => {
    setDraft((d) => {
      if (!d) return d;
      const removed = d.tiers.find((t) => t.id === id);
      return {
        ...d,
        tiers: d.tiers.filter((t) => t.id !== id),
        defaultTierKey: removed?.key && removed.key === d.defaultTierKey ? null : d.defaultTierKey,
      };
    });
    setAnnouncement('Tier removed');
  }, []);

  const addBenefit = useCallback(() => {
    setDraft((d) => d && { ...d, benefits: [...d.benefits, newBenefitRow()] });
    setAnnouncement('Benefit added');
  }, []);

  const renameBenefit = useCallback((id: string, name: string) => {
    setDraft(
      (d) => d && { ...d, benefits: d.benefits.map((b) => (b.id === id ? { ...b, name } : b)) }
    );
  }, []);

  const removeBenefit = useCallback((id: string) => {
    setDraft(
      (d) =>
        d && {
          ...d,
          benefits: d.benefits.filter((b) => b.id !== id),
          tiers: d.tiers.map((t) => ({ ...t, benefitIds: t.benefitIds.filter((b) => b !== id) })),
        }
    );
    setAnnouncement('Benefit removed');
  }, []);

  const toggleBenefit = useCallback((tierId: string, benefitId: string, checked: boolean) => {
    setDraft(
      (d) =>
        d && {
          ...d,
          tiers: d.tiers.map((t) => {
            if (t.id !== tierId) return t;
            const others = t.benefitIds.filter((b) => b !== benefitId);
            return { ...t, benefitIds: checked ? [...others, benefitId] : others };
          }),
        }
    );
  }, []);

  const handleSave = useCallback(() => {
    if (!draft || hasConflict) return;
    update.mutate(draftToPayload(draft, view?.updatedAt ?? null));
  }, [draft, hasConflict, update, view?.updatedAt]);

  const actions = useMemo(
    () =>
      canManage
        ? [
            {
              label: 'Reset to Defaults',
              onClick: () => setResetOpen(true),
              variant: 'secondary' as const,
              icon: 'restart_alt',
              hideOnMobile: true,
              disabled: isSaving,
            },
            {
              label: update.isPending ? 'Saving…' : 'Save Changes',
              onClick: handleSave,
              variant: 'primary' as const,
              icon: 'save',
              disabled: !isDirty || isSaving || hasConflict,
              loading: update.isPending,
            },
          ]
        : [],
    [canManage, handleSave, hasConflict, isDirty, isSaving, update.isPending]
  );

  if (query.error) {
    return (
      <div className="w-full text-center py-12">
        <p className="text-destructive mb-4">Failed to load account tiers: {query.error.message}</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="text-sm text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!view || !draft || !validation) return <AccountTiersLoading />;

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Accounts', href: '/accounts' },
          { label: 'Account Tiers' },
        ]}
        title="Account Tiers"
        description="Revenue tiers for accounts: names, thresholds, colours, benefits, default tier and up/down notifications."
        actions={actions}
        className="mb-6"
      />

      {readOnly && (
        <p className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Only workspace admins can change account tiers.
        </p>
      )}

      {validation.formErrors.length > 0 && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-destructive/40 px-4 py-3 text-sm text-destructive"
        >
          {validation.formErrors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <Card className={`lg:col-span-8 ${CARD}`}>
          <SectionHeader
            icon="category"
            iconBg="bg-purple-100 dark:bg-purple-900/30"
            iconFg="text-purple-600 dark:text-purple-400"
            title="Tier Definitions"
            description="Each tier starts at its minimum annual revenue and runs up to the next tier."
            action={
              canManage ? (
                <Button size="sm" onClick={addTier} disabled={draft.tiers.length >= MAX_TIERS}>
                  New Tier
                </Button>
              ) : undefined
            }
          />
          <TierDefinitionsCard
            tiers={draft.tiers}
            errors={validation.tierErrors}
            readOnly={readOnly}
            onChange={patchTier}
            onRemove={removeTier}
          />
        </Card>

        <Card className={`lg:col-span-4 ${CARD}`}>
          <SectionHeader
            icon="tune"
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            iconFg="text-blue-600 dark:text-blue-400"
            title="Default Tier"
            description="Tier for accounts without revenue."
          />
          <DefaultTierCard
            tiers={draft.tiers}
            value={draft.defaultTierKey}
            readOnly={readOnly}
            onChange={(defaultTierKey) => setDraft((d) => d && { ...d, defaultTierKey })}
          />
        </Card>

        <Card className={`lg:col-span-6 ${CARD}`}>
          <SectionHeader
            icon="notifications"
            iconBg="bg-amber-100 dark:bg-amber-900/30"
            iconFg="text-amber-600 dark:text-amber-400"
            title="Up/Down Rules"
            description="What happens when an account changes tier."
          />
          <TierRulesCard
            notifyOwnerOnUpgrade={draft.notifyOwnerOnUpgrade}
            notifyOwnerOnDowngrade={draft.notifyOwnerOnDowngrade}
            readOnly={readOnly}
            onChange={(patch) => setDraft((d) => d && { ...d, ...patch })}
          />
        </Card>

        <Card className={`lg:col-span-6 ${CARD}`}>
          <SectionHeader
            icon="workspace_premium"
            iconBg="bg-green-100 dark:bg-green-900/30"
            iconFg="text-green-600 dark:text-green-400"
            title="Benefits Matrix"
            description="What each tier receives. Shown on the account page."
            action={
              canManage ? (
                <Button size="sm" onClick={addBenefit}>
                  Add Benefit
                </Button>
              ) : undefined
            }
          />
          <BenefitsMatrixCard
            tiers={draft.tiers}
            benefits={draft.benefits}
            errors={validation.benefitErrors}
            readOnly={readOnly}
            announcement={announcement}
            onRename={renameBenefit}
            onRemove={removeBenefit}
            onToggle={toggleBenefit}
          />
        </Card>
      </div>

      <ConfirmationDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset account tiers to defaults?"
        description={RESET_CONFIRM_TEXT}
        confirmLabel="Reset"
        variant="destructive"
        onConfirm={() => reset.mutate()}
      />
    </div>
  );
}
