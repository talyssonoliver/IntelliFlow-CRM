'use client';

/**
 * Create / edit a case type (PG-204). Save is disabled until the draft differs
 * from its snapshot, while saving, and while a conflict is shown (duplicate or
 * empty name, invalid SLA, blank or duplicate checklist step). A server
 * CONFLICT on the name is shown under the field (`role="alert"`) and focused.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
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
  RadioGroup,
  RadioGroupItem,
  Switch,
} from '@intelliflow/ui';
import {
  CASE_REQUIRED_FIELD_KEYS,
  CASE_TYPE_LIMITS,
  type CasePriority,
  type CaseRequiredFieldKey,
} from '@intelliflow/domain';
import {
  CASE_TAG_COLOR_TOKENS,
  findDuplicateCaseTypeName,
  type CaseTagColorToken,
  type CaseTypeDto,
} from '@intelliflow/validators';
import { PrioritySelect } from '@/components/shared/priority-select';
import {
  CASE_TYPE_COLOR_LABELS,
  CASE_TYPE_SWATCH_CLASSES,
  toCaseTypeColorToken,
} from '@/components/cases/case-type-colors';
import { REQUIRED_FIELD_LABELS } from '@/components/cases/case-type-labels';
import {
  ResolutionChecklistEditor,
  newChecklistItem,
  type ChecklistDraftItem,
} from './ResolutionChecklistEditor';

/**
 * Every key a type can store gets a checkbox, so what is saved is always what is shown:
 * nothing changes unless someone ticks or unticks it.
 */
export const REQUIRED_KEY_CHOICES: readonly CaseRequiredFieldKey[] = CASE_REQUIRED_FIELD_KEYS;

export interface CaseTypeDraft {
  name: string;
  category: string;
  colorToken: CaseTagColorToken;
  defaultPriority: CasePriority | null;
  slaDays: string;
  requiredFields: CaseRequiredFieldKey[];
  checklist: ChecklistDraftItem[];
  isActive: boolean;
}

export interface CaseTypeSaveInput {
  name: string;
  category: string | null;
  colorToken: CaseTagColorToken;
  defaultPriority: CasePriority | null;
  defaultSlaDays: number | null;
  requiredFields: CaseRequiredFieldKey[];
  checklist: { title: string }[];
  isActive: boolean;
}

/**
 * `ok: false` keeps the dialog open; an `error` (a name conflict) is shown under the
 * name field. Other failures are reported by the caller (toast).
 */
export type CaseTypeSaveResult = { ok: true } | { ok: false; error?: string };

export function draftFromCaseType(type: CaseTypeDto | null): CaseTypeDraft {
  if (!type) {
    return {
      name: '',
      category: '',
      colorToken: 'slate',
      defaultPriority: null,
      slaDays: '',
      requiredFields: [],
      checklist: [],
      isActive: true,
    };
  }
  return {
    name: type.name,
    category: type.category ?? '',
    colorToken: toCaseTypeColorToken(type.colorToken),
    defaultPriority: type.defaultPriority,
    slaDays: type.defaultSlaDays == null ? '' : String(type.defaultSlaDays),
    requiredFields: [...type.requiredFields],
    checklist: type.checklist.map((item) => newChecklistItem(item.title)),
    isActive: type.isActive,
  };
}

/** Comparable form of a draft (checklist keys are UI-only). */
function fingerprint(draft: CaseTypeDraft): string {
  return JSON.stringify({
    ...draft,
    name: draft.name.trim(),
    category: draft.category.trim(),
    slaDays: draft.slaDays.trim(),
    requiredFields: [...draft.requiredFields].sort((a, b) => a.localeCompare(b)),
    checklist: draft.checklist.map((item) => item.title.trim()).filter(Boolean),
  });
}

export function parseSlaDays(value: string): number | null | 'invalid' {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const days = Number(trimmed);
  if (
    !Number.isInteger(days) ||
    days < CASE_TYPE_LIMITS.minSlaDays ||
    days > CASE_TYPE_LIMITS.maxSlaDays
  ) {
    return 'invalid';
  }
  return days;
}

