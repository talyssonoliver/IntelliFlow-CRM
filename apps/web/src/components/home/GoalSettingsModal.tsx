'use client';

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  RadioGroup,
  RadioGroupItem,
  Input,
  Button,
  Label,
} from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';

const GOAL_OPTIONS = [
  { value: 'revenue', label: 'Revenue', icon: 'attach_money' },
  { value: 'calls', label: 'Calls', icon: 'call' },
  { value: 'meetings', label: 'Meetings', icon: 'event' },
  { value: 'tasks', label: 'Tasks', icon: 'task_alt' },
  { value: 'custom', label: 'Custom', icon: 'tune' },
] as const;

interface GoalSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentGoal?: {
    type: 'revenue' | 'calls' | 'meetings' | 'tasks' | 'custom';
    targetValue: number;
    label?: string;
    unit?: string;
    [key: string]: unknown;
  };
}

export function GoalSettingsModal({
  open,
  onOpenChange,
  currentGoal,
}: Readonly<GoalSettingsModalProps>) {
  const [goalType, setGoalType] = useState<string>(currentGoal?.type || 'revenue');
  const [targetValue, setTargetValue] = useState<number>(currentGoal?.targetValue || 0);
  const [customUnit, setCustomUnit] = useState<string>('');

  const utils = trpc.useUtils();
  const updateGoal = trpc.home.updateDailyGoal.useMutation({
    onSuccess: () => {
      utils.home.getDailyGoal.invalidate();
      onOpenChange(false);
    },
  });

  const handleSave = useCallback(() => {
    updateGoal.mutate({
      type: goalType as 'revenue' | 'calls' | 'meetings' | 'tasks' | 'custom',
      targetValue,
      ...(goalType === 'custom' && customUnit ? { customUnit } : {}),
    });
  }, [goalType, targetValue, customUnit, updateGoal]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    },
    [onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Goal Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label>Goal Type</Label>
            <RadioGroup
              value={goalType}
              onValueChange={setGoalType}
              className="mt-2 space-y-2"
              data-testid="goal-type-selector"
            >
              {GOAL_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center gap-2">
                  <RadioGroupItem
                    value={option.value}
                    id={`goal-${option.value}`}
                    data-testid={`radio-${option.value}`}
                  />
                  <Label htmlFor={`goal-${option.value}`} className="flex items-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-sm">{option.icon}</span>
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="target-value">Daily Target</Label>
            <div className="flex items-center gap-2 mt-1">
              {goalType === 'revenue' && <span className="text-slate-500">$</span>}
              <Input
                id="target-value"
                type="number"
                min={1}
                value={targetValue || ''}
                onChange={(e) => setTargetValue(parseInt(e.target.value, 10) || 0)}
                data-testid="target-value-input"
                className="max-w-[200px]"
              />
              {goalType !== 'revenue' && goalType !== 'custom' && (
                <span className="text-sm text-slate-500">{goalType}</span>
              )}
            </div>
          </div>

          {goalType === 'custom' && (
            <div>
              <Label htmlFor="custom-unit">Unit Label</Label>
              <Input
                id="custom-unit"
                type="text"
                placeholder="e.g., demos, proposals"
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                data-testid="custom-unit-input"
                className="mt-1 max-w-[200px]"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!targetValue || targetValue <= 0}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
