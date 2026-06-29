'use client';

// Report Templates Content — PG-200
// PageHeader + 12-col bento grid (module-settings-playbook §1).
// List + create/edit + delete for saveable report layouts.

import { useState } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ConfirmationDialog,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@intelliflow/ui';
import { PageHeader, type PageAction } from '@/components/shared/page-header';
import type { ReportTemplateView } from '@intelliflow/validators';

type ChartType = 'table' | 'bar' | 'line' | 'pie' | 'area';
type SharingScope = 'private' | 'team' | 'tenant';
type DefaultPeriod = '7d' | '14d' | '30d' | '90d';

interface TemplateFormState {
  name: string;
  description: string;
  selectedColumns: string;
  chartType: ChartType;
  defaultPeriod: DefaultPeriod;
  sharingScope: SharingScope;
}

const EMPTY_FORM: TemplateFormState = {
  name: '',
  description: '',
  selectedColumns: '',
  chartType: 'table',
  defaultPeriod: '30d',
  sharingScope: 'private',
};

function parseColumns(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function ReportTemplatesContent() {
  const { isLoading: authLoading, isAuthenticated, user } = useRequireAuth();

  // ─── tRPC ──────────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const listQuery = trpc.analytics.reportTemplates.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const createMutation = trpc.analytics.reportTemplates.create.useMutation({
    onSuccess: () => {
      utils.analytics.reportTemplates.list.invalidate();
      toast({ title: 'Template created', description: 'Your report template was saved.' });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
  const updateMutation = trpc.analytics.reportTemplates.update.useMutation({
    onSuccess: () => {
      utils.analytics.reportTemplates.list.invalidate();
      toast({ title: 'Template updated', description: 'Your changes were saved.' });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
  const deleteMutation = trpc.analytics.reportTemplates.delete.useMutation({
    onSuccess: () => {
      utils.analytics.reportTemplates.list.invalidate();
      toast({ title: 'Template deleted' });
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // ─── Local state ───────────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<TemplateFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ─── Handlers ──────────────────────────────────────────────────────────────
  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEdit(t: ReportTemplateView) {
    setForm({
      name: t.name,
      description: t.description ?? '',
      selectedColumns: (t.selectedColumns as string[]).join(', '),
      chartType: (t.chartType as ChartType) ?? 'table',
      defaultPeriod: (t.defaultPeriod as DefaultPeriod) ?? '30d',
      sharingScope: (t.sharingScope as SharingScope) ?? 'private',
    });
    setEditingId(t.id);
    setDialogOpen(true);
  }

  async function handleSave() {
    const columns = parseColumns(form.selectedColumns);
    if (!form.name.trim() || columns.length === 0) return;

    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          name: form.name.trim(),
          // Send empty string (not undefined) so clearing the field actually
          // persists the cleared value. The router applies the field only when
          // !== undefined, so undefined would silently preserve the old value.
          description: form.description.trim(),
          selectedColumns: columns,
          chartType: form.chartType,
          defaultPeriod: form.defaultPeriod,
          sharingScope: form.sharingScope,
        });
      } else {
        await createMutation.mutateAsync({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          selectedColumns: columns,
          chartType: form.chartType,
          defaultPeriod: form.defaultPeriod,
          sharingScope: form.sharingScope,
          filterSet: {},
        });
      }
    } catch {
      // onError on the mutation already surfaces a toast; swallow here to
      // prevent an unhandled promise rejection (e.g. CONFLICT on duplicate name).
    }
  }

  // ─── Page actions ──────────────────────────────────────────────────────────
  const actions: PageAction[] = [
    {
      label: 'New Template',
      icon: 'add',
      variant: 'primary',
      onClick: openCreate,
    },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const templates = (listQuery.data ?? []) as unknown as ReportTemplateView[];
  const isLoading = listQuery.isLoading;
  const listError = listQuery.error;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        title="Report Templates"
        description="Save and reuse report configurations: filter sets, column selections, and chart types."
        actions={actions}
      />

      {/* 12-col bento grid (playbook §1) */}
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12">
          <CardHeader>
            <CardTitle>Templates</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div aria-busy="true" className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            )}
            {!isLoading && listError && (
              <p role="alert" className="text-sm text-destructive">
                {'Failed to load report templates. Please try again.'}
              </p>
            )}
            {!isLoading && !listError && templates.length === 0 && (
              <EmptyState entity="reports" phase="passive" size="sm" />
            )}
            {!isLoading && !listError && templates.length > 0 && (
              <div className="divide-y">
                {templates.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{t.name}</p>
                      {t.description && (
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                      )}
                      <div className="mt-1 flex gap-1.5">
                        <Badge variant="outline" className="text-xs">
                          {t.chartType as string}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {t.defaultPeriod as string}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {t.sharingScope as string}
                        </Badge>
                      </div>
                    </div>
                    {/* Only the creator can mutate a template; hide buttons for shared templates */}
                    {t.createdBy === user?.id && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Edit"
                          onClick={() => openEdit(t)}
                        >
                          <span className="material-symbols-outlined text-base">edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Delete"
                          onClick={() => setDeleteTarget({ id: t.id, name: t.name })}
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !isSaving && setDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Template' : 'New Report Template'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Monthly Revenue"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="template-description">Description (optional)</Label>
              <Input
                id="template-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief description"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="template-columns">Columns (comma-separated)</Label>
              <Input
                id="template-columns"
                value={form.selectedColumns}
                onChange={(e) => setForm((f) => ({ ...f, selectedColumns: e.target.value }))}
                placeholder="e.g. revenue, deal_count"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="chart-type">Chart Type</Label>
                <Select
                  value={form.chartType}
                  onValueChange={(v) => setForm((f) => ({ ...f, chartType: v as ChartType }))}
                >
                  <SelectTrigger id="chart-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="table">Table</SelectItem>
                    <SelectItem value="bar">Bar</SelectItem>
                    <SelectItem value="line">Line</SelectItem>
                    <SelectItem value="pie">Pie</SelectItem>
                    <SelectItem value="area">Area</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="default-period">Default Period</Label>
                <Select
                  value={form.defaultPeriod}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, defaultPeriod: v as DefaultPeriod }))
                  }
                >
                  <SelectTrigger id="default-period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">7 days</SelectItem>
                    <SelectItem value="14d">14 days</SelectItem>
                    <SelectItem value="30d">30 days</SelectItem>
                    <SelectItem value="90d">90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sharing-scope">Sharing Scope</Label>
              <Select
                value={form.sharingScope}
                onValueChange={(v) => setForm((f) => ({ ...f, sharingScope: v as SharingScope }))}
              >
                <SelectTrigger id="sharing-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                  <SelectItem value="tenant">Tenant</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                isSaving || !form.name.trim() || parseColumns(form.selectedColumns).length === 0
              }
            >
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete template?"
        description={deleteTarget ? `"${deleteTarget.name}" will be permanently deleted.` : ''}
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            if (deleteTarget) {
              await deleteMutation.mutateAsync({ id: deleteTarget.id });
            }
          } catch {
            // onError on the mutation already surfaces a toast; swallow here to
            // prevent an unhandled promise rejection.
          }
        }}
        isLoading={deleteMutation.isPending}
        variant="destructive"
      />
    </div>
  );
}
