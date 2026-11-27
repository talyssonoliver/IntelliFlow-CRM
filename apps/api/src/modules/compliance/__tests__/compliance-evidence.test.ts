import { describe, expect, it, vi } from 'vitest';
import { PUBLISHED_TERMS_VERSION } from '@intelliflow/validators';
import {
  buildOverview,
  collectEvidence,
  evaluateFrameworks,
  isCompleteEvidence,
  trendFromSnapshots,
  utcDay,
  type Evidence,
  type EvidenceDb,
} from '../compliance-evidence';

const NOW = new Date('2026-11-23T10:00:00Z');

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    now: NOW,
    users: { seats: 4, withMfa: 4, admins: 1, adminsWithMfa: 1, unverified: 0 },
    audit: { entries30d: 50, logins30d: 40, failedLogins30d: 1, leadsCreated30d: 5 },
    apiKeys: { active: 2, neverExpire: 0, older: 0 },
    dsar: {
      open: 0,
      overdue: 0,
      completed12m: 3,
      breached12m: 0,
      openErasure: 0,
      staleOpenErasure: 0,
      activeRestrictions: 0,
    },
    bookings: { publicBookings: 6, withoutConsent: 0 },
    terms: { seats: 4, accepted: 4, publishedVersion: 'v2026.10' },
    retention: { documentPolicies: 2, aiConversationDays: 90, memoryPolicyRow: true },
    ai: { events30d: 10, highSeverity30d: 0 },
    ...overrides,
  };
}

const byId = (e: Evidence, id: string) => evaluateFrameworks(e).find((f) => f.id === id)!;
const control = (e: Evidence, fw: string, id: string) =>
  byId(e, fw).controls.find((c) => c.id === id)!;

