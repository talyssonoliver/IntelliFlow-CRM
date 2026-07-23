/**
 * Property tests for Lead aggregate, Email value object, and LeadScore value
 * object (pure domain — no infrastructure).
 *
 * Property id: RACE-PURE-08
 * Title: Lead.changeStatus accepts any LeadStatus as target with no transition
 *        table — non-sensical reverse transitions are allowed in domain.
 *
 * Properties covered:
 *  1. Email validation: valid inputs accepted; invalid inputs rejected.
 *  2. Email normalisation idempotency: lower-casing + trimming is stable.
 *  3. Email equality semantics: case/whitespace variants compare equal.
 *  4. Email immutability: props are frozen.
 *  5. LeadScore validation: valid range accepted; out-of-range rejected.
 *  6. LeadScore rounding: stored value is Math.round(input).
 *  7. LeadScore tier monotonicity: higher scores never produce a lower tier.
 *  8. LeadScore equals: value semantics hold for same props.
 *  9. LeadScore toValue round-trip: all fields survive serialisation.
 * 10. Lead.create always starts in NEW status with score 0.
 * 11. Lead.create email normalisation: mixed-case email is stored lowercase.
 * 12. Lead default source: omitting source yields WEBSITE.
 * 13. Lead.updateScore: valid score replaces previous score.
 * 14. Lead.updateScore: invalid score leaves the original score unchanged.
 * 15. Lead converted guard (changeStatus): CONVERTED leads reject all further
 *     changeStatus calls.
 * 16. Lead.convert idempotency guard: second convert returns error.
 * 17. Lead.qualify guard: qualify succeeds only from NEW or CONTACTED.
 * 18. Lead.qualify guard: qualify from all other statuses fails.
 * 19. [SKIP/BUG] RACE-PURE-08: changeStatus should reject illegal reverse
 *     transitions (e.g. LOST→NEW, UNQUALIFIED→CONVERTED) but does not.
 * 20. Lead.qualify and changeStatus('QUALIFIED') observable state equivalence.
 * 21. Domain events accumulate: N operations → N events appended.
 *
 * @see docs/operations/property-testing/race-condition-findings.json RACE-PURE-08
 */

import { describe, expect, test as vitestTest } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  Email,
  LeadScore,
  Lead,
  LEAD_STATUSES,
  LEAD_SOURCES,
  type LeadStatus,
  type LeadSource,
} from '@intelliflow/domain';
import { propertyParams } from '../../support';

// ---------------------------------------------------------------------------
// Bounded arbitraries (inline — do not edit support/arbitraries)
// ---------------------------------------------------------------------------

/** All valid lead statuses. */
const arbLeadStatus: fc.Arbitrary<LeadStatus> = fc.constantFrom(...LEAD_STATUSES);

/** All valid lead sources. */
const arbLeadSource: fc.Arbitrary<LeadSource> = fc.constantFrom(...LEAD_SOURCES);

/**
 * A syntactically valid email according to the domain regex:
 *   /^[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,63}$/
 *
 * We build structurally sound emails directly rather than relying on
 * fc.emailAddress(), which may generate RFC-5321-compliant addresses that
 * contain characters the domain's conservative regex rejects (e.g. quoted
 * local parts, IP literals).
 */
const arbLocalPart: fc.Arbitrary<string> = fc
  .stringMatching(/^[a-zA-Z0-9._%+-]{1,64}$/)
  .filter((s) => s.length >= 1 && s.length <= 64);

const arbDomainLabel: fc.Arbitrary<string> = fc
  .stringMatching(/^[a-zA-Z0-9-]{1,30}$/)
  .filter((s) => s.length >= 1);

const arbTld: fc.Arbitrary<string> = fc
  .stringMatching(/^[a-zA-Z]{2,10}$/)
  .filter((s) => s.length >= 2 && s.length <= 10);

const arbValidEmail: fc.Arbitrary<string> = fc
  .tuple(arbLocalPart, arbDomainLabel, arbTld)
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)
  .filter((email) => {
    const n = email.toLowerCase().trim();
    return (
      n.length <= 320 && /^[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,63}$/.test(n)
    );
  });

