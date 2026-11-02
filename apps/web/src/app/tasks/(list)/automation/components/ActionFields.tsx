'use client';

// Rule dialog — Actions fieldset (PG-208). Actions run in a fixed order: Create
// Task (always), then optionally Assign Round-Robin, then optionally Notify, so a
// rule can never repeat an action type (AC-TA-003).

import type { ReactNode } from 'react';
import { TASK_AUTOMATION_LIMITS } from '@intelliflow/domain';
import { Checkbox, Input, Label, Textarea } from '@intelliflow/ui';
import { VariablePicker, type VariableSuggestion } from '@/components/shared/variable-picker';
import { PrioritySelect } from '@/components/shared/priority-select';
import { MemberMultiSelect, type MemberOption } from '@/components/shared/member-multi-select';
import { ACTION_TYPE_LABELS, dueDateHelp } from '../task-automation-labels';
import type { RuleFormErrors, RuleFormState } from './rule-form';
import { FieldError, errorProps } from '@/components/shared/field-error';

const L = TASK_AUTOMATION_LIMITS;

export interface ActionFieldsProps {
  readonly form: RuleFormState;
  readonly onChange: (patch: Partial<RuleFormState>) => void;
  readonly errors: RuleFormErrors;
  readonly variables: VariableSuggestion[];
  readonly members: MemberOption[];
  readonly membersLoading?: boolean;
  readonly membersError?: boolean;
}

function ActionCard({
  step,
  title,
  children,
}: Readonly<{ step: number; title: string; children: ReactNode }>) {
  return (
    <div className="space-y-3 rounded-md bg-muted/40 p-3">
      <p className="text-sm font-medium text-foreground">
        {step}. {title}
      </p>
      {children}
    </div>
  );
}

function CheckField({
  id,
  label,
  checked,
  onChange,
  describedBy,
}: Readonly<{
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  describedBy?: string;
}>) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        aria-describedby={describedBy}
      />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}

const VARIABLE_HELP = 'Filled in when the rule runs. Unknown variables are left empty.';
const NO_VARIABLES = 'This trigger has no variables.';