/** Index → message for case-insensitively duplicated steps (blank steps are dropped on save). */
export function findChecklistErrors(items: ChecklistDraftItem[]): Record<number, string> {
  const errors: Record<number, string> = {};
  const seen = new Map<string, number>();
  items.forEach((item, index) => {
    const key = item.title.trim().toLowerCase();
    if (!key) return;
    const first = seen.get(key);
    if (first === undefined) seen.set(key, index);
    else errors[index] = `Same as step ${first + 1}.`;
  });
  return errors;
}

export function toSaveInput(draft: CaseTypeDraft): CaseTypeSaveInput {
  const sla = parseSlaDays(draft.slaDays);
  return {
    name: draft.name.trim(),
    category: draft.category.trim() || null,
    colorToken: draft.colorToken,
    defaultPriority: draft.defaultPriority,
    defaultSlaDays: sla === 'invalid' ? null : sla,
    requiredFields: draft.requiredFields,
    checklist: draft.checklist
      .map((item) => ({ title: item.title.trim() }))
      .filter((item) => item.title.length > 0),
    isActive: draft.isActive,
  };
}

export interface CaseTypeDialogProps {
  open: boolean;
  /** null = create. */
  caseType: CaseTypeDto | null;
  /** All types, for the duplicate-name check. */
  existing: readonly { id: string; name: string }[];
  isSaving: boolean;
  onSave: (input: CaseTypeSaveInput) => Promise<CaseTypeSaveResult>;
  onClose: () => void;
}

