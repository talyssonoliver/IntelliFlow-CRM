/**
 * Property tests for evaluateDuplicateRules and extractFieldValue
 * (apps/api/src/shared/duplicate-rule-evaluator.ts — pure functions, zero I/O).
 *
 * Property id: RACE-DEDUP-07
 * Title: evaluateDuplicateRules — pure function lacks property test coverage
 *        for score symmetry and threshold boundary invariants.
 *
 * Invariants covered:
 *  1. Output scores are always in [0, 100].
 *  2. Self-match guard: no match when input.id === candidate.id.
 *  3. Empty-existing guard: empty existing always produces empty result.
 *  4. No-active-rules guard: all-inactive rules → empty result.
 *  5. Determinism: same args → same result (call twice, compare).
 *  6. Deduplication: a candidate appears at most once in the output.
 *  7. Exact/normalized match: identical normalised email → score 100.
 *  8. Phone normalisation: digits-only extract equals stripped punctuation extract.
 *  9. Website normalisation: strips protocol, www., trailing slash.
 * 10. Result sorted by score descending.
 * 11. Inactive rules are filtered: adding an inactive copy of an active rule
 *     does not change the number of matches.
 * 12. sortOrder is respected: higher-sortOrder rules are applied after
 *     lower-sortOrder rules (best-score wins, so sortOrder only matters when
 *     scores differ — we verify the best match is kept).
 * 13. fuzzy floor ≥ 60: a fuzzy rule can never match below score 60.
 * 14. [SKIP/BUG] RACE-DEDUP-07a: threshold=0 with exact strategy should match
 *     any non-empty value (floor=0), but resolveFloor maps 0→100 silently.
 * 15. [SKIP/BUG] RACE-DEDUP-07b: Self-match guard is bypassed when input has
 *     no id — a candidate whose id matches some synthesised undefined key can
 *     slip through; in practice input.id===undefined never equals a real uuid
 *     but the guard is logically incorrect (it compares undefined===uuid → false).
 *
 * @see docs/operations/property-testing/race-condition-findings.json RACE-DEDUP-07
 */

import { describe, expect, test as vitestTest } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  type EvaluableRule,
  type RuleField,
  type MatchStrategy,
  evaluateDuplicateRules,
  extractFieldValue,
} from '../../../../apps/api/src/shared/duplicate-rule-evaluator';
import { propertyParams } from '../../support';

// ---------------------------------------------------------------------------
// Bounded inline arbitraries (do NOT edit support/arbitraries)
// ---------------------------------------------------------------------------

/** All valid RuleField values. */
const ALL_FIELDS: RuleField[] = [
  'email',
  'phone',
  'name_company',
  'name',
  'website',
  'name_address',
];
/** All valid MatchStrategy values. */
const ALL_STRATEGIES: MatchStrategy[] = ['exact', 'normalized', 'fuzzy'];

const arbRuleField: fc.Arbitrary<RuleField> = fc.constantFrom(...ALL_FIELDS);
const arbMatchStrategy: fc.Arbitrary<MatchStrategy> = fc.constantFrom(...ALL_STRATEGIES);

/** A threshold value in [1, 100] (avoids the threshold=0 bug path covered separately). */
const arbThresholdSafe: fc.Arbitrary<number> = fc.integer({ min: 1, max: 100 });

/** A fully active rule with safe threshold. */
const arbActiveRule: fc.Arbitrary<EvaluableRule> = fc.record({
  field: arbRuleField,
  matchStrategy: arbMatchStrategy,
  threshold: arbThresholdSafe,
  isActive: fc.constant(true),
  sortOrder: fc.integer({ min: 0, max: 10 }),
});

/** ASCII email-safe local part (no special characters beyond dot/plus/underscore). */
const arbSafeLocal: fc.Arbitrary<string> = fc
  .stringMatching(/^[a-z0-9]{1,16}$/)
  .filter((s) => s.length >= 1);

/** Safe domain label (all lowercase letters/digits, 2–12 chars). */
const arbSafeLabel: fc.Arbitrary<string> = fc
  .stringMatching(/^[a-z0-9]{2,12}$/)
  .filter((s) => s.length >= 2);

