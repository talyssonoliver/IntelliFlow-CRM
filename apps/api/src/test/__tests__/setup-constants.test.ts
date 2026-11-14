/**
 * The api test setup keeps its own copy of NOT_RESTRICTED so that it does not load the
 * whole @intelliflow/application bundle into every test file. This test is the one place
 * that loads it, and fails if the copy ever drifts from the real value.
 */
import { describe, it, expect } from 'vitest';
import { NOT_RESTRICTED as applicationValue } from '@intelliflow/application';
import { NOT_RESTRICTED as setupValue } from '../setup';

describe('api test setup constants', () => {
  it('NOT_RESTRICTED in the setup equals the application value', () => {
    expect(setupValue).toEqual(applicationValue);
  });
});
