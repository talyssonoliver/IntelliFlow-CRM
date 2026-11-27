import { describe, expect, it } from 'vitest';
import { TENANT_MODELS } from '@intelliflow/db';
import { EXPORT_ENTITIES, MEMBERSHIP_EXPORT, USER_EXPORT } from '../entities';
import { EXCLUDED_MODELS } from '../excluded-models';
import { buildPlans } from '../export-workspace';

const exportedModels = (): Set<string> =>
  new Set([...EXPORT_ENTITIES.map((e) => e.model), USER_EXPORT.model, MEMBERSHIP_EXPORT.model]);

describe('every tenant model is accounted for', () => {
  it('is either exported or listed as excluded, with a reason', () => {
    const exported = exportedModels();
    const unaccounted = Object.keys(TENANT_MODELS).filter(
      (m) => !exported.has(m) && !(m in EXCLUDED_MODELS)
    );
    expect(
      unaccounted,
      'A tenant-owned model is neither exported nor excluded. Add it to EXPORT_ENTITIES ' +
        '(entities.ts) or to EXCLUDED_MODELS with a reason (excluded-models.ts).'
    ).toEqual([]);
  });

  it('never lists a model as both exported and excluded', () => {
    const exported = exportedModels();
    expect(Object.keys(EXCLUDED_MODELS).filter((m) => exported.has(m))).toEqual([]);
  });

  it('never keeps an exclusion for a model that no longer exists', () => {
    expect(Object.keys(EXCLUDED_MODELS).filter((m) => !(m in TENANT_MODELS))).toEqual([]);
  });

  it('gives every exclusion a real reason', () => {
    for (const [model, reason] of Object.entries(EXCLUDED_MODELS)) {
      expect(reason.trim().length, model).toBeGreaterThan(15);
    }
  });

  it('exports the models the review named: activity comments, SLA policies, ticket categories', () => {
    const exported = exportedModels();
    for (const m of ['ActivityComment', 'SLAPolicy', 'TicketCategory']) {
      expect(exported.has(m), m).toBe(true);
    }
  });

  it('gives every exported file a unique name and a plan', () => {
    const names = buildPlans().map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    const models = EXPORT_ENTITIES.map((e) => e.model);
    expect(new Set(models).size).toBe(models.length);
  });

  it('keeps credential stores out of the export, whatever the list says', () => {
    const exported = exportedModels();
    for (const m of ['EmailMailbox', 'Session', 'APIKey', 'WebhookEndpoint', 'UserMfaSettings']) {
      expect(exported.has(m), m).toBe(false);
      expect(EXCLUDED_MODELS[m], m).toBeDefined();
    }
  });
});