describe('evaluateFrameworks', () => {
  it('returns every framework the page shows, including the ones it cannot measure', () => {
    expect(evaluateFrameworks(evidence()).map((f) => f.id)).toEqual([
      'iso-27001',
      'iso-42001',
      'iso-14001',
      'gdpr',
      'adr-registry',
    ]);
  });

  it('scores a framework as the share of its measured controls that pass', () => {
    const sec = byId(
      evidence({ users: { seats: 4, withMfa: 2, admins: 1, adminsWithMfa: 0, unverified: 0 } }),
      'iso-27001'
    );
    // MFA and admin MFA fail; verified email, audit, sign-ins and API keys pass.
    expect(sec.counts).toEqual({ passing: 4, attention: 2, notMeasured: 2 });
    expect(sec.score).toBe(67);
    expect(sec.status).toBe('attention');
  });

  it('never gives a score to a framework with nothing measured', () => {
    for (const id of ['iso-14001', 'adr-registry']) {
      const f = byId(evidence(), id);
      expect(f.score).toBeNull();
      expect(f.status).toBe('not_measured');
      for (const c of f.controls) {
        expect(c.state).toBe('not_measured');
        expect(c.needed).toBeTruthy();
      }
    }
  });

  it('marks a control not measured, with its own evidence, when the rows could not be read', () => {
    const e = evidence({ users: null });
    const mfa = control(e, 'iso-27001', 'A.9.4-mfa');
    expect(mfa.state).toBe('not_measured');
    expect(mfa.evidence).toMatch(/could not be read/);
  });

  describe('security controls', () => {
    it('flags users and administrators without a second factor', () => {
      const e = evidence({
        users: { seats: 5, withMfa: 3, admins: 2, adminsWithMfa: 1, unverified: 2 },
      });
      expect(control(e, 'iso-27001', 'A.9.4-mfa')).toMatchObject({
        state: 'attention',
        evidence: '3 of 5 users have a second factor enabled.',
        actionHref: '/settings/security/mfa',
      });
      expect(control(e, 'iso-27001', 'A.9.2-admin-mfa').state).toBe('attention');
      expect(control(e, 'iso-27001', 'A.5.17-verified').evidence).toMatch(
        /2 of 5 users have not verified/
      );
    });

    it('agrees the verb with the count: "1 administrator has", "2 administrators have"', () => {
      const one = evidence({
        users: { seats: 1, withMfa: 0, admins: 1, adminsWithMfa: 0, unverified: 1 },
      });
      expect(control(one, 'iso-27001', 'A.9.2-admin-mfa').evidence).toBe(
        '0 of 1 administrator has a second factor enabled.'
      );
      expect(control(one, 'iso-27001', 'A.9.4-mfa').evidence).toBe(
        '0 of 1 user has a second factor enabled.'
      );
      expect(control(one, 'iso-27001', 'A.5.17-verified').evidence).toBe(
        '1 of 1 user has not verified their email.'
      );
      const two = evidence({
        users: { seats: 3, withMfa: 1, admins: 2, adminsWithMfa: 1, unverified: 0 },
      });
      expect(control(two, 'iso-27001', 'A.9.2-admin-mfa').evidence).toBe(
        '1 of 2 administrators have a second factor enabled.'
      );
      expect(control(two, 'iso-27001', 'A.5.17-verified').evidence).toBe(
        'All 3 users have a verified email.'
      );
    });

    it('does not measure MFA for a firm with no users', () => {
      const e = evidence({
        users: { seats: 0, withMfa: 0, admins: 0, adminsWithMfa: 0, unverified: 0 },
      });
      expect(control(e, 'iso-27001', 'A.9.4-mfa').state).toBe('not_measured');
      expect(control(e, 'iso-27001', 'A.9.2-admin-mfa').state).toBe('not_measured');
    });

    it('needs both activity and silence before the audit log is called broken', () => {
      expect(
        control(
          evidence({
            audit: { entries30d: 0, logins30d: 0, failedLogins30d: 0, leadsCreated30d: 3 },
          }),
          'iso-27001',
          'A.8.15-audit'
        ).state
      ).toBe('attention');
      expect(
        control(
          evidence({
            audit: { entries30d: 0, logins30d: 0, failedLogins30d: 0, leadsCreated30d: 0 },
          }),
          'iso-27001',
          'A.8.15-audit'
        ).state
      ).toBe('not_measured');
    });

    it('raises attention on failed sign-ins only past both the count and the share', () => {
      const failing = (failed: number, ok: number) =>
        control(
          evidence({
            audit: { entries30d: 1, logins30d: ok, failedLogins30d: failed, leadsCreated30d: 0 },
          }),
          'iso-27001',
          'A.8.16-failed-logins'
        ).state;
      expect(failing(4, 10)).toBe('pass'); // under the count
      expect(failing(5, 100)).toBe('pass'); // under the share
      expect(failing(6, 10)).toBe('attention');
    });

    it('does not call zero failed sign-ins a pass: they are logged before the firm is known', () => {
      const c = control(
        evidence({
          audit: { entries30d: 9, logins30d: 40, failedLogins30d: 0, leadsCreated30d: 0 },
        }),
        'iso-27001',
        'A.8.16-failed-logins'
      );
      expect(c.state).toBe('not_measured');
      expect(c.evidence).toMatch(/before the firm is known/);
    });

    it('flags API keys that never expire or are too old, and passes when there are none', () => {
      expect(
        control(
          evidence({ apiKeys: { active: 3, neverExpire: 1, older: 1 } }),
          'iso-27001',
          'A.5.18-api-keys'
        )
      ).toMatchObject({
        state: 'attention',
        actionHref: '/developers/apps',
      });
      expect(
        control(
          evidence({ apiKeys: { active: 0, neverExpire: 0, older: 0 } }),
          'iso-27001',
          'A.5.18-api-keys'
        ).state
      ).toBe('pass');
    });
  });

  describe('GDPR controls', () => {
    it('flags requests past their deadline or answered late', () => {
      const base = evidence().dsar!;
      expect(
        control(evidence({ dsar: { ...base, open: 2, overdue: 1 } }), 'gdpr', 'art12-sla')
      ).toMatchObject({
        state: 'attention',
        actionHref: '/settings/privacy-requests',
      });
      expect(
        control(evidence({ dsar: { ...base, breached12m: 1 } }), 'gdpr', 'art12-sla').state
      ).toBe('attention');
      expect(control(evidence(), 'gdpr', 'art12-sla').state).toBe('pass');
    });

    it('flags verified erasure requests waiting too long', () => {
      const base = evidence().dsar!;
      expect(
        control(
          evidence({ dsar: { ...base, openErasure: 1, staleOpenErasure: 1 } }),
          'gdpr',
          'art17-erasure'
        ).state
      ).toBe('attention');
    });

    it('does not measure completion with no requests at all', () => {
      const base = evidence().dsar!;
      expect(
        control(
          evidence({ dsar: { ...base, completed12m: 0, open: 0 } }),
          'gdpr',
          'art15-completion'
        ).state
      ).toBe('not_measured');
    });

    it('passes completion only with completed requests and none overdue', () => {
      const base = evidence().dsar!;
      expect(
        control(
          evidence({ dsar: { ...base, completed12m: 3, open: 0 } }),
          'gdpr',
          'art15-completion'
        ).state
      ).toBe('pass');
      expect(
        control(
          evidence({ dsar: { ...base, completed12m: 0, open: 2 } }),
          'gdpr',
          'art15-completion'
        )
      ).toMatchObject({ state: 'not_measured', evidence: expect.stringContaining('0 completed') });
      expect(
        control(
          evidence({ dsar: { ...base, completed12m: 3, open: 1, overdue: 1 } }),
          'gdpr',
          'art15-completion'
        ).state
      ).toBe('attention');
    });

    it('never calls an open request still inside its deadline a failure', () => {
      const base = evidence().dsar!;
      const c = control(
        evidence({ dsar: { ...base, completed12m: 0, open: 1, overdue: 0 } }),
        'gdpr',
        'art15-completion'
      );
      expect(c.state).toBe('not_measured');
      expect(
        control(
          evidence({ dsar: { ...base, completed12m: 0, open: 1, overdue: 1 } }),
          'gdpr',
          'art15-completion'
        ).state
      ).toBe('attention');
    });

    it('keeps all three data request controls when the requests could not be read', () => {
      const ids = byId(evidence({ dsar: null }), 'gdpr').controls.map((c) => c.id);
      expect(ids).toEqual(
        expect.arrayContaining(['art12-sla', 'art17-erasure', 'art15-completion'])
      );
      expect(byId(evidence({ dsar: null }), 'gdpr').controls).toHaveLength(
        byId(evidence(), 'gdpr').controls.length
      );
    });

    it('tells a missing retention policy from one with no period', () => {
      const none = control(
        evidence({
          retention: { documentPolicies: 1, aiConversationDays: null, memoryPolicyRow: false },
        }),
        'iso-42001',
        'ai-retention'
      );
      expect(none.evidence).toMatch(/platform default/);
      const kept = control(
        evidence({
          retention: { documentPolicies: 1, aiConversationDays: null, memoryPolicyRow: true },
        }),
        'iso-42001',
        'ai-retention'
      );
      expect(kept.evidence).toMatch(/kept indefinitely/);
    });

    it('checks consent on public bookings, and says when there are none', () => {
      expect(
        control(
          evidence({ bookings: { publicBookings: 4, withoutConsent: 1 } }),
          'gdpr',
          'art7-consent'
        )
      ).toMatchObject({
        state: 'attention',
        evidence: '3 of 4 public bookings carry a consent timestamp.',
      });
      expect(
        control(
          evidence({ bookings: { publicBookings: 0, withoutConsent: 0 } }),
          'gdpr',
          'art7-consent'
        ).state
      ).toBe('not_measured');
    });

    it('checks terms acceptance against the users who take a seat', () => {
      expect(
        control(
          evidence({ terms: { seats: 4, accepted: 1, publishedVersion: 'v2026.10' } }),
          'gdpr',
          'terms-acceptance'
        )
      ).toMatchObject({
        state: 'attention',
        evidence: '1 of 4 users accepted the published terms (v2026.10).',
      });
      expect(
        control(
          evidence({ terms: { seats: 4, accepted: 0, publishedVersion: 'v2026.10' } }),
          'gdpr',
          'terms-acceptance'
        )
      ).toMatchObject({
        state: 'attention',
        evidence: '0 of 4 users accepted the published terms (v2026.10).',
      });
      expect(
        control(
          evidence({ terms: { seats: 0, accepted: 0, publishedVersion: 'v2026.10' } }),
          'gdpr',
          'terms-acceptance'
        ).state
      ).toBe('not_measured');
    });

    it('needs a retention rule of some kind', () => {
      expect(
        control(
          evidence({
            retention: { documentPolicies: 0, aiConversationDays: null, memoryPolicyRow: false },
          }),
          'gdpr',
          'art5-retention'
        ).state
      ).toBe('attention');
      expect(
        control(
          evidence({
            retention: { documentPolicies: 0, aiConversationDays: 30, memoryPolicyRow: true },
          }),
          'gdpr',
          'art5-retention'
        ).state
      ).toBe('pass');
    });

    it('shows the DPA, sub-processor list, breach register and impact assessments as not measured', () => {
      for (const id of ['art28-dpa', 'art28-subprocessors', 'art33-breach', 'art35-dpia']) {
        const c = control(evidence(), 'gdpr', id);
        expect(c.state).toBe('not_measured');
        expect(c.needed).toBeTruthy();
      }
    });
  });

  describe('AI controls', () => {
    it('measures monitoring only when AI events exist', () => {
      expect(
        control(
          evidence({ ai: { events30d: 0, highSeverity30d: 0 } }),
          'iso-42001',
          'ai-monitoring'
        ).state
      ).toBe('not_measured');
      expect(
        control(evidence({ ai: { events30d: 5, highSeverity30d: 2 } }), 'iso-42001', 'ai-flags')
          .state
      ).toBe('attention');
    });

    it('asks for an AI conversation retention period', () => {
      expect(
        control(
          evidence({
            retention: { documentPolicies: 1, aiConversationDays: null, memoryPolicyRow: false },
          }),
          'iso-42001',
          'ai-retention'
        ).state
      ).toBe('attention');
    });
  });
});

