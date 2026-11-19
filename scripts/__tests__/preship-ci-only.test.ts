/**
 * Tests for scripts/lib/preship-ci-only.mjs: which pre-ship steps are left to CI on this PC.
 */
import { describe, it, expect } from 'vitest';
import {
  ciGuardLine,
  localBuildIsCiOnly,
  localFullSuiteIsCiOnly,
} from '../lib/preship-ci-only.mjs';

describe('localBuildIsCiOnly', () => {
  it('leaves the build to CI locally', () => {
    expect(localBuildIsCiOnly({ isCI: false, env: {} })).toBe(true);
  });
  it('runs it under CI and with PRESHIP_FULL_BUILD=1', () => {
    expect(localBuildIsCiOnly({ isCI: true, env: {} })).toBe(false);
    expect(localBuildIsCiOnly({ isCI: false, env: { PRESHIP_FULL_BUILD: '1' } })).toBe(false);
  });
});

describe('localFullSuiteIsCiOnly', () => {
  it('leaves a widened full scope to CI locally', () => {
    expect(localFullSuiteIsCiOnly({ isCI: false, env: {}, scope: 'full' })).toBe(true);
  });
  it('keeps related and none scopes local', () => {
    expect(localFullSuiteIsCiOnly({ isCI: false, env: {}, scope: 'related' })).toBe(false);
    expect(localFullSuiteIsCiOnly({ isCI: false, env: {}, scope: 'none' })).toBe(false);
  });
  it('runs under CI and with PRESHIP_FULL_TESTS=1', () => {
    expect(localFullSuiteIsCiOnly({ isCI: true, env: {}, scope: 'full' })).toBe(false);
    expect(
      localFullSuiteIsCiOnly({ isCI: false, env: { PRESHIP_FULL_TESTS: '1' }, scope: 'full' })
    ).toBe(false);
  });
});

describe('ciGuardLine', () => {
  it('names the CI job that guards the step', () => {
    expect(ciGuardLine('Build')).toBe('skipped locally, CI is the guard (Build)');
  });
});
