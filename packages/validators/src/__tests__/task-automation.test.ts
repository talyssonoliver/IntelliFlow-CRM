import { describe, expect, it } from 'vitest';
import {
  TASK_AUTOMATION_SETTINGS_DEFAULTS,
  TASK_AUTOMATION_TAG_COLOR_TOKENS,
  createTaskAutomationRuleSchema,
  createTaskAutomationTagSchema,
  findDuplicateTriggerActionRules,
  reorderTaskAutomationRulesSchema,
  rotateTaskAutomationWebhookSecretSchema,
  updateTaskAutomationRuleSchema,
  updateTaskAutomationSettingsSchema,
  updateTaskAutomationTagSchema,
} from '../task-automation';

const createTask = {
  type: 'CREATE_TASK' as const,
  titleTemplate: 'Call {{record.name}}',
  priority: 'MEDIUM' as const,
  dueInDays: 1,
  linkToRecord: true,
};
const assign = { type: 'ASSIGN_ROUND_ROBIN' as const, userIds: ['user_b', 'user_a'] };
const notify = {
  type: 'NOTIFY' as const,
  recipients: { assignee: true, owner: false, userIds: [] },
  message: 'New task',
};
const eventRule = {
  name: 'Follow up new leads',
  trigger: { type: 'ENTITY_EVENT' as const, eventType: 'lead.created' as const },
  actions: [createTask],
};

function issues(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return result.success ? [] : (result.error?.issues ?? []);
}

describe('createTaskAutomationRuleSchema — triggers', () => {
  it('accepts an entity-event rule and defaults isActive / tags', () => {
    const parsed = createTaskAutomationRuleSchema.parse(eventRule);
    expect(parsed.isActive).toBe(true);
    expect(parsed.tags).toEqual([]);
  });

  it('accepts a stage filter only on opportunity.stage_changed, and never a closing stage', () => {
    const stage = {
      ...eventRule,
      trigger: {
        type: 'ENTITY_EVENT',
        eventType: 'opportunity.stage_changed',
        filter: { toStage: 'PROPOSAL' },
      },
    };
    expect(createTaskAutomationRuleSchema.safeParse(stage).success).toBe(true);
    const wrongEvent = { ...stage, trigger: { ...stage.trigger, eventType: 'lead.created' } };
    expect(issues(createTaskAutomationRuleSchema.safeParse(wrongEvent))[0]?.path).toEqual([
      'trigger',
      'filter',
      'toStage',
    ]);
    const closing = { ...stage, trigger: { ...stage.trigger, filter: { toStage: 'CLOSED_WON' } } };
    expect(createTaskAutomationRuleSchema.safeParse(closing).success).toBe(false);
  });

  it('rejects unknown and task event types', () => {
    for (const eventType of ['lead.deleted', 'task.created']) {
      expect(
        createTaskAutomationRuleSchema.safeParse({
          ...eventRule,
          trigger: { type: 'ENTITY_EVENT', eventType },
        }).success
      ).toBe(false);
    }
  });

  it('accepts schedule cadences and requires their fields', () => {
    const daily = {
      ...eventRule,
      trigger: {
        type: 'SCHEDULE',
        cadence: 'daily',
        timeOfDay: '09:00',
        timezone: 'Europe/London',
      },
    };
    expect(createTaskAutomationRuleSchema.safeParse(daily).success).toBe(true);
    const weekly = { ...daily, trigger: { ...daily.trigger, cadence: 'weekly' } };
    expect(issues(createTaskAutomationRuleSchema.safeParse(weekly))[0]?.path).toEqual([
      'trigger',
      'dayOfWeek',
    ]);
    const custom = { ...daily, trigger: { type: 'SCHEDULE', cadence: 'custom', timezone: 'UTC' } };
    expect(issues(createTaskAutomationRuleSchema.safeParse(custom))[0]?.path).toEqual([
      'trigger',
      'cronExpression',
    ]);
    const badZone = { ...daily, trigger: { ...daily.trigger, timezone: 'Mars/Base' } };
    expect(createTaskAutomationRuleSchema.safeParse(badZone).success).toBe(false);
  });

  it('accepts a webhook trigger but never a client token or secret', () => {
    expect(
      createTaskAutomationRuleSchema.safeParse({ ...eventRule, trigger: { type: 'WEBHOOK' } })
        .success
    ).toBe(true);
    expect(
      createTaskAutomationRuleSchema.safeParse({
        ...eventRule,
        trigger: { type: 'WEBHOOK', secret: 'x'.repeat(10) },
      }).success
    ).toBe(false);
  });
});

