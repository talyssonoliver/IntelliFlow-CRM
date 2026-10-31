/**
 * Task Automation labels — PG-208: summaries, owner and due-date wording (M5),
 * outcome labels, template variables per trigger (engine templateVars).
 */
import { describe, it, expect } from 'vitest';
import {
  actionsSummary,
  dueDateHelp,
  eventLabel,
  outcomeLabel,
  ownerRuleText,
  triggerSummary,
  variablesForTrigger,
} from '../task-automation-labels';

const EVENTS = [
  { eventType: 'lead.created', label: 'Lead created' },
  { eventType: 'opportunity.stage_changed', label: 'Deal stage changed' },
];

describe('task-automation-labels', () => {
  it('summarises event triggers, with the target stage', () => {
    expect(triggerSummary({ type: 'ENTITY_EVENT', eventType: 'lead.created' }, EVENTS)).toBe(
      'Lead created'
    );
    expect(
      triggerSummary(
        {
          type: 'ENTITY_EVENT',
          eventType: 'opportunity.stage_changed',
          filter: { toStage: 'PROPOSAL' },
        },
        EVENTS
      )
    ).toBe('Deal stage changed to Proposal');
    expect(eventLabel('account.created', EVENTS)).toBe('account.created');
  });

  it('summarises schedule and webhook triggers', () => {
    const tz = 'Europe/London';
    expect(
      triggerSummary({ type: 'SCHEDULE', cadence: 'daily', timeOfDay: '09:00', timezone: tz }, [])
    ).toBe('Every day at 09:00 (Europe/London)');
    expect(
      triggerSummary(
        { type: 'SCHEDULE', cadence: 'weekly', dayOfWeek: 1, timeOfDay: '08:00', timezone: tz },
        []
      )
    ).toBe('Every Monday at 08:00 (Europe/London)');
    expect(
      triggerSummary(
        { type: 'SCHEDULE', cadence: 'quarterly', dayOfMonth: 3, timeOfDay: '10:00', timezone: tz },
        []
      )
    ).toBe('Quarterly (Jan, Apr, Jul, Oct) on day 3 at 10:00 (Europe/London)');
    expect(
      triggerSummary(
        { type: 'SCHEDULE', cadence: 'custom', cronExpression: '0 9 * * 1', timezone: tz },
        []
      )
    ).toBe('Custom schedule: 0 9 * * 1 (Europe/London)');
    expect(triggerSummary({ type: 'WEBHOOK' }, [])).toBe('When the webhook is called');
  });

  it('summarises actions in order', () => {
    expect(
      actionsSummary([
        {
          type: 'CREATE_TASK',
          titleTemplate: 'T',
          priority: 'LOW',
          dueInDays: null,
          linkToRecord: false,
        },
        { type: 'ASSIGN_ROUND_ROBIN', userIds: ['u1'] },
      ])
    ).toBe('Create Task, then Assign Round-Robin');
  });

  it('words the owner and due-date rules per trigger', () => {
    expect(ownerRuleText('ENTITY_EVENT')).toMatch(/record owner/);
    expect(ownerRuleText('SCHEDULE')).toMatch(/created the rule/);
    expect(dueDateHelp('SCHEDULE')).toMatch(/rule’s timezone/);
    expect(dueDateHelp('WEBHOOK')).toMatch(/\(UTC\)/);
  });

  it('labels outcomes, keeping unknown codes', () => {
    expect(outcomeLabel('task_created')).toBe('Task created');
    expect(outcomeLabel('something_new')).toBe('something_new');
    expect(outcomeLabel(null)).toBeNull();
  });

  it('offers the template variables the engine fills', () => {
    const paths = (t: Parameters<typeof variablesForTrigger>[0]) =>
      variablesForTrigger(t).map((v) => v.path);
    expect(paths({ type: 'SCHEDULE' })).toEqual(['rule.name', 'event.label', 'schedule.date']);
    expect(paths({ type: 'WEBHOOK' })).toEqual(['rule.name', 'event.label']);
    expect(paths({ type: 'ENTITY_EVENT', eventType: 'lead.created' })).toContain('record.name');
    expect(paths({ type: 'ENTITY_EVENT', eventType: 'lead.created' })).not.toContain('stage.new');
    expect(paths({ type: 'ENTITY_EVENT', eventType: 'opportunity.stage_changed' })).toContain(
      'stage.new'
    );
  });
});
