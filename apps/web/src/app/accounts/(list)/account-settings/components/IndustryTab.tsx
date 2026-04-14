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
  Switch,
} from '@intelliflow/ui';

export interface IndustryRow {
  id: string;
  label: string;
  key: string;
  sortOrder: number;
  isActive: boolean;
}

export interface IndustryTabProps {
  readonly rows: IndustryRow[];
  readonly onCreate: (label: string) => void | Promise<void>;
  readonly onUpdate: (
    id: string,
    patch: Partial<Pick<IndustryRow, 'label' | 'sortOrder' | 'isActive'>>
  ) => void | Promise<void>;
  readonly onDelete: (id: string) => void | Promise<void>;
  readonly isBusy?: boolean;
}

type EditState = { open: boolean; editing?: IndustryRow; label: string };

export function IndustryTab({
  rows,
  onCreate,
  onUpdate,
  onDelete,
  isBusy = false,
}: IndustryTabProps) {
  const [dialog, setDialog] = useState<EditState>({ open: false, label: '' });

  const openCreate = () => setDialog({ open: true, editing: undefined, label: '' });
  const openEdit = (row: IndustryRow) => setDialog({ open: true, editing: row, label: row.label });
  const close = () => setDialog({ open: false, label: '' });

  const submit = async () => {
    const label = dialog.label.trim();
    if (!label) return;
    if (dialog.editing) {
      await onUpdate(dialog.editing.id, { label });
    } else {
      await onCreate(label);
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
          Add Industry
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="business_center"
          title="No industries yet"
          description="Add your first industry or reset to the canonical taxonomy."
        />
      ) : (
        <Card className="divide-y divide-border">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-3 px-4 py-3"
              data-testid={`industry-row-${row.key}`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{row.label}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {row.key} · sort order {row.sortOrder}
                </div>
              </div>
              <Switch
                checked={row.isActive}
                onCheckedChange={(v) => onUpdate(row.id, { isActive: v })}
                aria-label={`Toggle ${row.label}`}
                disabled={isBusy}
              />
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
            <DialogTitle>{dialog.editing ? 'Edit industry' : 'Add industry'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="industry-label" className="text-sm font-medium">
              Label
            </label>
            <Input
              id="industry-label"
              value={dialog.label}
              onChange={(e) => setDialog((d) => ({ ...d, label: e.target.value }))}
              placeholder="e.g. Software & SaaS"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={dialog.label.trim().length === 0}>
              {dialog.editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
