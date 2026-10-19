'use client';

/**
 * Model Configuration — Module Settings (PG-199, ADR-082).
 *
 * One card per AI purpose (owner Q1): model pin, temperature, max tokens, ordered
 * fallbacks and a monthly cost ceiling. Everyone in the workspace can read the
 * settings; only AI-settings admins change them (the server is authoritative).
 * Save sends only the changed purposes with their concurrency tokens; any
 * cheaper model (primary or fallback) is confirmed once, in one dialog, before
 * the server would refuse it (owner R2/Q4/Q7).
 */
import { useEffect, useRef, useState } from 'react';
import { Button, ConfirmationDialog, toast } from '@intelliflow/ui';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { errorCode } from '@/lib/trpc-errors';
import { PageHeader, type PageAction } from '@/components/shared/page-header';
import { PurposeCard } from './components/PurposeCard';
import {
  buildResetPayload,
  buildUpdatePayload,
  changedDrafts,
  describeDowngrade,
  draftDowngrades,
  formatPeriod,
  mapServerIssues,
  resetDowngrades,
  toDraft,
  validateDraft,
  type ModelConfigData,
  type PurposeDraft,
  type PurposeErrors,
  type PurposeRow,
} from './components/model-config-model';
import { ModelConfigLoading } from './ModelConfigLoading';
import type { LLMPurpose } from '@intelliflow/domain';

const TITLE = 'Model Configuration';
const DESCRIPTION =
  'Which model each AI feature uses, its fallbacks, parameters and a monthly cost ceiling.';

const BREADCRUMBS = [
  { label: 'Dashboard', href: '/' },
  { label: 'AI & Agents', href: '/agent-approvals' },
  { label: 'AI Settings', href: '/agent-approvals/ai-settings' },
  { label: TITLE },
];

const CHAIN_VERSIONS_ACTION: PageAction = {
  label: 'Chain versions',
  href: '/agent-approvals/ai-settings',
  icon: 'account_tree',
  variant: 'secondary',
};

const DOWNGRADE_PREFIX = 'DOWNGRADE_UNCONFIRMED:';

interface PendingConfirm {
  kind: 'save' | 'reset';
  /** One line per cheaper pick. */
  lines: string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}

function hasErrors(errors: PurposeErrors): boolean {
  return Object.values(errors).some((fields) => fields && Object.keys(fields).length > 0);
}

/** Display row: the loaded row for edits, live spend and block state from the latest read. */
function withLiveSpend(row: PurposeRow, live: PurposeRow | undefined): PurposeRow {
  return live ? { ...row, spentCents: live.spentCents, blocked: live.blocked } : row;
}

function HowItApplies() {
  return (
    <section aria-labelledby="mc-notes-title" className="mb-4 rounded-lg border border-border p-4">
      <h2 id="mc-notes-title" className="text-sm font-semibold text-foreground">
        How these settings apply
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Changes reach the AI worker within about 2 minutes.</li>
        <li>
          Ceilings are soft: a call already in flight can finish and overshoot slightly. Embedding
          spend is estimated from input length.
        </li>
        <li>
          Pinned models run through the LiteLLM gateway. Models marked “not on OpenRouter” fall back
          to the feature default when the worker uses OpenRouter.
        </li>
        <li>
          Default models keep the platform fallbacks; your fallbacks are used once a model is
          pinned.
        </li>
      </ul>
    </section>
  );
}

