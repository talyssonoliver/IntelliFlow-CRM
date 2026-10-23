import { describe, expect, it } from 'vitest';
import { classifyDsnStatus } from '../dsn-classification';

describe('classifyDsnStatus', () => {
  it('treats a failed 5.x.x status as a hard bounce', () => {
    expect(classifyDsnStatus('failed', '5.1.1')).toBe('HARD');
  });

  it('treats a failed 4.x.x status as a soft bounce', () => {
    expect(classifyDsnStatus('failed', '4.2.2')).toBe('SOFT');
  });

  it('treats delayed as DELAYED regardless of the status class', () => {
    expect(classifyDsnStatus('delayed', '4.4.7')).toBe('DELAYED');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(classifyDsnStatus(' FAILED ', ' 5.0.0 ')).toBe('HARD');
  });

  it.each([
    ['delivered', '2.0.0'],
    ['relayed', '2.0.0'],
    ['expanded', '2.0.0'],
    ['failed', '2.0.0'],
    ['failed', 'garbage'],
    ['failed', ''],
    ['', '5.1.1'],
    ['unknown', '5.1.1'],
  ])('returns null for action %s with status %s', (action, status) => {
    expect(classifyDsnStatus(action, status)).toBeNull();
  });
});
