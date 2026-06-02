/**
 * Property tests for LeadRoutingService — evaluateConditions and
 * computeRoutingScore pure functions (IFC-030).
 *
 * Both functions are private; this file accesses them via a TypeScript cast to
 * `any` so property runs do not require mocking the Prisma layer.
 *
 * Properties covered:
 *  1. evaluateConditions — empty conditions array is always true.
 *  2. evaluateConditions — 'equals' matches only when fieldValue === conditionValue.
 *  3. evaluateConditions — 'not_equals' is the negation of 'equals'.
 *  4. evaluateConditions — 'greater_than' requires strictly ordered numbers.
 *  5. evaluateConditions — 'less_than' is the mirror of 'greater_than'.
 *  6. evaluateConditions — 'in' on a scalar value is contained in the array.
 *  7. evaluateConditions — 'not_in' is the negation of 'in'.
 *  8. evaluateConditions — 'in' on tags array (any-tag-in-set semantics).
 *  9. evaluateConditions — 'not_in' on tags array (none-tag-in-set semantics).
 * 10. evaluateConditions — 'contains' on string field is substring check.
 * 11. evaluateConditions — 'contains' on numeric field throws NF-005 error.
 * 12. evaluateConditions — unknown operator always returns false (no-match).
 * 13. evaluateConditions — unknown field maps to undefined; 'equals' undefined
 *     accepts only explicit undefined conditionValue.
 * 14. evaluateConditions — multiple conditions are ANDed (all must pass).
 * 15. computeRoutingScore — score is always in [0, 1] for all valid inputs.
 * 16. computeRoutingScore — score is monotone non-increasing with currentLoad
 *     (higher load => lower or equal score, holding proficiency constant).
 * 17. computeRoutingScore — score is monotone non-decreasing with proficiency
 *     (higher proficiency => higher or equal score, holding load constant).
 * 18. computeRoutingScore — maxCapacity=0 yields capacityFactor=0; score
 *     depends solely on proficiency component.
 * 19. computeRoutingScore — two identical agents produce equal scores.
 * 20. computeRoutingScore — absent proficiency defaults to 3/5 (the midpoint).
 * 21. evaluateConditions — 'greater_than' with non-number returns false.
 * 22. evaluateConditions — 'less_than' with non-number returns false.
 * 23. evaluateConditions — 'contains' on null location returns false.
 * 24. evaluateConditions — conditions short-circuit on first failure.
 */

import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  LeadRoutingService,
  type EligibleAgent,
  type LeadContext,
} from '../../../../apps/api/src/services/LeadRoutingService';
import { propertyParams } from '../../support';

// ---------------------------------------------------------------------------
// Private-method extraction
// ---------------------------------------------------------------------------

/**
 * Reach into the private `evaluateConditions` method via a type-cast to `any`.
 * Constructing LeadRoutingService requires a PrismaClient; we pass `null` because
 * the method under test is pure and never touches `this.prisma`.
 */
const svc = new LeadRoutingService(null as any);
const evalConditions: (
  conditions: Array<{ field: string; operator: string; value: unknown }>,
  ctx: LeadContext
) => boolean = (svc as any).evaluateConditions.bind(svc);

const computeScore: (agent: EligibleAgent, ctx: LeadContext) => number = (
  svc as any
).computeRoutingScore.bind(svc);

// ---------------------------------------------------------------------------
// Inline arbitraries
// ---------------------------------------------------------------------------

const LEAD_FIELDS = [
  'leadScore',
  'leadSource',
  'leadStatus',
  'estimatedValue',
  'location',
  'tags',
] as const;
/** A minimal LeadContext with bounded values. */
const arbLeadCtx: fc.Arbitrary<LeadContext> = fc.record({
  score: fc.integer({ min: 0, max: 100 }),
  source: fc.oneof(
    fc.constant('WEB'),
    fc.constant('REFERRAL'),
    fc.constant('COLD_CALL'),
    fc.constant('PARTNER')
  ),
  status: fc.oneof(
    fc.constant('NEW'),
    fc.constant('CONTACTED'),
    fc.constant('QUALIFIED'),
    fc.constant('UNQUALIFIED')
  ),
  estimatedValue: fc.option(fc.integer({ min: 0, max: 100_000 }), { nil: null }),
  location: fc.option(
    fc.oneof(fc.constant('New York'), fc.constant('Los Angeles'), fc.constant('Chicago')),
    { nil: null }
  ),
  tags: fc.array(
    fc.oneof(
      fc.constant('enterprise'),
      fc.constant('smb'),
      fc.constant('saas'),
      fc.constant('healthcare')
    ),
    { minLength: 0, maxLength: 4 }
  ),
});

