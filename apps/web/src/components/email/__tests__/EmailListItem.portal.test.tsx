// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { describe, expect, it, vi } from 'vitest';
import { createMockEmail } from './email-test-utils';
import { EMAIL_LABELS } from '@/components/sidebar/configs/EmailSidebarContent';

// Stands in for the sheets the sender card opens: outside the row on the page, inside it for React.
vi.mock('@/components/shared', () => ({
  EntityHoverCard: ({ children }: { children: React.ReactNode }) => (
    <>
      {children}
      {createPortal(<button type="button">Inside a sheet</button>, document.body)}
    </>
  ),
}));

const { EmailListItem } = await import('../EmailListItem');

function renderRow(over: Record<string, unknown> = {}) {
  const onSelect = vi.fn();
  render(
    <ul>
      <EmailListItem
        email={{ ...createMockEmail({}), labels: [], ...over } as never}
        isSelected={false}
        onSelect={onSelect}
      />
    </ul>
  );
  return onSelect;
}

describe('EmailListItem details', () => {
  it('shows a dot for each known label and skips one it does not know', () => {
    const label = EMAIL_LABELS[0];
    renderRow({ labels: [label.id, 'no-such-label'] });
    expect(screen.getByTitle(label.name)).toBeInTheDocument();
    expect(screen.getByRole('listitem').querySelectorAll('[title]')).toHaveLength(1);
  });

  it('shows no dots without labels', () => {
    renderRow();
    expect(screen.getByRole('listitem').querySelectorAll('[title]')).toHaveLength(0);
  });

  it('marks an email with attachments', () => {
    renderRow({ attachments: [{ id: 'a1' }] });
    expect(screen.getByTestId('attachment-icon')).toBeInTheDocument();
  });
});

describe('EmailListItem and what the sender card opens', () => {
  it('does not choose the email when something in a sheet is clicked', () => {
    const onSelect = renderRow();
    fireEvent.click(screen.getAllByRole('button', { name: 'Inside a sheet' })[0]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('still chooses the email when the row is clicked', () => {
    const onSelect = renderRow();
    fireEvent.click(screen.getByRole('listitem').querySelector('button') as HTMLElement);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