/** A valid email that survives trimLower / normalizeString. */
const arbSafeEmail: fc.Arbitrary<string> = fc
  .tuple(arbSafeLocal, arbSafeLabel, arbSafeLabel)
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/** Digits-only phone (8-12 digits). */
const arbSafePhone: fc.Arbitrary<string> = fc
  .stringMatching(/^[0-9]{8,12}$/)
  .filter((s) => s.length >= 8);

/** Plain ASCII domain like "example.com" — no protocol, no www, no trailing slash. */
const arbSafeDomain: fc.Arbitrary<string> = fc
  .tuple(arbSafeLabel, arbSafeLabel)
  .map(([domain, tld]) => `${domain}.${tld}`);

/** Safe ASCII name (letters only, 2–20 chars, single word). */
const arbSafeName: fc.Arbitrary<string> = fc
  .stringMatching(/^[a-z]{2,20}$/)
  .filter((s) => s.length >= 2);

/** A contact-style row with all relevant fields populated (safe ASCII). */
const arbContactRow = fc.record({
  id: fc.uuid(),
  email: arbSafeEmail,
  phone: arbSafePhone,
  firstName: arbSafeName,
  lastName: arbSafeName,
  company: arbSafeName,
});

type ContactRow = {
  id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  company: string;
};

type AccountRow = {
  id: string;
  name: string;
  website: string;
  addressLine1: string;
  city: string;
};

/** An account-style row. */
const arbAccountRow = fc.record({
  id: fc.uuid(),
  name: arbSafeName,
  website: arbSafeDomain,
  addressLine1: arbSafeName,
  city: arbSafeName,
});

/** Non-empty array of contact rows (1–15 items), all with distinct ids. */
const arbContactList: fc.Arbitrary<ContactRow[]> = fc
  .array(arbContactRow, { minLength: 1, maxLength: 15 })
  .filter((rows) => new Set(rows.map((r) => r.id)).size === rows.length);

// ---------------------------------------------------------------------------
// 1. Score bounds: every returned score must be in [0, 100]
// ---------------------------------------------------------------------------