describe('buildOverview', () => {
  it('averages only the frameworks that have a score and says how many that is', () => {
    const o = buildOverview(evidence());
    const scored = o.frameworks.filter((f) => f.score !== null);
    expect(o.overall.measuredFrameworks).toBe(scored.length);
    expect(o.overall.totalFrameworks).toBe(5);
    expect(o.overall.score).toBe(
      Math.round(scored.reduce((s, f) => s + (f.score ?? 0), 0) / scored.length)
    );
  });

  it('counts action items from the controls that need attention', () => {
    const o = buildOverview(
      evidence({ users: { seats: 2, withMfa: 0, admins: 1, adminsWithMfa: 0, unverified: 1 } })
    );
    expect(o.overall.actionItems).toBe(o.frameworks.reduce((n, f) => n + f.counts.attention, 0));
    expect(o.overall.actionItems).toBeGreaterThanOrEqual(3);
  });

  it('has no overall score when nothing could be measured', () => {
    const o = buildOverview(
      evidence({
        users: null,
        audit: null,
        apiKeys: null,
        dsar: null,
        bookings: null,
        terms: null,
        retention: null,
        ai: null,
      })
    );
    expect(o.overall.score).toBeNull();
    expect(o.overall.measuredFrameworks).toBe(0);
  });
});

