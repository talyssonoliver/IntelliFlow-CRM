'use client';

/**
 * Approval Policies — Module Settings (PG-198, ADR-076).
 *
 * Tenant rules for both approval queues (agent tool actions, AI email
 * auto-responses): timeout, minimum reviewer, opt-in auto-approval and
 * escalation, with per-agent overrides. Everyone in the workspace can read
 * them; only admins change them. The server is authoritative (FORBIDDEN for
 * others); the UI hides what a reader cannot do (AC-019).
 */
import { useMemo, useState } from 'react';
import { Button, Card, ConfirmationDialog, EmptyState, toast } from '@intelliflow/ui';
import { APPROVAL_POLICY_SCOPES, type ApprovalPolicyScope } from '@intelliflow/domain';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { SectionHeader } from '@/components/shared/section-header';
import { PolicyCard } from './components/PolicyCard';
import { PolicyDialog } from './components/PolicyDialog';
import { EffectiveRules } from './components/EffectiveRules';
import {
  SCOPE_META,
  formatMinutes,
  type PolicyRow,
  type PolicySaveInput,
} from './components/policy-model';
import { ApprovalPoliciesLoading } from './ApprovalPoliciesLoading';

interface DialogState {
  scope: ApprovalPolicyScope;
  policy: PolicyRow | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}

