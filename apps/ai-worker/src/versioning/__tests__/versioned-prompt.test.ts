import { describe, it, expect } from 'vitest';
import { missingPromptSlots, usableVersionedPrompt } from '../versioned-prompt';

describe('missingPromptSlots reads slots the way PromptTemplate formats them', () => {
  it('finds nothing missing when every slot is placed', () => {
    expect(missingPromptSlots('Score:\n{lead_info}', ['lead_info'])).toEqual([]);
  });

  it('reports a slot that is absent', () => {
    expect(missingPromptSlots('Score this lead.', ['lead_info'])).toEqual(['lead_info']);
  });

  it('treats an escaped {{slot}} as text, not as the slot', () => {
    expect(missingPromptSlots('Use {{lead_info}} here.', ['lead_info'])).toEqual(['lead_info']);
  });

  it('rejects a prompt with a slot the chain does not fill (format would throw)', () => {
    expect(missingPromptSlots('{lead_info} and {budget}', ['lead_info'])).toEqual(['lead_info']);
  });

  it('rejects a prompt PromptTemplate cannot parse', () => {
    expect(missingPromptSlots('Unbalanced { brace {lead_info}', ['lead_info'])).toEqual([
      'lead_info',
    ]);
  });
});

describe('usableVersionedPrompt', () => {
  it('keeps a prompt that places every slot, and drops one that does not', () => {
    expect(usableVersionedPrompt('TEST', 'A {text} B', ['text'])).toBe('A {text} B');
    expect(usableVersionedPrompt('TEST', 'No data here', ['text'])).toBeNull();
    expect(usableVersionedPrompt('TEST', 'Again no data', ['text'])).toBeNull(); // logged once
    expect(usableVersionedPrompt('TEST', null, ['text'])).toBeNull();
    expect(usableVersionedPrompt('TEST', undefined, ['text'])).toBeNull();
  });
});
