import { describe, expect, it } from 'vitest';
import { resolveDefaultSignature } from '../resolve-default-signature';

const sig = (id: string, scope: 'USER' | 'ORG', isDefault: boolean) => ({ id, scope, isDefault });

describe('resolveDefaultSignature', () => {
  it('prefers the user default over the org default', () => {
    expect(
      resolveDefaultSignature(
        [sig('u1', 'USER', false), sig('u2', 'USER', true)],
        [sig('o1', 'ORG', true)]
      )
    ).toEqual(sig('u2', 'USER', true));
  });

  it('falls back to the org default when the user has no default', () => {
    expect(resolveDefaultSignature([sig('u1', 'USER', false)], [sig('o1', 'ORG', true)])).toEqual(
      sig('o1', 'ORG', true)
    );
  });

  it('returns null when no default exists', () => {
    expect(
      resolveDefaultSignature([sig('u1', 'USER', false)], [sig('o1', 'ORG', false)])
    ).toBeNull();
    expect(resolveDefaultSignature([], [])).toBeNull();
  });
});