export default function ApprovalPoliciesContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const enabled = isAuthenticated && !authLoading;
  const utils = trpc.useUtils();

  const listQuery = trpc.approvalPolicies.list.useQuery(undefined, { enabled });
  const canManage = listQuery.data?.canManage ?? false;
  const agentPreview = trpc.approvalPolicies.preview.useQuery({ scope: 'AGENT_TOOL' }, { enabled });
  const draftPreview = trpc.approvalPolicies.preview.useQuery(
    { scope: 'AUTO_RESPONSE' },
    { enabled }
  );
  const membersQuery = trpc.ticket.assignees.useQuery(undefined, { enabled: enabled && canManage });

  const [announcement, setAnnouncement] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PolicyRow | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const refresh = async () => {
    await Promise.all([
      utils.approvalPolicies.list.invalidate(),
      utils.approvalPolicies.preview.invalidate(),
    ]);
  };
  const announce = (message: string, destructive = false) => {
    setAnnouncement(message);
    toast({ title: message, variant: destructive ? 'destructive' : undefined });
  };

  const createMutation = trpc.approvalPolicies.create.useMutation({ onSuccess: refresh });
  const updateMutation = trpc.approvalPolicies.update.useMutation({ onSuccess: refresh });
  const deleteMutation = trpc.approvalPolicies.delete.useMutation({ onSuccess: refresh });
  const setDefaultMutation = trpc.approvalPolicies.setDefault.useMutation({ onSuccess: refresh });
  const resetMutation = trpc.approvalPolicies.resetToDefaults.useMutation({ onSuccess: refresh });

  const policies = useMemo<PolicyRow[]>(() => listQuery.data?.policies ?? [], [listQuery.data]);
  const byScope = (scope: ApprovalPolicyScope) => policies.filter((p) => p.scope === scope);

  const isBusy =
    deleteMutation.isPending || setDefaultMutation.isPending || resetMutation.isPending;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSave = async (input: PolicySaveInput): Promise<PolicyRow | undefined> => {
    const id = dialog?.policy?.id;
    try {
      const saved: PolicyRow = id
        ? await updateMutation.mutateAsync({ ...input, id })
        : await createMutation.mutateAsync(input);
      announce(`${id ? 'Saved' : 'Created'} policy “${saved.name}”.`);
      return saved;
    } catch (error) {
      announce(`Could not save the policy: ${errorMessage(error)}`, true);
      return undefined;
    }
  };

  const handleSetDefault = async (policy: PolicyRow) => {
    try {
      await setDefaultMutation.mutateAsync({ id: policy.id });
      announce(`“${policy.name}” is now the default policy.`);
    } catch (error) {
      announce(`Could not change the default policy: ${errorMessage(error)}`, true);
    }
  };

  const actions = useMemo(
    () =>
      canManage
        ? [
            {
              label: 'Reset to Defaults',
              onClick: () => setResetOpen(true),
              variant: 'secondary' as const,
              icon: 'restart_alt',
              disabled: isBusy || policies.length === 0,
            },
          ]
        : [],
    [canManage, isBusy, policies.length]
  );

  if (authLoading || listQuery.isLoading) return <ApprovalPoliciesLoading />;

  if (listQuery.error || !listQuery.data) {
    return (
      <div className="w-full text-center py-12">
        <p className="text-destructive mb-4">
          Failed to load approval policies{listQuery.error ? `: ${listQuery.error.message}` : '.'}
        </p>
        <Button type="button" variant="outline" onClick={() => listQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const { defaults, limits } = listQuery.data;
  const previews = { AGENT_TOOL: agentPreview, AUTO_RESPONSE: draftPreview };
  const dialogScope = dialog?.scope ?? 'AGENT_TOOL';
  const dialogPolicies = byScope(dialogScope);

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'AI & Agents', href: '/agent-approvals' },
          { label: 'AI Settings', href: '/agent-approvals/ai-settings' },
          { label: 'Approval Policies' },
        ]}
        title="Approval Policies"
        description="How long AI work may wait for review, who may approve it, and when it escalates."
        actions={actions}
        className="mb-6"
      />

      <output aria-live="polite" className="sr-only">
        {announcement}
      </output>

      {!canManage && (
        <p className="mb-4 text-sm text-muted-foreground" role="note">
          You have view-only access. Only admins and managers can change approval policies.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {APPROVAL_POLICY_SCOPES.map((scope) => {
          const meta = SCOPE_META[scope];
          const scoped = byScope(scope);
          const builtIn = defaults[scope];
          return (
            <section key={scope} className="lg:col-span-6" aria-labelledby={`scope-${scope}-title`}>
              <Card className="h-full p-4 sm:p-5">
                <SectionHeader
                  icon={meta.icon}
                  iconBg={meta.iconBg}
                  iconFg={meta.iconFg}
                  title={meta.title}
                  titleId={`scope-${scope}-title`}
                  headingLevel={2}
                  description={meta.description}
                  action={
                    canManage ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setDialog({ scope, policy: null })}
                        disabled={isBusy}
                        aria-label={`New Policy for ${meta.title.toLowerCase()}`}
                      >
                        New Policy
                      </Button>
                    ) : undefined
                  }
                />
                {scoped.length === 0 ? (
                  <div className="space-y-2">
                    <EmptyState
                      entity="rules"
                      phase="passive"
                      size="sm"
                      className="py-4 px-3 gap-2"
                    />
                    <p className="text-sm text-muted-foreground">
                      No policy yet, so the built-in rules apply: {meta.itemNoun}s expire after{' '}
                      {formatMinutes(builtIn.timeoutMinutes)}, anyone with approval access decides,
                      nothing is auto-approved and nothing escalates.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {scoped.map((policy) => (
                      <PolicyCard
                        key={policy.id}
                        policy={policy}
                        canManage={canManage}
                        isBusy={isBusy}
                        onEdit={(p) => setDialog({ scope, policy: p })}
                        onDelete={setPendingDelete}
                        onSetDefault={handleSetDefault}
                      />
                    ))}
                  </div>
                )}
              </Card>
            </section>
          );
        })}

        <section className="lg:col-span-12" aria-labelledby="effective-title">
          <Card className="p-4 sm:p-5">
            <SectionHeader
              icon="account_tree"
              iconBg="bg-emerald-100 dark:bg-emerald-900/30"
              iconFg="text-emerald-600 dark:text-emerald-400"
              title="Effective rules"
              titleId="effective-title"
              headingLevel={2}
              description="Which policy decides each kind of item right now."
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {APPROVAL_POLICY_SCOPES.map((scope) => {
                const query = previews[scope];
                return (
                  <div key={scope} className="space-y-2">
                    <h3 id={`effective-${scope}`} className="text-sm font-semibold text-foreground">
                      {SCOPE_META[scope].title}
                    </h3>
                    <EffectiveRules
                      label={`Effective rules for ${SCOPE_META[scope].title.toLowerCase()}`}
                      rows={query.data}
                      isLoading={query.isLoading}
                      error={query.error}
                      onRetry={() => {
                        query.refetch().catch(() => undefined);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        </section>
      </div>

      {dialog && (
        <PolicyDialog
          open
          scope={dialog.scope}
          policy={dialog.policy}
          makeDefault={!dialogPolicies.some((p) => p.isDefault)}
          defaultTimeoutMinutes={defaults[dialog.scope].timeoutMinutes}
          otherNames={dialogPolicies.filter((p) => p.id !== dialog.policy?.id).map((p) => p.name)}
          limits={limits}
          members={membersQuery.data ?? []}
          membersLoading={membersQuery.isLoading}
          isSaving={isSaving}
          onSave={handleSave}
          onClose={() => setDialog(null)}
        />
      )}

      <ConfirmationDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => (open ? null : setPendingDelete(null))}
        title={`Delete ${pendingDelete?.name ?? 'policy'}?`}
        description="Its overrides are removed and the items it governed fall back to the default policy or the built-in rules. Items already waiting keep their current deadline."
        confirmLabel="Delete"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteMutation.mutateAsync({ id: pendingDelete.id });
            announce(`Deleted policy “${pendingDelete.name}”.`);
          } catch (error) {
            announce(`Could not delete the policy: ${errorMessage(error)}`, true);
          }
          setPendingDelete(null);
        }}
      />
      <ConfirmationDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset approval policies?"
        description="This deletes every approval policy and override in both queues, so the built-in rules apply again. Items already waiting for review and the approval history are kept."
        confirmLabel="Reset"
        variant="destructive"
        isLoading={resetMutation.isPending}
        onConfirm={async () => {
          try {
            await resetMutation.mutateAsync();
            announce('Approval policies reset to the built-in rules.');
          } catch (error) {
            announce(`Could not reset approval policies: ${errorMessage(error)}`, true);
          }
          setResetOpen(false);
        }}
      />
    </div>
  );
}
