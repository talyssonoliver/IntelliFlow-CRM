/**
 * PG-207 (AC-EM-028, CA-9): bounced and failed sends stay visible in Sent with
 * a text + icon badge (never colour alone, WCAG 1.4.1).
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMockEmail } from './email-test-utils';
import { DeliveryStatusBadge, deliveryStatusOf } from '../DeliveryStatusBadge';
import { EmailListItem } from '../EmailListItem';
import { EmailMessage } from '../EmailMessage';

describe('deliveryStatusOf', () => {
  it.each([
    [
      { status: 'BOUNCED', bouncedRecipientCount: 1 },
      { label: 'Bounced', icon: 'error' },
    ],
    [
      { status: 'SENT', bouncedRecipientCount: 2 },
      { label: 'Partly bounced', icon: 'warning' },
    ],
    [
      { status: 'FAILED', bouncedRecipientCount: 0 },
      { label: 'Failed', icon: 'report' },
    ],
  ])('maps %o', (input, expected) => {
    expect(deliveryStatusOf(input)).toMatchObject(expected);
  });

  it.each([[{ status: 'SENT', bouncedRecipientCount: 0 }], [{ status: 'DELIVERED' }], [{}]])(
    'shows nothing for %o',
    (input) => {
      expect(deliveryStatusOf(input)).toBeNull();
    }
  );
});

describe('DeliveryStatusBadge', () => {
  it('renders the label as text with a decorative icon', () => {
    const { container } = render(
      <DeliveryStatusBadge status="BOUNCED" bouncedRecipientCount={1} />
    );
    expect(screen.getByText('Bounced')).toBeInTheDocument();
    expect(container.querySelector('.material-symbols-outlined')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('renders nothing for a normal send', () => {
    const { container } = render(<DeliveryStatusBadge status="SENT" bouncedRecipientCount={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('badge in the list and the message view', () => {
  it('shows "Partly bounced" on a list row', () => {
    render(
      <EmailListItem
        email={
          { ...createMockEmail({ status: 'SENT', bouncedRecipientCount: 1 }), labels: [] } as never
        }
        isSelected={false}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('Partly bounced')).toBeInTheDocument();
  });

  it('shows "Failed" in the message header', () => {
    render(
      <EmailMessage
        message={createMockEmail({ status: 'FAILED', bouncedRecipientCount: 0 }) as never}
        isExpanded
        onToggle={vi.fn()}
        onReply={vi.fn()}
        onReplyAll={vi.fn()}
        onForward={vi.fn()}
      />
    );
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('shows no badge on a received email', () => {
    render(
      <EmailListItem
        email={{ ...createMockEmail({ status: 'DELIVERED' }), labels: [] } as never}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );
    expect(screen.queryByText(/bounced|failed/i)).not.toBeInTheDocument();
  });
});