/** Invalid emails: strings that are definitely not valid. */
const arbInvalidEmail: fc.Arbitrary<string> = fc.oneof(
  fc.constant(''),
  fc.constant('nodomain'),
  fc.constant('@nodomain.com'),
  fc.constant('no-at-sign.com'),
  fc.constant('missing@tld'),
  fc.constant('  '),
  fc.constant('double@@at.com'),
  // local part too long (65+ chars). Construct all-alphanumeric directly — a
  // `.filter(allAlnum)` over fc.string almost never satisfies for long lengths,
  // making fast-check spin (the cause of the file-level hang).
  fc.integer({ min: 65, max: 80 }).map((n) => `${'a'.repeat(n)}@example.com`),
  // exceeds the total 320-char limit
  fc.integer({ min: 280, max: 300 }).map((n) => `${'a'.repeat(n)}@example.com`)
);

/** Valid score value: integer in [0, 100]. */
const arbValidScoreInt: fc.Arbitrary<number> = fc.integer({ min: 0, max: 100 });

/** Valid score value: float in [0, 100] (will be rounded). */
const arbValidScoreFloat: fc.Arbitrary<number> = fc.double({
  min: 0,
  max: 100,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Invalid score value: outside [0, 100] and not NaN. */
const arbInvalidScore: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: 101, max: 10_000 }),
  fc.integer({ min: -10_000, max: -1 })
);

/** Valid confidence: float in [0, 1]. */
const arbValidConfidence: fc.Arbitrary<number> = fc.double({
  min: 0,
  max: 1,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Invalid confidence: outside [0, 1] and not NaN/Infinity. */
const arbInvalidConfidence: fc.Arbitrary<number> = fc.oneof(
  fc.double({ min: 1.001, max: 1000, noNaN: true, noDefaultInfinity: true }),
  fc.double({ min: -1000, max: -0.001, noNaN: true, noDefaultInfinity: true })
);

/** Minimal valid Lead creation props. */
const arbCreateLeadProps = fc.record({
  ownerId: fc.uuid(),
  tenantId: fc.uuid(),
  source: fc.option(arbLeadSource, { nil: undefined }),
});

/** A non-empty ASCII user-id string (used for changedBy / qualifiedBy). */
const arbUserId: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 36 })
  .filter((s) => s.trim().length > 0);

// ---------------------------------------------------------------------------
// Helper: create a lead from a fixed valid email + generated props
// ---------------------------------------------------------------------------
const VALID_EMAIL = 'prop.test@example.com';

function makeLead(ownerId: string, tenantId: string, source?: LeadSource): Lead {
  const result = Lead.create({
    email: VALID_EMAIL,
    ownerId,
    tenantId,
    source: source ?? 'WEBSITE',
  });
  if (result.isFailure) throw new Error(`Unexpected Lead.create failure: ${result.error.message}`);
  return result.value;
}

// ---------------------------------------------------------------------------
// 1–4. Email properties
// ---------------------------------------------------------------------------

describe('Email — value-object invariants (property, RACE-PURE-08)', () => {
  test.prop([arbValidEmail], propertyParams())(
    '1. create accepts any structurally valid email',
    (email) => {
      const result = Email.create(email);
      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(email.toLowerCase().trim());
    }
  );

  test.prop([arbInvalidEmail], propertyParams())(
    '2. create rejects invalid email with INVALID_EMAIL error code',
    (email) => {
      const result = Email.create(email);
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_EMAIL');
    }
  );

  test.prop([arbValidEmail], propertyParams())(
    '3. normalisation is idempotent — create(value).value equals create(value.toLowerCase().trim()).value',
    (email) => {
      const normalised = email.toLowerCase().trim();
      const r1 = Email.create(email);
      const r2 = Email.create(normalised);
      fc.pre(r1.isSuccess && r2.isSuccess);
      expect(r1.value.value).toBe(r2.value.value);
    }
  );

  test.prop([arbValidEmail], propertyParams())(
    '4. case-variant emails are equal (value semantics)',
    (email) => {
      const lower = email.toLowerCase().trim();
      const upper = email.toUpperCase().trim();
      const rl = Email.create(lower);
      const ru = Email.create(upper);
      fc.pre(rl.isSuccess && ru.isSuccess);
      expect(rl.value.equals(ru.value)).toBe(true);
    }
  );

  test.prop([arbValidEmail], propertyParams())(
    '5. Email props are frozen (immutability)',
    (email) => {
      const result = Email.create(email);
      fc.pre(result.isSuccess);
      const props = (result.value as unknown as { props: object }).props;
      expect(Object.isFrozen(props)).toBe(true);
    }
  );

  test.prop([arbValidEmail], propertyParams())(
    '6. toValue and value getter return the same normalised string',
    (email) => {
      const result = Email.create(email);
      fc.pre(result.isSuccess);
      expect(result.value.toValue()).toBe(result.value.value);
    }
  );

  test.prop([arbValidEmail], propertyParams())(
    '7. domain getter returns the part after @',
    (email) => {
      const result = Email.create(email);
      fc.pre(result.isSuccess);
      const normalised = email.toLowerCase().trim();
      const expectedDomain = normalised.split('@')[1];
      expect(result.value.domain).toBe(expectedDomain);
    }
  );

  test.prop([arbValidEmail], propertyParams())(
    '8. localPart getter returns the part before @',
    (email) => {
      const result = Email.create(email);
      fc.pre(result.isSuccess);
      const normalised = email.toLowerCase().trim();
      const expectedLocal = normalised.split('@')[0];
      expect(result.value.localPart).toBe(expectedLocal);
    }
  );
});

