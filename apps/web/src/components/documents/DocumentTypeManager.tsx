'use client';

import { useState } from 'react';
import { DOCUMENT_TYPES, type DocumentType } from '@intelliflow/domain';
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
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  toast,
} from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { SYSTEM_DOCUMENT_TYPE_LABELS } from './document-type-utils';

interface CustomDocumentTypeFormData {
  name: string;
  description: string;
  sortOrder: string;
}

const DEFAULT_FORM_DATA: CustomDocumentTypeFormData = {
  name: '',
  description: '',
  sortOrder: '0',
};

const SYSTEM_DOCUMENT_TYPE_DESCRIPTIONS: Record<DocumentType, string> = {
  CONTRACT: 'Formal commercial and legal agreements.',
  AGREEMENT: 'Signed understandings that are not treated as contracts.',
  EVIDENCE: 'Files used to support or prove a claim.',
  CORRESPONDENCE: 'Emails, letters, and other written communication.',
  COURT_FILING: 'Court-submitted pleadings, motions, and orders.',
  MEMO: 'Internal notes, briefs, and guidance documents.',
  REPORT: 'Investigative, analytical, or summary reports.',
  OTHER: 'Fallback bucket for custom tenant-specific document types.',
};

export function DocumentTypeManager() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const utils = trpc.useUtils();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CustomDocumentTypeFormData>(DEFAULT_FORM_DATA);

  const {
    data: customDocumentTypes,
    isLoading,
    error,
    refetch,
  } = trpc.documentSettings.documentTypes.list.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
  });

  const createMutation = trpc.documentSettings.documentTypes.create.useMutation({
    onSuccess: async () => {
      await utils.documentSettings.documentTypes.list.invalidate();
      setDialogOpen(false);
      setEditingId(null);
      setFormData(DEFAULT_FORM_DATA);
      toast({ title: 'Custom document type created' });
    },
    onError: (err) => {
      toast({ title: err.message, variant: 'destructive' });
    },
  });

  const updateMutation = trpc.documentSettings.documentTypes.update.useMutation({
    onSuccess: async () => {
      await utils.documentSettings.documentTypes.list.invalidate();
      setDialogOpen(false);
      setEditingId(null);
      setFormData(DEFAULT_FORM_DATA);
      toast({ title: 'Custom document type updated' });
    },
    onError: (err) => {
      toast({ title: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = trpc.documentSettings.documentTypes.delete.useMutation({
    onSuccess: async () => {
      await utils.documentSettings.documentTypes.list.invalidate();
      toast({ title: 'Custom document type deactivated' });
    },
    onError: (err) => {
      toast({ title: err.message, variant: 'destructive' });
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setFormData(DEFAULT_FORM_DATA);
    setDialogOpen(true);
  };

  const openEdit = (documentType: {
    id: string;
    name: string;
    description: string | null;
    sortOrder: number;
  }) => {
    setEditingId(documentType.id);
    setFormData({
      name: documentType.name,
      description: documentType.description ?? '',
      sortOrder: String(documentType.sortOrder),
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      sortOrder: Number.parseInt(formData.sortOrder || '0', 10) || 0,
    };

    if (!payload.name) {
      return;
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
      return;
    }

    createMutation.mutate(payload);
  };

  const isBusy =
    isLoading ||
    authLoading ||
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  if (isLoading || authLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
          <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full text-center py-12">
        <p className="text-destructive mb-4">Failed to load document types: {error.message}</p>
        <button onClick={() => refetch()} className="text-sm text-primary hover:underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Documents', href: '/documents' },
          { label: 'Document Types' },
        ]}
        title="Document Types"
        description="Manage built-in document categories and tenant-specific custom labels used when saving documents as OTHER."
        actions={[
          {
            label: 'Add Custom Type',
            onClick: openCreate,
            variant: 'primary',
            icon: 'add',
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Card className="p-4 sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-foreground">Built-in Types</h2>
            <p className="text-sm text-muted-foreground">
              These are the system document categories enforced by the API.
            </p>
          </div>
          <div className="space-y-3">
            {DOCUMENT_TYPES.map((documentType) => (
              <div
                key={documentType}
                className="rounded-lg border border-border bg-card/60 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">
                      {SYSTEM_DOCUMENT_TYPE_LABELS[documentType]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {SYSTEM_DOCUMENT_TYPE_DESCRIPTIONS[documentType]}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {documentType}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Custom Types</h2>
              <p className="text-sm text-muted-foreground">
                These appear in the upload form and are stored as `OTHER` with a custom label.
              </p>
            </div>
            <Button onClick={openCreate} disabled={isBusy}>
              <span className="material-symbols-outlined mr-1 text-sm" aria-hidden="true">
                add
              </span>
              Add Type
            </Button>
          </div>

          {!customDocumentTypes || customDocumentTypes.length === 0 ? (
            <EmptyState
              entity="documents"
              phase="passive"
              title="No custom document types yet"
              description="Create tenant-specific labels like Deposition Transcript or Expert Opinion."
              action={{
                label: 'Add Type',
                onClick: openCreate,
                icon: 'add',
              }}
            />
          ) : (
            <Table aria-label="Custom document types">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Sort Order</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customDocumentTypes.map((documentType) => (
                  <TableRow key={documentType.id}>
                    <TableCell className="font-medium">{documentType.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {documentType.description || '—'}
                    </TableCell>
                    <TableCell>{documentType.sortOrder}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(documentType)}
                          aria-label={`Edit ${documentType.name}`}
                        >
                          <span className="material-symbols-outlined text-base" aria-hidden="true">
                            edit
                          </span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate({ id: documentType.id })}
                          aria-label={`Deactivate ${documentType.name}`}
                        >
                          <span className="material-symbols-outlined text-base" aria-hidden="true">
                            delete
                          </span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Custom Document Type' : 'Add Custom Document Type'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="document-type-name">Name</Label>
              <Input
                id="document-type-name"
                value={formData.name}
                onChange={(e) => setFormData((current) => ({ ...current, name: e.target.value }))}
                placeholder="e.g. Deposition Transcript"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="document-type-description">Description</Label>
              <Textarea
                id="document-type-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((current) => ({ ...current, description: e.target.value }))
                }
                placeholder="Optional guidance for when this custom type should be used."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="document-type-sort-order">Sort Order</Label>
              <Input
                id="document-type-sort-order"
                type="number"
                min={0}
                value={formData.sortOrder}
                onChange={(e) =>
                  setFormData((current) => ({ ...current, sortOrder: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isBusy || formData.name.trim().length === 0}>
              {editingId ? 'Save Changes' : 'Add Type'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
