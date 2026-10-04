/**
 * Automation Rule Builder - PG-173
 *
 * CRUD interface for ticket automation rules. Uses the ticketRouting.*Rule tRPC procedures
 * (ticket rules are stored apart from lead routing rules and never mix with them).
 * REUSES: shadcn Table, Badge, Dialog, Button, Input, Select, Switch, Card
 */

'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import {
  TICKET_ROUTING_ACTION_TYPES,
  TICKET_ROUTING_CONDITION_FIELDS,
  TICKET_ROUTING_CONDITION_OPERATORS,
  TICKET_ROUTING_FIELD_VALUES,
  type TicketRoutingActionType,
  type TicketRoutingConditionField,
  type TicketRoutingConditionOperator,
} from '@intelliflow/domain';
import {
  createTicketRuleSchema,
  type TicketRuleAction,
  type TicketRuleCondition,
} from '@intelliflow/validators';
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

import { ConfigEmptyState, ConfigCardSkeleton } from './ticket-config-shared';
import { toast } from '@intelliflow/ui';

const FIELD_LABELS: Record<TicketRoutingConditionField, string> = {
  ticketCategory: 'Category',
  ticketPriority: 'Priority',
  ticketStatus: 'Status',
  slaStatus: 'SLA Status',
  isSlaBreached: 'SLA Breached',
};

const OPERATOR_LABELS: Record<TicketRoutingConditionOperator, string> = {
  equals: 'Equals',
  not_equals: 'Not Equals',
  in: 'Is One Of',
  not_in: 'Is Not One Of',
  gte: 'Greater or Equal',
  lte: 'Less or Equal',
};

const OPERATOR_SYMBOLS: Record<TicketRoutingConditionOperator, string> = {
  equals: ':',
  not_equals: '≠',
  in: 'in',
  not_in: 'not in',
  gte: '>=',
  lte: '<=',
};

const ACTION_LABELS: Record<TicketRoutingActionType, string> = {
  assign_to_user: 'Assign to User',
  assign_to_skill: 'Assign to Skill Group',
};

function isOneOf<T extends string>(allowed: readonly T[], value: string): value is T {
  return allowed.some((item) => item === value);
}

function isListOperator(operator: TicketRoutingConditionOperator): boolean {
  return operator === 'in' || operator === 'not_in';
}

/**
 * Render a condition as human-readable chip text.
 */
function formatCondition(condition: TicketRuleCondition): string {
  const value = Array.isArray(condition.value) ? condition.value.join(', ') : condition.value;
  return `${FIELD_LABELS[condition.field]} ${OPERATOR_SYMBOLS[condition.operator]} ${value.toUpperCase()}`;
}

/**
 * Render an action as human-readable chip text.
 */
function formatAction(action: TicketRuleAction): string {
  return `Assign to: ${action.target}`;
}

interface ConditionFormData {
  field: TicketRoutingConditionField;
  operator: TicketRoutingConditionOperator;
  value: string;
}

interface ActionFormData {
  type: TicketRoutingActionType;
  target: string;
}

interface RuleFormData {
  name: string;
  description: string;
  priority: number;
  isActive: boolean;
  conditions: ConditionFormData[];
  actions: ActionFormData[];
}

const emptyCondition: ConditionFormData = {
  field: 'ticketCategory',
  operator: 'equals',
  value: '',
};

const emptyAction: ActionFormData = { type: 'assign_to_skill', target: '' };

const defaultFormData: RuleFormData = {
  name: '',
  description: '',
  priority: 0,
  isActive: true,
  conditions: [emptyCondition],
  actions: [emptyAction],
};

/**
 * Resolve typed text to the canonical value for the field (case-insensitive), so
 * "billing" becomes BILLING and "TRUE" becomes true. Unknown text is kept as typed
 * and left for the schema to reject.
 */
function toCanonicalValue(field: TicketRoutingConditionField, text: string): string {
  const typed = text.trim();
  const match = TICKET_ROUTING_FIELD_VALUES[field].find(
    (allowed) => allowed.toUpperCase() === typed.toUpperCase()
  );
  return match ?? typed.toUpperCase();
}

/**
 * Turn what the user typed into the stored value: list operators take a
 * comma-separated list.
 */
function toConditionValue(condition: ConditionFormData): string | string[] {
  if (!isListOperator(condition.operator)) {
    return toCanonicalValue(condition.field, condition.value);
  }
  return condition.value
    .split(',')
    .filter((part) => part.trim())
    .map((part) => toCanonicalValue(condition.field, part));
}