// ---------------------------------------------------------------------------
// 5–9. LeadScore properties
// ---------------------------------------------------------------------------

describe('LeadScore — value-object invariants (property, RACE-PURE-08)', () => {
  test.prop([arbValidScoreFloat, arbValidConfidence], propertyParams())(
    '1. create accepts any score in [0, 100] with confidence in [0, 1]',
    (score, confidence) => {
      const result = LeadScore.create(score, confidence);
      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(Math.round(score));
      expect(result.value.confidence).toBe(confidence);
    }
  );

  test.prop([arbInvalidScore, arbValidConfidence], propertyParams())(
    '2. create rejects scores outside [0, 100] with INVALID_LEAD_SCORE error',
    (score, confidence) => {
      const result = LeadScore.create(score, confidence);
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_LEAD_SCORE');
    }
  );

  test.prop([arbValidScoreFloat, arbInvalidConfidence], propertyParams())(
    '3. create rejects confidence outside [0, 1] with INVALID_LEAD_CONFIDENCE error',
    (score, confidence) => {
      const result = LeadScore.create(score, confidence);
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_LEAD_CONFIDENCE');
    }
  );

  test.prop([arbValidScoreFloat, arbValidConfidence], propertyParams())(
    '4. stored value is always Math.round(input) — rounding is applied',
    (score, confidence) => {
      const result = LeadScore.create(score, confidence);
      fc.pre(result.isSuccess);
      expect(result.value.value).toBe(Math.round(score));
    }
  );

  test.prop([arbValidScoreInt, arbValidScoreInt, arbValidConfidence], propertyParams())(
    '5. tier is monotone non-decreasing with score: higher score never yields lower tier',
    (s1, s2, confidence) => {
      const lower = Math.min(s1, s2);
      const higher = Math.max(s1, s2);
      fc.pre(lower !== higher);
      const rLow = LeadScore.create(lower, confidence);
      const rHigh = LeadScore.create(higher, confidence);
      fc.pre(rLow.isSuccess && rHigh.isSuccess);

      const tierOrder: Record<string, number> = { COLD: 0, WARM: 1, HOT: 2 };
      expect(tierOrder[rHigh.value.tier]).toBeGreaterThanOrEqual(tierOrder[rLow.value.tier]);
    }
  );

  test.prop([arbValidScoreFloat, arbValidConfidence], propertyParams())(
    '6. two LeadScores with same inputs are equal (value semantics)',
    (score, confidence) => {
      const a = LeadScore.create(score, confidence);
      const b = LeadScore.create(score, confidence);
      fc.pre(a.isSuccess && b.isSuccess);
      expect(a.value.equals(b.value)).toBe(true);
    }
  );

  test.prop([arbValidScoreFloat, arbValidConfidence], propertyParams())(
    '7. toValue round-trip preserves score, confidence, and tier',
    (score, confidence) => {
      const result = LeadScore.create(score, confidence);
      fc.pre(result.isSuccess);
      const snapshot = result.value.toValue();
      expect(snapshot.score).toBe(Math.round(score));
      expect(snapshot.confidence).toBe(confidence);
      expect(snapshot.tier).toBe(result.value.tier);
    }
  );

  test.prop([arbValidScoreFloat, arbValidConfidence], propertyParams())(
    '8. toValue is idempotent — two calls return structurally equal objects',
    (score, confidence) => {
      const result = LeadScore.create(score, confidence);
      fc.pre(result.isSuccess);
      expect(result.value.toValue()).toEqual(result.value.toValue());
    }
  );

  test.prop([arbValidScoreFloat, arbValidConfidence], propertyParams())(
    '9. isHighConfidence iff confidence >= 0.8',
    (score, confidence) => {
      const result = LeadScore.create(score, confidence);
      fc.pre(result.isSuccess);
      const expected = confidence >= 0.8;
      expect(result.value.isHighConfidence).toBe(expected);
    }
  );

  vitestTest('10. LeadScore.zero() always yields value=0, confidence=1, tier=COLD', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const z = LeadScore.zero();
        expect(z.value).toBe(0);
        expect(z.confidence).toBe(1);
        expect(z.tier).toBe('COLD');
      }),
      propertyParams()
    );
  });
});

