'use client';

// Rule dialog — PG-208. Name, description and tags, then the Trigger and Actions
// fieldsets. Validation is the shared validator (rule-form.ts); a server
// refusal (CONFLICT for a duplicate active rule, limits) is shown inline.

import { useMemo, useRef, useState, type FormEvent } from 'react';
import type { TaskAutomationEventType } from '@intelliflow/domain';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@intelliflow/ui';
import type { CreateTaskAutomationRuleInput, TaskAutomationTagView } from '@intelliflow/validators';
import type { MemberOption } from '@/components/shared/member-multi-select';
import { swatchClass } from '@/lib/color-tokens';
import { variablesForTrigger, type EventOption, type RuleItem } from '../task-automation-labels';
import { TriggerFields } from './TriggerFields';
import { ActionFields } from './ActionFields';
import { FieldError, errorProps } from '@/components/shared/field-error';
import {
  duplicateRuleName,
  emptyRuleForm,
  formToInput,
  ruleToForm,
  validateRuleForm,
  type RuleFormErrors,
  type RuleFormState,
} from './rule-form';

export interface AutomationRuleDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** null = create. */
  readonly rule: RuleItem | null;
  readonly rules: readonly RuleItem[];
  readonly events: readonly EventOption[];
  readonly tags: readonly TaskAutomationTagView[];
  readonly members: MemberOption[];
  readonly membersLoading?: boolean;
  readonly membersError?: boolean;
  readonly canManageWebhooks: boolean;
  readonly defaultTimezone: string;
  readonly isSaving: boolean;
  /** Server refusal for the last save, shown in the dialog. */
  readonly serverError: string | null;
  readonly maxTags: number;
  readonly onSubmit: (input: CreateTaskAutomationRuleInput, id: string | null) => Promise<void>;
}

const FIRST_EVENT: TaskAutomationEventType = 'lead.created';
/** Focusable controls only (a fieldset can carry aria-invalid but cannot take focus). */
const FIRST_INVALID = ['input', 'textarea', 'button', 'select']
  .map((tag) => `${tag}[aria-invalid="true"]`)
  .join(',');

function TagPicker({
  tags,
  selected,
  max,
  onChange,
  error,
}: Readonly<{
  tags: readonly TaskAutomationTagView[];
  selected: string[];
  max: number;
  onChange: (tags: string[]) => void;
  error?: string;
}>) {
  const chosen = new Set(selected.map((t) => t.toLowerCase()));
  const toggle = (name: string, on: boolean) =>
    onChange(
      on ? [...selected, name] : selected.filter((t) => t.toLowerCase() !== name.toLowerCase())
    );
  return (
    <fieldset className="space-y-2" {...errorProps('rule-tags', error)}>
      <legend className="text-sm font-medium">Tags (optional)</legend>
      {tags.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No tags yet. Create them in the Tags card, then pick them here.
        </p>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {tags.map((tag) => {
            const isOn = chosen.has(tag.name.toLowerCase());
            return (
              <div key={tag.id} className="flex items-center gap-2">
                <Checkbox
                  id={`rule-tag-${tag.id}`}
                  checked={isOn}
                  disabled={!isOn && selected.length >= max}
                  onCheckedChange={(v) => toggle(tag.name, v === true)}
                />
                <Label
                  htmlFor={`rule-tag-${tag.id}`}
                  className="flex items-center gap-1.5 font-normal"
                >
                  <span
                    aria-hidden="true"
                    className={`inline-block h-2.5 w-2.5 rounded-full ${swatchClass(tag.colorToken)}`}
                  />
                  {tag.name}
                </Label>
              </div>
            );
          })}
        </div>
      )}
      <FieldError id="rule-tags-error" message={error} alert />
    </fieldset>
  );
}

export function AutomationRuleDialog({
  open,
  onOpenChange,
  rule,
  rules,
  events,
  tags,
  members,
  membersLoading,
  membersError,
  canManageWebhooks,
  defaultTimezone,
  isSaving,
  serverError,
  maxTags,
  onSubmit,
}: AutomationRuleDialogProps) {
  const [form, setForm] = useState<RuleFormState>(() =>
    rule
      ? ruleToForm(rule, defaultTimezone, FIRST_EVENT)
      : emptyRuleForm(defaultTimezone, FIRST_EVENT)
  );
  const [errors, setErrors] = useState<RuleFormErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const patch = (next: Partial<RuleFormState>) => setForm((f) => ({ ...f, ...next }));

  const duplicateOf = useMemo(
    () => duplicateRuleName(formToInput(form), rules, rule?.id ?? null),
    [form, rules, rule]
  );
  const variables = variablesForTrigger({ type: form.triggerType, eventType: form.eventType });
  const isEdit = rule !== null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const { input, errors: next } = validateRuleForm(form);
    setErrors(next);
    if (!input) {
      // After the errors render, move focus to the first invalid focusable field.
      setTimeout(() => formRef.current?.querySelector<HTMLElement>(FIRST_INVALID)?.focus(), 0);
      return;
    }
    try {
      await onSubmit(input, rule?.id ?? null);
    } catch {
      // The parent shows the refusal as serverError; keep the dialog and its input.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Rule' : 'New Rule'}</DialogTitle>
          <DialogDescription>
            A rule watches one trigger and runs its actions. Changes apply to events after you save.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
          <fieldset disabled={isSaving} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rule-name">Name</Label>
              <Input
                id="rule-name"
                value={form.name}
                maxLength={80}
                onChange={(e) => patch({ name: e.target.value })}
                {...errorProps('rule-name', errors.name)}
              />
              <FieldError id="rule-name-error" message={errors.name} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-description">Description (optional)</Label>
              <Textarea
                id="rule-description"
                rows={2}
                maxLength={500}
                value={form.description}
                onChange={(e) => patch({ description: e.target.value })}
                {...errorProps('rule-description', errors.description)}
              />
              <FieldError id="rule-description-error" message={errors.description} />
            </div>
            <TagPicker
              tags={tags}
              selected={form.tags}
              max={maxTags}
              onChange={(next) => patch({ tags: next })}
              error={errors.tags}
            />
            <TriggerFields
              form={form}
              onChange={patch}
              errors={errors}
              events={events}
              typeLocked={isEdit}
              canManageWebhooks={canManageWebhooks}
            />
            <ActionFields
              form={form}
              onChange={patch}
              errors={errors}
              variables={variables}
              members={members}
              membersLoading={membersLoading}
              membersError={membersError}
            />
          </fieldset>
          {/* Always mounted, so a warning that appears is announced. */}
          <output aria-live="polite" className="block text-sm text-amber-700 dark:text-amber-400">
            {duplicateOf &&
              `The active rule “${duplicateOf}” already does this. Turn one of them off or change the trigger or actions.`}
          </output>
          {serverError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save Rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