/** An EligibleAgent with valid, bounded capacity and proficiency. */
const arbAgent: fc.Arbitrary<EligibleAgent> = fc
  .record({
    agentId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    skills: fc.array(fc.constant('sales'), { minLength: 0, maxLength: 2 }),
    currentLoad: fc.integer({ min: 0, max: 9 }),
    maxCapacity: fc.integer({ min: 1, max: 10 }),
    status: fc.constantFrom('ONLINE', 'BUSY'),
    proficiency: fc.option(fc.integer({ min: 1, max: 5 }), { nil: undefined }),
    routingScore: fc.option(fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), {
      nil: undefined,
    }),
  })
  .filter((a) => a.currentLoad < a.maxCapacity); // agents must be under-capacity

// ---------------------------------------------------------------------------
// Helper: build a minimal LeadContext for a given field
// ---------------------------------------------------------------------------

function ctxWithField(field: (typeof LEAD_FIELDS)[number], value: unknown): LeadContext {
  return {
    score: field === 'leadScore' ? (value as number) : 50,
    source: field === 'leadSource' ? (value as string) : 'WEB',
    status: field === 'leadStatus' ? (value as string) : 'NEW',
    estimatedValue: field === 'estimatedValue' ? (value as number | null) : null,
    location: field === 'location' ? (value as string | null) : null,
    tags: field === 'tags' ? (value as string[]) : [],
  };
}

// ---------------------------------------------------------------------------
// 1. Empty conditions array is always true
// ---------------------------------------------------------------------------

