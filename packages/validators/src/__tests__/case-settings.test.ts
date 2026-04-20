import { describe, it, expect } from 'vitest';
import { caseSettingsSchema } from '../case-settings';

const VALID_CUID = 'cjld2cjxh0000qzrmn831i7rn';

describe('case-settings validators', () => {
  describe('caseSettingsSchema', () => {
    it('accepts valid default-like input', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE-',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(true);
    });

    it('rejects lowercase casePrefix', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'case-',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty casePrefix', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: '',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(false);
    });

    it('rejects casePrefix longer than 20 chars', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'ABCDEFGHIJKLMNOPQRSTU',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(false);
    });

    it('rejects casePrefix with spaces', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE A',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(false);
    });

    it('rejects casePrefix with special chars (underscore)', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE_',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid defaultPriority value', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE-',
        defaultPriority: 'CRITICAL',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(false);
    });

    it('accepts LOW priority', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE-',
        defaultPriority: 'LOW',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts MEDIUM priority', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE-',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts HIGH priority', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE-',
        defaultPriority: 'HIGH',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts URGENT priority', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE-',
        defaultPriority: 'URGENT',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts autoAssignUserId: null when autoAssignEnabled: false', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE-',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid cuid when autoAssignEnabled: true', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE-',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: true,
        autoAssignUserId: VALID_CUID,
      });
      expect(result.success).toBe(true);
    });

    it('rejects autoAssignEnabled: true with autoAssignUserId: null (cross-field)', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE-',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: true,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('autoAssignUserId');
      }
    });
  });
});

// ───────────────────────── v2 scope-up schemas ─────────────────────────
import {
  caseDuplicateRuleSchema,
  updateCaseDuplicateRulesSchema,
  caseRequiredFieldSchema,
  updateCaseRequiredFieldsSchema,
  createCaseTagSchema,
  caseTagColorTokenSchema,
  caseAutomationSettingsSchema,
  updateCaseAutomationSettingsSchema,
  DEFAULT_CASE_AUTOMATION,
  DEFAULT_CASE_DUPLICATE_RULES,
  DEFAULT_CASE_REQUIRED_FIELDS,
  CASE_TAG_COLOR_TOKENS,
} from '../case-settings';

