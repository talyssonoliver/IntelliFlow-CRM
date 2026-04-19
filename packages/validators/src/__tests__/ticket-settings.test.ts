/**
 * Ticket Settings Validators Tests - PG-185 (R-1)
 *
 * Covers: duplicate-rule superRefine, required-field refine,
 * tag schemas, automation schema with defaultSlaPolicyId + autoCloseIdleDays.
 */

import { describe, it, expect } from 'vitest';
import {
  updateTicketDuplicateRulesSchema,
  updateTicketRequiredFieldsSchema,
  createTicketTagSchema,
  updateTicketTagSchema,
  deleteTicketTagSchema,
  ticketAutomationSettingsSchema,
  ticketDuplicateRuleFieldSchema,
  ticketDuplicateRuleStrategySchema,
  ticketRequiredFieldKeySchema,
  DEFAULT_TICKET_DUPLICATE_RULES,
  DEFAULT_TICKET_REQUIRED_FIELDS,
  DEFAULT_TICKET_AUTOMATION,
} from '../ticket-settings';

// ─── Duplicate Rules ────────────────────────────────────────────────────────

describe('ticketDuplicateRuleFieldSchema', () => {
  it('accepts all 4 valid fields', () => {
    for (const f of [
      'contact_subject',
      'contact_24h',
      'email_subject',
      'contact_description_5min',
    ]) {
      expect(ticketDuplicateRuleFieldSchema.safeParse(f).success).toBe(true);
    }
  });

  it('rejects unknown field', () => {
    expect(ticketDuplicateRuleFieldSchema.safeParse('unknown_field').success).toBe(false);
  });
});

describe('ticketDuplicateRuleStrategySchema', () => {
  it('accepts exact, normalized, fuzzy', () => {
    for (const s of ['exact', 'normalized', 'fuzzy']) {
      expect(ticketDuplicateRuleStrategySchema.safeParse(s).success).toBe(true);
    }
  });

  it('rejects invalid strategy', () => {
    expect(ticketDuplicateRuleStrategySchema.safeParse('regex').success).toBe(false);
  });
});

