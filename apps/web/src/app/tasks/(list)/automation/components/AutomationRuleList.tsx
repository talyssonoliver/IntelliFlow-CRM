'use client';

// Automation rules list — PG-208. PG-201 ScheduleList row pattern; forwardRef +
// useImperativeHandle({ openCreate }) so the Rules SectionHeader "New Rule"
// button opens the dialog (playbook §4). Move Up / Move Down reorder from the
// keyboard: focus stays on the moved row's button and the new position is
// announced through the page's live region.

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Badge, Button, EmptyState, Switch } from '@intelliflow/ui';
import type { CreateTaskAutomationRuleInput, TaskAutomationTagView } from '@intelliflow/validators';
import type { MemberOption } from '@/components/shared/member-multi-select';
import { swatchClass } from '@/lib/color-tokens';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import {
  RUN_STATUS_LABELS,
  actionsSummary,
  outcomeLabel,
  ownerRuleText,
  triggerSummary,
  type EventOption,
  type RuleItem,
} from '../task-automation-labels';
import { AutomationRuleDialog } from './AutomationRuleDialog';

export type MoveDirection = 'up' | 'down';

export const TEST_UNAVAILABLE =
  'Event rules run when the event happens, so they cannot be tested on demand.';

export interface AutomationRuleListHandle {
  openCreate: () => void;
}

export interface AutomationRuleListProps {
  readonly rules: RuleItem[];
  readonly events: readonly EventOption[];
  readonly tags: readonly TaskAutomationTagView[];
  readonly members: MemberOption[];
  readonly membersLoading?: boolean;
  readonly membersError?: boolean;
  readonly canEdit: boolean;
  readonly canManageWebhooks: boolean;
  readonly defaultTimezone: string;
  readonly maxTags: number;
  readonly isSaving: boolean;
  readonly pendingToggleId: string | null;
  readonly isReordering: boolean;
  /** Resolves when saved; rejects with the server's message to keep the dialog open. */
  readonly onSave: (input: CreateTaskAutomationRuleInput, id: string | null) => Promise<void>;
  readonly onToggle: (rule: RuleItem, isActive: boolean) => void;
  readonly onMove: (rule: RuleItem, direction: MoveDirection) => Promise<void>;
  readonly onDelete: (rule: RuleItem) => void;
  readonly onShowRuns: (rule: RuleItem) => void;
  readonly onTest: (rule: RuleItem) => void;
  readonly onRotateSecret: (rule: RuleItem) => void;
  readonly onRegenerateUrl: (rule: RuleItem) => void;
}

interface DialogState {
  open: boolean;
  rule: RuleItem | null;
  key: number;
  error: string | null;
}

function LastRun({ rule }: Readonly<{ rule: RuleItem }>) {
  const { formatDateTime } = useTimezoneContext();
  if (!rule.lastRunAt) {
    return <span className="text-xs text-muted-foreground">Not run yet</span>;
  }
  const status = RUN_STATUS_LABELS[rule.lastRunStatus ?? ''] ?? rule.lastRunStatus ?? '';
  const outcome = outcomeLabel(rule.lastRunOutcome);
  if (rule.lastRunOutcome === 'no_eligible_owner') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-300">
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
          error
        </span>
        Last run {formatDateTime(rule.lastRunAt)}: {outcome}
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      Last run {formatDateTime(rule.lastRunAt)}: {status}
      {outcome ? ` — ${outcome}` : ''}
    </span>
  );
}

/** Lower-cased tag name → colour token, built once per tag list. */
type TagColours = ReadonlyMap<string, string>;

