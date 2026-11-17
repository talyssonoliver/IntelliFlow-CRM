import { describe, it, expect } from 'vitest';
import { isHomePath, SIGNED_IN_HOME_PATH } from '../home-paths';

describe('isHomePath', () => {
  it('accepts / and the signed-in home the proxy rewrites / to', () => {
    expect(isHomePath('/')).toBe(true);
    expect(isHomePath(SIGNED_IN_HOME_PATH)).toBe(true);
  });

  it.each(['/pricing', '/dashboard', '/signed-in-home/x', '', null, undefined])(
    'rejects %s',
    (path) => {
      expect(isHomePath(path)).toBe(false);
    }
  );
});
