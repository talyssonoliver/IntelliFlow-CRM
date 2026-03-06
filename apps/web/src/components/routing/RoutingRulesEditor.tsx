'use client';

/**
 * RoutingRulesEditor
 *
 * PG-132: Smart Lead Routing UI
 *
 * CRUD interface for routing rules with drag-drop priority reordering.
 * Uses @dnd-kit for DnD, Sheet for rule editor form.
 */

import { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  Switch,
  Textarea,
} from '@intelliflow/ui';
import {
  ROUTING_CONDITION_FIELDS,
  ROUTING_CONDITION_OPERATORS,
  ROUTING_ACTION_TYPES,
} from '@intelliflow/domain';
import { useRouting } from '@/app/settings/routing/hooks/useRouting';
import type { RoutingCondition, RoutingAction } from '@intelliflow/validators';

interface RoutingRule {
  id: string;
  name: string;
  description?: string | null;
  priority: number;
  isActive: boolean;
  conditions: RoutingCondition[];
  actions: RoutingAction[];
}

interface RuleFormData {
  name: string;
  description: string;
  conditions: RoutingCondition[];
  actions: RoutingAction[];
}

const emptyCondition: RoutingCondition = {
  field: 'leadScore',
  operator: 'greater_than',
  value: '',
};
const emptyAction: RoutingAction = { type: 'assign_to_user', target: '' };

/** Parse Prisma Json fields into typed RoutingRule with conditions/actions arrays.
 *  Prisma returns Json columns as `JsonValue` (typed as `[x: string]: any` in the tRPC response).
 *  We validate the shape here at the boundary rather than casting. */
function parseRoutingRule(
  row: Record<string, unknown> & {
    id: string;
    name: string;
    description?: string | null;
    priority: number;
    isActive: boolean;
  }
): RoutingRule {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priority: row.priority,
    isActive: row.isActive,
    conditions: Array.isArray(row.conditions) ? (row.conditions as RoutingCondition[]) : [],
    actions: Array.isArray(row.actions) ? (row.actions as RoutingAction[]) : [],
  };
}

function SortableRule({
  rule,
  onEdit,
  onDelete,
  onDuplicate,
  onToggle,
}: {
  rule: RoutingRule;
  onEdit: (rule: RoutingRule) => void;
  onDelete: (id: string) => void;
  onDuplicate: (rule: RoutingRule) => void;
  onToggle: (id: string, isActive: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: rule.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const conditions: RoutingCondition[] = Array.isArray(rule.conditions) ? rule.conditions : [];
  const actions: RoutingAction[] = Array.isArray(rule.actions) ? rule.actions : [];

  const conditionsSummary = conditions
    .map((c) => `${c.field} ${c.operator} ${Array.isArray(c.value) ? c.value.join(', ') : c.value}`)
    .join(' AND ');

  const actionsSummary = actions
    .map((a) => `${a.type}${a.target ? `: ${a.target}` : ''}`)
    .join(' → ');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 border rounded-lg bg-card hover:bg-accent/50 transition-colors"
      role="option"
      aria-selected={false}
      aria-grabbed={false}
    >
      <button
        className="cursor-grab text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${rule.name}`}
      >
        <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
      </button>

      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{rule.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {conditionsSummary || 'No conditions'}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {actionsSummary || 'No actions'}
        </div>
      </div>

      <Switch
        checked={rule.isActive}
        onCheckedChange={(checked) => onToggle(rule.id, checked)}
        aria-label={`Toggle ${rule.name} active`}
      />

      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEdit(rule)}
          aria-label={`Edit ${rule.name}`}
        >
          <span className="material-symbols-outlined text-[18px]">edit</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDuplicate(rule)}
          aria-label={`Duplicate ${rule.name}`}
        >
          <span className="material-symbols-outlined text-[18px]">content_copy</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(rule.id)}
          aria-label={`Delete ${rule.name}`}
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </Button>
      </div>
    </div>
  );
}

