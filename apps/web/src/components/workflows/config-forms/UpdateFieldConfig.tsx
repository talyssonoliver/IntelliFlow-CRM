'use client';

import { Input, Label } from '@intelliflow/ui';
import type { NodeConfigFormProps } from './types';

export function UpdateFieldConfig({ config, update }: NodeConfigFormProps) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="update-field-name">Field name</Label>
        <Input
          id="update-field-name"
          value={config.fieldName ?? ''}
          onChange={(e) => update({ fieldName: e.target.value })}
          placeholder="e.g. status or stage"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="update-field-value">New value</Label>
        <Input
          id="update-field-value"
          value={config.newValue ?? ''}
          onChange={(e) => update({ newValue: e.target.value })}
          placeholder="Literal value or {{variable}} token"
        />
      </div>
    </>
  );
}
