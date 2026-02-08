import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RelationshipGraph, type RelationshipGraphProps } from '../RelationshipGraph';

// ─── Mock next/link ─────────────────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

const defaultContact: RelationshipGraphProps['contact'] = {
  id: 'c-1',
  firstName: 'Sarah',
  lastName: 'Connor',
  account: { id: 'acct-1', name: 'Cyberdyne Systems' },
  accountId: 'acct-1',
};

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('RelationshipGraph', () => {
  // ── Rendering ─────────────────────────────────────────────────────────────────

  describe('Rendering', () => {
    it('renders "Relationships" heading', () => {
      render(<RelationshipGraph contact={defaultContact} />);

      expect(screen.getByText('Relationships')).toBeInTheDocument();
    });

    it('shows linked account with link to account page', () => {
      render(<RelationshipGraph contact={defaultContact} />);

      const link = screen.getByText('View account: Cyberdyne Systems');
      expect(link.closest('a')).toHaveAttribute('href', '/accounts/acct-1');
    });

    it('shows linked lead with link to lead page', () => {
      render(
        <RelationshipGraph
          contact={defaultContact}
          linkedLead={{ id: 'lead-1', name: 'Sarah Connor Lead' }}
        />,
      );

      const link = screen.getByText('View lead: Sarah Connor Lead');
      expect(link.closest('a')).toHaveAttribute('href', '/leads/lead-1');
    });

    it('displays related contacts at same account', () => {
      const relatedContacts = [
        { id: 'c-2', firstName: 'John', lastName: 'Smith', email: 'john@example.com', title: 'CTO' },
        { id: 'c-3', firstName: 'Alice', lastName: 'Brown', email: 'alice@example.com' },
      ];
      render(<RelationshipGraph contact={defaultContact} relatedContacts={relatedContacts} />);

      expect(screen.getByText('View contact: John Smith')).toBeInTheDocument();
      expect(screen.getByText('View contact: Alice Brown')).toBeInTheDocument();
      expect(screen.getByText('CTO')).toBeInTheDocument();
    });

    it('shows opportunity count', () => {
      render(<RelationshipGraph contact={defaultContact} opportunityCount={3} />);

      expect(screen.getByText('3 opportunities')).toBeInTheDocument();
    });

    it('shows task count', () => {
      render(<RelationshipGraph contact={defaultContact} taskCount={5} />);

      expect(screen.getByText('5 tasks')).toBeInTheDocument();
    });
  });

  // ── Empty States ──────────────────────────────────────────────────────────────

  describe('Empty States', () => {
    it('shows "No relationships yet" when contact has no links', () => {
      const emptyContact = {
        id: 'c-1',
        firstName: 'Sarah',
        lastName: 'Connor',
        account: null,
        accountId: null,
      };
      render(
        <RelationshipGraph
          contact={emptyContact as any}
          relatedContacts={[]}
          opportunityCount={0}
          taskCount={0}
        />,
      );

      expect(screen.getByText('No relationships yet')).toBeInTheDocument();
    });

    it('shows "No account linked" placeholder when no accountId', () => {
      const noAccountContact = {
        id: 'c-1',
        firstName: 'Sarah',
        lastName: 'Connor',
        account: undefined,
        accountId: undefined,
      };
      // When contact has no account but has other relationships (the component
      // shows "No account linked" row only inside the relationship list,
      // not when hasRelationships=false which shows "No relationships yet")
      render(
        <RelationshipGraph
          contact={noAccountContact}
          opportunityCount={1}
        />,
      );

      expect(screen.getByText('No account linked')).toBeInTheDocument();
    });
  });

  // ── Accessibility ─────────────────────────────────────────────────────────────

  describe('Accessibility', () => {
    it('container has aria-label="Relationships for {name}"', () => {
      render(<RelationshipGraph contact={defaultContact} />);

      const container = screen.getByLabelText('Relationships for Sarah Connor');
      expect(container).toBeInTheDocument();
    });

    it('uses semantic list structure (<ul> with <li>)', () => {
      render(
        <RelationshipGraph
          contact={defaultContact}
          opportunityCount={2}
          taskCount={3}
        />,
      );

      const list = document.querySelector('ul');
      expect(list).toBeTruthy();

      const items = list!.querySelectorAll('li');
      expect(items.length).toBeGreaterThanOrEqual(1);
    });

    it('links have descriptive text (not "click here")', () => {
      render(
        <RelationshipGraph
          contact={defaultContact}
          linkedLead={{ id: 'lead-1', name: 'Some Lead' }}
          relatedContacts={[{ id: 'c-2', firstName: 'John', lastName: 'Doe', email: 'john@example.com' }]}
        />,
      );

      // All links should have descriptive text
      const links = screen.getAllByRole('link');
      links.forEach((link) => {
        const text = link.textContent || '';
        expect(text).not.toBe('click here');
        expect(text.length).toBeGreaterThan(3);
      });
    });
  });

  // ── Singular/Plural ───────────────────────────────────────────────────────────

  describe('Singular/Plural', () => {
    it('uses singular "opportunity" for count of 1', () => {
      render(<RelationshipGraph contact={defaultContact} opportunityCount={1} />);

      expect(screen.getByText('1 opportunity')).toBeInTheDocument();
    });

    it('uses singular "task" for count of 1', () => {
      render(<RelationshipGraph contact={defaultContact} taskCount={1} />);

      expect(screen.getByText('1 task')).toBeInTheDocument();
    });
  });
});
