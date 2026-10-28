import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountCreatedEvent } from '../../../account/AccountEvents';
import { AccountId } from '../../../account/AccountId';
import { ContactCreatedEvent } from '../../../contact/ContactEvents';
import { ContactId } from '../../../contact/ContactId';
import { Email } from '../../../lead/Email';
import { LeadConvertedEvent, LeadCreatedEvent, LeadQualifiedEvent } from '../../../lead/LeadEvents';
import { LeadId } from '../../../lead/LeadId';
import {
  OpportunityCreatedEvent,
  OpportunityLostEvent,
  OpportunityStageChangedEvent,
  OpportunityWonEvent,
} from '../../../opportunity/OpportunityEvents';
import { OpportunityId } from '../../../opportunity/OpportunityId';
import {
  TASK_AUTOMATION_ACTION_TYPES,
  TASK_AUTOMATION_EVENTS,
  TASK_AUTOMATION_EVENT_TYPES,
  TASK_AUTOMATION_LIMITS,
  TASK_AUTOMATION_OPEN_STAGES,
  TASK_AUTOMATION_OUTCOMES,
  TASK_AUTOMATION_WEBHOOK_ADMIN_ROLES,
  canonicalRuleKey,
  computeAutomationDueDate,
  effectiveTaskAutomationEvent,
  endOfDayInTimeZone,
  fallbackTaskTitle,
  getTaskAutomationEvent,
  isTaskAutomationAdminRole,
  isTaskAutomationWebhookAdminRole,
  leadDisplayName,
  pickRoundRobinAssignee,
  referencedTemplateKeys,
  renderTaskTemplate,
  type TaskAutomationActionShape,
  type TaskAutomationTriggerShape,
} from '../task-automation-constants';

const NOW = new Date('2026-10-20T10:00:00.000Z');

describe('renderTaskTemplate', () => {
  const vars = new Map([
    ['record.name', 'Ada Lovelace'],
    ['webhook.orderId', 'A-17'],
  ]);

  it('substitutes known tokens and blanks unknown ones', () => {
    expect(
      renderTaskTemplate('Call {{record.name}} about {{webhook.orderId}}{{nope.x}}', vars, 200)
    ).toBe('Call Ada Lovelace about A-17');
  });

  it('never resolves prototype keys', () => {
    expect(renderTaskTemplate('x{{webhook.constructor}}{{webhook.toString}}y', vars, 200)).toBe(
      'xy'
    );
  });

  it('strips control characters, keeps markup as plain text, trims and truncates', () => {
    const control = String.fromCharCode(0) + String.fromCharCode(7);
    expect(renderTaskTemplate(`  <b>hi</b>${control}  `, vars, 200)).toBe('<b>hi</b>');
    expect(renderTaskTemplate('abcdefghij', vars, 4)).toBe('abcd');
  });

  it('strips bidi, zero-width and C1 controls but keeps tab, newline and normal text', () => {
    const chars = [0x202e, 0x200b, 0x2066, 0xfeff, 0x85, 0x7f].map((c) => String.fromCodePoint(c));
    expect(renderTaskTemplate(`Pay${chars.join('')} invoice`, vars, 200)).toBe('Pay invoice');
    expect(renderTaskTemplate('a\tb\nc café', vars, 200)).toBe('a\tb\nc café');
  });

  it('keeps tokens with spaces inside the braces', () => {
    expect(renderTaskTemplate('{{ record.name }}', vars, 200)).toBe('Ada Lovelace');
  });
});

describe('referencedTemplateKeys', () => {
  it('returns the distinct keys of one scope', () => {
    expect(
      referencedTemplateKeys(
        ['{{webhook.a}} {{webhook.b}}', '{{webhook.a}} {{record.name}}'],
        'webhook'
      )
    ).toEqual(['a', 'b']);
  });
});

describe('fallbackTaskTitle / leadDisplayName', () => {
  it('builds a non-empty fallback title', () => {
    expect(fallbackTaskTitle('Lead created', 'Lead')).toBe('Lead created – Lead');
    expect(fallbackTaskTitle('Scheduled rule')).toBe('Scheduled rule');
  });

  it('names a lead by person, then company, never email', () => {
    expect(leadDisplayName({ firstName: 'Ada', lastName: ' Lovelace ' })).toBe('Ada Lovelace');
    expect(leadDisplayName({ firstName: null, lastName: '', company: 'Acme' })).toBe('Acme');
    expect(leadDisplayName({})).toBe('Lead');
  });
});

