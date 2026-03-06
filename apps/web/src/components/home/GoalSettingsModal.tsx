'use client';

import { useState, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  RadioGroup,
  RadioGroupItem,
  Input,
  Label,
} from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';

const GOAL_OPTIONS = [
  {
    value: 'revenue',
    label: 'Revenue',
    icon: 'attach_money',
    description: 'Track daily revenue target',
  },
  { value: 'calls', label: 'Calls', icon: 'call', description: 'Number of calls to make' },
  { value: 'meetings', label: 'Meetings', icon: 'event', description: 'Meetings to schedule' },
  { value: 'tasks', label: 'Tasks', icon: 'task_alt', description: 'Tasks to complete' },
  { value: 'custom', label: 'Custom', icon: 'tune', description: 'Define your own metric' },
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-md flex flex-col overflow-hidden p-0 gap-0"
      >
        {/* Header */}
        <div className="p-6 border-b border-[#e2e8f0] dark:border-[#334155] flex-shrink-0">
          <SheetTitle className="text-xl font-bold text-slate-900 dark:text-white">
            Goal Settings
          </SheetTitle>
          <SheetDescription className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Choose your daily goal type and target
          </SheetDescription>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Goal Type
            </Label>
            <RadioGroup
              value={goalType}
              onValueChange={setGoalType}
              className="mt-3 space-y-1"
              data-testid="goal-type-selector"
            >
              {GOAL_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  htmlFor={`goal-${option.value}`}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="size-10 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300">
                      <span className="material-symbols-outlined">{option.icon}</span>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-200 text-sm">
                        {option.label}
                      </p>
                      <p className="text-xs text-slate-500">{option.description}</p>
                    </div>
                  </div>
                  <RadioGroupItem
                    value={option.value}
                    id={`goal-${option.value}`}
                    data-testid={`radio-${option.value}`}
                  />
                </label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label
              htmlFor="target-value"
              className="text-sm font-semibold text-slate-700 dark:text-slate-300"
            >
              Daily Target
            </Label>
            <div className="flex items-center gap-2 mt-2">
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
              <Label
                htmlFor="custom-unit"
                className="text-sm font-semibold text-slate-700 dark:text-slate-300"
              >
                Unit Label
              </Label>
              <Input
                id="custom-unit"
                type="text"
                placeholder="e.g., demos, proposals"
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                data-testid="custom-unit-input"
                className="mt-2 max-w-[200px]"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#e2e8f0] dark:border-[#334155] bg-slate-50/50 dark:bg-slate-800/20 flex gap-3 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={!targetValue || targetValue <= 0}
            className="flex-1 px-4 py-2.5 bg-[#137fec] text-white rounded-lg font-semibold hover:bg-[#0e6ac7] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Changes
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2.5 border border-[#e2e8f0] dark:border-[#334155] text-slate-600 dark:text-slate-300 rounded-lg font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
