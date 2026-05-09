import { describe, expect, it } from 'vitest';
import {
  type DuplicateMatch,
  type EvaluableRule,
  evaluateDuplicateRules,
  extractFieldValue,
} from '../duplicate-rule-evaluator';

type TestContact = {
  id: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
};

type TestAccount = {
  id: string;
  name?: string;
  website?: string;
  phone?: string;
  addressLine1?: string;
  city?: string;
};

const EXACT_EMAIL: EvaluableRule = {
  field: 'email',
  matchStrategy: 'exact',
  threshold: 100,
  isActive: true,
  sortOrder: 0,
};

const NORMALIZED_EMAIL: EvaluableRule = {
  field: 'email',
  matchStrategy: 'normalized',
  threshold: 100,
  isActive: true,
  sortOrder: 1,
};

const FUZZY_EMAIL: EvaluableRule = {
  field: 'email',
  matchStrategy: 'fuzzy',
  threshold: 80,
  isActive: true,
  sortOrder: 2,
};

const EXACT_PHONE: EvaluableRule = {
  field: 'phone',
  matchStrategy: 'exact',
  threshold: 100,
  isActive: true,
  sortOrder: 0,
};

const NORMALIZED_PHONE: EvaluableRule = {
  field: 'phone',
  matchStrategy: 'normalized',
  threshold: 100,
  isActive: true,
  sortOrder: 0,
};

const EXACT_NAME_COMPANY: EvaluableRule = {
  field: 'name_company',
  matchStrategy: 'exact',
  threshold: 100,
  isActive: true,
  sortOrder: 0,
};

const EXACT_NAME: EvaluableRule = {
  field: 'name',
  matchStrategy: 'exact',
  threshold: 100,
  isActive: true,
  sortOrder: 0,
};

const NORMALIZED_WEBSITE: EvaluableRule = {
  field: 'website',
  matchStrategy: 'normalized',
  threshold: 100,
  isActive: true,
  sortOrder: 0,
};

const EXACT_NAME_ADDRESS: EvaluableRule = {
  field: 'name_address',
  matchStrategy: 'exact',
  threshold: 100,
  isActive: true,
  sortOrder: 0,
};

const FUZZY_NAME: EvaluableRule = {
  field: 'name',
  matchStrategy: 'fuzzy',
  threshold: 80,
  isActive: true,
  sortOrder: 0,
};

describe('evaluateDuplicateRules — AC-001 base cases', () => {
  it('returns zero matches when rules array is empty', () => {
    const result = evaluateDuplicateRules<TestContact>(
      { email: 'a@b.com' },
      [{ id: '1', email: 'a@b.com' }],
      []
    );
    expect(result).toEqual([]);
  });

  it('returns zero matches when every rule is isActive: false', () => {
    const result = evaluateDuplicateRules<TestContact>(
      { email: 'a@b.com' },
      [{ id: '1', email: 'a@b.com' }],
      [{ ...EXACT_EMAIL, isActive: false }]
    );
    expect(result).toEqual([]);
  });

  it('returns zero matches when existing rows array is empty', () => {
    const result = evaluateDuplicateRules<TestContact>({ email: 'a@b.com' }, [], [EXACT_EMAIL]);
    expect(result).toEqual([]);
  });

  it('returns zero matches when input has no value for any rule field', () => {
    const result = evaluateDuplicateRules<TestContact>(
      {},
      [{ id: '1', email: 'a@b.com' }],
      [EXACT_EMAIL]
    );
    expect(result).toEqual([]);
  });

  it('excludes the candidate with the same id as the input (self-match guard)', () => {
    const result = evaluateDuplicateRules<TestContact>(
      { id: '1', email: 'a@b.com' },
      [{ id: '1', email: 'a@b.com' }],
      [EXACT_EMAIL]
    );
    expect(result).toEqual([]);
  });
});

