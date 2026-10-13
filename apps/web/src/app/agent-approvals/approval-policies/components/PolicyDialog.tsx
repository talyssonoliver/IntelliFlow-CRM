'use client';

/**
 * Create / edit an approval policy (PG-198, AC-003/004/018/020/021). Save is
 * disabled until the draft differs from its snapshot, while saving, and while a
 * conflict is shown (playbook §3). Turning auto-approval on asks for
 * confirmation first; cancelling leaves it off (AC-020).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  ConfirmationDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@intelliflow/ui';
import { APPROVER_ROLES, type ApprovalPolicyScope, type ApproverRole } from '@intelliflow/domain';
import { ACCOUNT_TAG_COLOR_TOKENS, type AccountTagColorToken } from '@intelliflow/validators';
import { COLOR_SWATCH_CLASSES, toColorToken } from '@/lib/color-tokens';
import {
  AssignmentsEditor,
  findAssignmentIssues,
  newAssignmentDraft,
  type AssignmentDraft,
} from './AssignmentsEditor';
import {
  ROLE_LABELS,
  SCOPE_META,
  formatMinutes,
  hasFormerTarget,
  type PolicyRow,
  type PolicySaveInput,
} from './policy-model';

export interface PolicyLimits {
  nameMaxLength: number;
  descriptionMaxLength: number;
  timeoutMinutes: { min: number; max: number };
  escalateAfterMinutes: { min: number };
  autoApproveThreshold: { min: number; max: number };
  maxAssignments: number;
}

export interface MemberOption {
  id: string;
  name: string;
}

export interface PolicyDraft {
  name: string;
  description: string;
  colorToken: AccountTagColorToken;
  timeoutMinutes: string;
  minReviewerRole: ApproverRole;
  autoApproveEnabled: boolean;
  autoApproveMinConfidence: string;
  escalationEnabled: boolean;
  escalateAfterMinutes: string;
  escalationTargetUserId: string | null;
  assignments: AssignmentDraft[];
}

const NO_TARGET = '__none__';
const DEFAULT_THRESHOLD = '95';

export function draftFromPolicy(
  policy: PolicyRow | null,
  defaultTimeoutMinutes: number
): PolicyDraft {
  if (!policy) {
    return {
      name: '',
      description: '',
      colorToken: 'slate',
      timeoutMinutes: String(defaultTimeoutMinutes),
      minReviewerRole: 'USER',
      autoApproveEnabled: false,
      autoApproveMinConfidence: '',
      escalationEnabled: false,
      escalateAfterMinutes: '',
      escalationTargetUserId: null,
      assignments: [],
    };
  }
  return {
    name: policy.name,
    description: policy.description ?? '',
    colorToken: toColorToken(policy.colorToken),
    timeoutMinutes: String(policy.timeoutMinutes),
    minReviewerRole: policy.minReviewerRole,
    autoApproveEnabled: policy.autoApproveEnabled,
    autoApproveMinConfidence:
      policy.autoApproveMinConfidence === null ? '' : String(policy.autoApproveMinConfidence),
    escalationEnabled: policy.escalationEnabled,
    escalateAfterMinutes:
      policy.escalateAfterMinutes === null ? '' : String(policy.escalateAfterMinutes),
    escalationTargetUserId: policy.escalationTargetUserId,
    assignments: policy.assignments.map((a) => newAssignmentDraft(a)),
  };
}

function fingerprint(draft: PolicyDraft): string {
  return JSON.stringify({
    ...draft,
    name: draft.name.trim(),
    description: draft.description.trim(),
    assignments: draft.assignments.map((a) => [a.agentKey, a.actionType]),
  });
}

function toInt(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}

export function toSaveInput(
  draft: PolicyDraft,
  scope: ApprovalPolicyScope,
  isDefault: boolean
): PolicySaveInput {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    colorToken: draft.colorToken,
    scope,
    isDefault,
    timeoutMinutes: toInt(draft.timeoutMinutes) ?? 0,
    minReviewerRole: draft.minReviewerRole,
    autoApproveEnabled: draft.autoApproveEnabled,
    autoApproveMinConfidence: draft.autoApproveEnabled
      ? toInt(draft.autoApproveMinConfidence)
      : null,
    escalationEnabled: draft.escalationEnabled,
    escalateAfterMinutes: draft.escalationEnabled ? toInt(draft.escalateAfterMinutes) : null,
    escalationTargetUserId: draft.escalationEnabled ? draft.escalationTargetUserId : null,
    assignments: draft.assignments.map(({ agentKey, actionType }) => ({ agentKey, actionType })),
  };
}

export type FieldErrors = Partial<
  Record<'name' | 'timeout' | 'threshold' | 'delay' | 'target', string>
>;

/** Field errors keyed by field; empty when the draft can be saved. */
export function findFieldErrors(
  draft: PolicyDraft,
  limits: PolicyLimits,
  otherNames: readonly string[]
): FieldErrors {
  const errors: FieldErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'Enter a name.';
  else if (otherNames.some((other) => other.toLowerCase() === name.toLowerCase())) {
    errors.name = `A policy named “${name}” already exists for this queue.`;
  }
  const timeout = toInt(draft.timeoutMinutes);
  const { min, max } = limits.timeoutMinutes;
  if (timeout === null || timeout < min || timeout > max) {
    errors.timeout = `Enter whole minutes from ${min} to ${max} (${formatMinutes(max)}).`;
  }
  if (draft.autoApproveEnabled) {
    const threshold = toInt(draft.autoApproveMinConfidence);
    const range = limits.autoApproveThreshold;
    if (threshold === null || threshold < range.min || threshold > range.max) {
      errors.threshold = `Enter a whole percent from ${range.min} to ${range.max}.`;
    }
  }
  if (draft.escalationEnabled) {
    const delay = toInt(draft.escalateAfterMinutes);
    const floor = limits.escalateAfterMinutes.min;
    if (delay === null || delay < floor) {
      errors.delay = `Enter at least ${floor} minutes.`;
    } else if (timeout !== null && delay >= timeout) {
      errors.delay = 'Escalate before the approval times out.';
    }
    if (!draft.escalationTargetUserId) errors.target = 'Choose who receives escalations.';
  }
  return errors;
}

