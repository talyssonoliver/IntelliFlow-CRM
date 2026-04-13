'use client';

import { Label } from '@intelliflow/ui';
import { VariablePicker, variablesForEntityKind } from '@/components/shared/variable-picker';
import type { NodeConfigFormProps } from './types';

export function LogConfig({ config, update }: NodeConfigFormProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="log-message">Log message</Label>
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
        ariaLabel="Log message"
        placeholder="Structured log line — variables are interpolated at runtime."
      />
    </div>
  );
}
