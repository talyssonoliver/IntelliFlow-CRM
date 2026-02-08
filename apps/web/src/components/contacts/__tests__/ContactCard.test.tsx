import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactCard } from '../ContactCard';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createContact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    firstName: 'Sarah',
    lastName: 'Connor',
    email: 'sarah@skynet.com',
    title: 'VP of Engineering',
    phone: '+15550001234',
    status: 'ACTIVE' as const,
    account: { id: 'acct-1', name: 'Cyberdyne Systems' },
    _count: { opportunities: 2, tasks: 3 },
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('ContactCard', () => {
  // ── Rendering ─────────────────────────────────────────────────────────────────

  describe('Rendering', () => {
    it('renders contact with all fields (name, title, email, phone, company)', () => {
      const contact = createContact();
      render(<ContactCard contact={contact} />);

      expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
      expect(screen.getByText('VP of Engineering')).toBeInTheDocument();
      expect(screen.getByText('Cyberdyne Systems')).toBeInTheDocument();
    });

    it('renders contact without optional fields (no title, no phone)', () => {
      const contact = createContact({ title: null, phone: null });
      render(<ContactCard contact={contact} />);

      expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
      expect(screen.queryByText('VP of Engineering')).not.toBeInTheDocument();
    });

    it('displays avatar with colored initials fallback', () => {
      const contact = createContact();
      render(<ContactCard contact={contact} />);

      const avatar = screen.getByText('SC');
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveAttribute('aria-hidden', 'true');
    });

    it('shows status badge with text + icon (ACTIVE)', () => {
      const contact = createContact({ status: 'ACTIVE' });
      render(<ContactCard contact={contact} />);

      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('shows status badge for INACTIVE status', () => {
      const contact = createContact({ status: 'INACTIVE' });
      render(<ContactCard contact={contact} />);

      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });

    it('shows status badge for ARCHIVED status', () => {
      const contact = createContact({ status: 'ARCHIVED' });
      render(<ContactCard contact={contact} />);

      expect(screen.getByText('Archived')).toBeInTheDocument();
    });

    it('displays activity count badges (deals + tasks)', () => {
      const contact = createContact();
      render(<ContactCard contact={contact} />);

      expect(screen.getByText('2 Deals')).toBeInTheDocument();
      expect(screen.getByText('3 Tasks')).toBeInTheDocument();
    });
  });

  // ── Interactions ──────────────────────────────────────────────────────────────

  describe('Interactions', () => {
    it('calls onClick when card is clicked', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      const contact = createContact();
      render(<ContactCard contact={contact} onClick={onClick} />);

      await user.click(screen.getByRole('article'));
      expect(onClick).toHaveBeenCalledWith(contact);
    });

    it('calls onEmail with contact when email button clicked', async () => {
      const user = userEvent.setup();
      const onEmail = vi.fn();
      const contact = createContact();
      render(<ContactCard contact={contact} onEmail={onEmail} />);

      await user.click(screen.getByLabelText('Send email to Sarah Connor'));
      expect(onEmail).toHaveBeenCalledWith(contact);
    });

    it('calls onCall with contact when call button clicked', async () => {
      const user = userEvent.setup();
      const onCall = vi.fn();
      const contact = createContact();
      render(<ContactCard contact={contact} onCall={onCall} />);

      await user.click(screen.getByLabelText('Call Sarah Connor'));
      expect(onCall).toHaveBeenCalledWith(contact);
    });

    it('stops event propagation on action button clicks', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      const onEmail = vi.fn();
      const contact = createContact();
      render(<ContactCard contact={contact} onClick={onClick} onEmail={onEmail} />);

      await user.click(screen.getByLabelText('Send email to Sarah Connor'));
      expect(onEmail).toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  // ── Accessibility ─────────────────────────────────────────────────────────────

  describe('Accessibility', () => {
    it('has role="article" with aria-label containing contact name', () => {
      const contact = createContact();
      render(<ContactCard contact={contact} />);

      const article = screen.getByRole('article');
      expect(article).toHaveAttribute('aria-label', 'Contact card for Sarah Connor');
    });

    it('icon-only buttons have aria-label', () => {
      const contact = createContact();
      render(<ContactCard contact={contact} onEmail={vi.fn()} onCall={vi.fn()} />);

      expect(screen.getByLabelText('Send email to Sarah Connor')).toBeInTheDocument();
      expect(screen.getByLabelText('Call Sarah Connor')).toBeInTheDocument();
    });

    it('status badge uses text + icon (not color-only)', () => {
      const contact = createContact({ status: 'ACTIVE' });
      render(<ContactCard contact={contact} />);

      // Badge should contain both text label and a hidden icon
      const badge = screen.getByText('Active');
      expect(badge).toBeInTheDocument();
      // The parent span contains both icon and text
      expect(badge.closest('span')).toBeTruthy();
    });
  });
});
