'use client';

/**
 * Custom Action Handlers — Admin (IFC-031 FU-012)
 *
 * Admin CRUD + Test-endpoint for tenant-registered webhook action handlers.
 * The engine POSTs step params (filtered by inputSchema) to `endpointUrl`
 * at workflow execution time via `dispatchCustomAction`.
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
import { PlayCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthContext';
import { FieldDescriptorBuilder } from '@/components/workflows/admin/FieldDescriptorBuilder';
import type { FieldDescriptor } from '@intelliflow/domain';

interface FormState {
  id?: string;
  actionTypeId: string;
  label: string;
  description: string;
  endpointUrl: string;
  authHeader: string;
  timeoutMs: number;
  inputSchema: FieldDescriptor[];
  outputSchema: FieldDescriptor[];
  isActive: boolean;
}

const DEFAULT_FORM: FormState = {
  actionTypeId: '',
  label: '',
  description: '',
  endpointUrl: '',
  authHeader: '',
  timeoutMs: 30000,
  inputSchema: [],
  outputSchema: [],
  isActive: true,
};

export default function CustomActionHandlersAdminPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const listQuery = api.customActionHandler.list.useQuery();
  const utils = api.useUtils();
  const refetch = useCallback(
    () => utils.customActionHandler.list.invalidate(),
    [utils]
  );

  const createMutation = api.customActionHandler.create.useMutation({
    onSuccess: () => {
      toast({ title: 'Custom action handler created' });
      refetch();
    },
    onError: (err) => toast({ title: 'Create failed', description: err.message }),
  });
  const updateMutation = api.customActionHandler.update.useMutation({
    onSuccess: () => {
      toast({ title: 'Updated' });
      refetch();
    },
    onError: (err) => toast({ title: 'Update failed', description: err.message }),
  });
  const deleteMutation = api.customActionHandler.delete.useMutation({
    onSuccess: () => {
      toast({ title: 'Deactivated' });
      refetch();
    },
    onError: (err) => toast({ title: 'Delete failed', description: err.message }),
  });
  const testMutation = api.customActionHandler.test.useMutation({
    onSuccess: (result) => {
      toast({
        title: result.ok ? `Ping OK (${result.status})` : `Ping failed`,
        description: result.errorMessage ?? `Status ${result.status}`,
      });
    },
    onError: (err) => toast({ title: 'Test failed', description: err.message }),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const openCreate = () => {
    setForm(DEFAULT_FORM);
    setDialogOpen(true);
  };

  const openEdit = (row: {
    id: string;
    actionTypeId: string;
    label: string;
    description: string | null;
    endpointUrl: string;
    hasAuthHeader: boolean;
    timeoutMs: number;
    inputSchema?: unknown;
    outputSchema?: unknown;
    isActive: boolean;
  }) => {
    setForm({
      id: row.id,
      actionTypeId: row.actionTypeId,
      label: row.label,
      description: row.description ?? '',
      endpointUrl: row.endpointUrl,
      // authHeader is never returned by the backend; leave blank unless user sets it
      authHeader: '',
      timeoutMs: row.timeoutMs,
      inputSchema: Array.isArray(row.inputSchema)
        ? (row.inputSchema as FieldDescriptor[])
        : [],
      outputSchema: Array.isArray(row.outputSchema)
        ? (row.outputSchema as FieldDescriptor[])
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
        endpointUrl: form.endpointUrl,
        // Only patch authHeader when user typed one; empty = leave existing
        authHeader: form.authHeader ? form.authHeader : undefined,
        timeoutMs: form.timeoutMs,
        inputSchema: form.inputSchema,
        outputSchema: form.outputSchema,
        isActive: form.isActive,
      });
    } else {
      createMutation.mutate({
        actionTypeId: form.actionTypeId,
        label: form.label,
        description: form.description || undefined,
        endpointUrl: form.endpointUrl,
        authHeader: form.authHeader || undefined,
        timeoutMs: form.timeoutMs,
        inputSchema: form.inputSchema,
        outputSchema: form.outputSchema,
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
          { label: 'Custom Actions' },
        ]}
        title="Custom Actions"
        description="Register webhook-based action handlers. Admins only."
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
          <CardTitle className="text-base">Registered handlers</CardTitle>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No custom action handlers registered yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left">
                <tr className="border-b">
                  <th className="py-2 pr-2 font-medium">Action ID</th>
                  <th className="py-2 pr-2 font-medium">Label</th>
                  <th className="py-2 pr-2 font-medium">Endpoint</th>
                  <th className="py-2 pr-2 font-medium">Auth</th>
                  <th className="py-2 pr-2 font-medium">Active</th>
                  <th className="py-2 pr-2 font-medium w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-2 pr-2 font-mono text-xs">{row.actionTypeId}</td>
                    <td className="py-2 pr-2">{row.label}</td>
                    <td className="py-2 pr-2 text-xs font-mono truncate max-w-[220px]">
                      {row.endpointUrl}
                    </td>
                    <td className="py-2 pr-2 text-xs">{row.hasAuthHeader ? '🔒' : '—'}</td>
                    <td className="py-2 pr-2 text-xs">{row.isActive ? 'Yes' : 'No'}</td>
                    <td className="py-2 pr-2">
                      {isAdmin && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => testMutation.mutate({ id: row.id })}
                            aria-label={`Test ${row.actionTypeId}`}
                            title="Test endpoint"
                          >
                            <PlayCircle className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(row)}
                            aria-label={`Edit ${row.actionTypeId}`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Deactivate "${row.actionTypeId}"?`)) {
                                deleteMutation.mutate({ id: row.id });
                              }
                            }}
                            aria-label={`Delete ${row.actionTypeId}`}
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
              {form.id ? 'Edit custom action handler' : 'Register custom action handler'}
            </DialogTitle>
            <DialogDescription>
              Webhook-based handler. Engine POSTs JSON body filtered by the input schema.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="actionTypeId">Action ID</Label>
                <Input
                  id="actionTypeId"
                  value={form.actionTypeId}
                  disabled={Boolean(form.id)}
                  onChange={(e) => setForm({ ...form, actionTypeId: e.target.value })}
                  placeholder="e.g. hubspot_sync"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="label">Label</Label>
                <Input
                  id="label"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="HubSpot Sync"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="endpointUrl">Endpoint URL</Label>
              <Input
                id="endpointUrl"
                value={form.endpointUrl}
                onChange={(e) => setForm({ ...form, endpointUrl: e.target.value })}
                placeholder="https://hooks.example.com/my-endpoint"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="authHeader">
                  Authorization Header {form.id ? '(leave blank to keep)' : ''}
                </Label>
                <Input
                  id="authHeader"
                  value={form.authHeader}
                  onChange={(e) => setForm({ ...form, authHeader: e.target.value })}
                  placeholder="Bearer token…"
                  type="password"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="timeoutMs">Timeout (ms)</Label>
                <Input
                  id="timeoutMs"
                  type="number"
                  min={500}
                  max={120000}
                  value={form.timeoutMs}
                  onChange={(e) =>
                    setForm({ ...form, timeoutMs: Number.parseInt(e.target.value, 10) || 30000 })
                  }
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Input schema</Label>
              <FieldDescriptorBuilder
                value={form.inputSchema}
                onChange={(next) => setForm({ ...form, inputSchema: next })}
              />
            </div>
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