describe('computeAutomationDueDate', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null without a due offset', () => {
    expect(computeAutomationDueDate(new Date(), null)).toBeNull();
  });

  it('uses the end of the UTC day N days later', () => {
    expect(computeAutomationDueDate(new Date(), 0)?.toISOString()).toBe('2026-10-20T23:59:59.000Z');
    expect(computeAutomationDueDate(new Date(), 1)?.toISOString()).toBe('2026-10-21T23:59:59.000Z');
    expect(computeAutomationDueDate(new Date(), 365)?.toISOString()).toBe(
      '2027-10-20T23:59:59.000Z'
    );
  });

  it('is never earlier than now + 15 minutes', () => {
    const late = new Date('2026-10-20T23:55:00.000Z');
    expect(computeAutomationDueDate(late, 0)?.toISOString()).toBe('2026-10-21T00:10:00.000Z');
  });

  it('uses the rule timezone for the calendar day', () => {
    // 10:00Z is 23:00 in Auckland (UTC+13 in October) → end of that local day.
    expect(computeAutomationDueDate(new Date(), 0, 'Pacific/Auckland')?.toISOString()).toBe(
      '2026-10-20T10:59:59.000Z'
    );
    expect(computeAutomationDueDate(new Date(), 0, 'Europe/London')?.toISOString()).toBe(
      '2026-10-20T22:59:59.000Z'
    );
  });

  it('settles the offset across a DST change on the target day', () => {
    // London leaves BST on 2026-10-25: end of that day is 23:59:59 GMT.
    expect(endOfDayInTimeZone(NOW, 5, 'Europe/London').toISOString()).toBe(
      '2026-10-25T23:59:59.000Z'
    );
  });
});

describe('pickRoundRobinAssignee', () => {
  const pool = ['u3', 'u1', 'u2'];

  it('rotates in pool order with the post-increment cursor', () => {
    expect([1, 2, 3, 4].map((c) => pickRoundRobinAssignee(pool, c))).toEqual([
      'u3',
      'u1',
      'u2',
      'u3',
    ]);
  });

  it('handles non-positive cursors and empty pools', () => {
    expect(pickRoundRobinAssignee(pool, 0)).toBe('u2');
    expect(pickRoundRobinAssignee(pool, -1)).toBe('u1');
    expect(pickRoundRobinAssignee([], 5)).toBeNull();
  });
});

