'use client';

import { Input, Label } from '@intelliflow/ui';
import { PrioritySelect } from '@/components/shared/priority-select';
import { VariablePicker, variablesForEntityKind } from '@/components/shared/variable-picker';
import type { NodeConfigFormProps } from './types';

export function HumanConfig({ config, update }: NodeConfigFormProps) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="human-priority">Approval priority</Label>
        <PrioritySelect
          value={config.priority}
          onChange={(p) => update({ priority: p })}
          ariaLabel="Approval priority"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="instructions">Instructions for approver</Label>
        <VariablePicker
          multiline
          value={config.instructions ?? ''}
          onChange={(next) => update({ instructions: next })}
          variables={[
            ...variablesForEntityKind('lead'),
            ...variablesForEntityKind('contact'),
            ...variablesForEntityKind('account'),
            ...variablesForEntityKind('deal'),
            ...variablesForEntityKind('case'),
          ]}
          ariaLabel="Instructions"
          placeholder="What should the approver decide?"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="human-deadline">Deadline (hours)</Label>
        <Input
          id="human-deadline"
          type="number"
          min={1}
          value={config.deadlineInHours ?? config.timeout ?? ''}
          onChange={(e) =>
            update({
              deadlineInHours: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          placeholder="Auto-escalate if no decision within this window"
        />
      </div>
    </>
  );
}