describe('trendFromSnapshots', () => {
  const point = (day: string, score: number | null) => ({
    day,
    score,
    passing: 0,
    attention: 0,
    notMeasured: 0,
  });

  it('says the trend starts tomorrow until two days are stored', () => {
    expect(trendFromSnapshots([])).toEqual({ state: 'pending', reason: 'Trend starts tomorrow' });
    expect(trendFromSnapshots([point('2026-11-23', 80)]).state).toBe('pending');
    expect(trendFromSnapshots([point('2026-11-22', null), point('2026-11-23', 80)]).state).toBe(
      'pending'
    );
  });

  it('is the change between the oldest and the newest stored score', () => {
    expect(
      trendFromSnapshots([
        point('2026-11-23', 70),
        point('2026-11-21', 80),
        point('2026-11-22', 75),
      ])
    ).toEqual({
      state: 'available',
      delta: -10,
      since: '2026-11-21',
    });
  });
});

describe('isCompleteEvidence', () => {
  it('is false as soon as one group could not be read', () => {
    expect(isCompleteEvidence(evidence())).toBe(true);
    expect(isCompleteEvidence(evidence({ ai: null }))).toBe(false);
    expect(isCompleteEvidence(evidence({ users: null }))).toBe(false);
  });
});

describe('utcDay', () => {
  it('truncates to the UTC calendar day', () => {
    expect(utcDay(new Date('2026-11-23T23:59:59Z')).toISOString()).toBe('2026-11-23T00:00:00.000Z');
  });
});

