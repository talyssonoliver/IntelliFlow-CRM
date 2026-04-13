'use client';

import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@intelliflow/ui';
import { PrioritySelect } from '@/components/shared/priority-select';
import { FlagSelect } from '@/components/shared/flag-select';
import { EntitySearchField } from '@/components/tasks/EntitySearchField';
import type { WorkflowEntityRef } from '@/lib/workflow-types';
import type { NodeConfigFormProps } from './types';

const LINKABLE_KINDS = ['lead', 'contact', 'account', 'opportunity'] as const;

export function CreateTaskConfig({ config, update }: NodeConfigFormProps) {
  const linked = config.linkedEntity;
  const isLinkable = (k: string | undefined): k is (typeof LINKABLE_KINDS)[number] =>
    !!k && (LINKABLE_KINDS as readonly string[]).includes(k);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="priority">Priority</Label>
        <PrioritySelect
          value={config.priority}
          onChange={(p) => update({ priority: p })}
          ariaLabel="Task priority"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="task-title">Task title</Label>
        <Input
          id="task-title"
          value={config.title ?? ''}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Short summary"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="task-description">Description</Label>
        <textarea
          id="task-description"
          className="w-full rounded-md border border-input px-3 py-2 text-sm min-h-[60px] resize-y"
          aria-label="Task description"
          value={config.description ?? ''}
          onChange={(e) => update({ description: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Linked CRM entity</Label>
        <Select
          value={linked?.kind ?? ''}
          onValueChange={(kind) => {
            const k = kind as WorkflowEntityRef['kind'];
            update({
              linkedEntity: linked?.kind === k ? linked : { kind: k, id: '', label: '' },
            });
          }}
        >
          <SelectTrigger aria-label="Linked entity kind">
            <SelectValue placeholder="Pick an entity kind…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lead">Lead</SelectItem>
            <SelectItem value="contact">Contact</SelectItem>
            <SelectItem value="account">Account</SelectItem>
            <SelectItem value="opportunity">Deal</SelectItem>
          </SelectContent>
        </Select>
        {isLinkable(linked?.kind) && (
          <EntitySearchField
            entityType={linked!.kind as (typeof LINKABLE_KINDS)[number]}
            value={linked!.id}
            valueName={linked!.label ?? ''}
            onChange={(id, label) => update({ linkedEntity: { kind: linked!.kind, id, label } })}
          />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label>Flag (optional)</Label>
        <FlagSelect
          value={config.flag}
          onChange={(f) => update({ flag: f })}
          ariaLabel="Task flag"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="task-due">Due in (hours)</Label>
        <Input
          id="task-due"
          type="number"
          min={1}
          value={config.dueInHours ?? ''}
          onChange={(e) =>
            update({ dueInHours: e.target.value ? Number(e.target.value) : undefined })
          }
        />
      </div>
    </>
  );
}
