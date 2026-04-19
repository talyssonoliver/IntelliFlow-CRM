'use client';

/**
 * FieldDescriptorBuilder — shared editor for a FieldDescriptor[] array.
 *
 * Used by both admin pages (custom-node-types + custom-actions) to edit
 * the `configSchema` / `inputSchema` / `outputSchema` JSON arrays.
 *
 * Each row: key, label, type-select, required-checkbox, enum values
 * (when type === 'enum'), + remove button. Emits the array via onChange.
 */

import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@intelliflow/ui';
import { FIELD_DESCRIPTOR_TYPES, type FieldDescriptor } from '@intelliflow/domain';

export interface FieldDescriptorBuilderProps {
  value: FieldDescriptor[];
  onChange: (next: FieldDescriptor[]) => void;
  disabled?: boolean;
}

function emptyRow(): FieldDescriptor {
  return {
    key: '',
    label: '',
    type: 'string',
    required: false,
  };
}

export function FieldDescriptorBuilder({ value, onChange, disabled }: FieldDescriptorBuilderProps) {
  const writeRow = (idx: number, patch: Partial<FieldDescriptor>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch } as FieldDescriptor;
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label>Fields</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onChange([...value, emptyRow()])}
        >
          <span className="material-symbols-outlined text-base mr-1" aria-hidden="true">
            add
          </span>{' '}
          Add field
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">No fields defined yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {value.map((row, idx) => (
            <div
              key={idx}
              className="rounded-md border border-input p-2 flex flex-col gap-2"
              data-testid={`field-row-${idx}`}
            >
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="key (identifier)"
                  aria-label={`Field ${idx + 1} key`}
                  value={row.key}
                  disabled={disabled}
                  onChange={(e) => writeRow(idx, { key: e.target.value })}
                  className="flex-1"
                />
                <Input
                  placeholder="Label"
                  aria-label={`Field ${idx + 1} label`}
                  value={row.label}
                  disabled={disabled}
                  onChange={(e) => writeRow(idx, { label: e.target.value })}
                  className="flex-1"
                />
                <Select
                  value={row.type}
                  disabled={disabled}
                  onValueChange={(val) => writeRow(idx, { type: val as FieldDescriptor['type'] })}
                >
                  <SelectTrigger className="w-[130px]" aria-label={`Field ${idx + 1} type`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_DESCRIPTOR_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label
                  htmlFor={`field-${idx}-required`}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <Checkbox
                    id={`field-${idx}-required`}
                    checked={row.required}
                    disabled={disabled}
                    onCheckedChange={(v) => writeRow(idx, { required: Boolean(v) })}
                    aria-label={`Field ${idx + 1} required`}
                  />
                  Required
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onChange(value.filter((_, i) => i !== idx))}
                  aria-label={`Remove field ${idx + 1}`}
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    delete
                  </span>
                </Button>
              </div>
              {row.type === 'enum' && (
                <Input
                  placeholder="Comma-separated enum values (e.g. low,high)"
                  aria-label={`Field ${idx + 1} enum values`}
                  value={(row.enumValues ?? []).join(',')}
                  disabled={disabled}
                  onChange={(e) =>
                    writeRow(idx, {
                      enumValues: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
