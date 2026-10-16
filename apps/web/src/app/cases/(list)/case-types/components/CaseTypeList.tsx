'use client';

/**
 * Case types (PG-204), default first then by name. The create/edit dialog
 * lives here and is opened from the section header through the `openCreate`
 * handle (playbook §4, forwardRef + useImperativeHandle); focus returns to
 * whatever opened it. Colour is decorative — every row states its facts in text.
 */
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Badge, Button, EmptyState } from '@intelliflow/ui';
import type { CaseTypeDto } from '@intelliflow/validators';
import { swatchClass } from '@/components/cases/case-type-colors';
import {
  caseCountLabel,
  checklistCountLabel,
  priorityLabel,
  requiredCountLabel,
  slaLabel,
} from '@/components/cases/case-type-labels';
import { CaseTypeDialog, type CaseTypeSaveInput, type CaseTypeSaveResult } from './CaseTypeDialog';

export interface CaseTypeListHandle {
  openCreate: () => void;
}

export interface CaseTypeListProps {
  types: CaseTypeDto[];
  canEdit: boolean;
  isBusy: boolean;
  isSaving: boolean;
  /** Ids referenced by `aria-describedby` on disabled controls (read-only note). */
  describedBy?: string;
  onSave: (input: CaseTypeSaveInput, id: string | null) => Promise<CaseTypeSaveResult>;
  onDelete: (type: CaseTypeDto) => void;
}

interface RowProps {
  type: CaseTypeDto;
  locked: boolean;
  describedBy?: string;
  onEdit: (type: CaseTypeDto, trigger: HTMLElement) => void;
  onDelete: (type: CaseTypeDto) => void;
}

function CaseTypeRow({ type, locked, describedBy, onEdit, onDelete }: Readonly<RowProps>) {
  const facts = [
    type.category,
    priorityLabel(type.defaultPriority),
    slaLabel(type.defaultSlaDays),
    requiredCountLabel(type.requiredFields.length),
    checklistCountLabel(type.checklist.length),
  ].filter(Boolean);

  return (
    <li
      className="flex flex-wrap items-center gap-3 px-3 py-3"
      data-testid={`case-type-row-${type.id}`}
    >
      <span
        className={`inline-block h-3 w-3 shrink-0 rounded-full ${swatchClass(type.colorToken)}`}
        aria-hidden="true"
        data-testid="case-type-swatch"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{type.name}</span>
          {type.isDefault && <Badge variant="secondary">Default</Badge>}
          {!type.isActive && <Badge variant="outline">Inactive</Badge>}
          <span className="text-xs text-muted-foreground">{caseCountLabel(type.caseCount)}</span>
        </div>
        <div className="text-xs text-muted-foreground">{facts.join(' · ')}</div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Edit ${type.name}`}
          aria-describedby={describedBy}
          disabled={locked}
          onClick={(event) => onEdit(type, event.currentTarget)}
        >
          Edit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Delete ${type.name}`}
          aria-describedby={describedBy}
          disabled={locked}
          onClick={() => onDelete(type)}
        >
          Delete
        </Button>
      </div>
    </li>
  );
}

export const CaseTypeList = forwardRef<CaseTypeListHandle, CaseTypeListProps>(function CaseTypeList(
  { types, canEdit, isBusy, isSaving, describedBy, onSave, onDelete },
  ref
) {
  const [dialog, setDialog] = useState<{ open: boolean; type: CaseTypeDto | null }>({
    open: false,
    type: null,
  });
  const returnFocus = useRef<HTMLElement | null>(null);

  const open = (type: CaseTypeDto | null, trigger: Element | null) => {
    returnFocus.current = trigger instanceof HTMLElement ? trigger : null;
    setDialog({ open: true, type });
  };
  useImperativeHandle(ref, () => ({
    openCreate: () => open(null, document.activeElement),
  }));

  const close = () => {
    setDialog((current) => ({ ...current, open: false }));
    const target = returnFocus.current;
    if (target) setTimeout(() => target.focus(), 0);
  };

  const locked = !canEdit || isBusy;

  return (
    <div className="space-y-3">
      {types.length === 0 ? (
        <EmptyState
          entity="cases"
          variant="folder"
          phase="passive"
          size="sm"
          title="No case types yet"
          description="Create a type to pre-fill priority, deadline and tasks on new cases."
          className="py-4 px-3 gap-2"
        />
      ) : (
        <ul
          className="divide-y divide-border rounded-lg border border-border"
          aria-label="Case types"
        >
          {types.map((type) => (
            <CaseTypeRow
              key={type.id}
              type={type}
              locked={locked}
              describedBy={canEdit ? undefined : describedBy}
              onEdit={(row, trigger) => open(row, trigger)}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}

      <CaseTypeDialog
        open={dialog.open}
        caseType={dialog.type}
        existing={types}
        isSaving={isSaving}
        onSave={(input) => onSave(input, dialog.type?.id ?? null)}
        onClose={close}
      />
    </div>
  );
});
