import { describe, expect, it } from 'vitest';
import { SESSION_HINT_ATTRIBUTE, SESSION_HINT_SCRIPT } from '../session-hint';

function marksPage(cookie: string): boolean {
  const attributes = new Set<string>();
  const fakeDocument = {
    cookie,
    documentElement: { setAttribute: (name: string) => attributes.add(name) },
  };
  new Function('document', SESSION_HINT_SCRIPT)(fakeDocument);
  return attributes.has(SESSION_HINT_ATTRIBUTE);
}

describe('session hint script', () => {
  it.each(['accessToken=x', 'theme=dark; accessToken=x'])('marks the page for %j', (cookie) => {
    expect(marksPage(cookie)).toBe(true);
  });

  it.each(['', 'theme=dark', 'accessToken=', 'oldaccessToken=x'])(
    'leaves the page alone for %j',
    (cookie) => {
      expect(marksPage(cookie)).toBe(false);
    }
  );
});