describe('evaluateConditions — structural invariants', () => {
  test.prop([arbLeadCtx], propertyParams())(
    '1. empty conditions array always returns true',
    (ctx) => {
      expect(evalConditions([], ctx)).toBe(true);
    }
  );

  // ---------------------------------------------------------------------------
  // 2–3. equals / not_equals duality
  // ---------------------------------------------------------------------------

  test.prop([fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 })], propertyParams())(
    '2. equals matches only when fieldValue === conditionValue (leadScore field)',
    (a, b) => {
      const ctx = ctxWithField('leadScore', a);
      const result = evalConditions([{ field: 'leadScore', operator: 'equals', value: b }], ctx);
      expect(result).toBe(a === b);
    }
  );

  test.prop([fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 })], propertyParams())(
    '3. not_equals is the exact negation of equals (leadScore field)',
    (a, b) => {
      const ctx = ctxWithField('leadScore', a);
      const eq = evalConditions([{ field: 'leadScore', operator: 'equals', value: b }], ctx);
      const neq = evalConditions([{ field: 'leadScore', operator: 'not_equals', value: b }], ctx);
      expect(neq).toBe(!eq);
    }
  );

  // ---------------------------------------------------------------------------
  // 4–5. greater_than / less_than
  // ---------------------------------------------------------------------------

  test.prop([fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 })], propertyParams())(
    '4. greater_than returns true iff fieldValue > conditionValue (both numbers)',
    (a, b) => {
      const ctx = ctxWithField('leadScore', a);
      const result = evalConditions(
        [{ field: 'leadScore', operator: 'greater_than', value: b }],
        ctx
      );
      expect(result).toBe(a > b);
    }
  );

  test.prop([fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 })], propertyParams())(
    '5. less_than returns true iff fieldValue < conditionValue (both numbers)',
    (a, b) => {
      const ctx = ctxWithField('leadScore', a);
      const result = evalConditions([{ field: 'leadScore', operator: 'less_than', value: b }], ctx);
      expect(result).toBe(a < b);
    }
  );

  test.prop([fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 })], propertyParams())(
    '5b. greater_than and less_than are mutually exclusive when a !== b',
    (a, b) => {
      fc.pre(a !== b);
      const ctx = ctxWithField('leadScore', a);
      const gt = evalConditions([{ field: 'leadScore', operator: 'greater_than', value: b }], ctx);
      const lt = evalConditions([{ field: 'leadScore', operator: 'less_than', value: b }], ctx);
      // When a !== b, exactly one of gt/lt is true (not both, not neither)
      expect(gt || lt).toBe(true);
      expect(gt && lt).toBe(false);
    }
  );

  // ---------------------------------------------------------------------------
  // 6–7. in / not_in on scalar (leadSource)
  // ---------------------------------------------------------------------------

  test.prop(
    [
      fc.constantFrom('WEB', 'REFERRAL', 'COLD_CALL', 'PARTNER'),
      fc.array(fc.constantFrom('WEB', 'REFERRAL', 'COLD_CALL', 'PARTNER'), {
        minLength: 0,
        maxLength: 4,
      }),
    ],
    propertyParams()
  )(
    '6. in operator: scalar value accepted iff it appears in the condition array',
    (source, arr) => {
      const ctx = ctxWithField('leadSource', source);
      const result = evalConditions([{ field: 'leadSource', operator: 'in', value: arr }], ctx);
      expect(result).toBe(arr.includes(source));
    }
  );

  test.prop(
    [
      fc.constantFrom('WEB', 'REFERRAL', 'COLD_CALL', 'PARTNER'),
      fc.array(fc.constantFrom('WEB', 'REFERRAL', 'COLD_CALL', 'PARTNER'), {
        minLength: 0,
        maxLength: 4,
      }),
    ],
    propertyParams()
  )('7. not_in is always the exact negation of in (scalar)', (source, arr) => {
    const ctx = ctxWithField('leadSource', source);
    const inResult = evalConditions([{ field: 'leadSource', operator: 'in', value: arr }], ctx);
    const notInResult = evalConditions(
      [{ field: 'leadSource', operator: 'not_in', value: arr }],
      ctx
    );
    expect(notInResult).toBe(!inResult);
  });

  // ---------------------------------------------------------------------------
  // 8–9. in / not_in on array field (tags — any-tag-in-set semantics)
  // ---------------------------------------------------------------------------

  const TAG_POOL = ['enterprise', 'smb', 'saas', 'healthcare', 'fintech'] as const;
  const arbTagSubset = fc.array(fc.constantFrom(...TAG_POOL), { minLength: 0, maxLength: 5 });

  test.prop([arbTagSubset, arbTagSubset], propertyParams())(
    '8. in on tags array: true iff at least one tag from fieldValue appears in condition array',
    (fieldTags, condTags) => {
      const ctx = ctxWithField('tags', fieldTags);
      const result = evalConditions([{ field: 'tags', operator: 'in', value: condTags }], ctx);
      const expected = fieldTags.some((t) => condTags.includes(t));
      expect(result).toBe(expected);
    }
  );

  test.prop([arbTagSubset, arbTagSubset], propertyParams())(
    '9. not_in on tags array: true iff no tag from fieldValue appears in condition array',
    (fieldTags, condTags) => {
      const ctx = ctxWithField('tags', fieldTags);
      const inResult = evalConditions([{ field: 'tags', operator: 'in', value: condTags }], ctx);
      const notInResult = evalConditions(
        [{ field: 'tags', operator: 'not_in', value: condTags }],
        ctx
      );
      expect(notInResult).toBe(!inResult);
    }
  );

  // ---------------------------------------------------------------------------
  // 10. contains on string field
  // ---------------------------------------------------------------------------

  test.prop(
    [
      fc.oneof(
        fc.constant('New York'),
        fc.constant('Los Angeles'),
        fc.constant('Chicago'),
        fc.constant('')
      ),
      fc.string({ minLength: 0, maxLength: 10 }),
    ],
    propertyParams()
  )(
    '10. contains on location string: result equals String.prototype.includes',
    (location, substring) => {
      fc.pre(location !== null);
      const ctx: LeadContext = {
        score: 50,
        source: 'WEB',
        status: 'NEW',
        estimatedValue: null,
        location,
        tags: [],
      };
      const result = evalConditions(
        [{ field: 'location', operator: 'contains', value: substring }],
        ctx
      );
      expect(result).toBe(location.includes(substring));
    }
  );

  // ---------------------------------------------------------------------------
  // 11. NF-005: contains on numeric field throws
  // ---------------------------------------------------------------------------

  test.prop([fc.constantFrom('leadScore', 'estimatedValue')], propertyParams())(
    '11. contains on numeric field (leadScore or estimatedValue) throws NF-005 error',
    (numericField) => {
      const ctx: LeadContext = {
        score: 85,
        source: 'WEB',
        status: 'NEW',
        estimatedValue: 5000,
        location: null,
        tags: [],
      };
      expect(() =>
        evalConditions([{ field: numericField, operator: 'contains', value: '8' }], ctx)
      ).toThrow(/contains.*numeric/i);
    }
  );

  // ---------------------------------------------------------------------------
  // 12. Unknown operator always returns false
  // ---------------------------------------------------------------------------

  test.prop(
    [
      fc
        .string({ minLength: 1, maxLength: 20 })
        .filter(
          (s) =>
            ![
              'equals',
              'not_equals',
              'greater_than',
              'less_than',
              'in',
              'not_in',
              'contains',
            ].includes(s)
        ),
    ],
    propertyParams()
  )('12. unknown operator always returns false (no-match)', (unknownOp) => {
    const ctx: LeadContext = {
      score: 50,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: null,
      tags: [],
    };
    const result = evalConditions([{ field: 'leadScore', operator: unknownOp, value: 50 }], ctx);
    expect(result).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 13. Unknown field maps to undefined; equals-undefined is the only match
  // ---------------------------------------------------------------------------

  test.prop([fc.string({ minLength: 1, maxLength: 20 })], propertyParams())(
    '13. unknown field always returns undefined; equals-conditionValue only true when conditionValue is undefined',
    (unknownField) => {
      fc.pre(!LEAD_FIELDS.includes(unknownField as any));
      const ctx: LeadContext = {
        score: 50,
        source: 'WEB',
        status: 'NEW',
        estimatedValue: null,
        location: null,
        tags: [],
      };
      // undefined === undefined -> true
      const resultUndef = evalConditions(
        [{ field: unknownField, operator: 'equals', value: undefined }],
        ctx
      );
      expect(resultUndef).toBe(true);

      // undefined === 42 -> false
      const resultNonUndef = evalConditions(
        [{ field: unknownField, operator: 'equals', value: 42 }],
        ctx
      );
      expect(resultNonUndef).toBe(false);
    }
  );

  // ---------------------------------------------------------------------------
  // 14. Multiple conditions are ANDed
  // ---------------------------------------------------------------------------

  test.prop(
    [
      fc.integer({ min: 0, max: 100 }),
      fc.integer({ min: 0, max: 100 }),
      fc.constantFrom('WEB', 'REFERRAL', 'COLD_CALL'),
    ],
    propertyParams()
  )(
    '14. all conditions must hold — ANDed semantics (two conditions)',
    (score, threshold, source) => {
      const ctx: LeadContext = {
        score,
        source,
        status: 'NEW',
        estimatedValue: null,
        location: null,
        tags: [],
      };

      const cond1Passes = score > threshold;
      const cond2Passes = source === 'WEB';

      const result = evalConditions(
        [
          { field: 'leadScore', operator: 'greater_than', value: threshold },
          { field: 'leadSource', operator: 'equals', value: 'WEB' },
        ],
        ctx
      );

      expect(result).toBe(cond1Passes && cond2Passes);
    }
  );

  // ---------------------------------------------------------------------------
  // 21. greater_than with non-number returns false
  // ---------------------------------------------------------------------------

  test.prop([arbLeadCtx], propertyParams())(
    '21. greater_than on non-number conditionValue always returns false',
    (ctx) => {
      // Pass a string as conditionValue — the evaluator checks typeof both sides
      const result = evalConditions(
        [{ field: 'leadScore', operator: 'greater_than', value: 'not-a-number' }],
        ctx
      );
      expect(result).toBe(false);
    }
  );

  // ---------------------------------------------------------------------------
  // 22. less_than with non-number returns false
  // ---------------------------------------------------------------------------

  test.prop([arbLeadCtx], propertyParams())(
    '22. less_than on non-number conditionValue always returns false',
    (ctx) => {
      const result = evalConditions(
        [{ field: 'leadScore', operator: 'less_than', value: 'not-a-number' }],
        ctx
      );
      expect(result).toBe(false);
    }
  );

  // ---------------------------------------------------------------------------
  // 23. contains on null location returns false
  // ---------------------------------------------------------------------------

  test.prop([fc.string({ minLength: 1, maxLength: 20 })], propertyParams())(
    '23. contains on null location always returns false',
    (substring) => {
      const ctx: LeadContext = {
        score: 50,
        source: 'WEB',
        status: 'NEW',
        estimatedValue: null,
        location: null,
        tags: [],
      };
      const result = evalConditions(
        [{ field: 'location', operator: 'contains', value: substring }],
        ctx
      );
      expect(result).toBe(false);
    }
  );

  // ---------------------------------------------------------------------------
  // 24. Short-circuit: if the first condition fails, the second is never reached
  //     even if it would throw (e.g. contains-on-numeric after a false condition)
  // ---------------------------------------------------------------------------

  test.prop([fc.integer({ min: 0, max: 50 })], propertyParams())(
    '24. conditions short-circuit on first failure — second condition not evaluated',
    (score) => {
      fc.pre(score <= 50); // Ensures first condition (>80) fails
      const ctx: LeadContext = {
        score,
        source: 'WEB',
        status: 'NEW',
        estimatedValue: null,
        location: null,
        tags: [],
      };

      // First condition fails (score <= 50, not > 80).
      // Second condition would throw if reached (contains on numeric NF-005).
      // If short-circuit works correctly, no throw — result is false.
      expect(() =>
        evalConditions(
          [
            { field: 'leadScore', operator: 'greater_than', value: 80 },
            { field: 'leadScore', operator: 'contains', value: '8' }, // would throw if reached
          ],
          ctx
        )
      ).not.toThrow();

      const result = evalConditions(
        [
          { field: 'leadScore', operator: 'greater_than', value: 80 },
          { field: 'leadScore', operator: 'contains', value: '8' },
        ],
        ctx
      );
      expect(result).toBe(false);
    }
  );
});

