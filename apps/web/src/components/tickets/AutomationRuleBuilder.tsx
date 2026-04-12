/**
 * Automation Rule Builder - PG-173
 *
 * CRUD interface for ticket automation rules. Uses existing routing.* tRPC procedures.
 * REUSES: shadcn Table, Badge, Dialog, Button, Input, Select, Switch, Card
 */

'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import {
  Button,
  Badge,
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

/**
 * Render a condition object as human-readable chip text.
 */
function formatCondition(condition: Record<string, unknown>): string {
  const field = String(condition.field ?? '').replace(/_/g, ' ');
  const operator = String(condition.operator ?? '');
  const value = String(condition.value ?? '');

  const opMap: Record<string, string> = {
    equals: ':',
    not_equals: '≠',
    greater_than: '>',
    less_than: '<',
    gte: '>=',
    lte: '<=',
    contains: '~',
    in: 'in',
  };
  const displayOp = opMap[operator] ?? operator;
  const displayField = field.charAt(0).toUpperCase() + field.slice(1);
  return `${displayField} ${displayOp} ${value.toUpperCase()}`;
}

/**
 * Render an action object as human-readable chip text.
 */
function formatAction(action: Record<string, unknown>): string {
  const type = String(action.type ?? '');
  const target = String(action.target ?? '');

  const typeMap: Record<string, string> = {
    assign_to_user: 'Assign to',
    assign_to_skill: 'Assign to',
    assign_to_team: 'Assign to',
    change_status: 'Set status',
    escalate: 'Escalate to',
    notify: 'Notify',
  };
  const displayType = typeMap[type] ?? type;
  return `${displayType}: ${target}`;
}

interface RuleFormData {
  name: string;
  description: string;
  priority: number;
  conditions: Array<{ field: string; operator: string; value: string }>;
  actions: Array<{ type: string; target: string }>;
}

const defaultFormData: RuleFormData = {
  name: '',
  description: '',
  priority: 0,
  conditions: [{ field: 'category', operator: 'equals', value: '' }],
  actions: [{ type: 'assign_to_skill', target: '' }],
};

