/**
 * SLA Policy Manager - PG-173
 *
 * CRUD interface for SLA policies. Uses tRPC for data fetching and mutations.
 * REUSES: shadcn Table, Badge, Dialog, Button, Input, Switch
 */

'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import {
  Button, Badge, Switch, Input, Label, Textarea,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@intelliflow/ui';
import { Star, Plus, Pencil, Trash2 } from 'lucide-react';
import { ConfigEmptyState, ConfigCardSkeleton, formatMinutesToDisplay } from './ticket-config-shared';
import { toast } from '@intelliflow/ui';

interface PolicyFormData {
  name: string;
  description: string;
  criticalResponseMinutes: number;
  highResponseMinutes: number;
  mediumResponseMinutes: number;
  lowResponseMinutes: number;
  criticalResolutionMinutes: number;
  highResolutionMinutes: number;
  mediumResolutionMinutes: number;
  lowResolutionMinutes: number;
  warningThresholdPercent: number;
}

const defaultFormData: PolicyFormData = {
  name: '',
  description: '',
  criticalResponseMinutes: 15,
  highResponseMinutes: 60,
  mediumResponseMinutes: 240,
  lowResponseMinutes: 480,
  criticalResolutionMinutes: 120,
  highResolutionMinutes: 480,
  mediumResolutionMinutes: 1440,
  lowResolutionMinutes: 4320,
  warningThresholdPercent: 25,
};

export function SLAPolicyManager() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<PolicyFormData>(defaultFormData);

  const utils = trpc.useUtils();
  const { data: policies, isLoading } = trpc.ticketConfig.slaPolicy.list.useQuery();

  const createMutation = trpc.ticketConfig.slaPolicy.create.useMutation({
    onSuccess: () => { utils.ticketConfig.slaPolicy.list.invalidate(); setDialogOpen(false); toast({ title: 'Policy created' }); },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });
  const updateMutation = trpc.ticketConfig.slaPolicy.update.useMutation({
    onSuccess: () => { utils.ticketConfig.slaPolicy.list.invalidate(); setDialogOpen(false); setEditingId(null); toast({ title: 'Policy updated' }); },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });
  const deleteMutation = trpc.ticketConfig.slaPolicy.delete.useMutation({
    onSuccess: () => { utils.ticketConfig.slaPolicy.list.invalidate(); setDeleteId(null); toast({ title: 'Policy deactivated' }); },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });
  const setDefaultMutation = trpc.ticketConfig.slaPolicy.setDefault.useMutation({
    onSuccess: () => { utils.ticketConfig.slaPolicy.list.invalidate(); toast({ title: 'Default policy updated' }); },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });

  function openCreate() {
    setEditingId(null);
    setFormData(defaultFormData);
    setDialogOpen(true);
  }

  function openEdit(policy: NonNullable<typeof policies>[number]) {
    setEditingId(policy.id);
    setFormData({
      name: policy.name,
      description: policy.description ?? '',
      criticalResponseMinutes: policy.criticalResponseMinutes,
      highResponseMinutes: policy.highResponseMinutes,
      mediumResponseMinutes: policy.mediumResponseMinutes,
      lowResponseMinutes: policy.lowResponseMinutes,
      criticalResolutionMinutes: policy.criticalResolutionMinutes,
      highResolutionMinutes: policy.highResolutionMinutes,
      mediumResolutionMinutes: policy.mediumResolutionMinutes,
      lowResolutionMinutes: policy.lowResolutionMinutes,
      warningThresholdPercent: policy.warningThresholdPercent,
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!formData.name.trim()) return;
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  }

  function handleToggleActive(id: string, currentActive: boolean) {
    updateMutation.mutate({ id, isActive: !currentActive });
  }

  if (isLoading) return <ConfigCardSkeleton />;

  if (!policies?.length) {
    return <ConfigEmptyState title="No SLA Policies" description="Create your first SLA policy to define response and resolution time targets." actionLabel="Create Policy" onAction={openCreate} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate} aria-label="Create new SLA policy">
          <Plus className="mr-2 h-4 w-4" />
          Create Policy
        </Button>
      </div>

      <Table aria-label="SLA Policies">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Response Times</TableHead>
            <TableHead>Resolution Times</TableHead>
            <TableHead>Warning %</TableHead>
            <TableHead>Default</TableHead>
            <TableHead>Active</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {policies.map((policy) => (
            <TableRow key={policy.id}>
              <TableCell className="font-medium">{policy.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatMinutesToDisplay(policy.criticalResponseMinutes)}/
                {formatMinutesToDisplay(policy.highResponseMinutes)}/
                {formatMinutesToDisplay(policy.mediumResponseMinutes)}/
                {formatMinutesToDisplay(policy.lowResponseMinutes)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatMinutesToDisplay(policy.criticalResolutionMinutes)}/
                {formatMinutesToDisplay(policy.highResolutionMinutes)}/
                {formatMinutesToDisplay(policy.mediumResolutionMinutes)}/
                {formatMinutesToDisplay(policy.lowResolutionMinutes)}
              </TableCell>
              <TableCell>{policy.warningThresholdPercent}%</TableCell>
              <TableCell>
                {policy.isDefault ? (
                  <Badge variant="secondary" aria-label="Default policy">
                    <Star className="mr-1 h-3 w-3" /> Default
                  </Badge>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setDefaultMutation.mutate({ id: policy.id })} aria-label={`Set ${policy.name} as default`}>
                    Set Default
                  </Button>
                )}
              </TableCell>
              <TableCell>
                <Switch checked={policy.isActive} onCheckedChange={() => handleToggleActive(policy.id, policy.isActive)} aria-label={`Toggle ${policy.name} active state`} />
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(policy)} aria-label={`Edit ${policy.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(policy.id)} aria-label={`Delete ${policy.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl" role="dialog">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit SLA Policy' : 'Create SLA Policy'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={formData.name} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Standard SLA" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={formData.description} onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="mb-2 text-sm font-medium">Response Times (minutes)</h4>
                {(['critical', 'high', 'medium', 'low'] as const).map((priority) => (
                  <div key={priority} className="mb-2 flex items-center gap-2">
                    <Label className="w-20 capitalize">{priority}</Label>
                    <Input type="number" min={1} value={formData[`${priority}ResponseMinutes`]} onChange={(e) => setFormData((f) => ({ ...f, [`${priority}ResponseMinutes`]: parseInt(e.target.value) || 1 }))} />
                  </div>
                ))}
              </div>
              <div>
                <h4 className="mb-2 text-sm font-medium">Resolution Times (minutes)</h4>
                {(['critical', 'high', 'medium', 'low'] as const).map((priority) => (
                  <div key={priority} className="mb-2 flex items-center gap-2">
                    <Label className="w-20 capitalize">{priority}</Label>
                    <Input type="number" min={1} value={formData[`${priority}ResolutionMinutes`]} onChange={(e) => setFormData((f) => ({ ...f, [`${priority}ResolutionMinutes`]: parseInt(e.target.value) || 1 }))} />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="warningThreshold">Warning Threshold (%)</Label>
              <Input id="warningThreshold" type="number" min={1} max={100} value={formData.warningThresholdPercent} onChange={(e) => setFormData((f) => ({ ...f, warningThresholdPercent: parseInt(e.target.value) || 25 }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!formData.name.trim()}>
              {editingId ? 'Save Changes' : 'Create Policy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate SLA Policy?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the policy. Existing tickets using this policy will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}>
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