describe('canonicalRuleKey', () => {
  const trigger: TaskAutomationTriggerShape = { type: 'ENTITY_EVENT', eventType: 'lead.created' };
  const create: TaskAutomationActionShape = {
    type: 'CREATE_TASK',
    titleTemplate: 'Call {{record.name}}',
    descriptionTemplate: null,
    priority: 'MEDIUM',
    dueInDays: 1,
    linkToRecord: true,
  };

  it('is stable across whitespace and recipient order', () => {
    const notifyA: TaskAutomationActionShape = {
      type: 'NOTIFY',
      recipients: { assignee: true, owner: false, userIds: ['b', 'a'] },
      message: 'hi',
    };
    const notifyB: TaskAutomationActionShape = {
      type: 'NOTIFY',
      recipients: { assignee: true, owner: false, userIds: ['a', 'b'] },
      message: ' hi ',
    };
    expect(
      canonicalRuleKey(trigger, [{ ...create, titleTemplate: ' Call {{record.name}} ' }, notifyA])
    ).toBe(canonicalRuleKey(trigger, [create, notifyB]));
  });

  it('keys a schedule by the fields that decide when it runs', () => {
    const weekly = (extra: Partial<Extract<TaskAutomationTriggerShape, { type: 'SCHEDULE' }>>) =>
      canonicalRuleKey(
        {
          type: 'SCHEDULE',
          cadence: 'weekly',
          dayOfWeek: 1,
          timeOfDay: '09:00',
          timezone: 'UTC',
          ...extra,
        },
        [create]
      );
    // A preset's derived cron and a stray day of month are ignored.
    expect(weekly({ cronExpression: '0 9 * * 1', dayOfMonth: 5 })).toBe(weekly({}));
    expect(weekly({ dayOfWeek: 2 })).not.toBe(weekly({}));
    const daily = (extra: Partial<Extract<TaskAutomationTriggerShape, { type: 'SCHEDULE' }>>) =>
      canonicalRuleKey(
        { type: 'SCHEDULE', cadence: 'daily', timeOfDay: '09:00', timezone: 'UTC', ...extra },
        [create]
      );
    expect(daily({ dayOfWeek: 3 })).toBe(daily({}));
    expect(
      canonicalRuleKey(
        {
          type: 'SCHEDULE',
          cadence: 'quarterly',
          dayOfMonth: 3,
          timeOfDay: '09:00',
          timezone: 'UTC',
        },
        [create]
      )
    ).not.toBe(
      canonicalRuleKey(
        {
          type: 'SCHEDULE',
          cadence: 'quarterly',
          dayOfMonth: 4,
          timeOfDay: '09:00',
          timezone: 'UTC',
        },
        [create]
      )
    );
    // A custom cadence is its cron (whitespace-insensitive); preset fields are ignored.
    const custom = (extra: Partial<Extract<TaskAutomationTriggerShape, { type: 'SCHEDULE' }>>) =>
      canonicalRuleKey(
        {
          type: 'SCHEDULE',
          cadence: 'custom',
          cronExpression: '0 9 * * 1',
          timezone: 'UTC',
          ...extra,
        },
        [create]
      );
    expect(custom({ cronExpression: ' 0 9 * * 1 ', timeOfDay: '10:00' })).toBe(custom({}));
    expect(custom({ cronExpression: undefined })).not.toBe(custom({}));
  });

  it('differs by template, pool order and filter', () => {
    const base = canonicalRuleKey(trigger, [create]);
    expect(canonicalRuleKey(trigger, [{ ...create, titleTemplate: 'Email' }])).not.toBe(base);
    expect(
      canonicalRuleKey(trigger, [create, { type: 'ASSIGN_ROUND_ROBIN', userIds: ['a', 'b'] }])
    ).not.toBe(
      canonicalRuleKey(trigger, [create, { type: 'ASSIGN_ROUND_ROBIN', userIds: ['b', 'a'] }])
    );
    expect(
      canonicalRuleKey(
        {
          type: 'ENTITY_EVENT',
          eventType: 'opportunity.stage_changed',
          filter: { toStage: 'PROPOSAL' },
        },
        [create]
      )
    ).not.toBe(
      canonicalRuleKey({ type: 'ENTITY_EVENT', eventType: 'opportunity.stage_changed' }, [create])
    );
    expect(
      canonicalRuleKey(
        { type: 'SCHEDULE', cadence: 'daily', timeOfDay: '09:00', timezone: 'UTC' },
        [create]
      )
    ).not.toBe(base);
  });

  it('is null for webhook rules', () => {
    expect(canonicalRuleKey({ type: 'WEBHOOK' }, [create])).toBeNull();
  });
});