export function CaseTypeDialog({
  open,
  caseType,
  existing,
  isSaving,
  onSave,
  onClose,
}: Readonly<CaseTypeDialogProps>) {
  const [snapshot, setSnapshot] = useState(() => draftFromCaseType(caseType));
  const [draft, setDraft] = useState(snapshot);
  const [serverError, setServerError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Reset whenever the dialog opens for a (possibly different) type.
  useEffect(() => {
    if (!open) return;
    const next = draftFromCaseType(caseType);
    setSnapshot(next);
    setDraft(next);
    setServerError(null);
  }, [open, caseType]);

  const set = <K extends keyof CaseTypeDraft>(key: K, value: CaseTypeDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (key === 'name') setServerError(null);
  };

  const trimmedName = draft.name.trim();
  const duplicateName = findDuplicateCaseTypeName(existing, trimmedName, caseType?.id);
  const sla = parseSlaDays(draft.slaDays);
  const checklistErrors = useMemo(() => findChecklistErrors(draft.checklist), [draft.checklist]);
  const isDefault = caseType?.isDefault ?? false;
  const hasConflict =
    !trimmedName ||
    duplicateName !== null ||
    sla === 'invalid' ||
    Object.keys(checklistErrors).length > 0;
  const isDirty = fingerprint(draft) !== fingerprint(snapshot);
  const nameError =
    serverError ?? (duplicateName ? `A case type named “${duplicateName}” already exists.` : null);

  const toggleRequired = (key: CaseRequiredFieldKey, checked: boolean) =>
    set(
      'requiredFields',
      checked ? [...draft.requiredFields, key] : draft.requiredFields.filter((k) => k !== key)
    );

  const save = async () => {
    const result = await onSave(toSaveInput(draft));
    if (!result.ok) {
      if (result.error) {
        setServerError(result.error);
        nameRef.current?.focus();
      }
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{caseType ? `Edit ${caseType.name}` : 'New Case Type'}</DialogTitle>
          <DialogDescription>
            These defaults are applied when a case of this type is created. Existing cases keep
            their values.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="case-type-name">Name</Label>
              <Input
                id="case-type-name"
                ref={nameRef}
                value={draft.name}
                maxLength={CASE_TYPE_LIMITS.maxNameLength}
                onChange={(e) => set('name', e.target.value)}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? 'case-type-name-error' : undefined}
              />
              {nameError && (
                <p
                  id="case-type-name-error"
                  role="alert"
                  className="text-xs text-red-700 dark:text-red-300"
                >
                  {nameError}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="case-type-category">Category (optional)</Label>
              <Input
                id="case-type-category"
                value={draft.category}
                maxLength={CASE_TYPE_LIMITS.maxCategoryLength}
                placeholder="e.g. Disputes, Advisory"
                onChange={(e) => set('category', e.target.value)}
              />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Colour</legend>
            <RadioGroup
              value={draft.colorToken}
              onValueChange={(value) => set('colorToken', toCaseTypeColorToken(value))}
              aria-label="Colour"
              className="grid grid-cols-2 sm:grid-cols-4 gap-2"
            >
              {CASE_TAG_COLOR_TOKENS.map((token) => (
                <label
                  key={token}
                  htmlFor={`case-type-color-${token}`}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 has-[[data-state=checked]]:ring-2 has-[[data-state=checked]]:ring-primary"
                >
                  <RadioGroupItem id={`case-type-color-${token}`} value={token} />
                  <span
                    className={`inline-block h-4 w-4 rounded-full ${CASE_TYPE_SWATCH_CLASSES[token]}`}
                    aria-hidden="true"
                  />
                  <span className="text-sm">{CASE_TYPE_COLOR_LABELS[token]}</span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <span className="text-sm font-medium leading-none">Default priority</span>
              <PrioritySelect
                value={draft.defaultPriority ?? undefined}
                onChange={(next) => set('defaultPriority', next ?? null)}
                ariaLabel="Default priority"
                placeholder="Case Settings default"
              />
              <p className="text-xs text-muted-foreground">
                Empty uses the Case Settings default priority.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="case-type-sla">Default SLA (days)</Label>
              <Input
                id="case-type-sla"
                type="number"
                inputMode="numeric"
                min={CASE_TYPE_LIMITS.minSlaDays}
                max={CASE_TYPE_LIMITS.maxSlaDays}
                value={draft.slaDays}
                onChange={(e) => set('slaDays', e.target.value)}
                aria-invalid={sla === 'invalid' ? true : undefined}
                aria-describedby={
                  sla === 'invalid'
                    ? 'case-type-sla-error case-type-sla-help'
                    : 'case-type-sla-help'
                }
              />
              <p id="case-type-sla-help" className="text-xs text-muted-foreground">
                Sets the deadline to the end of that day. Empty means no default deadline.
              </p>
              {sla === 'invalid' && (
                <p
                  id="case-type-sla-error"
                  role="alert"
                  className="text-xs text-red-700 dark:text-red-300"
                >
                  Enter a whole number from {CASE_TYPE_LIMITS.minSlaDays} to{' '}
                  {CASE_TYPE_LIMITS.maxSlaDays}.
                </p>
              )}
            </div>
          </div>

          <fieldset className="space-y-2" aria-describedby="case-type-required-help">
            <legend className="text-sm font-medium text-foreground">
              Required when creating a case
            </legend>
            <p id="case-type-required-help" className="text-xs text-muted-foreground">
              None ticked uses the Case Settings required fields; ticked fields replace them for
              this type. Subject, client and assignee are always filled in on a new case.
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {REQUIRED_KEY_CHOICES.map((key) => (
                <div key={key} className="flex min-h-11 items-center gap-2">
                  <Checkbox
                    id={`case-type-required-${key}`}
                    checked={draft.requiredFields.includes(key)}
                    onCheckedChange={(checked) => toggleRequired(key, checked === true)}
                  />
                  <Label htmlFor={`case-type-required-${key}`}>{REQUIRED_FIELD_LABELS[key]}</Label>
                </div>
              ))}
            </div>
          </fieldset>

          <ResolutionChecklistEditor
            items={draft.checklist}
            onChange={(items) => set('checklist', items)}
            errors={checklistErrors}
          />

          <div className="flex min-h-11 items-center justify-between gap-3">
            <Label htmlFor="case-type-active">Active</Label>
            <Switch
              id="case-type-active"
              checked={draft.isActive}
              onCheckedChange={(checked) => set('isActive', checked)}
              disabled={isDefault && draft.isActive}
              aria-describedby="case-type-active-help"
            />
          </div>
          <p id="case-type-active-help" className="text-xs text-muted-foreground -mt-3">
            {isDefault
              ? 'The default case type must stay active.'
              : 'Inactive types are hidden from the New Case form; existing cases keep them.'}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={!isDirty || isSaving || hasConflict}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
