import { describe, expect, it } from 'vitest';
import { Prisma, TENANT_MODELS } from '@intelliflow/db';
import {
  EXPLICIT_SECRET_DENYLIST,
  EXPORTED_COLUMN_EXCLUSIONS,
  REDACTED,
  REVIEWED_NON_SECRET,
  isReviewedNonSecret,
  scrubJson,
  stripUrlSecrets,
  unreviewedSecretLikeColumns,
} from '../deny-list';
import { EXPORT_ENTITIES, MEMBERSHIP_EXPORT, USER_EXPORT } from '../entities';
import { buildPlans } from '../export-workspace';

const scalarColumns = (model: string): string[] => {
  const e = (Prisma as unknown as Record<string, Record<string, string> | undefined>)[
    `${model}ScalarFieldEnum`
  ];
  if (!e) throw new Error(`unknown model ${model}`);
  return Object.keys(e);
};

describe('secret deny-list', () => {
  it('every exported model is tenant-owned (a tenantId column)', () => {
    for (const e of EXPORT_ENTITIES) {
      expect(TENANT_MODELS[e.model], e.model).toBeDefined();
      expect(scalarColumns(e.model), e.model).toContain('tenantId');
    }
    expect(TENANT_MODELS[MEMBERSHIP_EXPORT.model]).toBeDefined();
  });

  // The test that fails when a new secret-like column appears in an exported model: a developer
  // who adds `oauthToken` or `apiKeyHash` to Lead gets a red test and must either exclude the
  // column or review it into REVIEWED_NON_SECRET with a reason.
  it('no exported model has an unreviewed secret-like column', () => {
    const offenders: string[] = [];
    for (const e of EXPORT_ENTITIES) {
      for (const c of unreviewedSecretLikeColumns(e.model, scalarColumns(e.model))) {
        offenders.push(`${e.model}.${c}`);
      }
    }
    expect(
      offenders,
      'New secret-like column in an exported model. Add it to EXPORTED_COLUMN_EXCLUSIONS, or to ' +
        'REVIEWED_NON_SECRET with a reason (src/workspace-export/deny-list.ts).'
    ).toEqual([]);
  });

  it('the plan really leaves the excluded columns out of what it selects', () => {
    for (const plan of buildPlans()) {
      for (const col of EXPORTED_COLUMN_EXCLUSIONS[plan.model] ?? []) {
        expect(plan.columns, `${plan.model}.${col}`).not.toContain(col);
      }
      for (const col of plan.columns) {
        // Allow-listed models (users, memberships) are checked as well.
        expect(unreviewedSecretLikeColumns(plan.model, [col]), `${plan.model}.${col}`).toEqual([]);
      }
    }
  });

  it('a new secret-like column is caught (the guard itself works)', () => {
    expect(unreviewedSecretLikeColumns('Lead', ['id', 'email', 'oauthToken'])).toEqual([
      'oauthToken',
    ]);
    expect(
      unreviewedSecretLikeColumns('Lead', ['webhookSecret', 'apiKeyHash', 'smtpPassword'])
    ).toEqual(['webhookSecret', 'apiKeyHash', 'smtpPassword']);
    expect(
      unreviewedSecretLikeColumns('Lead', ['byokKey', 'privateKey', 'refreshToken'])
    ).toHaveLength(3);
    expect(unreviewedSecretLikeColumns('CallRecord', ['recordingUrl'])).toEqual([]);
    expect(unreviewedSecretLikeColumns('Tag', ['colorToken'])).toEqual([]);
    expect(unreviewedSecretLikeColumns('CaseDocument', ['contentHash'])).toEqual([]);
    expect(unreviewedSecretLikeColumns('Lead', ['firstName', 'tags', 'estimatedValue'])).toEqual(
      []
    );
  });

  it('users are exported by allow-list, never the secret-bearing columns', () => {
    const all = scalarColumns('User');
    for (const c of USER_EXPORT.columns) expect(all, c).toContain(c);
    for (const banned of ['stripeCustomerId', 'preferences', 'avatarUrl', 'bio']) {
      expect(USER_EXPORT.columns as readonly string[]).not.toContain(banned);
    }
    expect(unreviewedSecretLikeColumns('User', [...USER_EXPORT.columns])).toEqual([]);
  });

  it('models known to hold secrets are never exported', () => {
    const exported = new Set<string>([
      ...EXPORT_ENTITIES.map((e) => e.model),
      MEMBERSHIP_EXPORT.model,
      USER_EXPORT.model,
    ]);
    for (const model of Object.keys(EXPLICIT_SECRET_DENYLIST)) {
      expect(exported.has(model), model).toBe(false);
    }
  });

  it('every explicitly denied column still exists in the schema (the list cannot go stale)', () => {
    for (const [model, cols] of Object.entries(EXPLICIT_SECRET_DENYLIST)) {
      const all = scalarColumns(model);
      for (const c of cols) expect(all, `${model}.${c}`).toContain(c);
    }
    for (const [model, cols] of Object.entries(EXPORTED_COLUMN_EXCLUSIONS)) {
      const all = scalarColumns(model);
      for (const c of cols) expect(all, `${model}.${c}`).toContain(c);
    }
  });

  it('every reviewed non-secret entry still names a real column', () => {
    for (const key of Object.keys(REVIEWED_NON_SECRET)) {
      const [model, column] = key.split('.') as [string, string];
      const models = model === '*' ? EXPORT_ENTITIES.map((e) => e.model) : [model];
      const found = models.some((m) => scalarColumns(m).includes(column));
      expect(found, key).toBe(true);
    }
    expect(isReviewedNonSecret('Lead', 'colorToken')).toBe(true);
    expect(isReviewedNonSecret('Lead', 'oauthToken')).toBe(false);
  });

  it('scrubs secret-looking keys anywhere inside Json values', () => {
    expect(
      scrubJson({
        ok: 1,
        accessToken: 'a',
        nested: [{ password: 'p', fine: 'f' }, { 'api-key': 'k' }],
        Authorization: 'redact-me-value',
      })
    ).toEqual({
      ok: 1,
      accessToken: REDACTED,
      nested: [{ password: REDACTED, fine: 'f' }, { 'api-key': REDACTED }],
      Authorization: REDACTED,
    });
    expect(scrubJson(null)).toBeNull();
    expect(scrubJson('plain')).toBe('plain');
  });

  it('strips signed-link query strings from URL columns', () => {
    expect(stripUrlSecrets('https://h.example.invalid/o/a.pdf?token=SECRET&x=1')).toBe(
      'https://h.example.invalid/o/a.pdf'
    );
    expect(stripUrlSecrets('https://h.example.invalid/o/a.pdf#frag')).toBe(
      'https://h.example.invalid/o/a.pdf'
    );
    expect(stripUrlSecrets('plain/path')).toBe('plain/path');
  });
});
