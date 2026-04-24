import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// Mock tRPC — the generalized SuggestedTagsRow calls all four hook pairs
// unconditionally (rules of hooks) and picks the entity-matching pair per
// render. The mock provides stubs for every procedure it may read.
vi.mock('@intelliflow/api-client', () => ({
  trpc: {
    contact: {
      suggestTags: {
        useMutation: () => ({
          mutateAsync: vi.fn().mockResolvedValue([]),
          isLoading: false,
        }),
      },
      addTags: {
        useMutation: () => ({
          mutateAsync: vi.fn().mockResolvedValue({ tags: [] }),
          isLoading: false,
        }),
      },
    },
    account: {
      suggestTags: {
        useMutation: () => ({
          mutateAsync: vi.fn().mockResolvedValue([]),
          isLoading: false,
        }),
      },
      addTags: {
        useMutation: () => ({
          mutateAsync: vi.fn().mockResolvedValue({ tags: [] }),
          isLoading: false,
        }),
      },
    },
  },
}));

import { SuggestedTagsRow } from '../SuggestedTagsRow';

describe('SuggestedTagsRow (IFC-312 generalized — contact + account)', () => {
  it('renders nothing when enabled is false (contact)', () => {
    const { container } = render(
      <SuggestedTagsRow entity="contact" entityId="c-1" enabled={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when enabled is false (account)', () => {
    const { container } = render(
      <SuggestedTagsRow entity="account" entityId="a-1" enabled={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when enabled is true but LLM returned [] (contact)', () => {
    const { container } = render(
      <SuggestedTagsRow entity="contact" entityId="c-1" enabled={true} />
    );
    expect(container.querySelector('[data-testid="suggested-tags-row"]')).toBeNull();
  });

  it('renders nothing when enabled is true but LLM returned [] (account)', () => {
    const { container } = render(
      <SuggestedTagsRow entity="account" entityId="a-1" enabled={true} />
    );
    expect(container.querySelector('[data-testid="suggested-tags-row"]')).toBeNull();
  });
});
