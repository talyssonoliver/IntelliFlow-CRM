import { describe, it, expect } from 'vitest';
import { AI_REPLY_DRAFTING_DEFAULT, replyDraftingEnabled } from '../reply-drafting';

/** MVP-012: reply drafting is on unless the tenant saved it off. */
describe('replyDraftingEnabled', () => {
  it('uses the default (on) for a tenant that never saved the setting', () => {
    expect(AI_REPLY_DRAFTING_DEFAULT).toBe(true);
    expect(replyDraftingEnabled(undefined)).toBe(true);
    expect(replyDraftingEnabled(null)).toBe(true);
  });

  it('keeps a saved choice', () => {
    expect(replyDraftingEnabled(false)).toBe(false);
    expect(replyDraftingEnabled(true)).toBe(true);
  });
});