export function RoutingRulesEditor() {
  const { rules, rulesLoading, createRule, updateRule, deleteRule, reorderRules, toggleRule } =
    useRouting();
  const [editingRule, setEditingRule] = useState<RoutingRule | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [formData, setFormData] = useState<RuleFormData>({
    name: '',
    description: '',
    conditions: [{ ...emptyCondition }],
    actions: [{ ...emptyAction }],
  });

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !rules) return;

      const oldIndex = rules.findIndex((r) => r.id === active.id);
      const newIndex = rules.findIndex((r) => r.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(rules, oldIndex, newIndex);
      reorderRules.mutate({
        rules: reordered.map((r, i) => ({ id: r.id, priority: i })),
      });
    },
    [rules, reorderRules]
  );

  const openCreate = () => {
    setEditingRule(null);
    setFormData({
      name: '',
      description: '',
      conditions: [{ ...emptyCondition }],
      actions: [{ ...emptyAction }],
    });
    setIsSheetOpen(true);
  };

  const openEdit = (rule: RoutingRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      description: rule.description || '',
      conditions: Array.isArray(rule.conditions) ? rule.conditions : [{ ...emptyCondition }],
      actions: Array.isArray(rule.actions) ? rule.actions : [{ ...emptyAction }],
    });
    setIsSheetOpen(true);
  };

  const openDuplicate = (rule: RoutingRule) => {
    setEditingRule(null);
    setFormData({
      name: `Copy of ${rule.name}`,
      description: rule.description || '',
      conditions: Array.isArray(rule.conditions) ? rule.conditions : [{ ...emptyCondition }],
      actions: Array.isArray(rule.actions) ? rule.actions : [{ ...emptyAction }],
    });
    setIsSheetOpen(true);
  };

  const handleSubmit = () => {
    if (editingRule) {
      updateRule.mutate({
        id: editingRule.id,
        name: formData.name,
        description: formData.description || undefined,
        conditions: formData.conditions,
        actions: formData.actions,
      });
    } else {
      createRule.mutate({
        name: formData.name,
        description: formData.description || undefined,
        conditions: formData.conditions,
        actions: formData.actions,
      });
    }
    setIsSheetOpen(false);
  };

  const addCondition = () => {
    setFormData((prev) => ({ ...prev, conditions: [...prev.conditions, { ...emptyCondition }] }));
  };

  const removeCondition = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== index),
    }));
  };

  const updateCondition = (
    index: number,
    field: keyof RoutingCondition,
    value: string | number | string[]
  ) => {
    setFormData((prev) => ({
      ...prev,
      conditions: prev.conditions.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    }));
  };

  const addAction = () => {
    setFormData((prev) => ({ ...prev, actions: [...prev.actions, { ...emptyAction }] }));
  };

  const removeAction = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== index),
    }));
  };

  const updateAction = (index: number, field: keyof RoutingAction, value: string | string[]) => {
    setFormData((prev) => ({
      ...prev,
      actions: prev.actions.map((a, i) => (i === index ? { ...a, [field]: value } : a)),
    }));
  };

  if (rulesLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" /> // NOSONAR typescript:S6479 — static skeleton placeholder, no data identity
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Routing Rules</CardTitle>
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetTrigger asChild>
            <Button onClick={openCreate} className="gap-2">
              <span className="material-symbols-outlined text-[18px]">add</span> Add Rule
            </Button>
          </SheetTrigger>
          <SheetContent className="sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{editingRule ? 'Edit Rule' : 'Create Rule'}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label htmlFor="rule-name">Name</Label>
                <Input
                  id="rule-name"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  maxLength={100}
                  placeholder="e.g., High Score Leads"
                />
              </div>
              <div>
                <Label htmlFor="rule-desc">Description</Label>
                <Textarea
                  id="rule-desc"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  maxLength={500}
                  placeholder="Optional description"
                />
              </div>

              {/* Conditions Builder */}
              <div>
                <Label>Conditions</Label>
                <div className="space-y-2 mt-2">
                  {formData.conditions.map((condition, i) => (
                    <div key={`condition-${i}`} className="flex gap-2 items-start">
                      {' '}
                      {/* NOSONAR typescript:S6479 — mutable form builder array, index is positional identifier */}
                      <Select
                        value={condition.field}
                        onValueChange={(v) => updateCondition(i, 'field', v)}
                      >
                        <SelectTrigger className="w-[140px]" aria-label="Condition field">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROUTING_CONDITION_FIELDS.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={condition.operator}
                        onValueChange={(v) => updateCondition(i, 'operator', v)}
                      >
                        <SelectTrigger className="w-[130px]" aria-label="Condition operator">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROUTING_CONDITION_OPERATORS.map((o) => (
                            <SelectItem key={o} value={o}>
                              {o.replace(/_/g, ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={String(condition.value)}
                        onChange={(e) => updateCondition(i, 'value', e.target.value)}
                        placeholder="Value"
                        className="flex-1"
                        aria-label="Condition value"
                      />
                      {formData.conditions.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCondition(i)}
                          aria-label="Remove condition"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addCondition} className="gap-1">
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    Add Condition
                  </Button>
                </div>
              </div>

              {/* Actions Builder */}
              <div>
                <Label>Actions</Label>
                <div className="space-y-2 mt-2">
                  {formData.actions.map((action, i) => (
                    <div key={`action-${i}`} className="flex gap-2 items-start">
                      {' '}
                      {/* NOSONAR typescript:S6479 — mutable form builder array, index is positional identifier */}
                      <Select value={action.type} onValueChange={(v) => updateAction(i, 'type', v)}>
                        <SelectTrigger className="w-[160px]" aria-label="Action type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROUTING_ACTION_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t.replace(/_/g, ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={action.target || ''}
                        onChange={(e) => updateAction(i, 'target', e.target.value)}
                        placeholder="Target"
                        className="flex-1"
                        aria-label="Action target"
                      />
                      {formData.actions.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeAction(i)}
                          aria-label="Remove action"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addAction} className="gap-1">
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    Add Action
                  </Button>
                </div>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={
                  !formData.name ||
                  formData.conditions.length === 0 ||
                  formData.actions.length === 0
                }
                className="w-full"
              >
                {editingRule ? 'Update Rule' : 'Create Rule'}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </CardHeader>
      <CardContent>
        {!rules || rules.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <span className="material-symbols-outlined text-[48px] mb-4 block">rule</span>
            <p>No routing rules configured</p>
            <p className="text-sm mt-1">
              Create your first rule to start routing leads automatically.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={rules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2" role="listbox" aria-label="Routing rules list">
                {rules.map(parseRoutingRule).map((rule) => (
                  <SortableRule
                    key={rule.id}
                    rule={rule}
                    onEdit={openEdit}
                    onDelete={(id) => deleteRule.mutate({ id })}
                    onDuplicate={openDuplicate}
                    onToggle={(id, isActive) => toggleRule.mutate({ id, isActive })}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}