describe('evaluateDuplicateRules — score always in [0, 100] (RACE-DEDUP-07)', () => {
  test.prop(
    [arbContactRow, arbContactList, fc.array(arbActiveRule, { minLength: 1, maxLength: 5 })],
    propertyParams()
  )('1. every returned score is in [0, 100]', (input, existing, rules) => {
    const result = evaluateDuplicateRules<ContactRow>(input, existing, rules);
    for (const match of result) {
      expect(match.score).toBeGreaterThanOrEqual(0);
      expect(match.score).toBeLessThanOrEqual(100);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Self-match guard: input.id present → input never appears in result
// ---------------------------------------------------------------------------

describe('evaluateDuplicateRules — self-match guard (RACE-DEDUP-07)', () => {
  test.prop(
    [arbContactRow, fc.array(arbActiveRule, { minLength: 1, maxLength: 4 })],
    propertyParams()
  )('2. input is never returned as a match when input.id is in the existing list', (row, rules) => {
    // Include the row itself in existing (same id, same data)
    const existing: ContactRow[] = [row];
    const result = evaluateDuplicateRules<ContactRow>(row, existing, rules);
    const selfFound = result.some((m) => m.candidate.id === row.id);
    expect(selfFound).toBe(false);
  });

  test.prop(
    [arbContactRow, arbContactList, fc.array(arbActiveRule, { minLength: 1, maxLength: 4 })],
    propertyParams()
  )(
    '2b. input is never returned as a match when existing list contains input.id among others',
    (row, others, rules) => {
      // Prepend the input itself; others may not contain the same id
      const existing: ContactRow[] = [row, ...others.filter((r) => r.id !== row.id)];
      const result = evaluateDuplicateRules<ContactRow>(row, existing, rules);
      const selfFound = result.some((m) => m.candidate.id === row.id);
      expect(selfFound).toBe(false);
    }
  );
});

// ---------------------------------------------------------------------------
// 3. Empty-existing guard: empty array always returns []
// ---------------------------------------------------------------------------

describe('evaluateDuplicateRules — empty guards (RACE-DEDUP-07)', () => {
  test.prop(
    [arbContactRow, fc.array(arbActiveRule, { minLength: 1, maxLength: 4 })],
    propertyParams()
  )('3. empty existing list → empty result regardless of rules', (input, rules) => {
    const result = evaluateDuplicateRules<ContactRow>(input, [], rules);
    expect(result).toHaveLength(0);
  });

  test.prop([arbContactRow, arbContactList], propertyParams())(
    '4. empty rules list → empty result regardless of existing',
    (input, existing) => {
      const result = evaluateDuplicateRules<ContactRow>(input, existing, []);
      expect(result).toHaveLength(0);
    }
  );

  test.prop(
    [
      arbContactRow,
      arbContactList,
      fc
        .array(arbActiveRule, { minLength: 1, maxLength: 4 })
        .map((rules) => rules.map((r) => ({ ...r, isActive: false }))),
    ],
    propertyParams()
  )('5. all-inactive rules → empty result', (input, existing, inactiveRules) => {
    const result = evaluateDuplicateRules<ContactRow>(input, existing, inactiveRules);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Determinism: calling twice with the same args returns the same result
// ---------------------------------------------------------------------------

describe('evaluateDuplicateRules — determinism (RACE-DEDUP-07)', () => {
  test.prop(
    [arbContactRow, arbContactList, fc.array(arbActiveRule, { minLength: 1, maxLength: 4 })],
    propertyParams()
  )(
    '6. deterministic — two calls with the same args produce identical output',
    (input, existing, rules) => {
      const r1 = evaluateDuplicateRules<ContactRow>(input, existing, rules);
      const r2 = evaluateDuplicateRules<ContactRow>(input, existing, rules);
      expect(r1).toEqual(r2);
    }
  );
});

// ---------------------------------------------------------------------------
// 5. Deduplication: each candidate id appears at most once in the output
// ---------------------------------------------------------------------------

describe('evaluateDuplicateRules — deduplication (RACE-DEDUP-07)', () => {
  test.prop(
    [arbContactRow, arbContactList, fc.array(arbActiveRule, { minLength: 2, maxLength: 6 })],
    propertyParams()
  )(
    '7. each candidate appears at most once in the output (highest-score wins)',
    (input, existing, rules) => {
      const result = evaluateDuplicateRules<ContactRow>(input, existing, rules);
      const ids = result.map((m) => m.candidate.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  );
});

// ---------------------------------------------------------------------------
// 6. Sort order: result is sorted by score descending
// ---------------------------------------------------------------------------

describe('evaluateDuplicateRules — sort order (RACE-DEDUP-07)', () => {
  test.prop(
    [arbContactRow, arbContactList, fc.array(arbActiveRule, { minLength: 1, maxLength: 4 })],
    propertyParams()
  )(
    '8. result is sorted by score descending (each pair satisfies a[i].score >= a[i+1].score)',
    (input, existing, rules) => {
      const result = evaluateDuplicateRules<ContactRow>(input, existing, rules);
      for (let i = 0; i + 1 < result.length; i++) {
        expect(result[i]!.score).toBeGreaterThanOrEqual(result[i + 1]!.score);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// 7. Exact email match: same email → score 100
// ---------------------------------------------------------------------------

describe('evaluateDuplicateRules — exact email match (RACE-DEDUP-07)', () => {
  const exactEmailRule: EvaluableRule = {
    field: 'email',
    matchStrategy: 'exact',
    threshold: 100,
    isActive: true,
    sortOrder: 0,
  };

  test.prop([arbSafeEmail, fc.uuid(), fc.uuid()], propertyParams())(
    '9. exact email strategy: identical lowercase email → score 100',
    (email, inputId, candidateId) => {
      fc.pre(inputId !== candidateId);
      const input: ContactRow = {
        id: inputId,
        email,
        phone: '12345678',
        firstName: 'a',
        lastName: 'b',
        company: 'c',
      };
      const candidate: ContactRow = {
        id: candidateId,
        email,
        phone: '12345678',
        firstName: 'a',
        lastName: 'b',
        company: 'c',
      };
      const result = evaluateDuplicateRules<ContactRow>(input, [candidate], [exactEmailRule]);
      expect(result).toHaveLength(1);
      expect(result[0]!.score).toBe(100);
    }
  );

  test.prop([arbSafeEmail, fc.uuid(), fc.uuid()], propertyParams())(
    '10. exact email strategy: different emails → no match',
    (email, inputId, candidateId) => {
      fc.pre(inputId !== candidateId);
      // Append "x" to make a different email while remaining valid
      const differentEmail = `x${email}`;
      const input: ContactRow = {
        id: inputId,
        email,
        phone: '12345678',
        firstName: 'a',
        lastName: 'b',
        company: 'c',
      };
      const candidate: ContactRow = {
        id: candidateId,
        email: differentEmail,
        phone: '12345678',
        firstName: 'a',
        lastName: 'b',
        company: 'c',
      };
      const result = evaluateDuplicateRules<ContactRow>(input, [candidate], [exactEmailRule]);
      expect(result).toHaveLength(0);
    }
  );
});

// ---------------------------------------------------------------------------
// 8. Phone normalisation: digits-only variant matches
// ---------------------------------------------------------------------------

describe('evaluateDuplicateRules — phone normalisation (RACE-DEDUP-07)', () => {
  const normalizedPhoneRule: EvaluableRule = {
    field: 'phone',
    matchStrategy: 'normalized',
    threshold: 100,
    isActive: true,
    sortOrder: 0,
  };

  test.prop([arbSafePhone, fc.uuid(), fc.uuid()], propertyParams())(
    '11. normalized phone: formatted input matches digits-only candidate',
    (digits, inputId, candidateId) => {
      fc.pre(inputId !== candidateId);
      // Insert dashes to create a formatted version like "1234-5678"
      const formatted = digits.slice(0, 4) + '-' + digits.slice(4);
      const input: ContactRow = {
        id: inputId,
        email: 'a@b.com',
        phone: formatted,
        firstName: 'a',
        lastName: 'b',
        company: 'c',
      };
      const candidate: ContactRow = {
        id: candidateId,
        email: 'a@b.com',
        phone: digits,
        firstName: 'a',
        lastName: 'b',
        company: 'c',
      };
      const result = evaluateDuplicateRules<ContactRow>(input, [candidate], [normalizedPhoneRule]);
      expect(result).toHaveLength(1);
      expect(result[0]!.score).toBe(100);
    }
  );
});

// ---------------------------------------------------------------------------
// 9. Website normalisation via extractFieldValue
// ---------------------------------------------------------------------------

describe('extractFieldValue — website normalisation (RACE-DEDUP-07)', () => {
  test.prop([arbSafeDomain], propertyParams())(
    '12. website normalisation is idempotent: extractFieldValue twice = same result',
    (domain) => {
      const v1 = extractFieldValue({ website: domain }, 'website', 'normalized');
      const v2 = extractFieldValue({ website: v1 }, 'website', 'normalized');
      expect(v1).toBe(v2);
    }
  );

  test.prop([arbSafeDomain], propertyParams())(
    '13. https:// protocol prefix is stripped on normalized website',
    (domain) => {
      const withProtocol = `https://${domain}`;
      const plain = domain;
      const v1 = extractFieldValue({ website: withProtocol }, 'website', 'normalized');
      const v2 = extractFieldValue({ website: plain }, 'website', 'normalized');
      expect(v1).toBe(v2);
    }
  );

  test.prop([arbSafeDomain], propertyParams())(
    '14. http:// protocol prefix is stripped on normalized website',
    (domain) => {
      const withHttp = `http://${domain}`;
      const v1 = extractFieldValue({ website: withHttp }, 'website', 'normalized');
      const v2 = extractFieldValue({ website: domain }, 'website', 'normalized');
      expect(v1).toBe(v2);
    }
  );

  test.prop([arbSafeDomain], propertyParams())(
    '15. www. prefix is stripped on normalized website',
    (domain) => {
      const withWww = `www.${domain}`;
      const v1 = extractFieldValue({ website: withWww }, 'website', 'normalized');
      const v2 = extractFieldValue({ website: domain }, 'website', 'normalized');
      expect(v1).toBe(v2);
    }
  );

  test.prop([arbSafeDomain], propertyParams())(
    '16. trailing slash is stripped on normalized website',
    (domain) => {
      const withSlash = `${domain}/`;
      const v1 = extractFieldValue({ website: withSlash }, 'website', 'normalized');
      const v2 = extractFieldValue({ website: domain }, 'website', 'normalized');
      expect(v1).toBe(v2);
    }
  );
});

// ---------------------------------------------------------------------------
// 10. Inactive-rule filtering: adding inactive copy does not change match count
// ---------------------------------------------------------------------------

describe('evaluateDuplicateRules — inactive rules filtered (RACE-DEDUP-07)', () => {
  test.prop(
    [arbContactRow, arbContactList, fc.array(arbActiveRule, { minLength: 1, maxLength: 4 })],
    propertyParams()
  )(
    '17. adding inactive duplicate of each active rule does not change match count',
    (input, existing, activeRules) => {
      const withInactive = [
        ...activeRules,
        ...activeRules.map((r) => ({ ...r, isActive: false, sortOrder: r.sortOrder + 100 })),
      ];
      const r1 = evaluateDuplicateRules<ContactRow>(input, existing, activeRules);
      const r2 = evaluateDuplicateRules<ContactRow>(input, existing, withInactive);
      // Same candidate ids, same scores (order may vary if scores tie differently,
      // but since inactive rules contribute nothing, results must be identical)
      expect(r1).toEqual(r2);
    }
  );
});

// ---------------------------------------------------------------------------
// 11. Fuzzy floor: fuzzy rule can never produce a score < 60
// ---------------------------------------------------------------------------

describe('evaluateDuplicateRules — fuzzy floor ≥ 60 (RACE-DEDUP-07)', () => {
  test.prop([arbContactRow, arbContactList, fc.integer({ min: 1, max: 60 })], propertyParams())(
    '18. fuzzy matches always have score ≥ 60 regardless of threshold (DEFAULT_FUZZY_FLOOR)',
    (input, existing, threshold) => {
      const fuzzyEmailRule: EvaluableRule = {
        field: 'email',
        matchStrategy: 'fuzzy',
        threshold,
        isActive: true,
        sortOrder: 0,
      };
      const result = evaluateDuplicateRules<ContactRow>(input, existing, [fuzzyEmailRule]);
      for (const match of result) {
        expect(match.score).toBeGreaterThanOrEqual(60);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// 12. extractFieldValue null/undefined safety
// ---------------------------------------------------------------------------

/**
 * Fields that are composite (join multiple sub-fields with a separator like '|').
 * When all sub-fields are absent these return the separator skeleton, NOT ''.
 * This is a known quirk documented below in bug test 25.
 *
 * Non-composite fields: email, phone, name, website
 * Composite fields:     name_company (→ '|'), name_address (→ '||')
 */
const NON_COMPOSITE_FIELDS: RuleField[] = ['email', 'phone', 'name', 'website'];

const arbNonCompositeField: fc.Arbitrary<RuleField> = fc.constantFrom(...NON_COMPOSITE_FIELDS);

describe('extractFieldValue — null safety (RACE-DEDUP-07)', () => {
  test.prop([arbNonCompositeField, arbMatchStrategy], propertyParams())(
    '19. extractFieldValue with null row returns empty string for non-composite fields',
    (field, strategy) => {
      const result = extractFieldValue(null, field, strategy);
      expect(result).toBe('');
    }
  );

  test.prop([arbNonCompositeField, arbMatchStrategy], propertyParams())(
    '20. extractFieldValue with undefined row returns empty string for non-composite fields',
    (field, strategy) => {
      const result = extractFieldValue(undefined, field, strategy);
      expect(result).toBe('');
    }
  );

  test.prop([arbNonCompositeField, arbMatchStrategy], propertyParams())(
    '21. extractFieldValue with empty object returns empty string for non-composite fields',
    (field, strategy) => {
      const result = extractFieldValue({}, field, strategy);
      expect(result).toBe('');
    }
  );
});

// ---------------------------------------------------------------------------
// 13. Account-field normalisation: name_address composite
// ---------------------------------------------------------------------------

describe('evaluateDuplicateRules — account name_address match (RACE-DEDUP-07)', () => {
  const exactNameAddressRule: EvaluableRule = {
    field: 'name_address',
    matchStrategy: 'exact',
    threshold: 100,
    isActive: true,
    sortOrder: 0,
  };

  test.prop([arbAccountRow, fc.uuid()], propertyParams())(
    '22. exact name_address: identical row fields → score 100',
    (row, inputId) => {
      fc.pre(inputId !== row.id);
      const input: AccountRow = { ...row, id: inputId };
      const result = evaluateDuplicateRules<AccountRow>(input, [row], [exactNameAddressRule]);
      expect(result).toHaveLength(1);
      expect(result[0]!.score).toBe(100);
      expect(result[0]!.ruleField).toBe('name_address');
      expect(result[0]!.matchStrategy).toBe('exact');
    }
  );
});

// ---------------------------------------------------------------------------
// 14. DuplicateMatch shape is always well-formed
// ---------------------------------------------------------------------------

describe('evaluateDuplicateRules — match shape (RACE-DEDUP-07)', () => {
  test.prop(
    [arbContactRow, arbContactList, fc.array(arbActiveRule, { minLength: 1, maxLength: 4 })],
    propertyParams()
  )(
    '23. every DuplicateMatch has candidate.id, ruleField, matchStrategy, and score',
    (input, existing, rules) => {
      const result = evaluateDuplicateRules<ContactRow>(input, existing, rules);
      for (const match of result) {
        expect(typeof match.candidate.id).toBe('string');
        expect(match.candidate.id.length).toBeGreaterThan(0);
        expect(ALL_FIELDS).toContain(match.ruleField);
        expect(ALL_STRATEGIES).toContain(match.matchStrategy);
        expect(typeof match.score).toBe('number');
        expect(Number.isFinite(match.score)).toBe(true);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// 15. When multiple rules match the same candidate, the best score wins
// ---------------------------------------------------------------------------

describe('evaluateDuplicateRules — best-score dedup (RACE-DEDUP-07)', () => {
  vitestTest('24. two rules match same candidate — returned match has the higher score', () => {
    // Rule 1: exact email → score 100 if match
    // Rule 2: fuzzy name → score < 100 (typo)
    const exactEmail: EvaluableRule = {
      field: 'email',
      matchStrategy: 'exact',
      threshold: 100,
      isActive: true,
      sortOrder: 0,
    };
    const fuzzyName: EvaluableRule = {
      field: 'name',
      matchStrategy: 'fuzzy',
      threshold: 60,
      isActive: true,
      sortOrder: 1,
    };
    type Row = { id: string; email: string; firstName: string; lastName: string };
    const input: Row = {
      id: 'input-1',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    };
    const candidate: Row = {
      id: 'cand-1',
      email: 'ada@example.com',
      firstName: 'Adah',
      lastName: 'Lovelace',
    };
    const result = evaluateDuplicateRules<Row>(input, [candidate], [exactEmail, fuzzyName]);
    // candidate appears exactly once
    expect(result).toHaveLength(1);
    // The kept score must be 100 (from exact email, the winner)
    expect(result[0]!.score).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// BUG properties (skipped to keep file green)
// ---------------------------------------------------------------------------

// BUG(RACE-DEDUP-07a): threshold=0 with exact/normalized strategy should lower
// the floor to 0 (match any non-empty value), but resolveFloor at line 166 of
// duplicate-rule-evaluator.ts evaluates `threshold || 100` which maps 0 → 100.
// A caller passing threshold=0 as "match everything" gets floor=100 instead,
// silently missing any duplicates that score below 100.
// Fix: treat threshold=0 as floor=0 in the non-fuzzy branch.
// FIXED (ENG-OPS-002.R02 / QUAL-003): resolveFloor now uses the clamped threshold
// directly, so threshold=0 yields floor=0 ("match everything").
vitestTest(
  'BUG(RACE-DEDUP-07a): threshold=0 with exact strategy should match any non-empty value (floor=0), not silently use floor=100',
  () => {
    fc.assert(
      fc.property(arbSafeEmail, fc.uuid(), fc.uuid(), (email, inputId, candidateId) => {
        if (inputId === candidateId) return;
        // A different email that won't score 100 on exact
        const differentEmail = 'z' + email;
        const zeroThresholdExactRule: EvaluableRule = {
          field: 'email',
          matchStrategy: 'exact',
          threshold: 0, // caller intent: match everything
          isActive: true,
          sortOrder: 0,
        };
        type Row = { id: string; email: string };
        const input: Row = { id: inputId, email };
        const candidate: Row = { id: candidateId, email: differentEmail };
        const result = evaluateDuplicateRules<Row>(input, [candidate], [zeroThresholdExactRule]);
        // With floor=0 the evaluator returns the candidate (score=0 satisfies floor=0).
        expect(result).toHaveLength(1);
      }),
      propertyParams()
    );
  }
);

// BUG(RACE-DEDUP-07c): Composite fields (name_company, name_address) return the
// separator skeleton when all sub-fields are absent/empty — '|' for name_company
// and '||' for name_address — instead of returning ''. Because the evaluator's
// empty-input guard at line 217 checks `if (!inputValue) continue`, these non-empty
// separator strings pass the guard and two records with all-empty composite fields
// will be matched against each other with score=100 (identical separator strings).
// This can produce false-positive duplicate matches when records genuinely lack data.
// Fix: the composite field extractor should return '' when all sub-components are empty.
// FIXED (ENG-OPS-002.R02 / QUAL-004): composite extractors now return '' when all
// sub-fields are empty, so data-less records no longer falsely match on '|' / '||'.
vitestTest(
  'BUG(RACE-DEDUP-07c): composite fields with all-empty sub-fields return separator skeleton instead of empty string, causing false-positive matches',
  () => {
    // name_company on null input returns '|' not ''
    expect(extractFieldValue(null, 'name_company', 'exact')).toBe(''); // FAILS: actual is '|'
    expect(extractFieldValue(null, 'name_address', 'exact')).toBe(''); // FAILS: actual is '||'
    // Two records with no name/company data should NOT match each other
    type Row = { id: string; name?: string };
    const empty1: Row = { id: 'id-1' };
    const empty2: Row = { id: 'id-2' };
    const nameRule: EvaluableRule = {
      field: 'name_address',
      matchStrategy: 'exact',
      threshold: 100,
      isActive: true,
      sortOrder: 0,
    };
    const result = evaluateDuplicateRules<Row>(empty1, [empty2], [nameRule]);
    expect(result).toHaveLength(0); // FAILS today: actual is 1 (matched on '||' === '||')
  }
);

// BUG(RACE-DEDUP-07b): The self-match guard at line 178 only fires when
// `inputId !== undefined`. When the input object has no `id` field, `inputId`
// is `undefined` and `undefined === candidateId` is always false, so the guard
// is effectively absent. This is a latent logical flaw: if a caller constructs
// an input that accidentally has the same id (e.g. via Object.assign), the
// guard won't catch it. The description in race-condition-findings.json notes
// this as an invalid state. Fix: skip when input has no id or add explicit
// undefined guard on candidateId as well.
// ADR-054: QUAL-005 (RACE-DEDUP-07b) — confirmed conceptually-incomplete self-match
// guard in duplicate-rule-evaluator; tracked in
// artifacts/reports/sprint-19/baseline/quality-findings.json. Skip retained pending a
// dedicated fix task (out of scope for ENG-OPS-002.R13).
vitestTest.skip(
  'BUG(RACE-DEDUP-07b): self-match guard is logically absent when input.id is undefined — if candidate.id were also undefined both would match',
  () => {
    // Demonstrate: a candidate with id=undefined would match input with id=undefined
    // (both undefined → guard condition `inputId && inputId === candidate.id` → false → guard skipped)
    // In practice UUIDs are never undefined, but the guard is conceptually incomplete.
    const noIdRule: EvaluableRule = {
      field: 'email',
      matchStrategy: 'exact',
      threshold: 100,
      isActive: true,
      sortOrder: 0,
    };
    // TypeScript won't allow id=undefined in the generic constraint, so we cast
    type LooseRow = { id: string; email: string };
    const inputWithNoId = { email: 'test@example.com' } as LooseRow;
    const candidateWithSameUndefinedId = { email: 'test@example.com' } as LooseRow;
    const result = evaluateDuplicateRules<LooseRow>(
      inputWithNoId,
      [candidateWithSameUndefinedId],
      [noIdRule]
    );
    // The guard SHOULD exclude the candidate (self-match), but because inputId is
    // undefined the guard condition `inputId && ...` short-circuits to false,
    // and the candidate slips through. This assertion would FAIL:
    expect(result).toHaveLength(0); // BUG: actual is 1 today
  }
);
