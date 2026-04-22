import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@intelliflow/api-client', () => ({
  trpc: {
    contact: {
      listReplyDrafts: {
        useQuery: (
          _input: unknown,
          options?: { enabled?: boolean }
        ) => ({
          data: options?.enabled ? { drafts: [] } : undefined,
          isLoading: false,
        }),
      },
    },
  },
}));

vi.mock('@intelliflow/ui', () => ({
  EmptyState: ({ entity }: { entity: string }) => (
    <div data-testid="empty-state">empty:{entity}</div>
  ),
}));

import { ReplyDraftsPanel } from '../ReplyDraftsPanel';

describe('ReplyDraftsPanel (IFC-312)', () => {
  it('renders nothing when enabled is false', () => {
    const { container } = render(<ReplyDraftsPanel contactId="c-1" enabled={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders canonical EmptyState entity="emails" when no drafts exist', () => {
    render(<ReplyDraftsPanel contactId="c-1" enabled={true} />);
    expect(screen.getByTestId('empty-state').textContent).toBe('empty:emails');
  });
});