function RuleTags({ rule, colours }: Readonly<{ rule: RuleItem; colours: TagColours }>) {
  if (rule.tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={`Tags of ${rule.name}`}>
      {rule.tags.map((name) => (
        <li key={name}>
          <Badge variant="outline" className="gap-1.5 font-normal">
            <span
              aria-hidden="true"
              className={`inline-block h-2 w-2 rounded-full ${swatchClass(colours.get(name.toLowerCase()) ?? 'slate')}`}
            />
            {name}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function RuleDetails({
  rule,
  events,
  colours,
}: Readonly<{
  rule: RuleItem;
  events: readonly EventOption[];
  colours: TagColours;
}>) {
  const { formatDateTime } = useTimezoneContext();
  return (
    <div className="min-w-0 flex-1 space-y-1 sm:min-w-64">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-foreground">{rule.name}</p>
        {!rule.isActive && <Badge variant="secondary">Off</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">
        {triggerSummary(rule.trigger, events)} → {actionsSummary(rule.actions)}
      </p>
      <p className="text-xs text-muted-foreground">
        Tasks are created for: {ownerRuleText(rule.trigger.type)}
      </p>
      {rule.trigger.type === 'SCHEDULE' && rule.isActive && rule.nextRunAt && (
        <p className="text-xs text-muted-foreground">Next run {formatDateTime(rule.nextRunAt)}</p>
      )}
      <RuleTags rule={rule} colours={colours} />
      <LastRun rule={rule} />
      {rule.suppressedCount > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {rule.suppressedCount} {rule.suppressedCount === 1 ? 'run was' : 'runs were'} skipped by
          the hourly limit
        </p>
      )}
    </div>
  );
}

interface RowControlsProps {
  readonly rule: RuleItem;
  readonly index: number;
  readonly count: number;
  readonly pending: boolean;
  readonly isReordering: boolean;
  readonly canManageWebhooks: boolean;
  readonly registerButton: (key: string, el: HTMLButtonElement | null) => void;
  readonly onEdit: () => void;
  readonly onMove: (direction: MoveDirection) => void;
  readonly props: AutomationRuleListProps;
}

function RowControls({
  rule,
  index,
  count,
  pending,
  isReordering,
  canManageWebhooks,
  registerButton,
  onEdit,
  onMove,
  props,
}: RowControlsProps) {
  const isEvent = rule.trigger.type === 'ENTITY_EVENT';
  const reasonId = `rule-${rule.id}-test-reason`;
  const isWebhook = rule.trigger.type === 'WEBHOOK' && canManageWebhooks;
  return (
    // A named group, so "Edit", "Runs"… are identifiable out of context (WCAG 2.4.6).
    <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-1 border-0 p-0 sm:max-w-md sm:justify-end">
      <legend className="sr-only">Actions for {rule.name}</legend>
      <Switch
        checked={rule.isActive}
        disabled={pending}
        onCheckedChange={(checked) => props.onToggle(rule, checked)}
        aria-label={`Active: ${rule.name}`}
        className="mr-2"
      />
      <Button size="sm" variant="ghost" onClick={onEdit}>
        Edit
      </Button>
      <Button size="sm" variant="ghost" onClick={() => props.onShowRuns(rule)}>
        Runs
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-disabled={isEvent || undefined}
        aria-describedby={isEvent ? reasonId : undefined}
        title={isEvent ? TEST_UNAVAILABLE : undefined}
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        // The parent runs the test, or announces why an event rule cannot be tested.
        onClick={() => props.onTest(rule)}
      >
        Test Rule
      </Button>
      {isEvent && (
        <span id={reasonId} className="sr-only">
          {TEST_UNAVAILABLE}
        </span>
      )}
      <Button
        ref={(el) => registerButton(`${rule.id}-up`, el)}
        size="sm"
        variant="ghost"
        disabled={index === 0 || isReordering}
        aria-label={`Move Up: ${rule.name}`}
        onClick={() => onMove('up')}
      >
        Move Up
      </Button>
      <Button
        ref={(el) => registerButton(`${rule.id}-down`, el)}
        size="sm"
        variant="ghost"
        disabled={index === count - 1 || isReordering}
        aria-label={`Move Down: ${rule.name}`}
        onClick={() => onMove('down')}
      >
        Move Down
      </Button>
      {isWebhook && (
        <>
          <Button size="sm" variant="ghost" onClick={() => props.onRotateSecret(rule)}>
            Rotate Secret
          </Button>
          <Button size="sm" variant="ghost" onClick={() => props.onRegenerateUrl(rule)}>
            New URL
          </Button>
        </>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="text-red-700 hover:text-red-800 dark:text-red-300"
        onClick={() => props.onDelete(rule)}
      >
        Delete
      </Button>
    </fieldset>
  );
}

export const AutomationRuleList = forwardRef<AutomationRuleListHandle, AutomationRuleListProps>(
  function AutomationRuleList(props, ref) {
    const { rules, events, tags, canEdit } = props;
    const [dialog, setDialog] = useState<DialogState>({
      open: false,
      rule: null,
      key: 0,
      error: null,
    });
    const buttons = useRef(new Map<string, HTMLButtonElement>());
    const colours: TagColours = useMemo(
      () => new Map(tags.map((t) => [t.name.toLowerCase(), t.colorToken])),
      [tags]
    );

    const openDialog = (rule: RuleItem | null) =>
      setDialog((d) => ({ open: true, rule, key: d.key + 1, error: null }));
    useImperativeHandle(ref, () => ({ openCreate: () => openDialog(null) }));

    const registerButton = (key: string, el: HTMLButtonElement | null) => {
      if (el) buttons.current.set(key, el);
      else buttons.current.delete(key);
    };

    function focusMoved(rule: RuleItem, direction: MoveDirection) {
      // Keep focus on the moved row; at an edge the pressed button is disabled, so use the other.
      const opposite: MoveDirection = direction === 'up' ? 'down' : 'up';
      const same = buttons.current.get(`${rule.id}-${direction}`);
      const other = buttons.current.get(`${rule.id}-${opposite}`);
      (same && !same.disabled ? same : other)?.focus();
    }

    function handleMove(rule: RuleItem, direction: MoveDirection) {
      props.onMove(rule, direction).then(
        () => setTimeout(() => focusMoved(rule, direction), 0),
        // The parent reports the failure (toast); focus stays where it was.
        () => undefined
      );
    }

    async function handleSave(input: CreateTaskAutomationRuleInput) {
      try {
        await props.onSave(input, dialog.rule?.id ?? null);
        setDialog((d) => ({ ...d, open: false }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'The rule could not be saved.';
        setDialog((d) => ({ ...d, error: message }));
        throw err;
      }
    }

    return (
      <>
        {rules.length === 0 ? (
          <EmptyState entity="rules" phase="passive" size="sm" className="gap-2 px-3 py-4" />
        ) : (
          <ul className="divide-y divide-border" aria-label="Automation rules">
            {rules.map((rule, index) => (
              <li key={rule.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start">
                <RuleDetails rule={rule} events={events} colours={colours} />
                {canEdit && (
                  <RowControls
                    rule={rule}
                    index={index}
                    count={rules.length}
                    pending={props.pendingToggleId === rule.id}
                    isReordering={props.isReordering}
                    canManageWebhooks={props.canManageWebhooks}
                    registerButton={registerButton}
                    onEdit={() => openDialog(rule)}
                    onMove={(direction) => handleMove(rule, direction)}
                    props={props}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {dialog.open && (
          <AutomationRuleDialog
            key={dialog.key}
            open={dialog.open}
            onOpenChange={(open) => (open ? undefined : setDialog((d) => ({ ...d, open: false })))}
            rule={dialog.rule}
            rules={rules}
            events={events}
            // Active tags, plus inactive ones already on this rule so they can be removed.
            tags={tags.filter((t) => t.isActive || (dialog.rule?.tags.includes(t.name) ?? false))}
            members={props.members}
            membersLoading={props.membersLoading}
            membersError={props.membersError}
            canManageWebhooks={props.canManageWebhooks}
            defaultTimezone={props.defaultTimezone}
            maxTags={props.maxTags}
            isSaving={props.isSaving}
            serverError={dialog.error}
            onSubmit={handleSave}
          />
        )}
      </>
    );
  }
);
