/**
 * Ticket Type Manager - PG-173
 *
 * CRUD interface for ticket categories with hierarchical display.
 * REUSES: shadcn Table, Badge, Dialog, Button, Input, Select, Switch
 */

'use client';

import { Fragment, useState } from 'react';
import { trpc } from '@/lib/trpc';
import {
  Button,
  Switch,
  Input,
  Label,
  Textarea,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@intelliflow/ui';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { ConfigEmptyState, ConfigCardSkeleton } from './ticket-config-shared';
import { toast } from '@intelliflow/ui';

interface CategoryFormData {
  name: string;
  description: string;
  parentId: string;
  color: string;
  icon: string;
  slaPolicyId: string;
}

const defaultFormData: CategoryFormData = {
  name: '',
  description: '',
  parentId: '',
  color: '#3B82F6',
  icon: '',
  slaPolicyId: '',
};

export function TicketTypeManager() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CategoryFormData>(defaultFormData);

  const utils = trpc.useUtils();
  const { data: categories, isLoading } = trpc.ticketConfig.category.list.useQuery();
  const { data: slaPolicies } = trpc.ticketConfig.slaPolicy.list.useQuery();

  const createMutation = trpc.ticketConfig.category.create.useMutation({
    onSuccess: () => {
      utils.ticketConfig.category.list.invalidate();
      setDialogOpen(false);
      toast({ title: 'Category created' });
    },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });
  const updateMutation = trpc.ticketConfig.category.update.useMutation({
    onSuccess: () => {
      utils.ticketConfig.category.list.invalidate();
      setDialogOpen(false);
      setEditingId(null);
      toast({ title: 'Category updated' });
    },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });
  const deleteMutation = trpc.ticketConfig.category.delete.useMutation({
    onSuccess: () => {
      utils.ticketConfig.category.list.invalidate();
      toast({ title: 'Category deactivated' });
    },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });

  function openCreate() {
    setEditingId(null);
    setFormData(defaultFormData);
    setDialogOpen(true);
  }

  function openEdit(category: NonNullable<typeof categories>[number]) {
    setEditingId(category.id);
    setFormData({
      name: category.name,
      description: category.description ?? '',
      parentId: category.parentId ?? '',
      color: category.color ?? '#3B82F6',
      icon: category.icon ?? '',
      slaPolicyId: category.slaPolicyId ?? '',
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!formData.name.trim()) return;
    const payload = {
      name: formData.name,
      description: formData.description || undefined,
      parentId: formData.parentId || undefined,
      color: formData.color || undefined,
      icon: formData.icon || undefined,
      slaPolicyId: formData.slaPolicyId || undefined,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleToggleActive(id: string, currentActive: boolean) {
    updateMutation.mutate({ id, isActive: !currentActive });
  }

  // Hierarchical rendering: parents first, children indented
  const parents = categories?.filter((c) => !c.parentId) ?? [];
  const childrenMap = new Map<string, typeof parents>();
  categories?.forEach((c) => {
    if (c.parentId) {
      const existing = childrenMap.get(c.parentId) ?? [];
      existing.push(c);
      childrenMap.set(c.parentId, existing);
    }
  });

  if (isLoading) return <ConfigCardSkeleton />;

  if (!categories?.length) {
    return (
      <ConfigEmptyState
        title="No Ticket Types"
        description="Create ticket categories to organize and route support tickets."
        actionLabel="Add Type"
        onAction={openCreate}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate} aria-label="Add new ticket type">
          <Plus className="mr-2 h-4 w-4" />
          Add Type
        </Button>
      </div>

      <Table aria-label="Ticket Types">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Color</TableHead>
            <TableHead>Icon</TableHead>
            <TableHead>SLA Policy</TableHead>
            <TableHead>Active</TableHead>
            <TableHead>Order</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {parents.map((parent) => (
            <Fragment key={parent.id}>
              <TableRow>
                <TableCell className="font-medium">{parent.name}</TableCell>
                <TableCell>
                  {parent.color && (
                    <div className="flex items-center gap-2">
                      <div
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: parent.color }}
                      />
                      <span className="text-xs text-muted-foreground">{parent.color}</span>
                    </div>
                  )}
                </TableCell>
                <TableCell>{parent.icon || '—'}</TableCell>
                <TableCell className="text-sm">
                  {slaPolicies?.find((p) => p.id === parent.slaPolicyId)?.name ?? '—'}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={parent.isActive}
                    onCheckedChange={() => handleToggleActive(parent.id, parent.isActive)}
                    aria-label={`Toggle ${parent.name} active state`}
                  />
                </TableCell>
                <TableCell>{parent.sortOrder}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(parent)}
                      aria-label={`Edit ${parent.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate({ id: parent.id })}
                      aria-label={`Delete ${parent.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              {childrenMap.get(parent.id)?.map((child) => (
                <TableRow key={child.id}>
                  <TableCell className="pl-8 font-medium">↳ {child.name}</TableCell>
                  <TableCell>
                    {child.color && (
                      <div className="flex items-center gap-2">
                        <div
                          className="h-4 w-4 rounded-full"
                          style={{ backgroundColor: child.color }}
                        />
                        <span className="text-xs text-muted-foreground">{child.color}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{child.icon || '—'}</TableCell>
                  <TableCell className="text-sm">
                    {slaPolicies?.find((p) => p.id === child.slaPolicyId)?.name ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={child.isActive}
                      onCheckedChange={() => handleToggleActive(child.id, child.isActive)}
                      aria-label={`Toggle ${child.name} active state`}
                    />
                  </TableCell>
                  <TableCell>{child.sortOrder}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(child)}
                        aria-label={`Edit ${child.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate({ id: child.id })}
                        aria-label={`Delete ${child.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Ticket Type' : 'Add Ticket Type'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Billing"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-desc">Description</Label>
              <Textarea
                id="cat-desc"
                value={formData.description}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Parent Category</Label>
              <Select
                value={formData.parentId}
                onValueChange={(v) =>
                  setFormData((f) => ({ ...f, parentId: v === 'none' ? '' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="None (top-level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (top-level)</SelectItem>
                  {parents.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="cat-color">Color</Label>
                <Input
                  id="cat-color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData((f) => ({ ...f, color: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cat-icon">Icon</Label>
                <Input
                  id="cat-icon"
                  value={formData.icon}
                  onChange={(e) => setFormData((f) => ({ ...f, icon: e.target.value }))}
                  placeholder="e.g. credit-card"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>SLA Policy</Label>
              <Select
                value={formData.slaPolicyId}
                onValueChange={(v) =>
                  setFormData((f) => ({ ...f, slaPolicyId: v === 'none' ? '' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="No SLA policy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No SLA policy</SelectItem>
                  {slaPolicies?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!formData.name.trim()}>
              {editingId ? 'Save Changes' : 'Add Type'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
