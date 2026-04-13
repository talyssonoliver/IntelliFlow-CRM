'use client';

import { Label } from '@intelliflow/ui';
import { PrioritySelect } from '@/components/shared/priority-select';
import { VariablePicker, variablesForEntityKind } from '@/components/shared/variable-picker';
import type { NodeConfigFormProps } from './types';

/** Shared form for send_notification + log_event actions. */
export function NotifyConfig({ config, update }: NodeConfigFormProps) {
  return (
    <>
      {config.actionType === 'send_notification' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="priority">Priority</Label>
          <PrioritySelect
            value={config.priority}
            onChange={(p) => update({ priority: p })}
            ariaLabel="Notification priority"
          />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="action-message">Message</Label>
        <VariablePicker
          multiline
          value={config.message ?? ''}
          onChange={(next) => update({ message: next })}
          variables={[
            ...variablesForEntityKind('lead'),
            ...variablesForEntityKind('contact'),
            ...variablesForEntityKind('account'),
            ...variablesForEntityKind('deal'),
          ]}
          ariaLabel="Action message"
          placeholder="Message body — use “Insert variable” to add interpolation tokens."
        />
      </div>
    </>
  );
}