export function AutomationRuleBuilder() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<RuleFormData>(defaultFormData);

  const utils = trpc.useUtils();
  const { data: rules = [], isLoading } = trpc.ticketRouting.listRules.useQuery({});

  const createMutation = trpc.ticketRouting.createRule.useMutation({
    onSuccess: () => {
      utils.ticketRouting.listRules.invalidate();
      setDialogOpen(false);
      toast({ title: 'Rule created' });
    },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });
  const updateMutation = trpc.ticketRouting.updateRule.useMutation({
    onSuccess: () => {
      utils.ticketRouting.listRules.invalidate();
      setDialogOpen(false);
      setEditingId(null);
      toast({ title: 'Rule updated' });
    },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });
  const deleteMutation = trpc.ticketRouting.deleteRule.useMutation({
    onSuccess: () => {
      utils.ticketRouting.listRules.invalidate();
      toast({ title: 'Rule deleted' });
    },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });
  const toggleMutation = trpc.ticketRouting.toggleRule.useMutation({
    onSuccess: () => utils.ticketRouting.listRules.invalidate(),
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });

  function openCreate() {
    setEditingId(null);
    setFormData(defaultFormData);
    setDialogOpen(true);
  }

  function openEdit(rule: (typeof rules)[number]) {
    setEditingId(rule.id);
    setFormData({
      name: rule.name,
      description: rule.description ?? '',
      priority: rule.priority,
      isActive: rule.isActive,
      conditions: rule.conditions.length
        ? rule.conditions.map((c) => ({
            field: c.field,
            operator: c.operator,
            value: Array.isArray(c.value) ? c.value.join(', ') : c.value,
          }))
        : [emptyCondition],
      actions: rule.actions.length
        ? rule.actions.map((a) => ({ type: a.type, target: a.target }))
        : [emptyAction],
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!formData.name.trim()) return;
    const parsed = createTicketRuleSchema.safeParse({
      name: formData.name,
      description: formData.description || undefined,
      priority: formData.priority,
      isActive: formData.isActive,
      conditions: formData.conditions
        .filter((c) => c.value.trim())
        .map((c) => ({ field: c.field, operator: c.operator, value: toConditionValue(c) })),
      actions: formData.actions
        .filter((a) => a.target.trim())
        .map((a) => ({ type: a.type, target: a.target })),
    });
    if (!parsed.success) {
      toast({ title: parsed.error.issues[0].message, variant: 'destructive' });
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...parsed.data });
    } else {
      createMutation.mutate(parsed.data);
    }
  }

  function updateCondition(index: number, patch: Partial<ConditionFormData>) {
    setFormData((f) => ({
      ...f,
      conditions: f.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  }

  function updateAction(index: number, patch: Partial<ActionFormData>) {
    setFormData((f) => ({
      ...f,
      actions: f.actions.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }));
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
          <span className="material-symbols-outlined text-base mr-2" aria-hidden="true">
            add
          </span>{' '}
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
          {rules.map((rule) => (
            <TableRow key={rule.id}>
              <TableCell className="font-medium">{rule.name}</TableCell>
              <TableCell>
                <Badge variant="outline">{rule.priority}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {rule.conditions.length > 0 ? (
                    rule.conditions.map((c, i) => (
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
                  {rule.actions.length > 0 ? (
                    rule.actions.map((a, i) => (
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
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                      edit
                    </span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate({ id: rule.id })}
                    aria-label={`Delete ${rule.name}`}
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
                    onValueChange={(v) => {
                      if (isOneOf(TICKET_ROUTING_CONDITION_FIELDS, v)) {
                        updateCondition(idx, { field: v });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TICKET_ROUTING_CONDITION_FIELDS.map((field) => (
                        <SelectItem key={field} value={field}>
                          {FIELD_LABELS[field]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={condition.operator}
                    onValueChange={(v) => {
                      if (isOneOf(TICKET_ROUTING_CONDITION_OPERATORS, v)) {
                        updateCondition(idx, { operator: v });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TICKET_ROUTING_CONDITION_OPERATORS.map((operator) => (
                        <SelectItem key={operator} value={operator}>
                          {OPERATOR_LABELS[operator]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={condition.value}
                    onChange={(e) => updateCondition(idx, { value: e.target.value })}
                    placeholder={
                      isListOperator(condition.operator)
                        ? 'Comma-separated values'
                        : TICKET_ROUTING_FIELD_VALUES[condition.field].join(' / ')
                    }
                    aria-label={`Condition ${idx + 1} value`}
                  />
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setFormData((f) => ({ ...f, conditions: [...f.conditions, emptyCondition] }))
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
                  <Select
                    value={action.type}
                    onValueChange={(v) => {
                      if (isOneOf(TICKET_ROUTING_ACTION_TYPES, v)) {
                        updateAction(idx, { type: v });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TICKET_ROUTING_ACTION_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {ACTION_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={action.target}
                    onChange={(e) => updateAction(idx, { target: e.target.value })}
                    placeholder={action.type === 'assign_to_user' ? 'User ID' : 'Skill name'}
                    aria-label={`Action ${idx + 1} target`}
                  />
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFormData((f) => ({ ...f, actions: [...f.actions, emptyAction] }))}
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