describe('event catalogue', () => {
  const email = Email.create('ada@example.invalid').value;
  const leadId = LeadId.generate();
  const oppId = OpportunityId.generate();

  // The contract: the catalogue's event type and id field match what the domain emits.
  const emitted = [
    new LeadCreatedEvent(leadId, email, 'WEBSITE', 'owner-1'),
    new LeadQualifiedEvent(leadId, 'owner-1', 'fit'),
    new LeadConvertedEvent(leadId, 'contact-1', 'account-1', 'owner-1'),
    new ContactCreatedEvent(ContactId.generate(), email, 'Ada', 'Lovelace', 'owner-1'),
    new OpportunityCreatedEvent(oppId, 'Deal', 100, 'account-1', 'owner-1'),
    new OpportunityStageChangedEvent(oppId, 'PROSPECTING', 'PROPOSAL', 'owner-1'),
    new OpportunityWonEvent(oppId, 100, 'owner-1', 'owner-1'),
    new OpportunityLostEvent(oppId, 'price', 'owner-1'),
    new AccountCreatedEvent(AccountId.generate(), 'Acme', 'owner-1'),
  ];

  it('covers exactly the nine v1 events', () => {
    expect(TASK_AUTOMATION_EVENTS.map((e) => e.eventType)).toEqual([
      ...TASK_AUTOMATION_EVENT_TYPES,
    ]);
    expect(emitted.map((e) => e.eventType)).toEqual([...TASK_AUTOMATION_EVENT_TYPES]);
  });

  it.each(emitted.map((event) => [event.eventType, event] as const))(
    '%s carries a string id under its catalogue id field',
    (eventType, event) => {
      const definition = getTaskAutomationEvent(eventType);
      expect(definition).toBeDefined();
      const id = event.toPayload()[definition!.idField];
      expect(typeof id).toBe('string');
      expect(id).not.toBe('');
    }
  );

  it('never offers task events (owner ruling 4)', () => {
    expect(TASK_AUTOMATION_EVENT_TYPES.some((t) => t.startsWith('task.'))).toBe(false);
    expect(getTaskAutomationEvent('task.created')).toBeUndefined();
  });

  it('declares postconditions, links and conversion skips', () => {
    expect(getTaskAutomationEvent('lead.qualified')?.postcondition?.anyOf).toEqual([
      'QUALIFIED',
      'NEGOTIATING',
      'CONVERTED',
    ]);
    expect(getTaskAutomationEvent('lead.converted')?.link).toBe('contact');
    // Deal events are committed facts (published after save): no postcondition.
    expect(getTaskAutomationEvent('opportunity.won')?.postcondition).toBeNull();
    expect(getTaskAutomationEvent('opportunity.lost')?.postcondition).toBeNull();
    expect(getTaskAutomationEvent('opportunity.won')?.link).toBe('none');
    expect(getTaskAutomationEvent('account.created')?.link).toBe('none');
    expect(
      TASK_AUTOMATION_EVENTS.filter((e) => e.skipWhenConversionBorn).map((e) => e.eventType)
    ).toEqual(['contact.created', 'account.created']);
  });

  it('maps closing stage changes to won / lost', () => {
    expect(effectiveTaskAutomationEvent('opportunity.stage_changed', 'CLOSED_WON')).toBe(
      'opportunity.won'
    );
    expect(effectiveTaskAutomationEvent('opportunity.stage_changed', 'CLOSED_LOST')).toBe(
      'opportunity.lost'
    );
    expect(effectiveTaskAutomationEvent('opportunity.stage_changed', 'PROPOSAL')).toBe(
      'opportunity.stage_changed'
    );
    expect(effectiveTaskAutomationEvent('lead.created')).toBe('lead.created');
    expect(effectiveTaskAutomationEvent('task.created')).toBeNull();
    expect(TASK_AUTOMATION_OPEN_STAGES).not.toContain('CLOSED_WON');
  });
});

describe('roles, actions, outcomes, limits', () => {
  it('keeps managers off webhook secrets', () => {
    expect(TASK_AUTOMATION_WEBHOOK_ADMIN_ROLES).not.toContain('MANAGER');
    expect(isTaskAutomationAdminRole('MANAGER')).toBe(true);
    expect(isTaskAutomationWebhookAdminRole('MANAGER')).toBe(false);
    expect(isTaskAutomationWebhookAdminRole('ADMIN')).toBe(true);
    expect(isTaskAutomationAdminRole('USER')).toBe(false);
    expect(isTaskAutomationAdminRole(undefined)).toBe(false);
  });

  it('orders actions with Create Task first', () => {
    expect(TASK_AUTOMATION_ACTION_TYPES[0]).toBe('CREATE_TASK');
  });

  it('labels every outcome in plain language', () => {
    for (const label of Object.values(TASK_AUTOMATION_OUTCOMES)) {
      expect(label.length).toBeGreaterThan(5);
    }
  });

  it('keeps the webhook body cap at 64 KB and the skew at 300 s', () => {
    expect(TASK_AUTOMATION_LIMITS.webhookBodyMaxBytes).toBe(65_536);
    expect(TASK_AUTOMATION_LIMITS.webhookSkewSeconds).toBe(300);
  });
});