describe('collectEvidence', () => {
  function fakeDb(counts: Partial<Record<string, number>> = {}, fail: string[] = []): EvidenceDb {
    const count = (name: string) =>
      vi.fn(async () => {
        if (fail.includes(name)) throw new Error('boom');
        return counts[name] ?? 0;
      });
    return {
      user: { count: count('user') },
      auditLogEntry: { count: count('auditLogEntry') },
      lead: { count: count('lead') },
      aPIKey: { count: count('aPIKey') },
      dsarRequest: { count: count('dsarRequest') },
      processingRestriction: { count: count('processingRestriction') },
      appointment: { count: count('appointment') },
      termsAcceptance: {
        count: count('termsAcceptance'),
      },
      documentRetentionPolicy: { count: count('documentRetentionPolicy') },
      tenantMemoryPolicy: { findUnique: vi.fn(async () => ({ conversationRetentionDays: 45 })) },
      aIMonitoringEvent: { count: count('aIMonitoringEvent') },
    };
  }

  it('filters every query by the tenant', async () => {
    const db = fakeDb({ user: 3 });
    const e = await collectEvidence(db, 'tenant-a', NOW);
    expect(e.users?.seats).toBe(3);
    expect(e.terms?.publishedVersion).toBe(PUBLISHED_TERMS_VERSION);
    expect(e.retention?.aiConversationDays).toBe(45);
    for (const call of (db.auditLogEntry.count as ReturnType<typeof vi.fn>).mock.calls) {
      expect(JSON.stringify(call[0])).toContain('tenant-a');
    }
    for (const call of (db.dsarRequest.count as ReturnType<typeof vi.fn>).mock.calls) {
      expect(JSON.stringify(call[0])).toContain('tenant-a');
    }
    for (const call of (db.user.count as ReturnType<typeof vi.fn>).mock.calls) {
      expect(JSON.stringify(call[0])).toContain('tenant-a');
    }
  });

  it('counts accepted terms against the PUBLISHED version, not any version users sent', async () => {
    const db = fakeDb({ user: 3 });
    // A row with a client-chosen version must not move the yardstick.
    (db.termsAcceptance as Record<string, unknown>).findFirst = vi.fn(async () => ({
      termsVersion: 'attacker-chosen',
    }));
    await collectEvidence(db, 'tenant-a', NOW);
    const calls = (db.user.count as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      JSON.stringify(c[0])
    );
    expect(calls.some((c) => c.includes(`"termsVersion":"${PUBLISHED_TERMS_VERSION}"`))).toBe(true);
    expect(calls.some((c) => c.includes('attacker-chosen'))).toBe(false);
    expect((db.termsAcceptance as Record<string, unknown>).findFirst).not.toHaveBeenCalled();
  });

  it('counts administrators of this firm: home role or a live ADMIN membership here', async () => {
    const db = fakeDb({ user: 3 });
    await collectEvidence(db, 'tenant-a', NOW);
    const calls = (db.user.count as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      JSON.stringify(c[0])
    );
    const admin = calls.find((c) => c.includes('"role":"ADMIN"') && !c.includes('totpEnabled'))!;
    expect(admin).toContain('"revokedAt":null');
    expect(admin).toContain('"tenantId":"tenant-a","role":"ADMIN"');
  });

  it('measures MFA and admins over everyone with access, pinned staff included; terms over seats', async () => {
    const db = fakeDb({ user: 3 });
    await collectEvidence(db, 'tenant-a', NOW);
    const calls = (db.user.count as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      JSON.stringify(c[0])
    );
    const mfa = calls.filter((c) => c.includes('totpEnabled'));
    expect(mfa.length).toBeGreaterThan(0);
    for (const c of mfa) expect(c).not.toContain('"pinned":false');
    const terms = calls.filter((c) => c.includes('termsAcceptances'));
    expect(terms.length).toBe(1);
    expect(terms[0]).toContain('"pinned":false');
  });

  it('dates the 12-month DSAR history by when it was answered, not received', async () => {
    const db = fakeDb({ dsarRequest: 2 });
    await collectEvidence(db, 'tenant-a', NOW);
    const calls = (db.dsarRequest.count as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      JSON.stringify(c[0])
    );
    const completed = calls.find((c) => c.includes('"status":"COMPLETED"'))!;
    const breached = calls.find((c) => c.includes('"clockBreached":true'))!;
    expect(completed).toContain('"completedAt":{"gte"');
    expect(completed).not.toContain('receivedAt');
    expect(breached).toContain('"completedAt":{"gte"');
    expect(breached).not.toContain('receivedAt');
  });

  it('leaves only the failing group unread', async () => {
    const e = await collectEvidence(fakeDb({}, ['dsarRequest']), 'tenant-a', NOW);
    expect(e.dsar).toBeNull();
    expect(e.users).not.toBeNull();
    expect(e.audit).not.toBeNull();
  });
});