export function AutomationRuleBuilder() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<RuleFormData>(defaultFormData);

  const utils = trpc.useUtils();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tRPC deep type instantiation workaround
  const { data: rulesData, isLoading } = (trpc.routing.list as any).useQuery({ limit: 100 }) as {
    data: any;
    isLoading: boolean;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tRPC deep type instantiation workaround
  const createMutation = (trpc.routing.create as any).useMutation({
    onSuccess: () => {
      utils.routing.list.invalidate();
      setDialogOpen(false);
      toast({ title: 'Rule created' });
    },
    onError: (err: { message: string }) =>
      toast({ title: err.message, variant: 'destructive' as const }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateMutation = (trpc.routing.update as any).useMutation({
    onSuccess: () => {
      utils.routing.list.invalidate();
      setDialogOpen(false);
      setEditingId(null);
      toast({ title: 'Rule updated' });
    },
    onError: (err: { message: string }) =>
      toast({ title: err.message, variant: 'destructive' as const }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deleteMutation = (trpc.routing.delete as any).useMutation({
    onSuccess: () => {
      utils.routing.list.invalidate();
      toast({ title: 'Rule deleted' });
    },
    onError: (err: { message: string }) =>
      toast({ title: err.message, variant: 'destructive' as const }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toggleMutation = (trpc.routing.toggle as any).useMutation({
    onSuccess: () => utils.routing.list.invalidate(),
    onError: (err: { message: string }) =>
      toast({ title: err.message, variant: 'destructive' as const }),
  });

  const rules = rulesData?.items ?? [];

  function openCreate() {
    setEditingId(null);
    setFormData(defaultFormData);
    setDialogOpen(true);
  }

  function openEdit(rule: (typeof rules)[number]) {
    setEditingId(rule.id);
    const conditions = Array.isArray(rule.conditions)
      ? (rule.conditions as Array<Record<string, unknown>>).map((c) => ({
          field: String(c.field ?? 'category'),
          operator: String(c.operator ?? 'equals'),
          value: String(c.value ?? ''),
        }))
      : [{ field: 'category', operator: 'equals', value: '' }];
    const actions = Array.isArray(rule.actions)
      ? (rule.actions as Array<Record<string, unknown>>).map((a) => ({
          type: String(a.type ?? 'assign_to_skill'),
          target: String(a.target ?? ''),
        }))
      : [{ type: 'assign_to_skill', target: '' }];

    setFormData({
      name: rule.name,
      description: rule.description ?? '',
      priority: rule.priority,
      conditions,
      actions,
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!formData.name.trim()) return;
    const conditions = formData.conditions
      .filter((c) => c.value)
      .map((c) => ({ field: c.field as any, operator: c.operator as any, value: c.value }));
    const actions = formData.actions
      .filter((a) => a.target)
      .map((a) => ({ type: a.type as any, target: a.target }));
    const payload = {
      name: formData.name,
      description: formData.description || undefined,
      priority: formData.priority,
      isActive: true,
      conditions,
      actions,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function updateCondition(index: number, field: string, value: string) {
    setFormData((f) => {
      const conditions = [...f.conditions];
      conditions[index] = { ...conditions[index], [field]: value };
      return { ...f, conditions };
    });
  }

  function updateAction(index: number, field: string, value: string) {
    setFormData((f) => {
      const actions = [...f.actions];
      actions[index] = { ...actions[index], [field]: value };
      return { ...f, actions };
    });
  }

  if (isLoading) return <ConfigCardSkeleton />;

  if (!rules.length) {
    return (
      <ConfigEmptyState
        title="No Automation Rules"
        description="Create rules to automatically route, assign, and escalate tickets."
        actionLabel="Create Rule"
        onAction={openCreate}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate} aria-label="Create new automation rule">
          <Plus className="mr-2 h-4 w-4" />
          Create Rule
        </Button>
      </div>

      <Table aria-label="Automation Rules">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Conditions</TableHead>
            <TableHead>Actions</TableHead>
            <TableHead>Active</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule: any) => {
            const conditions = Array.isArray(rule.conditions)
              ? (rule.conditions as Array<Record<string, unknown>>)
              : [];
            const actions = Array.isArray(rule.actions)
              ? (rule.actions as Array<Record<string, unknown>>)
              : [];

            return (
              <TableRow key={rule.id}>
                <TableCell className="font-medium">{rule.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{rule.priority}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {conditions.length > 0 ? (
                      conditions.map((c, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {formatCondition(c)}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">No conditions</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {actions.length > 0 ? (
                      actions.map((a, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {formatAction(a)}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">No actions</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={rule.isActive}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ id: rule.id, isActive: checked })
                    }
                    aria-label={`Toggle ${rule.name} active state`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(rule)}
                      aria-label={`Edit ${rule.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate({ id: rule.id })}
                      aria-label={`Delete ${rule.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Rule Builder Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Rule' : 'Create Automation Rule'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="rule-name">Name</Label>
              <Input
                id="rule-name"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. High Priority Billing"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rule-desc">Description</Label>
              <Textarea
                id="rule-desc"
                value={formData.description}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rule-priority">Priority</Label>
              <Input
                id="rule-priority"
                type="number"
                min={0}
                value={formData.priority}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, priority: parseInt(e.target.value) || 0 }))
                }
              />
            </div>

            {/* Conditions */}
            <div>
              <h4 className="mb-2 text-sm font-medium">Conditions</h4>
              {formData.conditions.map((condition, idx) => (
                <div key={idx} className="mb-2 grid grid-cols-3 gap-2">
                  <Select
                    value={condition.field}
                    onValueChange={(v) => updateCondition(idx, 'field', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="category">Category</SelectItem>
                      <SelectItem value="priority">Priority</SelectItem>
                      <SelectItem value="slaStatus">SLA Status</SelectItem>
                      <SelectItem value="leadScore">Lead Score</SelectItem>
                      <SelectItem value="leadSource">Lead Source</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={condition.operator}
                    onValueChange={(v) => updateCondition(idx, 'operator', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">Equals</SelectItem>
                      <SelectItem value="not_equals">Not Equals</SelectItem>
                      <SelectItem value="greater_than">Greater Than</SelectItem>
                      <SelectItem value="less_than">Less Than</SelectItem>
                      <SelectItem value="gte">Greater or Equal</SelectItem>
                      <SelectItem value="contains">Contains</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={condition.value}
                    onChange={(e) => updateCondition(idx, 'value', e.target.value)}
                    placeholder="Value"
                  />
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setFormData((f) => ({
                    ...f,
                    conditions: [
                      ...f.conditions,
                      { field: 'category', operator: 'equals', value: '' },
                    ],
                  }))
                }
              >
                Add Condition
              </Button>
            </div>

            {/* Actions */}
            <div>
              <h4 className="mb-2 text-sm font-medium">Actions</h4>
              {formData.actions.map((action, idx) => (
                <div key={idx} className="mb-2 grid grid-cols-2 gap-2">
                  <Select value={action.type} onValueChange={(v) => updateAction(idx, 'type', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="assign_to_user">Assign to User</SelectItem>
                      <SelectItem value="assign_to_skill">Assign to Skill Group</SelectItem>
                      <SelectItem value="assign_to_team">Assign to Team</SelectItem>
                      <SelectItem value="change_status">Change Status</SelectItem>
                      <SelectItem value="escalate">Escalate</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={action.target}
                    onChange={(e) => updateAction(idx, 'target', e.target.value)}
                    placeholder="Target"
                  />
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setFormData((f) => ({
                    ...f,
                    actions: [...f.actions, { type: 'assign_to_skill', target: '' }],
                  }))
                }
              >
                Add Action
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!formData.name.trim()}>
              {editingId ? 'Save Changes' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