describe('evaluateDuplicateRules — AC-002 exact strategy', () => {
  it('matches on exact email', () => {
    const result = evaluateDuplicateRules<TestContact>(
      { email: 'a@b.com' },
      [{ id: '1', email: 'a@b.com' }],
      [EXACT_EMAIL]
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.score).toBe(100);
  });

  it('does NOT match when email differs by case (exact strategy is case-insensitive via trimLower)', () => {
    const result = evaluateDuplicateRules<TestContact>(
      { email: 'A@B.com' },
      [{ id: '1', email: 'a@b.com' }],
      [EXACT_EMAIL]
    );
    expect(result).toHaveLength(1);
  });

  it('matches on exact phone', () => {
    const result = evaluateDuplicateRules<TestContact>(
      { phone: '+1-415-555-1212' },
      [{ id: '1', phone: '+1-415-555-1212' }],
      [EXACT_PHONE]
    );
    expect(result).toHaveLength(1);
  });

  it('matches on exact name_company composite', () => {
    const result = evaluateDuplicateRules<TestContact>(
      { firstName: 'Ada', lastName: 'Lovelace', company: 'Analytical' },
      [{ id: '1', firstName: 'Ada', lastName: 'Lovelace', company: 'Analytical' }],
      [EXACT_NAME_COMPANY]
    );
    expect(result).toHaveLength(1);
  });

  it('matches on exact name (account-style)', () => {
    const result = evaluateDuplicateRules<TestAccount>(
      { name: 'Acme Inc' },
      [{ id: '1', name: 'Acme Inc' }],
      [EXACT_NAME]
    );
    expect(result).toHaveLength(1);
  });

  it('matches on exact name_address composite for accounts', () => {
    const result = evaluateDuplicateRules<TestAccount>(
      { name: 'Acme Inc', addressLine1: '1 Infinite Loop', city: 'Cupertino' },
      [
        {
          id: '1',
          name: 'Acme Inc',
          addressLine1: '1 Infinite Loop',
          city: 'Cupertino',
        },
      ],
      [EXACT_NAME_ADDRESS]
    );
    expect(result).toHaveLength(1);
  });
});

describe('evaluateDuplicateRules — AC-002 normalized strategy', () => {
  it('matches emails that differ only by case + whitespace', () => {
    const result = evaluateDuplicateRules<TestContact>(
      { email: '  ADA@Analytical.COM  ' },
      [{ id: '1', email: 'ada@analytical.com' }],
      [NORMALIZED_EMAIL]
    );
    expect(result).toHaveLength(1);
  });

  it('matches phones with and without formatting', () => {
    const result = evaluateDuplicateRules<TestContact>(
      { phone: '(415) 555-1212' },
      [{ id: '1', phone: '4155551212' }],
      [NORMALIZED_PHONE]
    );
    expect(result).toHaveLength(1);
  });

  it('matches websites stripped of protocol + www. + trailing slash', () => {
    const result = evaluateDuplicateRules<TestAccount>(
      { website: 'https://www.acme.com/' },
      [{ id: '1', website: 'acme.com' }],
      [NORMALIZED_WEBSITE]
    );
    expect(result).toHaveLength(1);
  });
});

describe('evaluateDuplicateRules — AC-002 fuzzy strategy', () => {
  it('matches typo above threshold', () => {
    const result = evaluateDuplicateRules<TestContact>(
      { firstName: 'Jonathan', lastName: 'Smith' },
      [{ id: '1', firstName: 'Jonatan', lastName: 'Smith' }],
      [FUZZY_NAME]
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.score).toBeLessThan(100);
  });

  it('does NOT match when distance pushes score below threshold', () => {
    const result = evaluateDuplicateRules<TestContact>(
      { firstName: 'Ada', lastName: 'Lovelace' },
      [{ id: '1', firstName: 'Bob', lastName: 'Ross' }],
      [FUZZY_NAME]
    );
    expect(result).toEqual([]);
  });

  it('fuzzy with threshold=100 collapses to exact match', () => {
    const rule: EvaluableRule = { ...FUZZY_EMAIL, threshold: 100 };
    const result = evaluateDuplicateRules<TestContact>(
      { email: 'foo@bar.com' },
      [{ id: '1', email: 'foo@baz.com' }],
      [rule]
    );
    expect(result).toEqual([]);
  });
});

