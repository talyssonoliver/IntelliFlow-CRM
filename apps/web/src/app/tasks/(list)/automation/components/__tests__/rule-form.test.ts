/**
 * Rule form model — PG-208 (AC-TA-003): input building, round trip from a
 * stored rule, validator issue mapping, duplicate active rule detection.
 */
import { describe, it, expect } from 'vitest';
import {
  duplicateRuleName,
  emptyRuleForm,
  fieldForPath,
  formToInput,
  ruleToForm,
  validateRuleForm,
  type RuleFormState,
} from '../rule-form';
import type { RuleItem } from '../../task-automation-labels';

function form(overrides: Partial<RuleFormState> = {}): RuleFormState {
  return {
    ...emptyRuleForm('Europe/London', 'lead.created'),
    name: 'Call leads',
    titleTemplate: 'Call {{record.name}}',
    ...overrides,
  };
}

function rule(overrides: Partial<RuleItem> = {}): RuleItem {
  return {
    id: 'r1',
    name: 'Existing',
    description: null,
    isActive: true,
    sortOrder: 0,
    tags: [],
    trigger: { type: 'ENTITY_EVENT', eventType: 'lead.created' },
    actions: [
      {
        type: 'CREATE_TASK',
        titleTemplate: 'Call {{record.name}}',
        descriptionTemplate: null,
        priority: 'MEDIUM',
        dueInDays: 1,
        linkToRecord: true,
      },
    ],
    webhookTokenPrefix: null,
    nextRunAt: null,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunOutcome: null,
    suppressedCount: 0,
    createdBy: 'u1',
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('formToInput', () => {
  it('builds an event rule with Create Task only', () => {
    expect(formToInput(form())).toEqual({
      name: 'Call leads',
      description: null,
      isActive: true,
      tags: [],
      trigger: { type: 'ENTITY_EVENT', eventType: 'lead.created' },
      actions: [
        {
          type: 'CREATE_TASK',
          titleTemplate: 'Call {{record.name}}',
          descriptionTemplate: null,
          priority: 'MEDIUM',
          dueInDays: 1,
          linkToRecord: true,
        },
      ],
    });
  });

  it('adds the stage filter only for stage changes', () => {
    const stage = formToInput(
      form({ eventType: 'opportunity.stage_changed', toStage: 'PROPOSAL' })
    );
    expect(stage.trigger).toEqual({
      type: 'ENTITY_EVENT',
      eventType: 'opportunity.stage_changed',
      filter: { toStage: 'PROPOSAL' },
    });
    expect(formToInput(form({ toStage: 'PROPOSAL' })).trigger).toEqual({
      type: 'ENTITY_EVENT',
      eventType: 'lead.created',
    });
  });

  it('builds schedule triggers per cadence', () => {
    const base = emptyRuleForm('Europe/London', 'lead.created').schedule;
    const weekly = formToInput(
      form({ triggerType: 'SCHEDULE', schedule: { ...base, cadence: 'weekly', dayOfWeek: '3' } })
    );
    expect(weekly.trigger).toEqual({
      type: 'SCHEDULE',
      cadence: 'weekly',
      timezone: 'Europe/London',
      dayOfWeek: 3,
      timeOfDay: '09:00',
    });
    const quarterly = formToInput(
      form({
        triggerType: 'SCHEDULE',
        schedule: { ...base, cadence: 'quarterly', dayOfMonth: '15' },
      })
    );
    expect(quarterly.trigger).toMatchObject({ cadence: 'quarterly', dayOfMonth: 15 });
    const custom = formToInput(
      form({
        triggerType: 'SCHEDULE',
        schedule: { ...base, cadence: 'custom', cronExpression: ' 0 9 * * 1 ' },
      })
    );
    expect(custom.trigger).toEqual({
      type: 'SCHEDULE',
      cadence: 'custom',
      timezone: 'Europe/London',
      cronExpression: '0 9 * * 1',
    });
    // Schedule and webhook tasks have no record to link.
    expect(custom.actions[0]).toMatchObject({ linkToRecord: false });
  });

  it('builds a webhook rule with all three actions in order', () => {
    const input = formToInput(
      form({
        triggerType: 'WEBHOOK',
        dueInDays: '',
        descriptionTemplate: '  Body  ',
        assignEnabled: true,
        assignUserIds: ['u2', 'u3'],
        notifyEnabled: true,
        notifyAssignee: false,
        notifyOwner: true,
        notifyUserIds: ['u4'],
        notifyMessage: ' New task ',
      })
    );
    expect(input.trigger).toEqual({ type: 'WEBHOOK' });
    expect(input.actions.map((a) => a.type)).toEqual([
      'CREATE_TASK',
      'ASSIGN_ROUND_ROBIN',
      'NOTIFY',
    ]);
    expect(input.actions[0]).toMatchObject({ dueInDays: null, descriptionTemplate: 'Body' });
    expect(input.actions[1]).toEqual({ type: 'ASSIGN_ROUND_ROBIN', userIds: ['u2', 'u3'] });
    expect(input.actions[2]).toEqual({
      type: 'NOTIFY',
      recipients: { assignee: false, owner: true, userIds: ['u4'] },
      message: 'New task',
    });
  });
});

describe('ruleToForm', () => {
  it('round-trips an event rule with every action', () => {
    const stored = rule({
      description: 'Desc',
      tags: ['Sales'],
      trigger: {
        type: 'ENTITY_EVENT',
        eventType: 'opportunity.stage_changed',
        filter: { toStage: 'NEGOTIATION' },
      },
      actions: [
        {
          type: 'CREATE_TASK',
          titleTemplate: 'T',
          descriptionTemplate: 'D',
          priority: 'URGENT',
          dueInDays: null,
          linkToRecord: false,
        },
        { type: 'ASSIGN_ROUND_ROBIN', userIds: ['u2'] },
        {
          type: 'NOTIFY',
          recipients: { assignee: false, owner: true, userIds: [] },
          message: null,
        },
      ],
    });
    const f = ruleToForm(stored, 'UTC', 'lead.created');
    expect(f).toMatchObject({
      name: 'Existing',
      description: 'Desc',
      tags: ['Sales'],
      eventType: 'opportunity.stage_changed',
      toStage: 'NEGOTIATION',
      dueInDays: '',
      priority: 'URGENT',
      assignEnabled: true,
      notifyEnabled: true,
      notifyAssignee: false,
      notifyOwner: true,
    });
    const input = formToInput(f);
    expect(input.trigger).toEqual(stored.trigger);
    expect(input.actions).toEqual([
      { ...stored.actions[0], linkToRecord: false },
      stored.actions[1],
      { ...stored.actions[2] },
    ]);
  });

  it('reads schedule and webhook triggers', () => {
    const schedule = ruleToForm(
      rule({
        trigger: {
          type: 'SCHEDULE',
          cadence: 'monthly',
          dayOfMonth: 5,
          timeOfDay: '07:30',
          timezone: 'Asia/Tokyo',
        },
      }),
      'UTC',
      'lead.created'
    );
    expect(schedule.triggerType).toBe('SCHEDULE');
    expect(schedule.timezone).toBe('Asia/Tokyo');
    expect(schedule.schedule).toEqual({
      cadence: 'monthly',
      dayOfWeek: '1',
      dayOfMonth: '5',
      timeOfDay: '07:30',
      cronExpression: '',
    });
    const custom = ruleToForm(
      rule({
        trigger: {
          type: 'SCHEDULE',
          cadence: 'custom',
          cronExpression: '0 * * * *',
          timezone: 'UTC',
        },
      }),
      'UTC',
      'lead.created'
    );
    expect(custom.schedule.cronExpression).toBe('0 * * * *');
    expect(
      ruleToForm(rule({ trigger: { type: 'WEBHOOK' } }), 'UTC', 'lead.created').triggerType
    ).toBe('WEBHOOK');
  });
});

describe('fieldForPath', () => {
  it.each([
    [['name'], 'name'],
    [['tags', 1], 'tags'],
    [['trigger', 'cronExpression'], 'cronExpression'],
    [['trigger', 'filter', 'toStage'], 'toStage'],
    [['trigger', 'unknown'], 'actions'],
    [['actions'], 'actions'],
    [['actions', 1], 'actions'],
    [['actions', 0, 'titleTemplate'], 'titleTemplate'],
    [['actions', 1, 'userIds'], 'assignUserIds'],
    [['actions', 2, 'recipients'], 'notifyRecipients'],
    [['actions', 0, 'other'], 'actions'],
    [['somewhere'], 'actions'],
  ] as const)('%j → %s', (path, key) => {
    expect(fieldForPath(path)).toBe(key);
  });
});

describe('validateRuleForm', () => {
  it('returns the parsed input when valid', () => {
    const { input, errors } = validateRuleForm(form());
    expect(errors).toEqual({});
    expect(input?.name).toBe('Call leads');
  });

  it('maps errors to fields with plain messages', () => {
    const { input, errors } = validateRuleForm(
      form({
        name: ' ',
        titleTemplate: '',
        dueInDays: '2 days',
        assignEnabled: true,
        assignUserIds: [],
        notifyEnabled: true,
        notifyAssignee: false,
        notifyOwner: false,
        notifyUserIds: [],
      })
    );
    expect(input).toBeNull();
    expect(errors.name).toBe('Enter a name.');
    expect(errors.titleTemplate).toBe('Enter a task title.');
    expect(errors.dueInDays).toBe('Enter a whole number of days from 0 to 365.');
    expect(errors.assignUserIds).toBe('Pick at least one person.');
    expect(errors.notifyRecipients).toBe('Choose at least one recipient.');
  });

  it('reports schedule fields', () => {
    const base = emptyRuleForm('UTC', 'lead.created').schedule;
    const { errors } = validateRuleForm(
      form({
        triggerType: 'SCHEDULE',
        schedule: { ...base, cadence: 'custom', cronExpression: '' },
      })
    );
    expect(errors.cronExpression).toBeTruthy();
  });
});

describe('duplicateRuleName', () => {
  const candidate = formToInput(form());

  it('names the active rule that does the same thing', () => {
    expect(duplicateRuleName(candidate, [rule()], null)).toBe('Existing');
  });

  it('ignores the rule being edited, inactive rules and an inactive candidate', () => {
    expect(duplicateRuleName(candidate, [rule()], 'r1')).toBeNull();
    expect(duplicateRuleName(candidate, [rule({ isActive: false })], null)).toBeNull();
    expect(duplicateRuleName({ ...candidate, isActive: false }, [rule()], null)).toBeNull();
  });

  it('returns null for a different rule', () => {
    const other = formToInput(form({ eventType: 'lead.qualified' }));
    expect(duplicateRuleName(other, [rule()], null)).toBeNull();
  });
});