describe('caseDuplicateRuleSchema', () => {
  it('accepts allowlisted field/strategy/action combos', () => {
    const result = caseDuplicateRuleSchema.safeParse({
      field: 'title',
      matchStrategy: 'fuzzy',
      collisionAction: 'warn',
      isActive: true,
      sortOrder: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown field', () => {
    const result = caseDuplicateRuleSchema.safeParse({
      field: 'subject',
      matchStrategy: 'exact',
      collisionAction: 'warn',
      isActive: true,
      sortOrder: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown matchStrategy', () => {
    const result = caseDuplicateRuleSchema.safeParse({
      field: 'title',
      matchStrategy: 'regex',
      collisionAction: 'warn',
      isActive: true,
      sortOrder: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown collisionAction', () => {
    const result = caseDuplicateRuleSchema.safeParse({
      field: 'title',
      matchStrategy: 'exact',
      collisionAction: 'delete',
      isActive: true,
      sortOrder: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative sortOrder', () => {
    const result = caseDuplicateRuleSchema.safeParse({
      field: 'title',
      matchStrategy: 'exact',
      collisionAction: 'warn',
      isActive: true,
      sortOrder: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe('updateCaseDuplicateRulesSchema — duplicate-pair superRefine (Playbook §6)', () => {
  it('accepts rules with distinct (field, matchStrategy) pairs', () => {
    const result = updateCaseDuplicateRulesSchema.safeParse({
      rules: [
        {
          field: 'title',
          matchStrategy: 'fuzzy',
          collisionAction: 'warn',
          isActive: true,
          sortOrder: 0,
        },
        {
          field: 'title',
          matchStrategy: 'exact',
          collisionAction: 'block',
          isActive: true,
          sortOrder: 1,
        },
        {
          field: 'client',
          matchStrategy: 'fuzzy',
          collisionAction: 'warn',
          isActive: true,
          sortOrder: 2,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects duplicate (field, matchStrategy) pair and points to the second offender', () => {
    const result = updateCaseDuplicateRulesSchema.safeParse({
      rules: [
        {
          field: 'title',
          matchStrategy: 'fuzzy',
          collisionAction: 'warn',
          isActive: true,
          sortOrder: 0,
        },
        {
          field: 'title',
          matchStrategy: 'fuzzy',
          collisionAction: 'block',
          isActive: false,
          sortOrder: 1,
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const offender = result.error.issues.find(
        (i) => i.path.join('.') === 'rules.1.matchStrategy'
      );
      expect(offender).toBeDefined();
    }
  });

  it('accepts empty rules array', () => {
    const result = updateCaseDuplicateRulesSchema.safeParse({ rules: [] });
    expect(result.success).toBe(true);
  });
});

describe('caseRequiredFieldSchema', () => {
  it('accepts allowlisted fieldKey values', () => {
    for (const key of [
      'title',
      'description',
      'deadline',
      'jurisdiction',
      'clientId',
      'assignedTo',
    ] as const) {
      const result = caseRequiredFieldSchema.safeParse({ fieldKey: key, isRequired: true });
      expect(result.success).toBe(true);
    }
  });

  it('rejects unknown fieldKey', () => {
    const result = caseRequiredFieldSchema.safeParse({ fieldKey: 'priority', isRequired: true });
    expect(result.success).toBe(false);
  });
});

describe('updateCaseRequiredFieldsSchema', () => {
  it('accepts valid fields array', () => {
    const result = updateCaseRequiredFieldsSchema.safeParse({
      fields: [
        { fieldKey: 'title', isRequired: true },
        { fieldKey: 'deadline', isRequired: false },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('caseTagColorTokenSchema', () => {
  it('accepts every allowlisted token', () => {
    for (const token of CASE_TAG_COLOR_TOKENS) {
      const result = caseTagColorTokenSchema.safeParse(token);
      expect(result.success).toBe(true);
    }
  });

  it('rejects an out-of-allowlist token', () => {
    const result = caseTagColorTokenSchema.safeParse('yellow');
    expect(result.success).toBe(false);
  });
});

describe('createCaseTagSchema', () => {
  it('accepts a valid tag', () => {
    const result = createCaseTagSchema.safeParse({ name: 'Urgent', colorToken: 'red' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createCaseTagSchema.safeParse({ name: '', colorToken: 'red' });
    expect(result.success).toBe(false);
  });

  it('rejects name over 50 chars', () => {
    const result = createCaseTagSchema.safeParse({ name: 'x'.repeat(51), colorToken: 'red' });
    expect(result.success).toBe(false);
  });
});

describe('caseAutomationSettingsSchema', () => {
  it('requires all 12 toggle keys', () => {
    const result = caseAutomationSettingsSchema.safeParse({
      autoEscalateOverdue: false,
      notifyOnAssignmentChange: true,
      // notifyOnDeadlineApproaching missing on purpose
      notifyOnStatusChange: false,
      notifyOnDuplicate: true,
      restrictTagCreationToAdmins: false,
      preventDeleteWithOpenTasks: true,
      aiCaseSummarization: false,
      aiPriorityPrediction: false,
      aiResolutionSuggestion: false,
      aiTagSuggestions: false,
      aiInsightGeneration: false,
    });
    expect(result.success).toBe(false);
  });

  it('accepts the DEFAULT_CASE_AUTOMATION object as-is', () => {
    const result = caseAutomationSettingsSchema.safeParse(DEFAULT_CASE_AUTOMATION);
    expect(result.success).toBe(true);
  });

  it('update schema allows any subset of keys (partial)', () => {
    const result = updateCaseAutomationSettingsSchema.safeParse({ aiCaseSummarization: true });
    expect(result.success).toBe(true);
  });

  it('default AI toggles are all FALSE (playbook §10 opt-in)', () => {
    expect(DEFAULT_CASE_AUTOMATION.aiCaseSummarization).toBe(false);
    expect(DEFAULT_CASE_AUTOMATION.aiPriorityPrediction).toBe(false);
    expect(DEFAULT_CASE_AUTOMATION.aiResolutionSuggestion).toBe(false);
    expect(DEFAULT_CASE_AUTOMATION.aiTagSuggestions).toBe(false);
    expect(DEFAULT_CASE_AUTOMATION.aiInsightGeneration).toBe(false);
  });
});

describe('seed defaults — v2', () => {
  it('DEFAULT_CASE_DUPLICATE_RULES satisfies updateCaseDuplicateRulesSchema', () => {
    const result = updateCaseDuplicateRulesSchema.safeParse({
      rules: DEFAULT_CASE_DUPLICATE_RULES,
    });
    expect(result.success).toBe(true);
  });

  it('DEFAULT_CASE_REQUIRED_FIELDS satisfies updateCaseRequiredFieldsSchema', () => {
    const result = updateCaseRequiredFieldsSchema.safeParse({
      fields: DEFAULT_CASE_REQUIRED_FIELDS,
    });
    expect(result.success).toBe(true);
  });
});