describe('createTaskAutomationRuleSchema — actions superRefine (DoD 9)', () => {
  it('accepts the full canonical order', () => {
    expect(
      createTaskAutomationRuleSchema.safeParse({
        ...eventRule,
        actions: [createTask, assign, notify],
      }).success
    ).toBe(true);
  });

  it('requires Create Task first', () => {
    const result = createTaskAutomationRuleSchema.safeParse({ ...eventRule, actions: [assign] });
    expect(issues(result)[0]).toMatchObject({ path: ['actions', 0] });
  });

  it('rejects a repeated action type at the second offender ("actions N and M")', () => {
    const result = createTaskAutomationRuleSchema.safeParse({
      ...eventRule,
      actions: [createTask, notify, notify],
    });
    const issue = issues(result).find((i) => i.message.includes('actions'));
    expect(issue?.path).toEqual(['actions', 2]);
    expect(issue?.message).toMatch(/actions 2 and 3/);
  });

  it('rejects out-of-order actions', () => {
    const result = createTaskAutomationRuleSchema.safeParse({
      ...eventRule,
      actions: [createTask, notify, assign],
    });
    expect(issues(result).some((i) => i.path.join('.') === 'actions.2')).toBe(true);
  });

  it('allows 1..3 actions', () => {
    expect(createTaskAutomationRuleSchema.safeParse({ ...eventRule, actions: [] }).success).toBe(
      false
    );
    expect(
      createTaskAutomationRuleSchema.safeParse({
        ...eventRule,
        actions: [createTask, assign, notify, notify],
      }).success
    ).toBe(false);
  });
});

describe('createTaskAutomationRuleSchema — bounds and strictness', () => {
  it('trims names and enforces lengths', () => {
    expect(createTaskAutomationRuleSchema.parse({ ...eventRule, name: '  Rule  ' }).name).toBe(
      'Rule'
    );
    expect(createTaskAutomationRuleSchema.safeParse({ ...eventRule, name: ' ' }).success).toBe(
      false
    );
    expect(
      createTaskAutomationRuleSchema.safeParse({ ...eventRule, name: 'n'.repeat(81) }).success
    ).toBe(false);
    expect(
      createTaskAutomationRuleSchema.safeParse({
        ...eventRule,
        actions: [{ ...createTask, titleTemplate: 't'.repeat(201) }],
      }).success
    ).toBe(false);
    expect(
      createTaskAutomationRuleSchema.safeParse({
        ...eventRule,
        actions: [{ ...createTask, descriptionTemplate: 'd'.repeat(2001) }],
      }).success
    ).toBe(false);
  });

  it('bounds due days, pool size and recipients', () => {
    for (const dueInDays of [-1, 366, 1.5]) {
      expect(
        createTaskAutomationRuleSchema.safeParse({
          ...eventRule,
          actions: [{ ...createTask, dueInDays }],
        }).success
      ).toBe(false);
    }
    expect(
      createTaskAutomationRuleSchema.safeParse({
        ...eventRule,
        actions: [{ ...createTask, dueInDays: null }],
      }).success
    ).toBe(true);
    const pool = Array.from({ length: 26 }, (_, i) => `user_${i}`);
    expect(
      createTaskAutomationRuleSchema.safeParse({
        ...eventRule,
        actions: [createTask, { type: 'ASSIGN_ROUND_ROBIN', userIds: pool }],
      }).success
    ).toBe(false);
    expect(
      createTaskAutomationRuleSchema.safeParse({
        ...eventRule,
        actions: [createTask, { type: 'ASSIGN_ROUND_ROBIN', userIds: ['u1', 'u1'] }],
      }).success
    ).toBe(false);
    expect(
      createTaskAutomationRuleSchema.safeParse({
        ...eventRule,
        actions: [
          createTask,
          { ...notify, recipients: { assignee: false, owner: false, userIds: [] } },
        ],
      }).success
    ).toBe(false);
  });

  it('keeps the round-robin pool in the order picked', () => {
    const parsed = createTaskAutomationRuleSchema.parse({
      ...eventRule,
      actions: [createTask, assign],
    });
    expect(parsed.actions[1]).toMatchObject({ userIds: ['user_b', 'user_a'] });
  });

  it('rejects server-owned fields', () => {
    for (const extra of [
      'tenantId',
      'createdBy',
      'webhookSecret',
      'webhookTokenHash',
      'ruleKey',
      'rrCursor',
    ]) {
      expect(createTaskAutomationRuleSchema.safeParse({ ...eventRule, [extra]: 'x' }).success).toBe(
        false
      );
    }
  });

  it('de-duplicates tags case-insensitively', () => {
    expect(
      createTaskAutomationRuleSchema.safeParse({ ...eventRule, tags: ['VIP', 'vip'] }).success
    ).toBe(false);
    expect(
      createTaskAutomationRuleSchema.safeParse({
        ...eventRule,
        tags: Array(11)
          .fill('t')
          .map((t, i) => t + i),
      }).success
    ).toBe(false);
  });

  it('requires an id on update', () => {
    expect(updateTaskAutomationRuleSchema.safeParse(eventRule).success).toBe(false);
    expect(
      updateTaskAutomationRuleSchema.safeParse({ ...eventRule, id: 'rule_1', isActive: false })
        .success
    ).toBe(true);
  });
});

