'use client';

import { useState } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@intelliflow/ui';
import type {
  CreateDealScoringRuleInput,
  UpdateDealScoringRuleInput,
} from '@intelliflow/validators';

type ScoringField = CreateDealScoringRuleInput['field'];
type ScoringOperator = CreateDealScoringRuleInput['operator'];

const FIELD_OPTIONS: { value: ScoringField; label: string }[] = [
  { value: 'value', label: 'Value' },
  { value: 'stage', label: 'Stage' },
  { value: 'expectedCloseDate', label: 'Expected close date' },
  { value: 'ownerId', label: 'Owner' },
  { value: 'accountIndustry', label: 'Account industry' },
];

const OPERATOR_OPTIONS: { value: ScoringOperator; label: string }[] = [
  { value: 'eq', label: '= equals' },
  { value: 'neq', label: '≠ not equals' },
  { value: 'gt', label: '> greater than' },
  { value: 'gte', label: '≥ greater or equal' },
  { value: 'lt', label: '< less than' },
  { value: 'lte', label: '≤ less or equal' },
  { value: 'contains', label: 'contains' },
  { value: 'in', label: 'in list' },
];

type ScoringValue =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'array'; value: (string | number)[] };

export interface DealScoringRuleRow {
  id: string;
  name: string;
  field: ScoringField;
  operator: ScoringOperator;
  valueJson: ScoringValue;
  points: number;
  isActive: boolean;
  sortOrder: number;
}

export interface DealScoringCardProps {
  readonly rules: DealScoringRuleRow[];
  readonly onCreate: (input: CreateDealScoringRuleInput) => void | Promise<void>;
  readonly onUpdate: (input: UpdateDealScoringRuleInput) => void | Promise<void>;
  readonly onDelete: (id: string) => void | Promise<void>;
  readonly isBusy?: boolean;
}

interface DialogState {
  open: boolean;
  editing?: DealScoringRuleRow;
  name: string;
  field: ScoringField;
  operator: ScoringOperator;
  valueType: 'number' | 'string' | 'array';
  valueRaw: string;
  points: number;
}

const EMPTY: DialogState = {
  open: false,
  name: '',
  field: 'value',
  operator: 'gte',
  valueType: 'number',
  valueRaw: '50000',
  points: 10,
};

function parseValue(type: 'number' | 'string' | 'array', raw: string): ScoringValue {
  if (type === 'number') return { type: 'number', value: Number.parseFloat(raw) || 0 };
  if (type === 'array') {
    return {
      type: 'array',
      value: raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
  return { type: 'string', value: raw };
}

function formatValue(value: ScoringValue): string {
  if (value.type === 'array') {
    return value.value.join(', ');
  }
  return String(value.value ?? '');
}

export function DealScoringCard({
  rules,
  onCreate,
  onUpdate,
  onDelete,
  isBusy = false,
}: Readonly<DealScoringCardProps>) {
  const [dialog, setDialog] = useState<DialogState>(EMPTY);

  const openCreate = () => setDialog({ ...EMPTY, open: true });
  const openEdit = (rule: DealScoringRuleRow) =>
    setDialog({
      open: true,
      editing: rule,
      name: rule.name,
      field: rule.field,
      operator: rule.operator,
      valueType: rule.valueJson.type,
      valueRaw: formatValue(rule.valueJson),
      points: rule.points,
    });
  const close = () => setDialog(EMPTY);

  const submit = async () => {
    const name = dialog.name.trim();
    if (!name) return;
    const valueJson = parseValue(dialog.valueType, dialog.valueRaw);
    const payload = {
      name,
      field: dialog.field,
      operator: dialog.operator,
      valueJson,
      points: dialog.points,
      isActive: dialog.editing?.isActive ?? true,
    };
    if (dialog.editing) {
      await onUpdate({ id: dialog.editing.id, ...payload });
    } else {
      await onCreate(payload);
    }
    close();
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Runtime scoring engine delivered by IFC-312. Rules defined here persist for the engine to
        consume.
      </p>
      {rules.length === 0 ? (
        <EmptyState
          entity="rules"
          size="sm"
          phase="passive"
          title="No scoring rules yet"
          description="Add a rule to start shaping deal scores."
          className="py-4 px-3 gap-2"
        />
      ) : (
        <Card className="divide-y divide-border">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center gap-3 px-4 py-3"
              data-testid={`deal-scoring-row-${rule.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{rule.name}</div>
                <div className="text-xs text-muted-foreground">
                  {rule.field} {rule.operator} {formatValue(rule.valueJson)} → {rule.points} pts
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => openEdit(rule)} disabled={isBusy}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDelete(rule.id)}
                disabled={isBusy}
              >
                Delete
              </Button>
            </div>
          ))}
        </Card>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          Add Rule
        </Button>
      </div>

      <Dialog open={dialog.open} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Edit rule' : 'Add scoring rule'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label htmlFor="rule-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="rule-name"
                value={dialog.name}
                onChange={(e) => setDialog((d) => ({ ...d, name: e.target.value }))}
                placeholder="High-value deals"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="rule-field" className="text-sm font-medium">
                  Field
                </label>
                <Select
                  value={dialog.field}
                  onValueChange={(v) => setDialog((d) => ({ ...d, field: v as ScoringField }))}
                >
                  <SelectTrigger id="rule-field">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="rule-op" className="text-sm font-medium">
                  Operator
                </label>
                <Select
                  value={dialog.operator}
                  onValueChange={(v) =>
                    setDialog((d) => ({ ...d, operator: v as ScoringOperator }))
                  }
                >
                  <SelectTrigger id="rule-op">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATOR_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="rule-value-type" className="text-sm font-medium">
                  Value type
                </label>
                <Select
                  value={dialog.valueType}
                  onValueChange={(v) =>
                    setDialog((d) => ({ ...d, valueType: v as 'number' | 'string' | 'array' }))
                  }
                >
                  <SelectTrigger id="rule-value-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="string">String</SelectItem>
                    <SelectItem value="array">List</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="rule-value" className="text-sm font-medium">
                  Value
                </label>
                <Input
                  id="rule-value"
                  value={dialog.valueRaw}
                  onChange={(e) => setDialog((d) => ({ ...d, valueRaw: e.target.value }))}
                  placeholder={dialog.valueType === 'array' ? 'a, b, c' : ''}
                />
              </div>
            </div>
            <div>
              <label htmlFor="rule-points" className="text-sm font-medium">
                Points
              </label>
              <Input
                id="rule-points"
                type="number"
                min={-100}
                max={100}
                value={dialog.points}
                onChange={(e) =>
                  setDialog((d) => ({
                    ...d,
                    points: Math.min(
                      100,
                      Math.max(-100, Number.parseInt(e.target.value || '0', 10))
                    ),
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={dialog.name.trim().length === 0}>
              {dialog.editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