// ---------------------------------------------------------------------------
// computeRoutingScore properties
// ---------------------------------------------------------------------------

describe('computeRoutingScore — numeric invariants', () => {
  // ---------------------------------------------------------------------------
  // 15. Score is always in [0, 1]
  // ---------------------------------------------------------------------------

  test.prop([arbAgent, arbLeadCtx], propertyParams())(
    '15. computeRoutingScore always returns a value in [0, 1]',
    (agent, ctx) => {
      const score = computeScore(agent, ctx);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  );

  // ---------------------------------------------------------------------------
  // 16. Score is monotone non-increasing with currentLoad (capacity factor)
  // ---------------------------------------------------------------------------

  test.prop(
    [
      fc.integer({ min: 0, max: 9 }),
      fc.integer({ min: 0, max: 9 }),
      fc.integer({ min: 10, max: 10 }),
      fc.option(fc.integer({ min: 1, max: 5 }), { nil: undefined }),
      arbLeadCtx,
    ],
    propertyParams()
  )(
    '16. higher currentLoad produces a lower or equal score (monotone non-increasing)',
    (load1, load2, maxCap, proficiency, ctx) => {
      const higherLoad = Math.max(load1, load2);
      const lowerLoad = Math.min(load1, load2);

      const agentHighLoad: EligibleAgent = {
        agentId: 'a1',
        name: 'Alice',
        skills: [],
        currentLoad: higherLoad,
        maxCapacity: maxCap,
        status: 'ONLINE',
        proficiency,
      };
      const agentLowLoad: EligibleAgent = {
        ...agentHighLoad,
        currentLoad: lowerLoad,
      };

      const scoreHigh = computeScore(agentHighLoad, ctx);
      const scoreLow = computeScore(agentLowLoad, ctx);

      // lower load => higher or equal score
      expect(scoreLow).toBeGreaterThanOrEqual(scoreHigh);
    }
  );

  // ---------------------------------------------------------------------------
  // 17. Score is monotone non-decreasing with proficiency
  // ---------------------------------------------------------------------------

  test.prop(
    [
      fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 6, max: 10 }),
      arbLeadCtx,
    ],
    propertyParams()
  )(
    '17. higher proficiency produces a higher or equal score (monotone non-decreasing)',
    (prof1, prof2, currentLoad, maxCapacity, ctx) => {
      const higherProf = Math.max(prof1, prof2);
      const lowerProf = Math.min(prof1, prof2);

      const agentHighProf: EligibleAgent = {
        agentId: 'b1',
        name: 'Bob',
        skills: [],
        currentLoad,
        maxCapacity,
        status: 'ONLINE',
        proficiency: higherProf,
      };
      const agentLowProf: EligibleAgent = {
        ...agentHighProf,
        proficiency: lowerProf,
      };

      const scoreHigh = computeScore(agentHighProf, ctx);
      const scoreLow = computeScore(agentLowProf, ctx);

      expect(scoreHigh).toBeGreaterThanOrEqual(scoreLow);
    }
  );

  // ---------------------------------------------------------------------------
  // 18. maxCapacity=0 yields capacityFactor=0; score is solely proficiency-based
  // ---------------------------------------------------------------------------

  test.prop(
    [fc.option(fc.integer({ min: 1, max: 5 }), { nil: undefined }), arbLeadCtx],
    propertyParams()
  )(
    '18. maxCapacity=0 clamps capacityFactor to 0 — score = round(proficiencyFactor * 0.6 * 100) / 100',
    (proficiency, ctx) => {
      const agent: EligibleAgent = {
        agentId: 'c1',
        name: 'Carol',
        skills: [],
        currentLoad: 0,
        maxCapacity: 0, // edge case
        status: 'ONLINE',
        proficiency,
      };
      const score = computeScore(agent, ctx);
      // capacityFactor = 0 when maxCapacity=0; formula: round((0*0.4 + pf*0.6)*100)/100
      const proficiencyFactor = (proficiency ?? 3) / 5;
      const expected = Math.round((0 * 0.4 + proficiencyFactor * 0.6) * 100) / 100;
      expect(score).toBe(expected);
    }
  );

  // ---------------------------------------------------------------------------
  // 19. Two identical agents produce equal scores
  // ---------------------------------------------------------------------------

  test.prop([arbAgent, arbLeadCtx], propertyParams())(
    '19. two structurally identical agents always produce the same routing score',
    (agent, ctx) => {
      const agentCopy: EligibleAgent = { ...agent };
      expect(computeScore(agent, ctx)).toBe(computeScore(agentCopy, ctx));
    }
  );

  // ---------------------------------------------------------------------------
  // 20. Absent proficiency defaults to 3 (the midpoint of [1, 5])
  // ---------------------------------------------------------------------------

  test.prop(
    [fc.integer({ min: 0, max: 9 }), fc.integer({ min: 1, max: 10 }), arbLeadCtx],
    propertyParams()
  )(
    '20. absent proficiency uses default of 3/5 — equals explicit proficiency=3',
    (currentLoad, maxCapacity, ctx) => {
      fc.pre(currentLoad < maxCapacity);
      const agentDefault: EligibleAgent = {
        agentId: 'd1',
        name: 'Dave',
        skills: [],
        currentLoad,
        maxCapacity,
        status: 'ONLINE',
        proficiency: undefined,
      };
      const agentExplicit3: EligibleAgent = {
        ...agentDefault,
        proficiency: 3,
      };
      expect(computeScore(agentDefault, ctx)).toBe(computeScore(agentExplicit3, ctx));
    }
  );

  // ---------------------------------------------------------------------------
  // Score formula verification: spot-check the 40/60 weighting
  // ---------------------------------------------------------------------------

  test.prop([arbAgent, arbLeadCtx], propertyParams())(
    'formula: score = round((capacityRatio*0.4 + proficiencyFactor*0.6) * 100) / 100',
    (agent, ctx) => {
      const capacityRatio = agent.maxCapacity > 0 ? 1 - agent.currentLoad / agent.maxCapacity : 0;
      const proficiencyFactor = (agent.proficiency ?? 3) / 5;
      const expected = Math.round((capacityRatio * 0.4 + proficiencyFactor * 0.6) * 100) / 100;
      expect(computeScore(agent, ctx)).toBe(expected);
    }
  );
});
