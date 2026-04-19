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
  toast,
} from '@intelliflow/ui';
import type {
  CreateDealWinLossReasonInput,
  UpdateDealWinLossReasonInput,
} from '@intelliflow/validators';

export interface DealWinLossReasonRow {
  id: string;
  category: 'WON' | 'LOST';
  label: string;
  key: string;
  sortOrder: number;
  isActive: boolean;
}

export interface DealWinLossCardProps {
  readonly reasons: DealWinLossReasonRow[];
  readonly onCreate: (input: CreateDealWinLossReasonInput) => void | Promise<void>;
  readonly onUpdate: (input: UpdateDealWinLossReasonInput) => void | Promise<void>;
  readonly onDelete: (id: string) => void | Promise<{ softDeleted: boolean } | void>;
  readonly isBusy?: boolean;
}

interface DialogState {
  open: boolean;
  editing?: DealWinLossReasonRow;
  category: 'WON' | 'LOST';
  label: string;
}

const EMPTY: DialogState = { open: false, category: 'WON', label: '' };

export function DealWinLossCard({
  reasons,
  onCreate,
  onUpdate,
  onDelete,
  isBusy = false,
}: Readonly<DealWinLossCardProps>) {
  const [dialog, setDialog] = useState<DialogState>(EMPTY);

  const openCreate = (category: 'WON' | 'LOST') => setDialog({ open: true, category, label: '' });
  const openEdit = (row: DealWinLossReasonRow) =>
    setDialog({ open: true, editing: row, category: row.category, label: row.label });
  const close = () => setDialog(EMPTY);

  const submit = async () => {
    const label = dialog.label.trim();
    if (!label) return;
    if (dialog.editing) {
      await onUpdate({ id: dialog.editing.id, label });
    } else {
      await onCreate({ category: dialog.category, label });
    }
    close();
  };

  const handleDelete = async (row: DealWinLossReasonRow) => {
    const result = (await onDelete(row.id)) ?? undefined;
    if (result && 'softDeleted' in result && result.softDeleted) {
      toast({
        title: 'Reason deactivated',
        description: `"${row.label}" kept because deals still reference it.`,
      });
    }
  };

  const won = reasons.filter((r) => r.category === 'WON').sort((a, b) => a.sortOrder - b.sortOrder);
  const lost = reasons
    .filter((r) => r.category === 'LOST')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-5">
      {(['WON', 'LOST'] as const).map((category) => {
        const rows = category === 'WON' ? won : lost;
        const label = category === 'WON' ? 'Won reasons' : 'Lost reasons';
        return (
          <div key={category} className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">{label}</h4>
              <Button size="sm" onClick={() => openCreate(category)} disabled={isBusy}>
                {category === 'WON' ? 'Add Won Reason' : 'Add Lost Reason'}
              </Button>
            </div>
            {rows.length === 0 ? (
              <EmptyState
                entity="rules"
                size="sm"
                phase="passive"
                title={`No ${category.toLowerCase()} reasons`}
                description={`Add the first ${category.toLowerCase()} reason above.`}
                className="py-4 px-3 gap-2"
              />
            ) : (
              <Card className="divide-y divide-border">
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center gap-3 px-4 py-3"
                    data-testid={`deal-reason-row-${row.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {row.label}
                      </div>
                      <div className="text-xs text-muted-foreground">{row.key}</div>
                    </div>
                    <Switch
                      checked={row.isActive}
                      onCheckedChange={(v) => onUpdate({ id: row.id, isActive: v })}
                      aria-label={`Toggle ${row.label} active`}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(row)}
                      disabled={isBusy}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleDelete(row)}
                      disabled={isBusy}
                    >
                      Delete
                    </Button>
                  </div>
                ))}
              </Card>
            )}
          </div>
        );
      })}

      <Dialog open={dialog.open} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Edit reason' : 'Add reason'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label htmlFor="reason-category" className="text-sm font-medium">
                Category
              </label>
              <Select
                value={dialog.category}
                onValueChange={(v) => setDialog((d) => ({ ...d, category: v as 'WON' | 'LOST' }))}
                disabled={Boolean(dialog.editing)}
              >
                <SelectTrigger id="reason-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WON">Won</SelectItem>
                  <SelectItem value="LOST">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="reason-label" className="text-sm font-medium">
                Label
              </label>
              <Input
                id="reason-label"
                value={dialog.label}
                onChange={(e) => setDialog((d) => ({ ...d, label: e.target.value }))}
                placeholder="e.g. Better price"
              />
            </div>
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
