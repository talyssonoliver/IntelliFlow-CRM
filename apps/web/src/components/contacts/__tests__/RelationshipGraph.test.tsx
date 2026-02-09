// @vitest-environment jsdom
/**
 * RelationshipGraph Component Tests (PG-133)
 *
 * Tests the RelationshipGraph component for:
 * - Relationship rendering (account, lead, contacts, opportunities, tasks)
 * - Empty state when no relationships
 * - Links to related entities
 * - Pluralization logic
 * - Account link handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RelationshipGraph } from '../RelationshipGraph';
import { createMockRelationshipData } from './contact-test-utils';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe('RelationshipGraph', () => {
  describe('Empty State', () => {
    it('shows empty message when no relationships', () => {
      render(
        <RelationshipGraph
          contact={{
            id: 'contact-1',
            firstName: 'John',
            lastName: 'Doe',
            account: null,
            accountId: null,
          }}
        />
      );

      expect(screen.getByText('No relationships yet')).toBeInTheDocument();
    });

    it('does not show relationship items when empty', () => {
      render(
        <RelationshipGraph
          contact={{
            id: 'contact-1',
            firstName: 'John',
            lastName: 'Doe',
            account: null,
            accountId: null,
          }}
        />
      );

      expect(screen.queryByText('Account')).not.toBeInTheDocument();
      expect(screen.queryByText('Related Contacts')).not.toBeInTheDocument();
    });
  });

  describe('Account Relationship', () => {
    it('renders account link when account is present', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} />);

      const accountLink = screen.getByText(/View account:/);
      expect(accountLink.textContent).toContain('Acme Corporation');
      expect(accountLink.closest('a')).toHaveAttribute('href', '/accounts/account-1');
    });

    it('shows "No account linked" when account is null', () => {
      render(
        <RelationshipGraph
          contact={{
            id: 'contact-1',
            firstName: 'John',
            lastName: 'Doe',
            account: null,
            accountId: null,
          }}
          opportunityCount={1}
        />
      );

      expect(screen.getByText('No account linked')).toBeInTheDocument();
    });

    it('renders account section heading', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} />);

      expect(screen.getByText('Account')).toBeInTheDocument();
    });
  });

  describe('Linked Lead', () => {
    it('renders linked lead when provided', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} />);

      const leadLink = screen.getByText(/View lead:/);
      expect(leadLink.textContent).toContain('Initial Inquiry - Acme Corp');
      expect(leadLink.closest('a')).toHaveAttribute('href', '/leads/lead-1');
    });

    it('shows "Converted from Lead" heading', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} />);

      expect(screen.getByText('Converted from Lead')).toBeInTheDocument();
    });

    it('does not render lead section when linkedLead is null', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} linkedLead={null} />);

      expect(screen.queryByText('Converted from Lead')).not.toBeInTheDocument();
    });
  });

  describe('Related Contacts', () => {
    it('renders related contacts list', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} />);

      expect(screen.getByText(/View contact:.*Jane Smith/)).toBeInTheDocument();
      expect(screen.getByText(/View contact:.*Bob Johnson/)).toBeInTheDocument();
    });

    it('renders contact count in heading', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} />);

      expect(screen.getByText(/Related Contacts \(2\)/)).toBeInTheDocument();
    });

    it('renders contact titles when present', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} />);

      expect(screen.getByText('CTO')).toBeInTheDocument();
      expect(screen.getByText('VP Sales')).toBeInTheDocument();
    });

    it('links to contact detail pages', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} />);

      const janeLink = screen.getByText(/View contact:.*Jane Smith/).closest('a');
      expect(janeLink).toHaveAttribute('href', '/contacts/contact-2');

      const bobLink = screen.getByText(/View contact:.*Bob Johnson/).closest('a');
      expect(bobLink).toHaveAttribute('href', '/contacts/contact-3');
    });

    it('does not render related contacts section when empty', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} relatedContacts={[]} />);

      expect(screen.queryByText(/Related Contacts/)).not.toBeInTheDocument();
    });
  });

  describe('Opportunities', () => {
    it('renders opportunity count when > 0', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} opportunityCount={5} />);

      expect(screen.getByText('5 opportunities')).toBeInTheDocument();
    });

    it('uses singular "opportunity" for count of 1', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} opportunityCount={1} />);

      expect(screen.getByText('1 opportunity')).toBeInTheDocument();
    });

    it('does not render opportunities section when count is 0', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} opportunityCount={0} />);

      expect(screen.queryByText(/opportunity/i)).not.toBeInTheDocument();
    });

    it('renders opportunities heading', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} opportunityCount={5} />);

      expect(screen.getByText('Opportunities')).toBeInTheDocument();
    });
  });

  describe('Tasks', () => {
    it('renders task count when > 0', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} taskCount={8} />);

      expect(screen.getByText('8 tasks')).toBeInTheDocument();
    });

    it('uses singular "task" for count of 1', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} taskCount={1} />);

      expect(screen.getByText('1 task')).toBeInTheDocument();
    });

    it('does not render tasks section when count is 0', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} taskCount={0} />);

      expect(screen.queryByText(/task/i)).not.toBeInTheDocument();
    });

    it('renders tasks heading', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} taskCount={8} />);

      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
  });

  describe('Contact Name Handling', () => {
    it('renders full contact name in heading', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} />);

      expect(screen.getByLabelText('Relationships for John Doe')).toBeInTheDocument();
    });

    it('handles null firstName', () => {
      render(
        <RelationshipGraph
          contact={{
            id: 'contact-1',
            firstName: null,
            lastName: 'Doe',
            account: null,
            accountId: null,
          }}
          opportunityCount={1}
        />
      );

      expect(screen.getByLabelText('Relationships for Doe')).toBeInTheDocument();
    });

    it('handles null lastName', () => {
      render(
        <RelationshipGraph
          contact={{
            id: 'contact-1',
            firstName: 'John',
            lastName: null,
            account: null,
            accountId: null,
          }}
          opportunityCount={1}
        />
      );

      expect(screen.getByLabelText('Relationships for John')).toBeInTheDocument();
    });

    it('uses "Unknown" when both names are null', () => {
      render(
        <RelationshipGraph
          contact={{
            id: 'contact-1',
            firstName: null,
            lastName: null,
            account: null,
            accountId: null,
          }}
          opportunityCount={1}
        />
      );

      expect(screen.getByLabelText('Relationships for Unknown')).toBeInTheDocument();
    });
  });

  describe('Rendering with All Relationships', () => {
    it('renders all relationship types together', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} />);

      expect(screen.getByText(/View account:/)).toBeInTheDocument();
      expect(screen.getByText('Converted from Lead')).toBeInTheDocument();
      expect(screen.getByText(/Related Contacts \(2\)/)).toBeInTheDocument();
      expect(screen.getByText('5 opportunities')).toBeInTheDocument();
      expect(screen.getByText('8 tasks')).toBeInTheDocument();
    });

    it('renders in correct order', () => {
      const data = createMockRelationshipData();
      const { container } = render(<RelationshipGraph {...data} />);

      const listItems = container.querySelectorAll('li');
      const order = Array.from(listItems).map(li => li.textContent);

      // Account should come before lead
      const accountIndex = order.findIndex(text => text?.includes('Account'));
      const leadIndex = order.findIndex(text => text?.includes('Converted from Lead'));
      expect(accountIndex).toBeLessThan(leadIndex);
    });
  });

  describe('Accessibility', () => {
    it('has proper aria-label for component', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} />);

      expect(screen.getByLabelText('Relationships for John Doe')).toBeInTheDocument();
    });

    it('renders links with descriptive text', () => {
      const data = createMockRelationshipData();
      render(<RelationshipGraph {...data} />);

      expect(screen.getByText(/View account: Acme Corporation/)).toBeInTheDocument();
      expect(screen.getByText(/View lead: Initial Inquiry - Acme Corp/)).toBeInTheDocument();
      expect(screen.getByText(/View contact: Jane Smith/)).toBeInTheDocument();
    });
  });

  describe('Default Props', () => {
    it('handles missing relatedContacts (defaults to empty array)', () => {
      render(
        <RelationshipGraph
          contact={{
            id: 'contact-1',
            firstName: 'John',
            lastName: 'Doe',
            account: { id: 'account-1', name: 'Acme Corp' },
            accountId: 'account-1',
          }}
        />
      );

      expect(screen.queryByText(/Related Contacts/)).not.toBeInTheDocument();
    });

    it('handles missing opportunityCount (defaults to 0)', () => {
      render(
        <RelationshipGraph
          contact={{
            id: 'contact-1',
            firstName: 'John',
            lastName: 'Doe',
            account: { id: 'account-1', name: 'Acme Corp' },
            accountId: 'account-1',
          }}
        />
      );

      expect(screen.queryByText(/opportunity/i)).not.toBeInTheDocument();
    });

    it('handles missing taskCount (defaults to 0)', () => {
      render(
        <RelationshipGraph
          contact={{
            id: 'contact-1',
            firstName: 'John',
            lastName: 'Doe',
            account: { id: 'account-1', name: 'Acme Corp' },
            accountId: 'account-1',
          }}
        />
      );

      expect(screen.queryByText(/task/i)).not.toBeInTheDocument();
    });

    it('handles missing linkedLead (defaults to null)', () => {
      render(
        <RelationshipGraph
          contact={{
            id: 'contact-1',
            firstName: 'John',
            lastName: 'Doe',
            account: { id: 'account-1', name: 'Acme Corp' },
            accountId: 'account-1',
          }}
        />
      );

      expect(screen.queryByText('Converted from Lead')).not.toBeInTheDocument();
    });
  });
});
