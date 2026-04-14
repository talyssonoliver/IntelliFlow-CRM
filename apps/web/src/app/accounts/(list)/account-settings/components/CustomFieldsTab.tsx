'use client';

import { useState } from 'react';
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@intelliflow/ui';
import type { AccountCustomFieldDataType } from '@intelliflow/validators';

const DATA_TYPES: AccountCustomFieldDataType[] = [
  'text',
  'number',
  'currency',
  'dropdown',
  'date',
  'boolean',
];

export interface CustomFieldRow {
  id: string;
  fieldName: string;
  fieldKey: string;
  dataType: string;
  isRequired: boolean;
  options: { values: string[] } | null;
}

export interface CreateFieldData {
  fieldName: string;
  dataType: AccountCustomFieldDataType;
  isRequired: boolean;
  options?: { values: string[] };
}

export interface UpdateFieldData extends CreateFieldData {
  id: string;
}

export interface CustomFieldsTabProps {
  readonly rows: CustomFieldRow[];
  readonly onCreate: (data: CreateFieldData) => void | Promise<void>;
  readonly onUpdate: (data: UpdateFieldData) => void | Promise<void>;
  readonly onDelete: (id: string) => void | Promise<void>;
  readonly isBusy?: boolean;
}

type DialogState = {
  open: boolean;
  editing?: CustomFieldRow;
  fieldName: string;
  dataType: AccountCustomFieldDataType;
  isRequired: boolean;
  optionsText: string;
};

const EMPTY_DIALOG: DialogState = {
  open: false,
  fieldName: '',
  dataType: 'text',
  isRequired: false,
  optionsText: '',
};

export function CustomFieldsTab({
  rows,
  onCreate,
  onUpdate,
  onDelete,
  isBusy = false,
}: CustomFieldsTabProps) {
  const [dialog, setDialog] = useState<DialogState>(EMPTY_DIALOG);

  const openCreate = () => setDialog({ ...EMPTY_DIALOG, open: true });
  const openEdit = (row: CustomFieldRow) =>
    setDialog({
      open: true,
      editing: row,
      fieldName: row.fieldName,
      dataType: row.dataType as AccountCustomFieldDataType,
      isRequired: row.isRequired,
      optionsText: row.options?.values.join(', ') ?? '',
    });
  const close = () => setDialog(EMPTY_DIALOG);

  const submit = async () => {
    const name = dialog.fieldName.trim();
    if (!name) return;
    const options =
      dialog.dataType === 'dropdown' && dialog.optionsText.trim()
        ? {
            values: dialog.optionsText
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean),
          }
        : undefined;

    const payload: CreateFieldData = {
      fieldName: name,
      dataType: dialog.dataType,
      isRequired: dialog.isRequired,
      options,
    };

    if (dialog.editing) {
      await onUpdate({ id: dialog.editing.id, ...payload });
    } else {
      await onCreate(payload);
    }
    close();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button type="button" onClick={openCreate} disabled={isBusy}>
          <span className="material-symbols-outlined text-sm mr-1" aria-hidden>
            add
          </span>
          Add Field
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="dynamic_form"
          title="No custom fields yet"
          description="Add your first account custom field to start capturing more data."
        />
      ) : (
        <Card className="divide-y divide-border">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-3 px-4 py-3"
              data-testid={`field-row-${row.fieldKey}`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{row.fieldName}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {row.fieldKey} · {row.dataType}
                  {row.isRequired ? ' · required' : ''}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => openEdit(row)}
                disabled={isBusy}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onDelete(row.id)}
                disabled={isBusy}
              >
                Delete
              </Button>
            </div>
          ))}
        </Card>
      )}

      <Dialog open={dialog.open} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Edit custom field' : 'Add custom field'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label htmlFor="custom-field-name" className="text-sm font-medium">
                Field name
              </label>
              <Input
                id="custom-field-name"
                value={dialog.fieldName}
                onChange={(e) => setDialog((d) => ({ ...d, fieldName: e.target.value }))}
                placeholder="e.g. Segment Code"
              />
            </div>
            <div>
              <label htmlFor="custom-field-type" className="text-sm font-medium">
                Data type
              </label>
              <Select
                value={dialog.dataType}
                onValueChange={(v) =>
                  setDialog((d) => ({
                    ...d,
                    dataType: v as AccountCustomFieldDataType,
                  }))
                }
              >
                <SelectTrigger id="custom-field-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATA_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {dialog.dataType === 'dropdown' && (
              <div>
                <label htmlFor="custom-field-options" className="text-sm font-medium">
                  Options (comma separated)
                </label>
                <Input
                  id="custom-field-options"
                  value={dialog.optionsText}
                  onChange={(e) => setDialog((d) => ({ ...d, optionsText: e.target.value }))}
                  placeholder="e.g. Gold, Silver, Bronze"
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <label htmlFor="custom-field-required" className="text-sm font-medium">
                Required
              </label>
              <Switch
                id="custom-field-required"
                checked={dialog.isRequired}
                onCheckedChange={(v) => setDialog((d) => ({ ...d, isRequired: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={dialog.fieldName.trim().length === 0}>
              {dialog.editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