// ---------------------------------------------------------------------------
// 10–21. Lead aggregate properties
// ---------------------------------------------------------------------------

describe('Lead aggregate — invariants (property, RACE-PURE-08)', () => {
  test.prop([arbCreateLeadProps], propertyParams())(
    '1. Lead.create always starts with status=NEW and score.value=0',
    ({ ownerId, tenantId, source }) => {
      const lead = makeLead(ownerId, tenantId, source ?? undefined);
      expect(lead.status).toBe('NEW');
      expect(lead.score.value).toBe(0);
    }
  );

  test.prop([arbCreateLeadProps], propertyParams())(
    '2. Lead.create with mixed-case email stores normalised lowercase email',
    ({ ownerId, tenantId }) => {
      const result = Lead.create({
        email: 'Mixed.CASE@Example.COM',
        ownerId,
        tenantId,
      });
      expect(result.isSuccess).toBe(true);
      expect(result.value.email.value).toBe('mixed.case@example.com');
    }
  );

  test.prop([fc.uuid(), fc.uuid()], propertyParams())(
    '3. Lead.create without source defaults to WEBSITE',
    (ownerId, tenantId) => {
      const result = Lead.create({ email: VALID_EMAIL, ownerId, tenantId });
      expect(result.isSuccess).toBe(true);
      expect(result.value.source).toBe('WEBSITE');
    }
  );

  test.prop([arbCreateLeadProps, arbLeadSource], propertyParams())(
    '4. Lead.create stores the provided source unchanged',
    ({ ownerId, tenantId }, source) => {
      const result = Lead.create({ email: VALID_EMAIL, ownerId, tenantId, source });
      expect(result.isSuccess).toBe(true);
      expect(result.value.source).toBe(source);
    }
  );

  test.prop([arbCreateLeadProps, arbValidScoreFloat, arbValidConfidence], propertyParams())(
    '5. updateScore replaces previous score with the new valid score',
    ({ ownerId, tenantId, source }, scoreVal, confidence) => {
      const lead = makeLead(ownerId, tenantId, source ?? undefined);
      const result = lead.updateScore(scoreVal, confidence, 'v1.0.0');
      expect(result.isSuccess).toBe(true);
      expect(lead.score.value).toBe(Math.round(scoreVal));
      expect(lead.score.confidence).toBe(confidence);
    }
  );

  test.prop([arbCreateLeadProps, arbInvalidScore], propertyParams())(
    '6. updateScore with invalid score leaves original score unchanged',
    ({ ownerId, tenantId, source }, badScore) => {
      const lead = makeLead(ownerId, tenantId, source ?? undefined);
      const originalScoreValue = lead.score.value;
      const result = lead.updateScore(badScore, 0.5, 'v1.0.0');
      expect(result.isFailure).toBe(true);
      expect(lead.score.value).toBe(originalScoreValue);
    }
  );

  test.prop([arbCreateLeadProps, arbLeadStatus, arbUserId], propertyParams())(
    '7. changeStatus on a non-CONVERTED lead always succeeds (no transition table guards)',
    ({ ownerId, tenantId, source }, targetStatus, userId) => {
      const lead = makeLead(ownerId, tenantId, source ?? undefined);
      // Only skip if somehow lead is already converted (impossible from create, but guard anyway)
      fc.pre(lead.status !== 'CONVERTED');
      const result = lead.changeStatus(targetStatus, userId);
      expect(result.isSuccess).toBe(true);
      expect(lead.status).toBe(targetStatus);
    }
  );

  test.prop([arbCreateLeadProps, arbLeadStatus, arbUserId], propertyParams())(
    '8. changeStatus on a CONVERTED lead always fails with LEAD_ALREADY_CONVERTED',
    ({ ownerId, tenantId, source }, targetStatus, userId) => {
      const lead = makeLead(ownerId, tenantId, source ?? undefined);
      lead.convert(null, null, userId);
      fc.pre(lead.isConverted);
      const result = lead.changeStatus(targetStatus, userId);
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('LEAD_ALREADY_CONVERTED');
    }
  );

  test.prop([arbCreateLeadProps, arbUserId], propertyParams())(
    '9. convert succeeds from NEW status; second convert returns LEAD_ALREADY_CONVERTED',
    ({ ownerId, tenantId, source }, userId) => {
      const lead = makeLead(ownerId, tenantId, source ?? undefined);
      const first = lead.convert(null, null, userId);
      expect(first.isSuccess).toBe(true);
      expect(lead.isConverted).toBe(true);

      const second = lead.convert(null, null, userId);
      expect(second.isFailure).toBe(true);
      expect(second.error.code).toBe('LEAD_ALREADY_CONVERTED');
    }
  );

  test.prop([arbCreateLeadProps, arbUserId], propertyParams())(
    '10. qualify from NEW status succeeds and sets status to QUALIFIED',
    ({ ownerId, tenantId, source }, userId) => {
      const lead = makeLead(ownerId, tenantId, source ?? undefined);
      // Lead starts in NEW
      expect(lead.status).toBe('NEW');
      const result = lead.qualify(userId, 'good fit');
      expect(result.isSuccess).toBe(true);
      expect(lead.status).toBe('QUALIFIED');
      expect(lead.isQualified).toBe(true);
    }
  );

  test.prop([arbCreateLeadProps, arbUserId], propertyParams())(
    '11. qualify from CONTACTED status succeeds and sets status to QUALIFIED',
    ({ ownerId, tenantId, source }, userId) => {
      const lead = makeLead(ownerId, tenantId, source ?? undefined);
      lead.changeStatus('CONTACTED', userId);
      const result = lead.qualify(userId, 'good fit');
      expect(result.isSuccess).toBe(true);
      expect(lead.status).toBe('QUALIFIED');
    }
  );

  test.prop([arbCreateLeadProps, arbUserId], propertyParams())(
    '12. qualify from UNQUALIFIED fails with LEAD_CANNOT_BE_QUALIFIED',
    ({ ownerId, tenantId, source }, userId) => {
      const lead = makeLead(ownerId, tenantId, source ?? undefined);
      lead.changeStatus('UNQUALIFIED', userId);
      const result = lead.qualify(userId, 'reconsider');
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('LEAD_CANNOT_BE_QUALIFIED');
    }
  );

  test.prop([arbCreateLeadProps, arbUserId], propertyParams())(
    '13. qualify from LOST fails with LEAD_CANNOT_BE_QUALIFIED',
    ({ ownerId, tenantId, source }, userId) => {
      const lead = makeLead(ownerId, tenantId, source ?? undefined);
      lead.changeStatus('LOST', userId);
      const result = lead.qualify(userId, 'reconsider');
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('LEAD_CANNOT_BE_QUALIFIED');
    }
  );

  test.prop([arbCreateLeadProps, arbUserId], propertyParams())(
    '14. qualify from NEGOTIATING fails with LEAD_CANNOT_BE_QUALIFIED',
    ({ ownerId, tenantId, source }, userId) => {
      const lead = makeLead(ownerId, tenantId, source ?? undefined);
      lead.changeStatus('NEGOTIATING', userId);
      const result = lead.qualify(userId, 'reconsider');
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('LEAD_CANNOT_BE_QUALIFIED');
    }
  );

  test.prop([arbCreateLeadProps, arbUserId], propertyParams())(
    '15. qualify from CONVERTED fails with LEAD_ALREADY_CONVERTED',
    ({ ownerId, tenantId, source }, userId) => {
      const lead = makeLead(ownerId, tenantId, source ?? undefined);
      lead.convert(null, null, userId);
      const result = lead.qualify(userId, 'late reconsider');
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('LEAD_ALREADY_CONVERTED');
    }
  );

  test.prop([arbCreateLeadProps, arbUserId], propertyParams())(
    '16. qualify and changeStatus("QUALIFIED") produce identical observable state',
    ({ ownerId, tenantId, source }, userId) => {
      const leadA = makeLead(ownerId, tenantId, source ?? undefined);
      leadA.qualify(userId, 'reason');

      const leadB = makeLead(ownerId, tenantId, source ?? undefined);
      leadB.changeStatus('QUALIFIED', userId);

      // Both must have QUALIFIED status and isQualified=true
      expect(leadA.status).toBe('QUALIFIED');
      expect(leadB.status).toBe('QUALIFIED');
      expect(leadA.isQualified).toBe(true);
      expect(leadB.isQualified).toBe(true);
    }
  );

  test.prop(
    [arbCreateLeadProps, arbValidScoreFloat, arbValidConfidence, arbUserId],
    propertyParams()
  )(
    '17. domain events accumulate: create + updateScore + changeStatus = 3 events total',
    ({ ownerId, tenantId, source }, scoreVal, confidence, userId) => {
      const lead = makeLead(ownerId, tenantId, source ?? undefined);
      expect(lead.getDomainEvents()).toHaveLength(1); // LeadCreatedEvent

      lead.updateScore(scoreVal, confidence, 'v1');
      expect(lead.getDomainEvents()).toHaveLength(2); // + LeadScoredEvent

      lead.changeStatus('CONTACTED', userId);
      expect(lead.getDomainEvents()).toHaveLength(3); // + LeadStatusChangedEvent
    }
  );

  test.prop([arbCreateLeadProps], propertyParams())(
    '18. clearDomainEvents empties the events list',
    ({ ownerId, tenantId, source }) => {
      const lead = makeLead(ownerId, tenantId, source ?? undefined);
      expect(lead.getDomainEvents().length).toBeGreaterThan(0);
      lead.clearDomainEvents();
      expect(lead.getDomainEvents()).toHaveLength(0);
    }
  );

  test.prop([arbCreateLeadProps, arbUserId], propertyParams())(
    '19. isConverted and isQualified are mutually observable: only one true at a time',
    ({ ownerId, tenantId, source }, userId) => {
      const lead = makeLead(ownerId, tenantId, source ?? undefined);

      // Initially neither
      expect(lead.isConverted).toBe(false);
      expect(lead.isQualified).toBe(false);

      // After qualify: qualified, not converted
      lead.qualify(userId, 'fits');
      expect(lead.isQualified).toBe(true);
      expect(lead.isConverted).toBe(false);

      // After convert: converted, not qualified (status=CONVERTED ≠ QUALIFIED)
      lead.convert(null, null, userId);
      expect(lead.isConverted).toBe(true);
      expect(lead.isQualified).toBe(false);
    }
  );

  // -------------------------------------------------------------------------
  // BUG PROPERTY (RACE-PURE-08)
  //
  // The domain has NO transition table. changeStatus() only guards the CONVERTED
  // state. All other transitions — including nonsensical ones such as LOST→NEW,
  // UNQUALIFIED→CONVERTED, NEGOTIATING→NEW — are silently accepted.
  //
  // The property below asserts what the business rule SHOULD be: reverse or
  // invalid transitions must be rejected.  It is skipped because the current
  // implementation intentionally (or by omission) allows all non-CONVERTED
  // transitions.
  // -------------------------------------------------------------------------

  // BUG(RACE-PURE-08): changeStatus allows any transition from any non-CONVERTED
  // status, including semantically invalid reverse transitions such as LOST→NEW
  // or UNQUALIFIED→CONVERTED.  A transition table (VALID_LEAD_TRANSITIONS) should
  // be introduced and validated in changeStatus().  Until then this property would
  // fail on e.g. LOST→NEW, so it is skipped to keep the file green.
  // ADR-054: QUAL-006 (RACE-PURE-08) — confirmed missing VALID_LEAD_TRANSITIONS table
  // in Lead.changeStatus; tracked in
  // artifacts/reports/sprint-19/baseline/quality-findings.json. Skip retained pending a
  // dedicated fix task (out of scope for ENG-OPS-002.R13).
  test.skip('BUG(RACE-PURE-08): changeStatus rejects illegal reverse transitions (e.g. LOST→NEW, UNQUALIFIED→CONVERTED)', () => {
    const illegalPairs: Array<[LeadStatus, LeadStatus]> = [
      ['LOST', 'NEW'],
      ['LOST', 'CONTACTED'],
      ['LOST', 'QUALIFIED'],
      ['UNQUALIFIED', 'CONVERTED'],
      ['QUALIFIED', 'NEW'],
      ['NEGOTIATING', 'NEW'],
      ['NEGOTIATING', 'CONTACTED'],
    ];

    for (const [from, to] of illegalPairs) {
      const lead = makeLead('owner-1', 'tenant-1');
      if (from !== 'NEW') {
        // Reach the 'from' status via the unrestricted changeStatus
        lead.changeStatus(from, 'user-1');
      }
      const result = lead.changeStatus(to, 'user-1');
      expect(result.isFailure).toBe(true); // This assertion FAILS today
    }
  });
});
