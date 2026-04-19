/**
 * DuplicateDetectionTab Tests - PG-186
 *
 * NOTE: this file ships with structural smoke coverage only. Full RTL
 * behavior tests (Add Rule, conflict detection, row removal) are tracked
 * as a follow-up — see PG-186 audit, finding #5.
 */
import { describe, it, expect } from 'vitest';
import { DuplicateDetectionTab } from '../components/DuplicateDetectionTab';

describe('DuplicateDetectionTab — smoke', () => {
  it('exports a function component', () => {
    expect(typeof DuplicateDetectionTab).toBe('function');
  });

  it('component name is the React-debuggable name', () => {
    expect(DuplicateDetectionTab.name).toBe('DuplicateDetectionTab');
  });
});
