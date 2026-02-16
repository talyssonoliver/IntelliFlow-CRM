// @vitest-environment jsdom
/**
 * ContactCard Component Tests (PG-133)
 *
 * Tests the ContactCard component for:
 * - Rendering with various data states
 * - Quick action buttons (email, call)
 * - Status badges
 * - Activity badges (deals, tasks)
 * - Compact mode
 * - Click interactions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContactCard, type ContactCardProps } from '../ContactCard';
import { createMockContact, createMockHandlers, resetAllMocks } from './contact-test-utils';

describe('ContactCard', () => {
  let handlers: ReturnType<typeof createMockHandlers>;

  beforeEach(() => {
    handlers = createMockHandlers();
    resetAllMocks(handlers);
  });

  describe('Rendering', () => {
    it('renders contact name and email', () => {
      const contact = createMockContact();
      render(<ContactCard contact={contact} />);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('renders contact title when provided', () => {
      const contact = createMockContact({ title: 'VP of Sales' });
      render(<ContactCard contact={contact} />);

      expect(screen.getByText('VP of Sales')).toBeInTheDocument();
    });

    it('renders account name when provided', () => {
      const contact = createMockContact({ account: { id: 'account-1', name: 'Acme Corporation' } });
      render(<ContactCard contact={contact} />);

      expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
    });

    it('renders avatar with initials', () => {
      const contact = createMockContact({ firstName: 'Sarah', lastName: 'Connor' });
      render(<ContactCard contact={contact} />);

      expect(screen.getByText('SC')).toBeInTheDocument();
    });

    it('handles missing last name gracefully', () => {
      const contact = createMockContact({ firstName: 'John', lastName: '' });
      render(<ContactCard contact={contact} />);

      expect(screen.getByText('J')).toBeInTheDocument();
    });

    it('shows question mark for empty names', () => {
      const contact = createMockContact({ firstName: '', lastName: '' });
      render(<ContactCard contact={contact} />);

      expect(screen.getByText('?')).toBeInTheDocument();
    });
  });

  describe('Status Badges', () => {
    it('renders ACTIVE status badge', () => {
      const contact = createMockContact({ status: 'ACTIVE' });
      render(<ContactCard contact={contact} />);

      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('renders INACTIVE status badge', () => {
      const contact = createMockContact({ status: 'INACTIVE' });
      render(<ContactCard contact={contact} />);

      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });

    it('renders ARCHIVED status badge', () => {
      const contact = createMockContact({ status: 'ARCHIVED' });
      render(<ContactCard contact={contact} />);

      expect(screen.getByText('Archived')).toBeInTheDocument();
    });
  });

  describe('Activity Badges', () => {
    it('shows deals badge when opportunities > 0', () => {
      const contact = createMockContact({ _count: { opportunities: 3, tasks: 0 } });
      render(<ContactCard contact={contact} />);

      expect(screen.getByText(/3/)).toBeInTheDocument();
      expect(screen.getByText(/Deals/)).toBeInTheDocument();
    });

    it('shows singular "Deal" for 1 opportunity', () => {
      const contact = createMockContact({ _count: { opportunities: 1, tasks: 0 } });
      render(<ContactCard contact={contact} />);

      expect(screen.getByText(/1 Deal/)).toBeInTheDocument();
    });

    it('shows tasks badge when tasks > 0', () => {
      const contact = createMockContact({ _count: { opportunities: 0, tasks: 5 } });
      render(<ContactCard contact={contact} />);

      expect(screen.getByText(/5/)).toBeInTheDocument();
      expect(screen.getByText(/Tasks/)).toBeInTheDocument();
    });

    it('shows singular "Task" for 1 task', () => {
      const contact = createMockContact({ _count: { opportunities: 0, tasks: 1 } });
      render(<ContactCard contact={contact} />);

      expect(screen.getByText(/1 Task/)).toBeInTheDocument();
    });

    it('shows both deals and tasks when present', () => {
      const contact = createMockContact({ _count: { opportunities: 3, tasks: 5 } });
      render(<ContactCard contact={contact} />);

      expect(screen.getByText(/3/)).toBeInTheDocument();
      expect(screen.getByText(/5/)).toBeInTheDocument();
    });

    it('hides activity badges when both are zero', () => {
      const contact = createMockContact({ _count: { opportunities: 0, tasks: 0 } });
      render(<ContactCard contact={contact} />);

      expect(screen.queryByText(/Deals/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Tasks/)).not.toBeInTheDocument();
    });
  });

  describe('Compact Mode', () => {
    it('hides title in compact mode', () => {
      const contact = createMockContact({ title: 'VP of Sales' });
      render(<ContactCard contact={contact} compact />);

      expect(screen.queryByText('VP of Sales')).not.toBeInTheDocument();
    });

    it('hides account in compact mode', () => {
      const contact = createMockContact({ account: { id: 'account-1', name: 'Acme Corporation' } });
      render(<ContactCard contact={contact} compact />);

      expect(screen.queryByText('Acme Corporation')).not.toBeInTheDocument();
    });

    it('hides activity badges in compact mode', () => {
      const contact = createMockContact({ _count: { opportunities: 3, tasks: 5 } });
      render(<ContactCard contact={contact} compact />);

      expect(screen.queryByText(/Deals/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Tasks/)).not.toBeInTheDocument();
    });

    it('still shows name and status in compact mode', () => {
      const contact = createMockContact({ status: 'ACTIVE' });
      render(<ContactCard contact={contact} compact />);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
    });
  });

  describe('Quick Actions', () => {
    it('renders email button when onEmail provided', () => {
      const contact = createMockContact();
      render(<ContactCard contact={contact} onEmail={handlers.onEmail} />);

      const emailButton = screen.getByLabelText(/Send email to John Doe/i);
      expect(emailButton).toBeInTheDocument();
    });

    it('calls onEmail with contact when email button clicked', () => {
      const contact = createMockContact();
      render(<ContactCard contact={contact} onEmail={handlers.onEmail} />);

      const emailButton = screen.getByLabelText(/Send email to John Doe/i);
      fireEvent.click(emailButton);

      expect(handlers.onEmail).toHaveBeenCalledTimes(1);
      expect(handlers.onEmail).toHaveBeenCalledWith(contact);
    });

    it('renders call button when onCall provided and contact has phone', () => {
      const contact = createMockContact({ phone: '+1 (555) 123-4567' });
      render(<ContactCard contact={contact} onCall={handlers.onCall} />);

      const callButton = screen.getByLabelText(/Call John Doe/i);
      expect(callButton).toBeInTheDocument();
    });

    it('does not render call button when contact has no phone', () => {
      const contact = createMockContact({ phone: null });
      render(<ContactCard contact={contact} onCall={handlers.onCall} />);

      expect(screen.queryByLabelText(/Call/i)).not.toBeInTheDocument();
    });

    it('calls onCall with contact when call button clicked', () => {
      const contact = createMockContact({ phone: '+1 (555) 123-4567' });
      render(<ContactCard contact={contact} onCall={handlers.onCall} />);

      const callButton = screen.getByLabelText(/Call John Doe/i);
      fireEvent.click(callButton);

      expect(handlers.onCall).toHaveBeenCalledTimes(1);
      expect(handlers.onCall).toHaveBeenCalledWith(contact);
    });

    it('stops propagation when quick action clicked', () => {
      const contact = createMockContact();
      render(
        <ContactCard contact={contact} onClick={handlers.onClick} onEmail={handlers.onEmail} />
      );

      const emailButton = screen.getByLabelText(/Send email to John Doe/i);
      fireEvent.click(emailButton);

      expect(handlers.onEmail).toHaveBeenCalledTimes(1);
      expect(handlers.onClick).not.toHaveBeenCalled();
    });
  });

  describe('Click Interaction', () => {
    it('calls onClick with contact when card clicked', () => {
      const contact = createMockContact();
      render(<ContactCard contact={contact} onClick={handlers.onClick} />);

      const card = screen.getByRole('article');
      fireEvent.click(card);

      expect(handlers.onClick).toHaveBeenCalledTimes(1);
      expect(handlers.onClick).toHaveBeenCalledWith(contact);
    });

    it('has cursor-pointer when onClick provided', () => {
      const contact = createMockContact();
      render(<ContactCard contact={contact} onClick={handlers.onClick} />);

      const card = screen.getByRole('article');
      expect(card).toHaveClass('cursor-pointer');
    });

    it('does not have cursor-pointer when onClick not provided', () => {
      const contact = createMockContact();
      render(<ContactCard contact={contact} />);

      const card = screen.getByRole('article');
      expect(card).not.toHaveClass('cursor-pointer');
    });
  });

  describe('Accessibility', () => {
    it('has proper aria-label', () => {
      const contact = createMockContact({ firstName: 'Sarah', lastName: 'Connor' });
      render(<ContactCard contact={contact} />);

      expect(screen.getByLabelText('Contact card for Sarah Connor')).toBeInTheDocument();
    });

    it('marks avatar and icons as aria-hidden', () => {
      const contact = createMockContact();
      const { container } = render(<ContactCard contact={contact} />);

      const hiddenElements = container.querySelectorAll('[aria-hidden="true"]');
      expect(hiddenElements.length).toBeGreaterThan(0);
    });

    it('has accessible button labels', () => {
      const contact = createMockContact({ firstName: 'Sarah', lastName: 'Connor' });
      render(<ContactCard contact={contact} onEmail={handlers.onEmail} onCall={handlers.onCall} />);

      expect(screen.getByLabelText(/Send email to Sarah Connor/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Call Sarah Connor/i)).toBeInTheDocument();
    });
  });
});
