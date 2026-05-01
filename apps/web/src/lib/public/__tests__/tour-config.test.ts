/**
 * PG-126 — tour-config integrity.
 *
 * Ensures the inlined TS config and the `artifacts/misc/onboarding-config.json`
 * artefact describe the same shape (both validate against
 * onboardingConfigSchema).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { onboardingConfigSchema } from '@intelliflow/validators';
import { FEATURES_TOUR_CONFIG, ONBOARDING_CONFIG } from '../tour-config';

describe('FEATURES_TOUR_CONFIG', () => {
  it('is id=features-v1 and route=/features', () => {
    expect(FEATURES_TOUR_CONFIG.id).toBe('features-v1');
    expect(FEATURES_TOUR_CONFIG.route).toBe('/features');
  });

  it('has exactly 4 steps', () => {
    expect(FEATURES_TOUR_CONFIG.steps).toHaveLength(4);
  });

  it('includes the hero + 3 feature steps', () => {
    const ids = FEATURES_TOUR_CONFIG.steps.map((s) => s.id);
    expect(ids).toEqual(['hero', 'ai-scoring', 'automation', 'analytics']);
  });

  it('validates against onboardingConfigSchema', () => {
    expect(() => onboardingConfigSchema.parse(ONBOARDING_CONFIG)).not.toThrow();
  });
});

describe('artifacts/misc/onboarding-config.json', () => {
  it('parses and matches the inlined TS config', () => {
    const artifactPath = resolve(process.cwd(), '../..', 'artifacts/misc/onboarding-config.json');
    const raw = readFileSync(artifactPath, 'utf8');
    const parsed = onboardingConfigSchema.parse(JSON.parse(raw));
    expect(parsed.tours[0].id).toBe('features-v1');
    expect(parsed.tours[0].steps).toHaveLength(4);
    // Selectors must match exactly
    const tsSelectors = FEATURES_TOUR_CONFIG.steps.map((s) => s.targetSelector);
    const jsonSelectors = parsed.tours[0].steps.map((s) => s.targetSelector);
    expect(jsonSelectors).toEqual(tsSelectors);
  });
});
