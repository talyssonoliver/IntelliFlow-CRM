import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// Mock tRPC hook — minimal shim for the enabled=false branch (no tRPC provider needed).
vi.mock('@intelliflow/api-client', () => ({
  trpc: {
    contact: {
      suggestTags: {
        useMutation: () => ({
          mutateAsync: vi.fn().mockResolvedValue([]),
          isLoading: false,
        }),
      },
    },
  },
}));

import { SuggestedTagsRow } from '../SuggestedTagsRow';

describe('SuggestedTagsRow (IFC-312)', () => {
  it('renders nothing when enabled is false', () => {
    const { container } = render(<SuggestedTagsRow contactId="c-1" enabled={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when enabled is true but LLM returned []', () => {
    const { container } = render(<SuggestedTagsRow contactId="c-1" enabled={true} />);
    // The empty-result path renders null — verifying via absence of testid chip list.
    expect(container.querySelector('[data-testid="suggested-tags-row"]')).toBeNull();
  });
});
