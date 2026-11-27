/**
 * MVP-001: Zoho's send API takes no reply-to, so the setting says so when a Zoho mailbox is on.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReplyToCard } from '../TenantSettingsCards';

const editable = { readOnly: false, readOnlyNoteId: 'read-only-note' };

describe('ReplyToCard', () => {
  it('says nothing extra while no Zoho mailbox is connected', () => {
    render(<ReplyToCard value="" onChange={vi.fn()} {...editable} />);
    expect(screen.getByLabelText('Reply-to address')).toBeInTheDocument();
    expect(screen.queryByTestId('reply-to-zoho-note')).not.toBeInTheDocument();
  });

  it('explains that Zoho mail goes without this reply-to, and where to set one instead', () => {
    render(
      <ReplyToCard
        value="replies@business.example.invalid"
        onChange={vi.fn()}
        zohoConnected
        {...editable}
      />
    );
    expect(screen.getByTestId('reply-to-zoho-note')).toHaveTextContent(
      "set a reply-to address in Zoho Mail's own settings"
    );
  });
});