describe('evaluateDuplicateRules — dedup, sort, score bounds', () => {
  it('deduplicates the same candidate when it matches on multiple rules (returns once)', () => {
    const contact: TestContact = {
      id: '1',
      email: 'ada@a.com',
      phone: '4155551212',
    };
    const result = evaluateDuplicateRules<TestContact>(
      { email: 'ada@a.com', phone: '4155551212' },
      [contact],
      [EXACT_EMAIL, EXACT_PHONE]
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.candidate.id).toBe('1');
  });

  it('returns score bounded 0-100 on every returned match', () => {
    const result = evaluateDuplicateRules<TestContact>(
      { firstName: 'Ada', lastName: 'Love' },
      [{ id: '1', firstName: 'Adam', lastName: 'Lovey' }],
      [FUZZY_NAME]
    );
    for (const m of result) {
      expect(m.score).toBeGreaterThanOrEqual(0);
      expect(m.score).toBeLessThanOrEqual(100);
    }
  });

  it('returns matches sorted by score desc', () => {
    const contacts: TestContact[] = [
      { id: '1', firstName: 'Adam', lastName: 'Lovelace' },
      { id: '2', firstName: 'Ada', lastName: 'Lovelace' },
    ];
    const result = evaluateDuplicateRules<TestContact>(
      { firstName: 'Ada', lastName: 'Lovelace' },
      contacts,
      [FUZZY_NAME]
    );
    expect(result.length).toBe(2);
    expect(result[0]?.score).toBeGreaterThanOrEqual(result[1]?.score ?? 0);
    expect(result[0]?.candidate.id).toBe('2');
  });

  it('returns DuplicateMatch shape with candidate, ruleField, matchStrategy, score', () => {
    const result = evaluateDuplicateRules<TestContact>(
      { email: 'a@b.com' },
      [{ id: '1', email: 'a@b.com' }],
      [EXACT_EMAIL]
    );
    const match = result[0] as DuplicateMatch<TestContact>;
    expect(match).toMatchObject({
      candidate: expect.objectContaining({ id: '1' }),
      ruleField: 'email',
      matchStrategy: 'exact',
      score: 100,
    });
  });
});

describe('evaluateDuplicateRules — null / missing fields', () => {
  it('returns no match when candidate has null value for the rule field', () => {
    const result = evaluateDuplicateRules<TestContact>(
      { email: 'a@b.com' },
      [{ id: '1' }],
      [EXACT_EMAIL]
    );
    expect(result).toEqual([]);
  });

  it('returns no match when input lacks the rule field', () => {
    const result = evaluateDuplicateRules<TestContact>(
      { phone: '4155551212' },
      [{ id: '1', email: 'a@b.com' }],
      [EXACT_EMAIL]
    );
    expect(result).toEqual([]);
  });
});

describe('evaluateDuplicateRules — scale / perf smoke', () => {
  it('evaluates a 1000-candidate array under 50 ms', () => {
    const existing: TestContact[] = Array.from({ length: 1000 }, (_, i) => ({
      id: String(i),
      email: `user${i}@example.com`,
    }));
    existing[999] = { id: '999', email: 'target@example.com' };
    const start = Date.now();
    const result = evaluateDuplicateRules<TestContact>({ email: 'target@example.com' }, existing, [
      EXACT_EMAIL,
    ]);
    const elapsed = Date.now() - start;
    expect(result).toHaveLength(1);
    expect(elapsed).toBeLessThan(50);
  });
});

describe('AC-003: evaluator is pure — zero Prisma / fs / net imports', () => {
  it('module source does not import @prisma/client, @intelliflow/db, fs, or net', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, '../duplicate-rule-evaluator.ts'), 'utf8');
    expect(source).not.toMatch(/from ['"]@prisma\/client['"]/);
    expect(source).not.toMatch(/from ['"]@intelliflow\/db['"]/);
    expect(source).not.toMatch(/from ['"]node:fs['"]/);
    expect(source).not.toMatch(/from ['"]node:net['"]/);
    expect(source).not.toMatch(/from ['"]\.\.\/\.\.\/domain/);
    expect(source).not.toMatch(/from ['"]\.\.\/\.\.\/application/);
  });
});

describe('extractFieldValue helper', () => {
  it('extracts normalized email', () => {
    expect(extractFieldValue({ email: '  FOO@BAR.com  ' }, 'email', 'normalized')).toBe(
      'foo@bar.com'
    );
  });

  it('extracts exact email lowercased + trimmed', () => {
    expect(extractFieldValue({ email: '  FOO@BAR.com  ' }, 'email', 'exact')).toBe('foo@bar.com');
  });

  it('extracts phone stripped of punctuation under normalized', () => {
    expect(extractFieldValue({ phone: '(415) 555-1212 x33' }, 'phone', 'normalized')).toBe(
      '415555121233'
    );
  });

  it('returns empty for unknown-ish fields on null input', () => {
    expect(extractFieldValue(null, 'email', 'exact')).toBe('');
  });
});
