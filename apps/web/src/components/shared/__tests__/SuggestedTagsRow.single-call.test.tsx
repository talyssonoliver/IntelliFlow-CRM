import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

// Like the real useMutation, every call returns a NEW object (its state changes as the request
// runs), while the request function itself is stable. The row used to list that object in its
// effect dependencies, so each answer started the next request: ~3,000 AI calls in two seconds
// from one contact page on 19/11/2026, which used up the user's rate limit (MVP-007).
const mocks = vi.hoisted(() => ({
  contactSuggest: vi.fn(),
  accountSuggest: vi.fn(),
}));

vi.mock('@intelliflow/api-client', () => ({
  trpc: {
    contact: {
      suggestTags: { useMutation: () => ({ mutateAsync: mocks.contactSuggest, status: 'idle' }) },
      addTags: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
    account: {
      suggestTags: { useMutation: () => ({ mutateAsync: mocks.accountSuggest, status: 'idle' }) },
      addTags: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
  },
}));

import { SuggestedTagsRow } from '../SuggestedTagsRow';

describe('SuggestedTagsRow asks for suggestions once per entity', () => {
  beforeEach(() => {
    mocks.contactSuggest.mockReset().mockResolvedValue([]);
    mocks.accountSuggest.mockReset().mockResolvedValue([]);
  });

  it('does not ask again when its own state changes or the parent re-renders', async () => {
    const { rerender } = render(<SuggestedTagsRow entity="contact" entityId="c-1" enabled />);
    await waitFor(() => expect(mocks.contactSuggest).toHaveBeenCalledTimes(1));

    for (let i = 0; i < 10; i++) {
      rerender(<SuggestedTagsRow entity="contact" entityId="c-1" enabled />);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mocks.contactSuggest).toHaveBeenCalledTimes(1);
    expect(mocks.accountSuggest).not.toHaveBeenCalled();
  });

  it('asks again only for a different contact', async () => {
    const { rerender } = render(<SuggestedTagsRow entity="contact" entityId="c-1" enabled />);
    await waitFor(() => expect(mocks.contactSuggest).toHaveBeenCalledTimes(1));

    rerender(<SuggestedTagsRow entity="contact" entityId="c-2" enabled />);
    await waitFor(() => expect(mocks.contactSuggest).toHaveBeenCalledTimes(2));
    expect(mocks.contactSuggest).toHaveBeenLastCalledWith({ contactId: 'c-2' });
  });

  it('asks the account procedure once for an account', async () => {
    const { rerender } = render(<SuggestedTagsRow entity="account" entityId="a-1" enabled />);
    await waitFor(() => expect(mocks.accountSuggest).toHaveBeenCalledTimes(1));
    rerender(<SuggestedTagsRow entity="account" entityId="a-1" enabled />);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mocks.accountSuggest).toHaveBeenCalledTimes(1);
    expect(mocks.accountSuggest).toHaveBeenCalledWith({ accountId: 'a-1' });
  });

  it('does not ask while disabled', async () => {
    render(<SuggestedTagsRow entity="contact" entityId="c-1" enabled={false} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.contactSuggest).not.toHaveBeenCalled();
  });
});
