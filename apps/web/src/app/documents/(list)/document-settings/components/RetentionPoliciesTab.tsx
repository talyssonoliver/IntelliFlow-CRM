'use client';

import { useState } from 'react';
import {
  Button,
  Card,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Switch,
} from '@intelliflow/ui';
import type { ColumnDef } from '@tanstack/react-table';

export interface LocalRetentionPolicy {
  id?: string;
  categoryKey: string;
  retentionDays: number;
  autoArchive: boolean;
  legalHoldOverride: boolean;
}

interface Props {
  policies: LocalRetentionPolicy[];
  onPoliciesChange: (p: LocalRetentionPolicy[]) => void;
}

interface SectionHeaderProps {
  icon: string;
  iconBg: string;
  iconFg: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}

function SectionHeader({
  icon,
  iconBg,
  iconFg,
  title,
  description,
  action,
}: Readonly<SectionHeaderProps>) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <span className={`material-symbols-outlined text-[20px] ${iconFg}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const EMPTY_FORM: Omit<LocalRetentionPolicy, 'id'> = {
  categoryKey: '',
  retentionDays: 365,
  autoArchive: false,
  legalHoldOverride: false,
};

export function RetentionPoliciesTab({ policies, onPoliciesChange }: Readonly<Props>) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [form, setForm] = useState<Omit<LocalRetentionPolicy, 'id'>>(EMPTY_FORM);

  const openCreate = () => {
    setEditingIdx(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (idx: number) => {
    const p = policies[idx];
    setEditingIdx(idx);
    setForm({
      categoryKey: p.categoryKey,
      retentionDays: p.retentionDays,
      autoArchive: p.autoArchive,
      legalHoldOverride: p.legalHoldOverride,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const key = form.categoryKey.trim();
    if (!key) return;
    if (editingIdx !== null) {
      onPoliciesChange(
        policies.map((p, i) => (i === editingIdx ? { ...p, ...form, categoryKey: key } : p))
      );
    } else {
      onPoliciesChange([...policies, { ...form, categoryKey: key }]);
    }
    setDialogOpen(false);
  };

  const handleRemove = (idx: number) => {
    onPoliciesChange(policies.filter((_, i) => i !== idx));
  };

  const columns: ColumnDef<LocalRetentionPolicy>[] = [
    { accessorKey: 'categoryKey', header: 'Category' },
    {
      accessorKey: 'retentionDays',
      header: 'Retention (Days)',
      cell: ({ row }) =>
        row.original.retentionDays === 0 ? 'Forever' : row.original.retentionDays,
    },
    {
      accessorKey: 'autoArchive',
      header: 'Auto Archive',
      cell: ({ row }) => (row.original.autoArchive ? 'Yes' : 'No'),
    },
    {
      accessorKey: 'legalHoldOverride',
      header: 'Legal Hold',
      cell: ({ row }) => (row.original.legalHoldOverride ? 'Yes' : 'No'),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex gap-1 justify-end">
          <button
            type="button"
            onClick={() => openEdit(row.index)}
            aria-label={`Edit policy ${row.original.categoryKey}`}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              edit
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleRemove(row.index)}
            aria-label={`Remove policy ${row.original.categoryKey}`}
            className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              delete
            </span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <Card className="lg:col-span-8 p-4 sm:p-6">
      <SectionHeader
        icon="policy"
        iconBg="bg-teal-500/10"
        iconFg="text-teal-500"
        title="Retention & Compliance"
        description="Per-category retention periods and legal hold policies."
        action={
          <Button type="button" size="sm" variant="outline" onClick={openCreate}>
            <span className="material-symbols-outlined text-[16px] mr-1" aria-hidden="true">
              add
            </span>
            Add Policy
          </Button>
        }
      />

      {policies.length === 0 ? (
        <EmptyState entity="signatures" phase="passive" size="sm" className="py-4 px-3 gap-2" />
      ) : (
        <DataTable columns={columns} data={policies} />
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => (o ? null : setDialogOpen(false))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingIdx !== null ? 'Edit Policy' : 'Add Policy'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label htmlFor="policy-category" className="text-sm font-medium">
                Category Key
              </label>
              <Input
                id="policy-category"
                value={form.categoryKey}
                onChange={(e) => setForm((f) => ({ ...f, categoryKey: e.target.value }))}
                placeholder="e.g. contracts"
              />
            </div>
            <div>
              <label htmlFor="policy-days" className="text-sm font-medium">
                Retention Days (0 = forever)
              </label>
              <Input
                id="policy-days"
                type="number"
                min={0}
                value={form.retentionDays}
                onChange={(e) =>
                  setForm((f) => ({ ...f, retentionDays: Math.max(0, Number(e.target.value)) }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto Archive</p>
                <p className="text-xs text-muted-foreground">
                  Move to archive after retention period.
                </p>
              </div>
              <Switch
                checked={form.autoArchive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, autoArchive: v }))}
                aria-label="Auto archive"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Legal Hold Override</p>
                <p className="text-xs text-muted-foreground">
                  Preserve documents regardless of retention period.
                </p>
              </div>
              <Switch
                checked={form.legalHoldOverride}
                onCheckedChange={(v) => setForm((f) => ({ ...f, legalHoldOverride: v }))}
                aria-label="Legal hold override"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={form.categoryKey.trim().length === 0}>
              {editingIdx !== null ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