function CreateTaskFields({ form, onChange, errors, variables }: ActionFieldsProps) {
  const isEvent = form.triggerType === 'ENTITY_EVENT';
  return (
    <ActionCard step={1} title={ACTION_TYPE_LABELS.CREATE_TASK}>
      <div className="space-y-1.5">
        <Label htmlFor="rule-title">Task title</Label>
        <VariablePicker
          id="rule-title"
          insertLabel="Insert variable into Task title"
          value={form.titleTemplate}
          onChange={(titleTemplate) => onChange({ titleTemplate })}
          variables={variables}
          maxLength={L.titleMax}
          invalid={Boolean(errors.titleTemplate)}
          describedBy={errors.titleTemplate ? 'rule-title-error' : undefined}
          placeholder="Call {{record.name}}"
          helpText={VARIABLE_HELP}
          emptyText={NO_VARIABLES}
        />
        <FieldError id="rule-title-error" message={errors.titleTemplate} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rule-task-description">Task description (optional)</Label>
        <VariablePicker
          id="rule-task-description"
          insertLabel="Insert variable into Task description"
          multiline
          value={form.descriptionTemplate}
          onChange={(descriptionTemplate) => onChange({ descriptionTemplate })}
          variables={variables}
          maxLength={L.descriptionMax}
          invalid={Boolean(errors.descriptionTemplate)}
          describedBy={errors.descriptionTemplate ? 'rule-task-description-error' : undefined}
          helpText={VARIABLE_HELP}
          emptyText={NO_VARIABLES}
        />
        <FieldError id="rule-task-description-error" message={errors.descriptionTemplate} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <span aria-hidden="true" className="text-sm font-medium">
            Priority
          </span>
          <PrioritySelect
            ariaLabel="Priority"
            value={form.priority}
            onChange={(priority) => {
              if (priority) onChange({ priority });
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rule-due">Due in days (optional)</Label>
          <Input
            id="rule-due"
            inputMode="numeric"
            value={form.dueInDays}
            onChange={(e) => onChange({ dueInDays: e.target.value })}
            aria-invalid={errors.dueInDays ? true : undefined}
            aria-describedby={errors.dueInDays ? 'rule-due-help rule-due-error' : 'rule-due-help'}
          />
          <p id="rule-due-help" className="text-xs text-muted-foreground">
            {dueDateHelp(form.triggerType)}
          </p>
          <FieldError id="rule-due-error" message={errors.dueInDays} />
        </div>
      </div>
      {isEvent && (
        <CheckField
          id="rule-link"
          label="Link the task to the record"
          checked={form.linkToRecord}
          onChange={(linkToRecord) => onChange({ linkToRecord })}
        />
      )}
    </ActionCard>
  );
}

function AssignFields({
  form,
  onChange,
  errors,
  members,
  membersLoading,
  membersError,
}: ActionFieldsProps) {
  return (
    <ActionCard step={2} title={ACTION_TYPE_LABELS.ASSIGN_ROUND_ROBIN}>
      <CheckField
        id="rule-assign-enabled"
        label="Assign the task in turn to a group"
        checked={form.assignEnabled}
        onChange={(assignEnabled) => onChange({ assignEnabled })}
      />
      {form.assignEnabled && (
        <div className="space-y-1.5">
          <Label htmlFor="rule-assign-pool">Assign in turn to</Label>
          <MemberMultiSelect
            id="rule-assign-pool"
            legend="Assign in turn to"
            label="Assign in turn to"
            options={members}
            selectedIds={form.assignUserIds}
            onChange={(assignUserIds) => onChange({ assignUserIds })}
            isLoading={membersLoading}
            isError={membersError}
            invalid={Boolean(errors.assignUserIds)}
            describedBy={errors.assignUserIds ? 'rule-assign-pool-error' : undefined}
          />
          <p className="text-xs text-muted-foreground">
            Tasks go to these people in the order picked. If none of them is available, the task
            stays with its owner.
          </p>
          <FieldError id="rule-assign-pool-error" message={errors.assignUserIds} />
        </div>
      )}
    </ActionCard>
  );
}

function NotifyFields({
  form,
  onChange,
  errors,
  members,
  membersLoading,
  membersError,
}: ActionFieldsProps) {
  const recipientsError = errors.notifyRecipients;
  const describedBy = recipientsError ? 'rule-notify-error' : undefined;
  return (
    <ActionCard step={form.assignEnabled ? 3 : 2} title={ACTION_TYPE_LABELS.NOTIFY}>
      <CheckField
        id="rule-notify-enabled"
        label="Send an in-app notification"
        checked={form.notifyEnabled}
        onChange={(notifyEnabled) => onChange({ notifyEnabled })}
      />
      {form.notifyEnabled && (
        <>
          <fieldset className="space-y-2" aria-describedby={describedBy}>
            <legend className="text-sm font-medium">Notify</legend>
            <CheckField
              id="rule-notify-assignee"
              label="The task assignee"
              checked={form.notifyAssignee}
              onChange={(notifyAssignee) => onChange({ notifyAssignee })}
            />
            <CheckField
              id="rule-notify-owner"
              label="The task owner"
              checked={form.notifyOwner}
              onChange={(notifyOwner) => onChange({ notifyOwner })}
            />
            <div className="space-y-1.5">
              <Label htmlFor="rule-notify-users">Also notify</Label>
              <MemberMultiSelect
                id="rule-notify-users"
                legend="Also notify"
                label="Also notify"
                options={members}
                selectedIds={form.notifyUserIds}
                onChange={(notifyUserIds) => onChange({ notifyUserIds })}
                isLoading={membersLoading}
                isError={membersError}
                invalid={Boolean(recipientsError)}
                describedBy={describedBy}
              />
            </div>
            <FieldError id="rule-notify-error" message={recipientsError} alert />
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="rule-notify-message">Message (optional)</Label>
            <Textarea
              id="rule-notify-message"
              rows={2}
              maxLength={L.messageMax}
              value={form.notifyMessage}
              onChange={(e) => onChange({ notifyMessage: e.target.value })}
              {...errorProps('rule-notify-message', errors.notifyMessage)}
            />
            <FieldError id="rule-notify-message-error" message={errors.notifyMessage} />
          </div>
        </>
      )}
    </ActionCard>
  );
}

export function ActionFields(props: ActionFieldsProps) {
  return (
    <fieldset
      className="space-y-3 rounded-lg border border-border p-4"
      aria-describedby={props.errors.actions ? 'rule-actions-error' : 'rule-actions-help'}
    >
      <legend className="px-1 text-sm font-semibold text-foreground">Actions</legend>
      <p id="rule-actions-help" className="text-xs text-muted-foreground">
        Actions run in this order. Runs over the hourly limit are skipped and counted on the rule.
      </p>
      {props.errors.actions && (
        <p id="rule-actions-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
          {props.errors.actions}
        </p>
      )}
      <CreateTaskFields {...props} />
      <AssignFields {...props} />
      <NotifyFields {...props} />
    </fieldset>
  );
}
