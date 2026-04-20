'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { Card, ConfirmationDialog, toast } from '@intelliflow/ui';
import { PageHeader, type PageAction } from '@/components/shared/page-header';
import type {
  CaseSettingsInput,
  CaseDuplicateRuleInput,
  CaseRequiredFieldInput,
  CaseAutomationSettingsInput,
  CaseTagColorToken,
} from '@intelliflow/validators';

interface SectionHeaderProps {
  icon: string;
  iconBg: string;
  iconFg: string;
  title: string;
  description: string;
}

function SectionHeader({ icon, iconBg, iconFg, title, description }: Readonly<SectionHeaderProps>) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <span className={`material-symbols-outlined text-[20px] ${iconFg}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

const REQUIRED_FIELD_KEYS = [
  'title',
  'description',
  'deadline',
  'jurisdiction',
  'clientId',
  'assignedTo',
] as const;

const TAG_COLORS: readonly CaseTagColorToken[] = [
  'slate',
  'blue',
  'red',
  'amber',
  'green',
  'violet',
  'rose',
  'teal',
] as const;

const TAG_COLOR_CLASSES: Record<CaseTagColorToken, string> = {
  slate: 'bg-slate-100 text-slate-800',
  blue: 'bg-blue-100 text-blue-800',
  red: 'bg-red-100 text-red-800',
  amber: 'bg-amber-100 text-amber-800',
  green: 'bg-green-100 text-green-800',
  violet: 'bg-violet-100 text-violet-800',
  rose: 'bg-rose-100 text-rose-800',
  teal: 'bg-teal-100 text-teal-800',
};

export default function CaseSettingsContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const utils = trpc.useUtils();

  // ─── General ──────────────────────────────────────────────────────────────
  const generalQuery = trpc.caseSettings.general.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const generalUpdate = trpc.caseSettings.general.update.useMutation({
    onSuccess: () => {
      utils.caseSettings.general.get.invalidate();
      setGeneralDirty(false);
      toast({ title: 'General settings saved', variant: 'success' });
    },
    onError: (err) =>
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' }),
  });
  const generalReset = trpc.caseSettings.general.resetToDefaults.useMutation({
    onSuccess: () => {
      utils.caseSettings.general.get.invalidate();
      setGeneralDirty(false);
      toast({ title: 'General settings reset' });
    },
  });

  // ─── Duplicate Rules ──────────────────────────────────────────────────────
  const duplicateRulesQuery = trpc.caseSettings.duplicateRules.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const duplicateRulesUpdate = trpc.caseSettings.duplicateRules.update.useMutation({
    onSuccess: () => {
      utils.caseSettings.duplicateRules.list.invalidate();
      toast({ title: 'Duplicate rules saved', variant: 'success' });
    },
  });

  // ─── Required Fields ──────────────────────────────────────────────────────
  const requiredFieldsQuery = trpc.caseSettings.requiredFields.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const requiredFieldsUpdate = trpc.caseSettings.requiredFields.update.useMutation({
    onSuccess: () => {
      utils.caseSettings.requiredFields.list.invalidate();
      toast({ title: 'Required fields saved', variant: 'success' });
    },
  });

  // ─── Tags ─────────────────────────────────────────────────────────────────
  const tagsQuery = trpc.caseSettings.tags.list.useQuery(undefined, { enabled: isAuthenticated });
  const tagCreate = trpc.caseSettings.tags.create.useMutation({
    onSuccess: () => {
      utils.caseSettings.tags.list.invalidate();
      setNewTagName('');
      setNewTagColor('slate');
      toast({ title: 'Tag added', variant: 'success' });
    },
    onError: (err) =>
      toast({ title: 'Add tag failed', description: err.message, variant: 'destructive' }),
  });
  const tagDelete = trpc.caseSettings.tags.delete.useMutation({
    onSuccess: () => {
      utils.caseSettings.tags.list.invalidate();
      toast({ title: 'Tag removed' });
    },
  });

  // ─── Automation ───────────────────────────────────────────────────────────
  const automationQuery = trpc.caseSettings.automation.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const automationUpdate = trpc.caseSettings.automation.update.useMutation({
    onSuccess: () => {
      utils.caseSettings.automation.get.invalidate();
      toast({ title: 'Automation saved', variant: 'success' });
    },
  });

  // ─── Local state ──────────────────────────────────────────────────────────
  const [general, setGeneral] = useState<CaseSettingsInput>({
    casePrefix: 'CASE-',
    defaultPriority: 'MEDIUM',
    autoAssignEnabled: false,
    autoAssignUserId: null,
  });
  const [generalDirty, setGeneralDirty] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<CaseTagColorToken>('slate');

  const usersQuery = trpc.user.list.useQuery(
    { search: userSearch },
    { enabled: isAuthenticated && general.autoAssignEnabled }
  );

  useEffect(() => {
    if (generalQuery.data) {
      setGeneral({
        casePrefix: generalQuery.data.casePrefix,
        defaultPriority: generalQuery.data.defaultPriority as CaseSettingsInput['defaultPriority'],
        autoAssignEnabled: generalQuery.data.autoAssignEnabled,
        autoAssignUserId: generalQuery.data.autoAssignUserId ?? null,
      });
      setGeneralDirty(false);
    }
  }, [generalQuery.data]);

  const changeGeneral = useCallback(
    <K extends keyof CaseSettingsInput>(key: K, value: CaseSettingsInput[K]) => {
      setGeneral((prev) => ({ ...prev, [key]: value }));
      setGeneralDirty(true);
    },
    []
  );

  const handleSaveGeneral = useCallback(async () => {
    await generalUpdate.mutateAsync(general);
  }, [general, generalUpdate]);

  const handleReset = useCallback(async () => {
    await generalReset.mutateAsync();
    setShowResetDialog(false);
  }, [generalReset]);

  const actions = useMemo<PageAction[]>(
    () => [
      {
        label: 'Reset to Defaults',
        variant: 'secondary' as const,
        onClick: () => setShowResetDialog(true),
      },
      {
        label: 'Save Changes',
        variant: 'primary' as const,
        onClick: () => void handleSaveGeneral(),
        disabled: !generalDirty || generalUpdate.isPending,
      },
    ],
    [handleSaveGeneral, generalDirty, generalUpdate.isPending]
  );

  const duplicateRules = (duplicateRulesQuery.data ?? []) as CaseDuplicateRuleInput[];
  const requiredFields = (requiredFieldsQuery.data ?? []) as CaseRequiredFieldInput[];
  const tags = (tagsQuery.data ?? []) as Array<{
    id: string;
    name: string;
    colorToken: CaseTagColorToken;
    description: string | null;
  }>;
  const automation = (automationQuery.data ?? null) as CaseAutomationSettingsInput | null;

  const toggleDuplicateActive = (idx: number, next: boolean) => {
    const rules = duplicateRules.map((r, i) => (i === idx ? { ...r, isActive: next } : r));
    duplicateRulesUpdate.mutate({ rules });
  };

  const toggleRequiredField = (fieldKey: CaseRequiredFieldInput['fieldKey'], next: boolean) => {
    const fields = requiredFields.map((f) =>
      f.fieldKey === fieldKey ? { ...f, isRequired: next } : f
    );
    if (!fields.find((f) => f.fieldKey === fieldKey)) {
      fields.push({ fieldKey, isRequired: next });
    }
    requiredFieldsUpdate.mutate({ fields });
  };

  const toggleAutomation = (key: keyof CaseAutomationSettingsInput, next: boolean) => {
    if (!automation) return;
    automationUpdate.mutate({ ...automation, [key]: next } as CaseAutomationSettingsInput);
  };

  if (authLoading || generalQuery.isLoading) {
    return (
      <div className="w-full animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3 mb-4" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {[7, 5, 12, 6, 6, 12, 6, 6, 12].map((span, i) => (
            <div key={i} className={`lg:col-span-${span} h-40 bg-muted rounded`} />
          ))}
        </div>
      </div>
    );
  }

  if (generalQuery.error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
        <p className="text-sm text-destructive">{generalQuery.error.message}</p>
        <button
          onClick={() => generalQuery.refetch()}
          className="px-4 py-2 text-sm rounded border border-border hover:bg-muted"
        >
          Retry
        </button>
      </div>
    );
  }

  const toggleClasses = (on: boolean) =>
    `relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      on ? 'bg-primary' : 'bg-muted-foreground/30'
    }`;
  const thumbClasses = (on: boolean) =>
    `inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
      on ? 'translate-x-6' : 'translate-x-1'
    }`;

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Cases', href: '/cases' },
          { label: 'Case Settings' },
        ]}
        title="Case Settings"
        description="Prefix, priority, auto-assign, duplicate rules, required fields, tags, automation & AI."
        actions={actions}
        className="mb-6"
      />

      <ConfirmationDialog
        open={showResetDialog}
        onOpenChange={setShowResetDialog}
        title="Reset General Case Settings?"
        description="This will restore case prefix, default priority, and auto-assign to factory defaults."
        confirmLabel="Reset to Defaults"
        variant="destructive"
        onConfirm={handleReset}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* Case Prefix */}
        <Card className="lg:col-span-7 p-4 sm:p-6">
          <SectionHeader
            icon="badge"
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            iconFg="text-blue-600 dark:text-blue-400"
            title="Case Prefix"
            description="Prefix added to case identifiers (e.g. CASE-0001)."
          />
          <div className="space-y-3">
            <label className="block text-sm font-medium" htmlFor="case-prefix">
              Case Prefix
            </label>
            <input
              id="case-prefix"
              type="text"
              value={general.casePrefix}
              onChange={(e) => changeGeneral('casePrefix', e.target.value.toUpperCase())}
              maxLength={20}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Uppercase letters, digits, and hyphens only. Max 20 characters.
            </p>
          </div>
        </Card>

        {/* Default Priority */}
        <Card className="lg:col-span-5 p-4 sm:p-6">
          <SectionHeader
            icon="priority_high"
            iconBg="bg-amber-100 dark:bg-amber-900/30"
            iconFg="text-amber-600 dark:text-amber-400"
            title="Default Priority"
            description="Priority assigned to new cases when not explicitly set."
          />
          <div className="space-y-3">
            <label className="block text-sm font-medium" htmlFor="default-priority">
              Default Priority
            </label>
            <select
              id="default-priority"
              value={general.defaultPriority}
              onChange={(e) =>
                changeGeneral(
                  'defaultPriority',
                  e.target.value as CaseSettingsInput['defaultPriority']
                )
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
        </Card>

        {/* Auto-Assign */}
        <Card className="lg:col-span-12 p-4 sm:p-6">
          <SectionHeader
            icon="person_add"
            iconBg="bg-green-100 dark:bg-green-900/30"
            iconFg="text-green-600 dark:text-green-400"
            title="Auto-Assign"
            description="Automatically assign new cases to a specific team member."
          />
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                role="switch"
                aria-checked={general.autoAssignEnabled}
                aria-label="Enable auto-assign"
                onClick={() => {
                  const next = !general.autoAssignEnabled;
                  changeGeneral('autoAssignEnabled', next);
                  if (!next) changeGeneral('autoAssignUserId', null);
                }}
                className={toggleClasses(general.autoAssignEnabled)}
              >
                <span className={thumbClasses(general.autoAssignEnabled)} />
              </button>
              <span className="text-sm font-medium">Enable Auto-Assign</span>
            </div>

            {general.autoAssignEnabled && (
              <div className="space-y-2">
                <label className="block text-sm font-medium" htmlFor="auto-assign-user-search">
                  Assign To
                </label>
                <input
                  id="auto-assign-user-search"
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search team members…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                {usersQuery.data &&
                  'users' in usersQuery.data &&
                  (usersQuery.data as { users: unknown[] }).users.length > 0 && (
                    <ul className="rounded-md border border-border bg-popover shadow-md mt-1 max-h-48 overflow-y-auto">
                      {(
                        usersQuery.data as {
                          users: { id: string; name?: string | null; email: string }[];
                        }
                      ).users.map((u) => (
                        <li key={u.id}>
                          <button
                            type="button"
                            onClick={() => {
                              changeGeneral('autoAssignUserId', u.id);
                              setUserSearch(u.name ?? u.email);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${
                              general.autoAssignUserId === u.id ? 'bg-accent font-medium' : ''
                            }`}
                          >
                            {u.name ?? u.email}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                {generalQuery.data?.autoAssignUserId && !generalQuery.data.autoAssignUser && (
                  <p className="text-xs text-muted-foreground">(user removed)</p>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Duplicate Detection */}
        <Card className="lg:col-span-6 p-4 sm:p-6">
          <SectionHeader
            icon="content_copy"
            iconBg="bg-violet-100 dark:bg-violet-900/30"
            iconFg="text-violet-600 dark:text-violet-400"
            title="Duplicate Detection"
            description="Rules that fire when a new case matches an existing one."
          />
          <div className="space-y-2">
            {duplicateRules.length === 0 && (
              <p className="text-sm text-muted-foreground">No rules configured.</p>
            )}
            {duplicateRules.map((r, idx) => (
              <div
                key={`${r.field}-${r.matchStrategy}`}
                className="flex items-center gap-3 rounded-md border border-border bg-background p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium capitalize">
                    {r.field} · {r.matchStrategy}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">{r.collisionAction}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={r.isActive}
                  aria-label={`Toggle rule ${r.field} ${r.matchStrategy}`}
                  onClick={() => toggleDuplicateActive(idx, !r.isActive)}
                  className={toggleClasses(r.isActive)}
                >
                  <span className={thumbClasses(r.isActive)} />
                </button>
              </div>
            ))}
          </div>
        </Card>

        {/* Required Fields */}
        <Card className="lg:col-span-6 p-4 sm:p-6">
          <SectionHeader
            icon="rule"
            iconBg="bg-rose-100 dark:bg-rose-900/30"
            iconFg="text-rose-600 dark:text-rose-400"
            title="Required Fields"
            description="Force these fields to be set when a case is created."
          />
          <div className="space-y-2">
            {REQUIRED_FIELD_KEYS.map((key) => {
              const current = requiredFields.find((f) => f.fieldKey === key);
              const isRequired = current?.isRequired ?? false;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-md border border-border bg-background p-3"
                >
                  <span className="text-sm font-medium">{key}</span>
                  <button
                    role="switch"
                    aria-checked={isRequired}
                    aria-label={`Require ${key}`}
                    onClick={() => toggleRequiredField(key, !isRequired)}
                    className={toggleClasses(isRequired)}
                  >
                    <span className={thumbClasses(isRequired)} />
                  </button>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Tags */}
        <Card className="lg:col-span-12 p-4 sm:p-6">
          <SectionHeader
            icon="sell"
            iconBg="bg-teal-100 dark:bg-teal-900/30"
            iconFg="text-teal-600 dark:text-teal-400"
            title="Tags"
            description="Shared case tag library with color tokens."
          />
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {tags.length === 0 && <p className="text-sm text-muted-foreground">No tags yet.</p>}
              {tags.map((t) => (
                <span
                  key={t.id}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                    TAG_COLOR_CLASSES[t.colorToken]
                  }`}
                >
                  {t.name}
                  <button
                    aria-label={`Delete tag ${t.name}`}
                    onClick={() => tagDelete.mutate({ id: t.id })}
                    className="material-symbols-outlined text-[14px] opacity-60 hover:opacity-100"
                  >
                    close
                  </button>
                </span>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-2">
              <input
                aria-label="New tag name"
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="New tag name"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                maxLength={50}
              />
              <select
                aria-label="New tag color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value as CaseTagColorToken)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {TAG_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  if (!newTagName.trim()) return;
                  tagCreate.mutate({ name: newTagName.trim(), colorToken: newTagColor });
                }}
                disabled={tagCreate.isPending || !newTagName.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Add Tag
              </button>
            </div>
          </div>
        </Card>

        {/* Automation */}
        <Card className="lg:col-span-6 p-4 sm:p-6">
          <SectionHeader
            icon="bolt"
            iconBg="bg-amber-100 dark:bg-amber-900/30"
            iconFg="text-amber-600 dark:text-amber-400"
            title="Automation"
            description="Workflow and notification automations for cases."
          />
          <div className="space-y-2">
            {(
              [
                ['autoEscalateOverdue', 'Auto-escalate overdue cases'],
                ['notifyOnAssignmentChange', 'Notify on assignment change'],
                ['notifyOnDeadlineApproaching', 'Notify on deadline approaching'],
                ['notifyOnStatusChange', 'Notify on status change'],
                ['notifyOnDuplicate', 'Notify on duplicate detection'],
                ['restrictTagCreationToAdmins', 'Restrict tag creation to admins'],
                ['preventDeleteWithOpenTasks', 'Prevent delete with open tasks'],
              ] as const
            ).map(([key, label]) => {
              const on = automation ? automation[key] : false;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-md border border-border bg-background p-3"
                >
                  <span className="text-sm">{label}</span>
                  <button
                    role="switch"
                    aria-checked={on}
                    aria-label={label}
                    onClick={() => toggleAutomation(key, !on)}
                    disabled={!automation}
                    className={toggleClasses(on)}
                  >
                    <span className={thumbClasses(on)} />
                  </button>
                </div>
              );
            })}
          </div>
        </Card>

        {/* AI & Intelligence */}
        <Card className="lg:col-span-6 p-4 sm:p-6">
          <SectionHeader
            icon="auto_awesome"
            iconBg="bg-violet-100 dark:bg-violet-900/30"
            iconFg="text-violet-600 dark:text-violet-400"
            title="AI & Intelligence"
            description="Opt-in AI assists for case triage and summarization. Default OFF."
          />
          <div className="space-y-2">
            {(
              [
                ['aiCaseSummarization', 'Case summarization'],
                ['aiPriorityPrediction', 'Priority prediction'],
                ['aiResolutionSuggestion', 'Resolution suggestion'],
                ['aiTagSuggestions', 'Tag suggestions'],
                ['aiInsightGeneration', 'Insight generation'],
              ] as const
            ).map(([key, label]) => {
              const on = automation ? automation[key] : false;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-md border border-border bg-background p-3"
                >
                  <span className="text-sm">{label}</span>
                  <button
                    role="switch"
                    aria-checked={on}
                    aria-label={label}
                    onClick={() => toggleAutomation(key, !on)}
                    disabled={!automation}
                    className={toggleClasses(on)}
                  >
                    <span className={thumbClasses(on)} />
                  </button>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Configuration Summary */}
        <Card className="lg:col-span-12 p-4 sm:p-6">
          <SectionHeader
            icon="summarize"
            iconBg="bg-slate-100 dark:bg-slate-800"
            iconFg="text-slate-600 dark:text-slate-400"
            title="Configuration Summary"
            description="Current active case settings at a glance."
          />
          <dl className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Case Prefix</dt>
              <dd className="font-medium">{generalQuery.data?.casePrefix ?? general.casePrefix}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Default Priority</dt>
              <dd className="font-medium capitalize">
                {(generalQuery.data?.defaultPriority ?? general.defaultPriority).toLowerCase()}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Auto-Assign</dt>
              <dd className="font-medium">
                {(() => {
                  if (!generalQuery.data?.autoAssignEnabled) return 'Disabled';
                  const user = generalQuery.data.autoAssignUser;
                  return user ? (user.name ?? user.email) : 'Enabled (no user)';
                })()}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Active Rules / Tags</dt>
              <dd className="font-medium">
                {duplicateRules.filter((r) => r.isActive).length} rules · {tags.length} tags
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
