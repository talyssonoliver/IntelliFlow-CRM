'use client';

// Rule dialog — Trigger fieldset (PG-208): event / schedule / webhook. The
// trigger type is fixed once a rule exists (the router refuses a change), and
// the webhook option is offered only to webhook admins.

import {
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@intelliflow/ui';
import {
  TASK_AUTOMATION_EVENT_TYPES,
  TASK_AUTOMATION_OPEN_STAGES,
  TASK_AUTOMATION_TRIGGER_TYPES,
  type TaskAutomationEventType,
  type TaskAutomationTriggerType,
} from '@intelliflow/domain';
import { ScheduleCadenceFields } from '@/components/shared/schedule-cadence-fields';
import { TimezoneSelector } from '@/components/settings/TimezoneSelector';
import {
  OPEN_STAGE_LABELS,
  TRIGGER_TYPE_LABELS,
  type EventOption,
  type OpenStage,
} from '../task-automation-labels';
import type { RuleFormErrors, RuleFormState } from './rule-form';
import { FieldError, errorProps } from '@/components/shared/field-error';

const ANY_STAGE = '__any__';
const EVENT_SET: ReadonlySet<string> = new Set(TASK_AUTOMATION_EVENT_TYPES);
const STAGES: readonly OpenStage[] = TASK_AUTOMATION_OPEN_STAGES;

export interface TriggerFieldsProps {
  readonly form: RuleFormState;
  readonly onChange: (patch: Partial<RuleFormState>) => void;
  readonly errors: RuleFormErrors;
  readonly events: readonly EventOption[];
  readonly typeLocked: boolean;
  readonly canManageWebhooks: boolean;
}

function isTriggerType(value: string): value is TaskAutomationTriggerType {
  return (TASK_AUTOMATION_TRIGGER_TYPES as readonly string[]).includes(value);
}

function isEventType(value: string): value is TaskAutomationEventType {
  return EVENT_SET.has(value);
}

function EventFields({ form, onChange, errors, events }: TriggerFieldsProps) {
  const isStageChange = form.eventType === 'opportunity.stage_changed';
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="rule-event">Event</Label>
        <Select
          value={form.eventType}
          onValueChange={(v) => {
            if (isEventType(v)) onChange({ eventType: v, toStage: '' });
          }}
        >
          <SelectTrigger id="rule-event" {...errorProps('rule-event', errors.eventType)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {events.map((e) => (
              <SelectItem key={e.eventType} value={e.eventType}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="rule-event-error" message={errors.eventType} />
      </div>
      {isStageChange && (
        <div className="space-y-1.5">
          <Label htmlFor="rule-to-stage">To stage (optional)</Label>
          <Select
            value={form.toStage || ANY_STAGE}
            onValueChange={(v) =>
              onChange({ toStage: v === ANY_STAGE ? '' : (STAGES.find((s) => s === v) ?? '') })
            }
          >
            <SelectTrigger id="rule-to-stage" {...errorProps('rule-to-stage', errors.toStage)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_STAGE}>Any open stage</SelectItem>
              {STAGES.map((stage) => (
                <SelectItem key={stage} value={stage}>
                  {OPEN_STAGE_LABELS[stage]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="rule-to-stage-error" message={errors.toStage} />
        </div>
      )}
      <p className="text-xs text-muted-foreground md:col-span-2">
        Rules apply to events that happen after you save. A closed deal (won or lost) runs the “Deal
        won” or “Deal lost” rules. Leads created by the system produce tasks owned by the system
        user.
      </p>
    </div>
  );
}

function ScheduleFields({ form, onChange, errors }: TriggerFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <ScheduleCadenceFields
        idPrefix="rule"
        value={form.schedule}
        onChange={(key, value) => onChange({ schedule: { ...form.schedule, [key]: value } })}
        errors={{
          cadence: errors.cadence,
          dayOfWeek: errors.dayOfWeek,
          dayOfMonth: errors.dayOfMonth,
          timeOfDay: errors.timeOfDay,
          cronExpression: errors.cronExpression,
        }}
        cronHint="Five fields: minute, hour, day of month, month, day of week. At most once an hour."
      />
      <div className="space-y-1.5">
        <Label htmlFor="rule-timezone">Timezone</Label>
        <TimezoneSelector
          id="rule-timezone"
          value={form.timezone}
          onChange={(timezone) => onChange({ timezone })}
          invalid={Boolean(errors.timezone)}
          describedBy={errors.timezone ? 'rule-timezone-error' : undefined}
        />
        <FieldError id="rule-timezone-error" message={errors.timezone} />
      </div>
    </div>
  );
}

function WebhookExplanation() {
  return (
    <p className="text-sm text-muted-foreground">
      Saving gives you a webhook URL and a signing secret, shown once. Another system calls the URL
      with a signed JSON body; top-level fields can be used in the task as{' '}
      <code className="rounded bg-muted px-1">{'{{webhook.<field>}}'}</code>.
    </p>
  );
}

export function TriggerFields(props: TriggerFieldsProps) {
  const { form, onChange, typeLocked, canManageWebhooks } = props;
  const types = TASK_AUTOMATION_TRIGGER_TYPES.filter(
    (t) => t !== 'WEBHOOK' || canManageWebhooks || form.triggerType === 'WEBHOOK'
  );
  return (
    <fieldset className="space-y-4 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold text-foreground">Trigger</legend>
      <RadioGroup
        aria-label="Trigger type"
        aria-describedby={typeLocked ? 'rule-trigger-locked' : undefined}
        value={form.triggerType}
        onValueChange={(v) => {
          if (isTriggerType(v)) onChange({ triggerType: v });
        }}
        disabled={typeLocked}
        className="gap-2"
      >
        {types.map((type) => (
          <div key={type} className="flex items-center gap-2">
            <RadioGroupItem id={`rule-trigger-${type}`} value={type} />
            <Label htmlFor={`rule-trigger-${type}`} className="font-normal">
              {TRIGGER_TYPE_LABELS[type]}
            </Label>
          </div>
        ))}
      </RadioGroup>
      {typeLocked && (
        <p id="rule-trigger-locked" className="text-xs text-muted-foreground">
          The trigger type cannot change after a rule is created. Create a new rule instead.
        </p>
      )}
      {form.triggerType === 'ENTITY_EVENT' && <EventFields {...props} />}
      {form.triggerType === 'SCHEDULE' && <ScheduleFields {...props} />}
      {form.triggerType === 'WEBHOOK' && <WebhookExplanation />}
    </fieldset>
  );
}