export default function ModelConfigContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const enabled = isAuthenticated && !authLoading;
  const utils = trpc.useUtils();
  const query = trpc.modelConfig.get.useQuery(undefined, { enabled, refetchOnWindowFocus: true });
  const updateMutation = trpc.modelConfig.update.useMutation();
  const resetMutation = trpc.modelConfig.resetToDefaults.useMutation();
  const data = query.data as ModelConfigData | undefined;

  const [snapshot, setSnapshot] = useState<PurposeRow[] | null>(null);
  const [drafts, setDrafts] = useState<PurposeDraft[]>([]);
  const [errors, setErrors] = useState<PurposeErrors>({});
  const [hasConflict, setHasConflict] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [queued, setQueued] = useState<string | null>(null);
  const resync = useRef(false);

  const isDirty = snapshot ? changedDrafts(snapshot, drafts).length > 0 : false;
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  // Adopt the server state on first load, after a save/reset/reload, and on any
  // refetch while there is nothing unsaved. Unsaved edits are never overwritten.
  useEffect(() => {
    if (!data) return;
    if (!resync.current && dirtyRef.current) return;
    resync.current = false;
    setSnapshot(data.purposes);
    setDrafts(data.purposes.map(toDraft));
  }, [data]);

  // While the dialog is open everything outside it is aria-hidden, so results are
  // announced once it has closed (WCAG 4.1.3).
  useEffect(() => {
    if (confirm || !queued) return;
    setAnnouncement(queued);
    setQueued(null);
  }, [confirm, queued]);
  const announce = (message: string, destructive = false) => {
    setQueued(message);
    toast({ title: message, variant: destructive ? 'destructive' : undefined });
  };

  const isSaving = updateMutation.isPending || resetMutation.isPending;
  const canManage = data?.canManage ?? false;

  const adoptLatest = async () => {
    resync.current = true;
    await utils.modelConfig.get.invalidate();
  };

  const handleWriteError = (error: unknown, sent: LLMPurpose[]) => {
    const code = errorCode(error);
    const message = errorMessage(error);
    if (code === 'CONFLICT') {
      setHasConflict(true);
      setServerError(message);
      return;
    }
    if (code === 'PRECONDITION_FAILED' && message.startsWith(DOWNGRADE_PREFIX)) {
      setConfirm({ kind: 'save', lines: [message.slice(DOWNGRADE_PREFIX.length).trim()] });
      return;
    }
    if (code === 'BAD_REQUEST') {
      const mapped = mapServerIssues(message, sent);
      if (hasErrors(mapped)) {
        setErrors(mapped);
        announce('Some fields need attention before saving.', true);
        return;
      }
    }
    setServerError(message);
    announce('Could not save model settings', true);
  };

  const submit = async (acknowledge: boolean) => {
    if (!snapshot) return;
    const payload = buildUpdatePayload(snapshot, drafts, acknowledge);
    if (payload.purposes.length === 0) return;
    setServerError(null);
    try {
      await updateMutation.mutateAsync(payload);
      setErrors({});
      await adoptLatest();
      announce('Model settings saved.');
    } catch (error) {
      handleWriteError(
        error,
        payload.purposes.map((p) => p.purpose)
      );
    }
  };

  const handleSave = () => {
    if (!snapshot || !data) return;
    const clientErrors: PurposeErrors = {};
    for (const draft of changedDrafts(snapshot, drafts)) {
      const fieldErrors = validateDraft(draft, data.limits);
      if (Object.keys(fieldErrors).length > 0) clientErrors[draft.purpose] = fieldErrors;
    }
    setErrors(clientErrors);
    if (hasErrors(clientErrors)) {
      announce('Some fields need attention before saving.', true);
      return;
    }
    const downgrades = draftDowngrades(snapshot, drafts);
    if (downgrades.length > 0) {
      setConfirm({ kind: 'save', lines: downgrades.map(describeDowngrade) });
      return;
    }
    void submit(false);
  };

  const handleReset = async (acknowledge: boolean) => {
    if (!snapshot) return;
    setServerError(null);
    try {
      await resetMutation.mutateAsync(buildResetPayload(snapshot, acknowledge));
      setErrors({});
      await adoptLatest();
      announce('Model settings reset to the platform defaults.');
    } catch (error) {
      handleWriteError(error, []);
    }
  };

  const handleReload = async () => {
    resync.current = true;
    await query.refetch();
    setHasConflict(false);
    setServerError(null);
    setErrors({});
  };

  const handleConfirm = async () => {
    const pending = confirm;
    setConfirm(null);
    if (pending?.kind === 'reset') await handleReset(pending.lines.length > 0);
    else await submit(true);
  };

  const hasOverrides = snapshot?.some((row) => row.updatedAt !== null) ?? false;
  const actions: PageAction[] = canManage
    ? [
        CHAIN_VERSIONS_ACTION,
        {
          label: 'Reset to Defaults',
          onClick: () =>
            setConfirm({
              kind: 'reset',
              lines: snapshot ? resetDowngrades(snapshot).map(describeDowngrade) : [],
            }),
          variant: 'secondary',
          icon: 'restart_alt',
          disabled: isSaving || !hasOverrides,
        },
        {
          label: 'Save changes',
          onClick: handleSave,
          variant: 'primary',
          icon: 'save',
          disabled: !isDirty || isSaving || hasConflict,
          loading: updateMutation.isPending,
        },
      ]
    : [CHAIN_VERSIONS_ACTION];

  if (authLoading || query.isLoading) return <ModelConfigLoading />;

  // An API older than this page has no `modelConfig` procedures (tRPC NOT_FOUND):
  // explain calmly and never attempt a write.
  if (errorCode(query.error) === 'NOT_FOUND') {
    return (
      <div className="w-full">
        <PageHeader
          breadcrumbs={BREADCRUMBS}
          title={TITLE}
          description={DESCRIPTION}
          className="mb-6"
        />
        <output className="block rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200">
          Model configuration is not available on this server yet. It will appear after the next
          release.
        </output>
      </div>
    );
  }

  if (query.error || !data) {
    return (
      <div className="w-full">
        <PageHeader
          breadcrumbs={BREADCRUMBS}
          title={TITLE}
          description={DESCRIPTION}
          className="mb-6"
        />
        <div className="text-center py-12">
          <p className="text-red-700 dark:text-red-400 mb-4" role="alert">
            Failed to load model configuration
            {query.error ? `: ${query.error.message}` : '.'}
          </p>
          <Button type="button" variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const rows = snapshot ?? data.purposes;
  const live = new Map(data.purposes.map((row) => [row.purpose, row]));
  const draftFor = (row: PurposeRow) =>
    drafts.find((draft) => draft.purpose === row.purpose) ?? toDraft(row);

  const confirmDescription =
    confirm?.kind === 'reset'
      ? `Models, fallbacks, temperature, max tokens and ceilings return to the platform defaults for every purpose. Rate-limit overrides are kept.${
          confirm.lines.length > 0
            ? ` Cheaper models after the reset: ${confirm.lines.join('; ')}.`
            : ''
        }`
      : `These choices cost less per token than the current models, which can lower answer quality: ${
          confirm?.lines.join('; ') ?? ''
        }.`;

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={BREADCRUMBS}
        title={TITLE}
        description={DESCRIPTION}
        actions={actions}
        className="mb-6"
      />

      <output aria-live="polite" className="sr-only">
        {announcement}
      </output>

      <p className="mb-4 text-sm text-muted-foreground">
        Spend and ceilings for {formatPeriod(data.period)}.
      </p>

      {!canManage && (
        <p className="mb-4 text-sm text-muted-foreground" role="note" aria-label="View-only access">
          You have view-only access. Only admins and managers can change model settings.
        </p>
      )}

      {serverError && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert">{serverError}</p>
          {hasConflict && (
            <Button type="button" variant="outline" onClick={() => void handleReload()}>
              Reload latest
            </Button>
          )}
        </div>
      )}

      <HowItApplies />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {rows.map((row) => (
          <PurposeCard
            key={row.purpose}
            row={withLiveSpend(row, live.get(row.purpose))}
            draft={draftFor(row)}
            catalog={data.catalog}
            limits={data.limits}
            canManage={canManage}
            errors={errors[row.purpose]}
            onChange={(next) =>
              setDrafts((current) =>
                current.map((draft) => (draft.purpose === next.purpose ? next : draft))
              )
            }
          />
        ))}
      </div>

      <ConfirmationDialog
        open={confirm !== null}
        onOpenChange={(open) => (open ? null : setConfirm(null))}
        title={confirm?.kind === 'reset' ? 'Reset model settings?' : 'Save with cheaper models?'}
        description={confirmDescription}
        confirmLabel={confirm?.kind === 'reset' ? 'Reset' : 'Save with cheaper models'}
        variant={confirm?.kind === 'reset' ? 'destructive' : 'default'}
        isLoading={isSaving}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
