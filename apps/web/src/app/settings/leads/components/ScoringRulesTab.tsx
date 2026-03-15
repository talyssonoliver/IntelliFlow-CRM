'use client';

import { useCallback } from 'react';
import { Card, Input } from '@intelliflow/ui';

export interface ScoringRule {
  activityType: string;
  points: number;
}

interface ScoringRulesTabProps {
  rules: ScoringRule[];
  onRulesChange: (rules: ScoringRule[]) => void;
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  EMAIL_OPEN: 'Email Open',
  EMAIL_CLICK: 'Email Click',
  MEETING_SCHEDULED: 'Meeting Scheduled',
  FORM_SUBMISSION: 'Form Submission',
  WEBSITE_VISIT: 'Website Visit',
  CALL_COMPLETED: 'Call Completed',
};

export function ScoringRulesTab({ rules, onRulesChange }: Readonly<ScoringRulesTabProps>) {
  const handlePointsChange = useCallback(
    (activityType: string, value: string) => {
      const points = Math.min(1000, Math.max(0, Math.floor(Number(value) || 0)));
      onRulesChange(
        rules.map((r) =>
          r.activityType === activityType ? { ...r, points } : r
        )
      );
    },
    [rules, onRulesChange]
  );

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Scoring Rules</h3>
        <p className="text-sm text-muted-foreground">
          Assign point values to lead activities for automatic scoring.
        </p>
      </div>

      <div className="space-y-4">
        {rules.map((rule) => (
          <div
            key={rule.activityType}
            className="flex items-center justify-between gap-4"
          >
            <label
              htmlFor={`scoring-${rule.activityType}`}
              className="text-sm font-medium flex-1"
            >
              {ACTIVITY_TYPE_LABELS[rule.activityType] ?? rule.activityType}
            </label>
            <div className="flex items-center gap-2">
              <Input
                id={`scoring-${rule.activityType}`}
                type="number"
                min={0}
                max={1000}
                step={1}
                value={rule.points}
                onChange={(e) =>
                  handlePointsChange(rule.activityType, e.target.value)
                }
                className="w-20 h-8 text-right"
              />
              <span className="text-sm text-muted-foreground w-6">pts</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