type SetField = <K extends keyof PolicyDraft>(key: K, value: PolicyDraft[K]) => void;

function AutoApproveFields({
  draft,
  set,
  error,
  limits,
  onRequestEnable,
}: Readonly<{
  draft: PolicyDraft;
  set: SetField;
  error: string | undefined;
  limits: PolicyLimits;
  onRequestEnable: () => void;
}>) {
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="policy-auto-approve">Auto-approve high-confidence items</Label>
        <Switch
          id="policy-auto-approve"
          checked={draft.autoApproveEnabled}
          onCheckedChange={(checked) =>
            checked ? onRequestEnable() : set('autoApproveEnabled', false)
          }
          aria-describedby="policy-auto-approve-help"
        />
      </div>
      <p id="policy-auto-approve-help" className="text-xs text-muted-foreground">
        Off by default. Only items whose model confidence is above the threshold, requested by
        someone allowed to approve them, run without a review. High-impact and delete actions always
        wait for a person.
      </p>
      {draft.autoApproveEnabled && (
        <div className="space-y-1.5">
          <Label htmlFor="policy-threshold">Confidence threshold (%)</Label>
          <div className="flex items-center gap-2">
            <Input
              id="policy-threshold"
              inputMode="numeric"
              className="w-24"
              value={draft.autoApproveMinConfidence}
              onChange={(e) => set('autoApproveMinConfidence', e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby="policy-threshold-help"
            />
            <span className="text-sm text-muted-foreground" aria-hidden="true">
              %
            </span>
          </div>
          <p
            id="policy-threshold-help"
            className={`text-xs ${error ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground'}`}
          >
            {error ??
              `Confidence must be strictly above this (${limits.autoApproveThreshold.min}–${limits.autoApproveThreshold.max}).`}
          </p>
        </div>
      )}
    </div>
  );
}

function EscalationFields({
  draft,
  set,
  errors,
  formerTarget,
  targetOptions,
  membersLoading,
}: Readonly<{
  draft: PolicyDraft;
  set: SetField;
  errors: FieldErrors;
  formerTarget: boolean;
  targetOptions: MemberOption[];
  membersLoading?: boolean;
}>) {
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="policy-escalation">Escalate when nobody decides</Label>
        <Switch
          id="policy-escalation"
          checked={draft.escalationEnabled}
          onCheckedChange={(checked) => set('escalationEnabled', checked)}
        />
      </div>
      {formerTarget && (
        <p className="text-xs text-amber-700 dark:text-amber-400" role="note">
          The escalation target (former user) no longer exists. Escalation is inactive until you
          choose a new target.
        </p>
      )}
      {draft.escalationEnabled && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="policy-delay">Escalate after (minutes)</Label>
            <Input
              id="policy-delay"
              inputMode="numeric"
              value={draft.escalateAfterMinutes}
              onChange={(e) => set('escalateAfterMinutes', e.target.value)}
              aria-invalid={errors.delay ? true : undefined}
              aria-describedby={errors.delay ? 'policy-delay-error' : undefined}
            />
            {errors.delay && (
              <p id="policy-delay-error" className="text-xs text-red-700 dark:text-red-400">
                {errors.delay}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="policy-target">Escalate to</Label>
            <Select
              value={draft.escalationTargetUserId ?? NO_TARGET}
              onValueChange={(value) =>
                set('escalationTargetUserId', value === NO_TARGET ? null : value)
              }
            >
              <SelectTrigger
                id="policy-target"
                aria-invalid={errors.target ? true : undefined}
                aria-describedby={errors.target ? 'policy-target-error' : undefined}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TARGET}>
                  {formerTarget ? '(former user)' : 'Choose a person'}
                </SelectItem>
                {targetOptions.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {membersLoading && (
              <output className="block text-xs text-muted-foreground">Loading people…</output>
            )}
            {errors.target && (
              <p id="policy-target-error" className="text-xs text-red-700 dark:text-red-400">
                {errors.target}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export interface PolicyDialogProps {
  open: boolean;
  scope: ApprovalPolicyScope;
  /** null = create. */
  policy: PolicyRow | null;
  /** A new policy becomes the queue default when the queue has none yet. */
  makeDefault: boolean;
  defaultTimeoutMinutes: number;
  /** Names of the other policies in this queue, for the duplicate-name check. */
  otherNames: string[];
  limits: PolicyLimits;
  members: MemberOption[];
  membersLoading?: boolean;
  isSaving: boolean;
  /** Resolves with the saved row; rejects with the reason shown inside the dialog. */
  onSave: (input: PolicySaveInput) => Promise<PolicyRow>;
  onClose: () => void;
}

export function PolicyDialog({
  open,
  scope,
  policy,
  makeDefault,
  defaultTimeoutMinutes,
  otherNames,
  limits,
  members,
  membersLoading,
  isSaving,
  onSave,
  onClose,
}: Readonly<PolicyDialogProps>) {
  const [snapshot, setSnapshot] = useState(() => draftFromPolicy(policy, defaultTimeoutMinutes));
  const [draft, setDraft] = useState(snapshot);
  const [confirmAutoApprove, setConfirmAutoApprove] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const next = draftFromPolicy(policy, defaultTimeoutMinutes);
    setSnapshot(next);
    setDraft(next);
    setNameTouched(false);
    setSaveError(null);
  }, [open, policy, defaultTimeoutMinutes]);

  const set = <K extends keyof PolicyDraft>(key: K, value: PolicyDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const errors = findFieldErrors(draft, limits, otherNames);
  const assignmentIssues = useMemo(
    () => findAssignmentIssues(draft.assignments),
    [draft.assignments]
  );
  const hasConflict = Object.keys(errors).length > 0 || assignmentIssues.length > 0;
  const isDirty = fingerprint(draft) !== fingerprint(snapshot);
  const isDefault = policy?.isDefault ?? makeDefault;
  const formerTarget = policy !== null && hasFormerTarget(policy) && !draft.escalationTargetUserId;

  // A stored target who is no longer an assignee still shows by name.
  const targetOptions = useMemo(() => {
    const target = policy?.escalationTarget;
    if (!target || members.some((m) => m.id === target.id)) return members;
    return [...members, { id: target.id, name: target.name }];
  }, [members, policy]);

  // A new policy's empty name is not an error until the field has been visited.
  const nameError = nameTouched || draft.name.trim() ? errors.name : undefined;

  const save = async () => {
    setSaveError(null);
    let saved: PolicyRow;
    try {
      saved = await onSave(toSaveInput(draft, scope, isDefault));
    } catch (error) {
      // Shown inside the dialog: the page's live region is aria-hidden while it is open.
      setSaveError(error instanceof Error ? error.message : 'Please try again.');
      return;
    }
    const refreshed = draftFromPolicy(saved, defaultTimeoutMinutes);
    setSnapshot(refreshed);
    setDraft(refreshed);
    onClose();
  };

  const timeout = toInt(draft.timeoutMinutes);
  const meta = SCOPE_META[scope];

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{policy ? `Edit ${policy.name}` : 'New Policy'}</DialogTitle>
            <DialogDescription>
              {meta.title}: how long an {meta.itemNoun} may wait, who may decide it, and what
              happens if nobody does.
              {isDefault ? ' This is the default policy for the queue.' : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="policy-name">
                  Name{' '}
                  <span className="text-red-700 dark:text-red-400" aria-hidden="true">
                    *
                  </span>
                </Label>
                <Input
                  id="policy-name"
                  value={draft.name}
                  maxLength={limits.nameMaxLength}
                  onChange={(e) => set('name', e.target.value)}
                  onBlur={() => setNameTouched(true)}
                  aria-required="true"
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? 'policy-name-error' : undefined}
                />
                {nameError && (
                  <p id="policy-name-error" className="text-xs text-red-700 dark:text-red-400">
                    {nameError}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="policy-color">Colour</Label>
                <Select
                  value={draft.colorToken}
                  onValueChange={(value) => set('colorToken', toColorToken(value))}
                >
                  <SelectTrigger id="policy-color">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TAG_COLOR_TOKENS.map((token) => (
                      <SelectItem key={token} value={token}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={`inline-block w-3 h-3 rounded-full ${COLOR_SWATCH_CLASSES[token]}`}
                            aria-hidden="true"
                          />
                          {token}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="policy-description">Description (optional)</Label>
              <Input
                id="policy-description"
                value={draft.description}
                maxLength={limits.descriptionMaxLength}
                onChange={(e) => set('description', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="policy-timeout">
                  Approval timeout (minutes){' '}
                  <span className="text-red-700 dark:text-red-400" aria-hidden="true">
                    *
                  </span>
                </Label>
                <Input
                  id="policy-timeout"
                  aria-required="true"
                  inputMode="numeric"
                  value={draft.timeoutMinutes}
                  onChange={(e) => set('timeoutMinutes', e.target.value)}
                  aria-invalid={errors.timeout ? true : undefined}
                  aria-describedby="policy-timeout-help"
                />
                <p
                  id="policy-timeout-help"
                  className={`text-xs ${errors.timeout ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground'}`}
                >
                  {errors.timeout ??
                    `Undecided ${meta.itemNoun}s expire after ${timeout === null ? '…' : formatMinutes(timeout)}.`}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="policy-role">Minimum reviewer</Label>
                <Select
                  value={draft.minReviewerRole}
                  onValueChange={(value) =>
                    set(
                      'minReviewerRole',
                      APPROVER_ROLES.find((role) => role === value) ?? draft.minReviewerRole
                    )
                  }
                >
                  <SelectTrigger id="policy-role" aria-describedby="policy-role-help">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPROVER_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p id="policy-role-help" className="text-xs text-muted-foreground">
                  In addition to the approval permission.
                </p>
              </div>
            </div>

            <AutoApproveFields
              draft={draft}
              set={set}
              error={errors.threshold}
              limits={limits}
              onRequestEnable={() => setConfirmAutoApprove(true)}
            />

            <EscalationFields
              draft={draft}
              set={set}
              errors={errors}
              formerTarget={formerTarget}
              targetOptions={targetOptions}
              membersLoading={membersLoading}
            />

            <AssignmentsEditor
              scope={scope}
              rows={draft.assignments}
              onChange={(rows) => set('assignments', rows)}
              issues={assignmentIssues}
              maxRows={limits.maxAssignments}
            />
          </div>

          {saveError && (
            <p className="text-sm text-red-700 dark:text-red-400" role="alert">
              Could not save the policy: {saveError}
            </p>
          )}
          {isDirty && hasConflict && (
            <p id="policy-save-hint" className="text-xs text-muted-foreground">
              Fix the highlighted fields to save.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={!isDirty || isSaving || hasConflict}
              aria-describedby={isDirty && hasConflict ? 'policy-save-hint' : undefined}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={confirmAutoApprove}
        onOpenChange={setConfirmAutoApprove}
        title="Turn on auto-approval?"
        description={`Items whose model confidence is above the threshold (default ${DEFAULT_THRESHOLD}%) will execute without a human review. High-impact and delete actions still wait for a person.`}
        confirmLabel="Turn On"
        onConfirm={() => {
          setDraft((current) => ({
            ...current,
            autoApproveEnabled: true,
            autoApproveMinConfidence: current.autoApproveMinConfidence || DEFAULT_THRESHOLD,
          }));
          setConfirmAutoApprove(false);
        }}
      />
    </>
  );
}
