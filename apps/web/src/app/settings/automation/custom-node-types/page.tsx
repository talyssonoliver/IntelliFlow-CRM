'use client';

/**
 * Custom Node Types — Admin (IFC-031 FU-011)
 *
 * Tenant-wide admin CRUD for workflow custom node types. Admins register
 * a new `typeId` + FieldDescriptor[]. The resulting descriptor is hydrated
 * into the builder's NodePalette on next load.
 */

import { useCallback, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
  toast,
} from '@intelliflow/ui';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthContext';
import { FieldDescriptorBuilder } from '@/components/workflows/admin/FieldDescriptorBuilder';
import type { FieldDescriptor } from '@intelliflow/domain';

interface FormState {
  id?: string;
  typeId: string;
  label: string;
  description: string;
  iconKey: string;
  accentClass: string;
  configSchema: FieldDescriptor[];
  isActive: boolean;
}

const DEFAULT_FORM: FormState = {
  typeId: '',
  label: '',
  description: '',
  iconKey: 'extension',
  accentClass: 'border-slate-500/60 bg-slate-500/5',
  configSchema: [],
  isActive: true,
};

export default function CustomNodeTypesAdminPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const listQuery = api.customNodeType.list.useQuery();
  const utils = api.useUtils();

  const refetch = useCallback(() => {
    utils.customNodeType.list.invalidate();
  }, [utils]);

  const createMutation = api.customNodeType.create.useMutation({
    onSuccess: () => {
      toast({ title: 'Custom node type created' });
      refetch();
    },
    onError: (err) => toast({ title: 'Create failed', description: err.message }),
  });
  const updateMutation = api.customNodeType.update.useMutation({
    onSuccess: () => {
      toast({ title: 'Custom node type updated' });
      refetch();
    },
    onError: (err) => toast({ title: 'Update failed', description: err.message }),
  });
  const deleteMutation = api.customNodeType.delete.useMutation({
    onSuccess: () => {
      toast({ title: 'Custom node type deactivated' });
      refetch();
    },
    onError: (err) => toast({ title: 'Delete failed', description: err.message }),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const openCreate = () => {
    setForm(DEFAULT_FORM);
    setDialogOpen(true);
  };

  const openEdit = (row: {
    id: string;
    typeId: string;
    label: string;
    description: string | null;
    iconKey: string;
    accentClass: string;
    configSchema?: unknown;
    isActive: boolean;
  }) => {
    setForm({
      id: row.id,
      typeId: row.typeId,
      label: row.label,
      description: row.description ?? '',
      iconKey: row.iconKey,
      accentClass: row.accentClass,
      configSchema: Array.isArray(row.configSchema)
        ? (row.configSchema as FieldDescriptor[])
        : [],
      isActive: row.isActive,
    });
    setDialogOpen(true);
  };

  const onSave = () => {
    if (form.id) {
      updateMutation.mutate({
        id: form.id,
        label: form.label,
        description: form.description || null,
        iconKey: form.iconKey,
        accentClass: form.accentClass,
        configSchema: form.configSchema,
        isActive: form.isActive,
      });
    } else {
      createMutation.mutate({
        typeId: form.typeId,
        label: form.label,
        description: form.description || undefined,
        iconKey: form.iconKey,
        accentClass: form.accentClass,
        configSchema: form.configSchema,
        isActive: form.isActive,
      });
    }
    setDialogOpen(false);
  };

  const items = listQuery.data?.items ?? [];

  return (
    <div className="pb-10">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Settings', href: '/settings' },
          { label: 'Automation', href: '/settings/automation' },
          { label: 'Custom Node Types' },
        ]}
        title="Custom Node Types"
        description="Register tenant-specific workflow node types. Admins only."
        className="mb-6"
      />
      {isAdmin && (
        <div className="flex justify-end mb-3">
          <Button onClick={openCreate} data-testid="open-create-dialog">
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" /> Register new
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registered types</CardTitle>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No custom node types registered yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left">
                <tr className="border-b">
                  <th className="py-2 pr-2 font-medium">Type ID</th>
                  <th className="py-2 pr-2 font-medium">Label</th>
                  <th className="py-2 pr-2 font-medium">Fields</th>
                  <th className="py-2 pr-2 font-medium">Active</th>
                  <th className="py-2 pr-2 font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-2 pr-2 font-mono text-xs">{row.typeId}</td>
                    <td className="py-2 pr-2">{row.label}</td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">
                      {Array.isArray(row.configSchema)
                        ? (row.configSchema as unknown[]).length
                        : 0}
                    </td>
                    <td className="py-2 pr-2 text-xs">{row.isActive ? 'Yes' : 'No'}</td>
                    <td className="py-2 pr-2">
                      {isAdmin && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(row)}
                            aria-label={`Edit ${row.typeId}`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Deactivate "${row.typeId}"?`)) {
                                deleteMutation.mutate({ id: row.id });
                              }
                            }}
                            aria-label={`Delete ${row.typeId}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {form.id ? 'Edit custom node type' : 'Register custom node type'}
            </DialogTitle>
            <DialogDescription>
              Define a node type tenant-wide. All fields become config inputs in the builder.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="typeId">Type ID</Label>
                <Input
                  id="typeId"
                  value={form.typeId}
                  disabled={Boolean(form.id)}
                  onChange={(e) => setForm({ ...form, typeId: e.target.value })}
                  placeholder="e.g. slack_notify"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="label">Label</Label>
                <Input
                  id="label"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Slack Notify"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What this node does"
                rows={2}
              />
            </div>
            <FieldDescriptorBuilder
              value={form.configSchema}
              onChange={(next) => setForm({ ...form, configSchema: next })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