describe('findDuplicateTriggerActionRules', () => {
  const base = { trigger: eventRule.trigger, actions: [createTask], isActive: true };

  it('returns the two positions of identical active rules', () => {
    expect(
      findDuplicateTriggerActionRules([
        base,
        { ...base, actions: [{ ...createTask, titleTemplate: ' Call {{record.name}}' }] },
      ])
    ).toEqual([0, 1]);
  });

  it('ignores inactive and webhook rules and different actions', () => {
    expect(findDuplicateTriggerActionRules([base, { ...base, isActive: false }])).toBeNull();
    const hook = { ...base, trigger: { type: 'WEBHOOK' as const } };
    expect(findDuplicateTriggerActionRules([hook, hook])).toBeNull();
    expect(
      findDuplicateTriggerActionRules([
        base,
        { ...base, actions: [{ ...createTask, titleTemplate: 'Email' }] },
      ])
    ).toBeNull();
  });
});

describe('other schemas', () => {
  it('reorders a unique id list', () => {
    expect(reorderTaskAutomationRulesSchema.safeParse({ ids: ['a', 'b'] }).success).toBe(true);
    expect(reorderTaskAutomationRulesSchema.safeParse({ ids: ['a', 'a'] }).success).toBe(false);
  });

  it('defaults revokePrevious to false', () => {
    expect(rotateTaskAutomationWebhookSecretSchema.parse({ id: 'r1' }).revokePrevious).toBe(false);
  });

  it('bounds settings and exposes defaults', () => {
    expect(TASK_AUTOMATION_SETTINGS_DEFAULTS).toEqual({
      automationEnabled: true,
      notifyRuleOwnerOnFailure: false,
      maxRunsPerRulePerHour: 60,
    });
    expect(updateTaskAutomationSettingsSchema.safeParse({ maxRunsPerRulePerHour: 0 }).success).toBe(
      false
    );
    expect(
      updateTaskAutomationSettingsSchema.safeParse({ maxRunsPerRulePerHour: 501 }).success
    ).toBe(false);
    expect(updateTaskAutomationSettingsSchema.safeParse({ automationEnabled: false }).success).toBe(
      true
    );
    expect(updateTaskAutomationSettingsSchema.safeParse({ tenantId: 't' }).success).toBe(false);
  });

  it('limits tag colours to the 18-token palette', () => {
    expect(TASK_AUTOMATION_TAG_COLOR_TOKENS).toHaveLength(18);
    expect(
      createTaskAutomationTagSchema.safeParse({ name: 'VIP', colorToken: 'rose' }).success
    ).toBe(true);
    expect(
      createTaskAutomationTagSchema.safeParse({ name: 'VIP', colorToken: 'neon' }).success
    ).toBe(false);
    expect(createTaskAutomationTagSchema.safeParse({ name: 'n'.repeat(51) }).success).toBe(false);
    expect(updateTaskAutomationTagSchema.safeParse({ id: 't1', isActive: false }).success).toBe(
      true
    );
  });
});