describe('updateTicketDuplicateRulesSchema', () => {
  it('accepts valid rules', () => {
    const result = updateTicketDuplicateRulesSchema.safeParse({
      rules: [
        {
          field: 'contact_subject',
          matchStrategy: 'exact',
          threshold: 100,
          isActive: true,
          sortOrder: 0,
        },
        {
          field: 'contact_24h',
          matchStrategy: 'normalized',
          threshold: 90,
          isActive: false,
          sortOrder: 1,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty rules array', () => {
    const result = updateTicketDuplicateRulesSchema.safeParse({ rules: [] });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate (field, matchStrategy) pairs with row-specific error', () => {
    const result = updateTicketDuplicateRulesSchema.safeParse({
      rules: [
        {
          field: 'contact_subject',
          matchStrategy: 'exact',
          threshold: 100,
          isActive: true,
          sortOrder: 0,
        },
        {
          field: 'contact_subject',
          matchStrategy: 'exact',
          threshold: 90,
          isActive: false,
          sortOrder: 1,
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue.message).toContain('rows 1 and 2');
      expect(issue.path).toEqual(['rules', 1, 'matchStrategy']);
    }
  });

  it('allows same field with different strategies', () => {
    const result = updateTicketDuplicateRulesSchema.safeParse({
      rules: [
        {
          field: 'contact_subject',
          matchStrategy: 'exact',
          threshold: 100,
          isActive: true,
          sortOrder: 0,
        },
        {
          field: 'contact_subject',
          matchStrategy: 'fuzzy',
          threshold: 85,
          isActive: true,
          sortOrder: 1,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects threshold > 100', () => {
    const result = updateTicketDuplicateRulesSchema.safeParse({
      rules: [
        {
          field: 'contact_subject',
          matchStrategy: 'exact',
          threshold: 150,
          isActive: true,
          sortOrder: 0,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

// ─── Required Fields ────────────────────────────────────────────────────────

describe('ticketRequiredFieldKeySchema', () => {
  it('accepts all 7 valid keys', () => {
    for (const k of [
      'subject',
      'description',
      'contactEmail',
      'contactName',
      'priority',
      'category',
      'slaPolicy',
    ]) {
      expect(ticketRequiredFieldKeySchema.safeParse(k).success).toBe(true);
    }
  });

  it('rejects unknown key', () => {
    expect(ticketRequiredFieldKeySchema.safeParse('assigneeId').success).toBe(false);
  });
});

describe('updateTicketRequiredFieldsSchema', () => {
  it('accepts payload where subject + contactEmail are required', () => {
    const result = updateTicketRequiredFieldsSchema.safeParse({
      fields: [
        { fieldKey: 'subject', isRequired: true },
        { fieldKey: 'contactEmail', isRequired: true },
        { fieldKey: 'description', isRequired: false },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects payload where subject is not required', () => {
    const result = updateTicketRequiredFieldsSchema.safeParse({
      fields: [
        { fieldKey: 'subject', isRequired: false },
        { fieldKey: 'contactEmail', isRequired: true },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects payload where contactEmail is not required', () => {
    const result = updateTicketRequiredFieldsSchema.safeParse({
      fields: [
        { fieldKey: 'subject', isRequired: true },
        { fieldKey: 'contactEmail', isRequired: false },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty fields array', () => {
    const result = updateTicketRequiredFieldsSchema.safeParse({ fields: [] });
    expect(result.success).toBe(false);
  });
});

// ─── Tags ───────────────────────────────────────────────────────────────────

describe('createTicketTagSchema', () => {
  it('accepts valid tag with defaults', () => {
    const result = createTicketTagSchema.safeParse({ name: 'urgent' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.colorToken).toBe('slate');
    }
  });

  it('accepts explicit colorToken', () => {
    const result = createTicketTagSchema.safeParse({ name: 'vip', colorToken: 'rose' });
    expect(result.success).toBe(true);
  });

  it('rejects unknown colorToken', () => {
    const result = createTicketTagSchema.safeParse({ name: 'bug', colorToken: 'neon' });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    expect(createTicketTagSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects name > 60 chars', () => {
    expect(createTicketTagSchema.safeParse({ name: 'x'.repeat(61) }).success).toBe(false);
  });

  it('accepts description up to 200 chars', () => {
    const result = createTicketTagSchema.safeParse({ name: 'ok', description: 'A'.repeat(200) });
    expect(result.success).toBe(true);
  });

  it('rejects description > 200 chars', () => {
    const result = createTicketTagSchema.safeParse({ name: 'ok', description: 'A'.repeat(201) });
    expect(result.success).toBe(false);
  });
});

describe('updateTicketTagSchema', () => {
  it('requires id', () => {
    expect(updateTicketTagSchema.safeParse({ name: 'x' }).success).toBe(false);
  });

  it('accepts partial update', () => {
    const result = updateTicketTagSchema.safeParse({ id: 'tag-1', isActive: false });
    expect(result.success).toBe(true);
  });
});

describe('deleteTicketTagSchema', () => {
  it('requires non-empty id', () => {
    expect(deleteTicketTagSchema.safeParse({ id: '' }).success).toBe(false);
    expect(deleteTicketTagSchema.safeParse({ id: 'tag-1' }).success).toBe(true);
  });
});

// ─── Automation ─────────────────────────────────────────────────────────────

describe('ticketAutomationSettingsSchema', () => {
  it('accepts full valid payload', () => {
    const result = ticketAutomationSettingsSchema.safeParse(DEFAULT_TICKET_AUTOMATION);
    expect(result.success).toBe(true);
  });

  it('accepts defaultSlaPolicyId as null', () => {
    const result = ticketAutomationSettingsSchema.safeParse({
      ...DEFAULT_TICKET_AUTOMATION,
      defaultSlaPolicyId: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts defaultSlaPolicyId as non-empty string', () => {
    const result = ticketAutomationSettingsSchema.safeParse({
      ...DEFAULT_TICKET_AUTOMATION,
      defaultSlaPolicyId: 'sla-abc',
    });
    expect(result.success).toBe(true);
  });

  it('rejects defaultSlaPolicyId as empty string', () => {
    const result = ticketAutomationSettingsSchema.safeParse({
      ...DEFAULT_TICKET_AUTOMATION,
      defaultSlaPolicyId: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects autoCloseIdleDays < 0', () => {
    const result = ticketAutomationSettingsSchema.safeParse({
      ...DEFAULT_TICKET_AUTOMATION,
      autoCloseIdleDays: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects autoCloseIdleDays > 365', () => {
    const result = ticketAutomationSettingsSchema.safeParse({
      ...DEFAULT_TICKET_AUTOMATION,
      autoCloseIdleDays: 400,
    });
    expect(result.success).toBe(false);
  });

  it('accepts autoCloseIdleDays = 0 (disabled)', () => {
    const result = ticketAutomationSettingsSchema.safeParse({
      ...DEFAULT_TICKET_AUTOMATION,
      autoCloseIdleDays: 0,
    });
    expect(result.success).toBe(true);
  });

  it('accepts autoCloseIdleDays = 365 (max)', () => {
    const result = ticketAutomationSettingsSchema.safeParse({
      ...DEFAULT_TICKET_AUTOMATION,
      autoCloseIdleDays: 365,
    });
    expect(result.success).toBe(true);
  });

  it('requires all 22 fields (rejects partial)', () => {
    const result = ticketAutomationSettingsSchema.safeParse({
      notifyOnSlaBreach: true,
    });
    expect(result.success).toBe(false);
  });
});

// ─── Defaults ───────────────────────────────────────────────────────────────

describe('DEFAULT_TICKET_DUPLICATE_RULES', () => {
  it('has 4 default rules', () => {
    expect(DEFAULT_TICKET_DUPLICATE_RULES).toHaveLength(4);
  });

  it('first two are active, last two inactive', () => {
    expect(DEFAULT_TICKET_DUPLICATE_RULES[0].isActive).toBe(true);
    expect(DEFAULT_TICKET_DUPLICATE_RULES[1].isActive).toBe(true);
    expect(DEFAULT_TICKET_DUPLICATE_RULES[2].isActive).toBe(false);
    expect(DEFAULT_TICKET_DUPLICATE_RULES[3].isActive).toBe(false);
  });
});

describe('DEFAULT_TICKET_REQUIRED_FIELDS', () => {
  it('has 7 default fields', () => {
    expect(DEFAULT_TICKET_REQUIRED_FIELDS).toHaveLength(7);
  });

  it('subject, contactEmail, contactName, priority are required by default', () => {
    const required = DEFAULT_TICKET_REQUIRED_FIELDS.filter((f) => f.isRequired).map(
      (f) => f.fieldKey
    );
    expect(required).toEqual(
      expect.arrayContaining(['subject', 'contactEmail', 'contactName', 'priority'])
    );
  });
});

describe('DEFAULT_TICKET_AUTOMATION', () => {
  it('AI toggles all default to false', () => {
    expect(DEFAULT_TICKET_AUTOMATION.aiDuplicateDetection).toBe(false);
    expect(DEFAULT_TICKET_AUTOMATION.aiAutoCategorization).toBe(false);
    expect(DEFAULT_TICKET_AUTOMATION.aiSentimentAnalysis).toBe(false);
    expect(DEFAULT_TICKET_AUTOMATION.aiNextStepRecommendation).toBe(false);
    expect(DEFAULT_TICKET_AUTOMATION.aiTagSuggestions).toBe(false);
    expect(DEFAULT_TICKET_AUTOMATION.aiInsightGeneration).toBe(false);
  });

  it('notifyOnSlaBreach defaults true (preserves existing behavior)', () => {
    expect(DEFAULT_TICKET_AUTOMATION.notifyOnSlaBreach).toBe(true);
  });

  it('defaultSlaPolicyId defaults null', () => {
    expect(DEFAULT_TICKET_AUTOMATION.defaultSlaPolicyId).toBeNull();
  });

  it('autoCloseIdleDays defaults 7', () => {
    expect(DEFAULT_TICKET_AUTOMATION.autoCloseIdleDays).toBe(7);
  });
});
